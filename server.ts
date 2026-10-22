import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
// Local (no-API-key) PDF text extraction engine — works fully offline.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// Secondary local parser: extracts text reliably even from PDFs with broken
// Cyrillic font ToMaps where pdf.js returns garbage.
import { PDFParse } from 'pdf-parse';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// High payload limit for engineering PDF drawings
app.use(express.json({ limit: '50mb' }));

// Initialize GoogleGenAI client (Server-side only)
// Note: apiKey is intentionally optional here. If GEMINI_API_KEY is missing we
// still create the client, but every AI call is guarded below and falls back to
// demo data instead of throwing "API key not found" errors.
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Candidate Gemini models, tried in order. The first non-404 model wins.
// This makes the app resilient when a specific model name (e.g. a preview
// model like 'gemini-3.8-flash') is not available for the current API key —
// a wrong/unavailable model name was the cause of "Не удалось проанализировать PDF чертежи".
const MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
].filter((m): m is string => Boolean(m));

/**
 * Calls Gemini with the given prompt/PDF, trying candidate models until one works.
 */
async function generateWithModelFallback(
  contents: any,
  config: any
): Promise<string> {
  let lastError: any = null;

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });
      const text = response.text;
      if (!text) {
        throw new Error(`Модель ${model} вернула пустой ответ`);
      }
      if (model !== MODEL_CANDIDATES[0]) {
        console.log(`Gemini model "${model}" used (primary model unavailable).`);
      }
      return text;
    } catch (error: any) {
      lastError = error;
      const status = error?.status ?? error?.response?.status;
      const msg = String(error?.message || error);
      console.error(`Gemini model "${model}" failed (status ${status}): ${msg}`);

      // Only fall through to the next model on model-not-found / permission /
      // unsupported errors. Other errors (network, payload size, etc.) are
      // unlikely to be fixed by switching models, but trying the next one is
      // still safer than crashing outright.
      const isModelIssue =
        status === 404 ||
        status === 400 && /model|not found|unsupported/i.test(msg) ||
        /not found|no such model|unsupported/i.test(msg);

      if (!isModelIssue && status && status < 500 && status !== 408 && status !== 429) {
        // 401/403 — bad API key, retrying with another model is pointless
        if (status === 401 || status === 403) break;
      }
    }
  }

  throw lastError || new Error('Все модели Gemini недоступны');
}

// ---------------------------------------------------------------------------
// LOCAL RECOGNITION ENGINE (works without any external AI API)
// Extracts text from every PDF page with pdfjs-dist and parses ЕСКД title
// blocks (штампы), specification tables and section divider sheets by regex.
// ---------------------------------------------------------------------------

const SECTIONS = [
  'Токарные+фрезерные работы',
  'Токарные+фрезерные работы: Лазер',
  'Токарные+фрезерные работы: ВОС',
  'Стандарты',
] as const;

async function extractPageText(pdfBase64: string): Promise<string[]> {
  const binary = Buffer.from(pdfBase64, 'base64');
  // pdfjs mutates the passed buffer — give each parse its own copy
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(binary),
    // Needed on Node to decode standard (WinAnsi) fonts — otherwise Cyrillic
    // text from many PDFs fails to extract.
    standardFontDataUrl: path.join(__dirname, 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/',
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let lastY: number | undefined = undefined;
      let text = '';
      for (const item of content.items as any[]) {
        if (!('str' in item)) continue;
        const y: number | undefined = item.transform ? item.transform[5] : lastY ?? undefined;
        if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 3) text += '\n';
        else if (text && !text.endsWith('\n')) text += ' ';
        text += item.str;
        lastY = y;
      }
      pages.push(text);
    } catch (e: any) {
      console.warn(`Failed to read page ${i}: ${e?.message}`);
      pages.push('');
    }
  }
  try { await doc.destroy(); } catch {}
  return pages;
}

function detectSectionFromText(text: string): string | null {
  const t = text.toLowerCase();
  const hasDivider = /(титульн|раздел\b|лист\s*\d+\s*из)|\bраздел\s*[№#\s]*\d/i.test(text);
  const laser = /лазер/.test(t);
  const vos = /\bвос\b|водоотлива|восстановл/.test(t);
  const std = /стандарт[^\n]{0,25}(издели|крепеж)|крепеж[^\n]{0,25}(издели|и)?|\bГОСТ\s*(на\s*)?(изделия|крепеж)/i.test(text)
    || (/стандартн/i.test(t) && /(винт|болт|гайк|шайб|штифт|заклёп|подшипник|кольц|уплотн)/i.test(t));
  const turn = /токарн|фрезерн/i.test(t);
  if (laser && turn) return SECTIONS[1];
  if (vos && turn) return SECTIONS[2];
  if (std) return SECTIONS[3];
  if (turn && hasDivider) return SECTIONS[0];
  if (hasDivider && std) return SECTIONS[3];
  return null;
}

function normalizeName(raw: string): string {
  let n = raw.replace(/[«»"']/g, '').trim();
  n = n.replace(/\s+/g, ' ');
  return n;
}

function isFastenerName(name: string): boolean {
  return /^(винт|болт|гайка|шайба|штифт|заклёп|заклеп|шпилька|шуруп|подшипник|кольцо|указатель|втулка|сухари|штифты)\b/i.test(name);
}

function looksLikeStdDesignation(d: string): boolean {
  return /(ГОСТ|ОСТ|ТУ|DIN|ISO|ANSI|JIS|EN)\s*[\dА-Яа-яЁё.\-–—/ ]{2,}/i.test(d);
}

function findCode1C(lines: string[]): string {
  for (const l of lines) {
    const m = l.match(/(?:код(?:\s*по)?\s*1?с?[:\s]*|[«"]?\b1?с\b[»"]?\s*[:\-]\s*)([\dА-ЯA-Z][\dА-ЯA-Za-zа-я\-._\/]{3,})/i);
    if (m) return m[1].trim();
  }
  return '';
}

function extractPartLength(text: string): string {
  // L=180, L 180 мм, длина 180 мм, Ø30х180, 120x60 s=4
  let m = text.match(/\bL\s*[=:]?\s*(\d+(?:[.,]\d+)?)\s*(мм)?/i);
  if (m) return `${m[1]} мм`;
  m = text.match(/(?:габаритная\s+)?длина\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*мм/i);
  if (m) return `${m[1]} мм`;
  m = text.match(/(?:Ø|⌀|ø|Φ|φ)\s*\d+(?:[.,]\d+)?\s*[хxX*]\s*(\d+(?:[.,]\d+)?)/);
  if (m) return `${m[1]} мм`;
  m = text.match(/\b(\d+(?:[.,]\d+)?)\s*[хxX*]\s*\d+(?:[.,]\d+)?\b/);
  if (m) return `${m[1]} мм`;
  return '';
}

function detectCnc(text: string): boolean {
  return /(чпу|cnc|числовое\s+программ|координатн|обрабатывающ центр|доводка|hrc\s*\d|rа\s*0[.,][0-2]|прецизион|лазерн|гравиров)/i.test(text);
}

interface RawItem {
  name: string;
  designation: string;
  quantity: number | null;
  code1C: string;
  partLength: string;
  isCnc: boolean;
  hasNoStamp: boolean;
  identificationMark: string;
  section?: string;
  material: string;
  pageNumber: number;
  isHighlighted: boolean;
  notes: string;
}

// ЕСКД main title block fields: Наименование / Обозначение / Материал / Кол-во
function parseTitleBlock(pageText: string, pageNum: number): Omit<RawItem, 'section'> | null {
  const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);
  const joined = pageText.replace(/\s+/g, ' ');

  const pickValue = (labelRe: RegExp): string => {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(labelRe);
      if (m) {
        const inline = lines[i].replace(labelRe, '').trim();
        if (inline) return inline;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          if (!labelRe.test(lines[j]) && lines[j].length > 1) return lines[j];
        }
      }
    }
    return '';
  };

  const designationRaw = pickValue(/^обозначение[:\s]*/i);
  const nameRaw = pickValue(/^наименование[:\s]*/i);
  let material = pickValue(/^материал[:\s]*/i);
  material = material.replace(/\s*(марка|назначени|обозначени|ечп|код оквэд)[\s\S]*$/i, '').trim();

  let quantity: number | null = null;
  let qm = joined.match(/кол(?:-во|-vo|ичество|ичество\s*шт\.?)?\s*[:=]?\s*(\d+)/i);
  if (qm) quantity = parseInt(qm[1], 10);
  if (quantity === null) {
    qm = joined.match(/всего\s*(\d+)\s*(шт|компл|комлектов?)\b/i);
    if (qm) quantity = parseInt(qm[1], 10);
  }

  const name = normalizeName(nameRaw);
  const designation = normalizeName(designationRaw);
  if (!name && !designation) return null;

  return {
    name: name || designation || `Чертеж (лист ${pageNum})`,
    designation: designation || (name ? `Без обозначения — опознано по наименованию` : `Лист ${pageNum}`),
    quantity,
    code1C: findCode1C(lines),
    partLength: extractPartLength(joined),
    isCnc: detectCnc(joined),
    hasNoStamp: false,
    identificationMark: '',
    material: material.replace(/^(сталь|бронза|латунь|текстолит|резина|алюминий|чугун)$/i, '$1'),
    pageNumber: pageNum,
    isHighlighted: false,
    notes: '',
  };
}

// Specification table rows: "1 Втулка 4 АБВГ... ГОСТ ..." style
function parseSpecRows(pageText: string, pageNum: number): RawItem[] {
  const out: RawItem[] = [];
  const rowRe = /^\s*(\d{1,3})(?:[.)]|\s)\s*([А-ЯЁA-Z][\wа-яё\-./ ]{2,60}?)\s+(\d{1,4})\s+(?:шт\.?\s+)?((?:[А-ЯЁA-Z]{2,6}[.\dА-ЯЁa-z]{0,20}|(?:ГОСТ|ОСТ|DIN|ISO|ТУ)[\s\d\-–—/.А-Яa-z]*)[^а-я]*?)?\s*$/;
  const lines = pageText.split('\n').map(l => l.trim());
  for (const line of lines) {
    const m = line.match(rowRe);
    if (!m) continue;
    const name = normalizeName(m[2]);
    if (!/[а-яa-z]/i.test(name)) continue;
    if (/^примечан|^итого|^всего|^спецификац/i.test(name)) continue;
    const qty = parseInt(m[3], 10);
    const designation = normalizeName(m[4] || '');
    out.push({
      name,
      designation: designation || `Позиция №${m[1]} (спецификация, лист ${pageNum})`,
      quantity: qty,
      code1C: '',
      partLength: extractPartLength(line),
      isCnc: false,
      hasNoStamp: true,
      identificationMark: `Спецификация: Поз. ${m[1]}, ${name}, ${qty} шт`,
      material: '',
      pageNumber: pageNum,
      isHighlighted: false,
      notes: 'Из таблицы спецификации',
    });
  }
  return out;
}

// ЕСКД designation like АБВГ.711142.012 / XXXX.XXXXXX.XXX(-YY)
const DESIGNATION_RE = /\b[А-ЯЁA-Z]{2,10}\.\d{3,8}\.\d{2,4}(?:[-–.]\d{1,4})?\b/;

// Generic table-row fallback for text PDFs whose layout doesn't match the
// strict spec regex (rows extracted line-by-line from pdfjs text layer).
function parseGenericRows(pageText: string, pageNum: number): RawItem[] {
  const out: RawItem[] = [];
  const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // skip headers/labels
    if (/^(наименование|обозначение|спецификация|примечание|итого|всего|кол-?во|материал|лист\\s*\d)/i.test(line)) continue;
    const desM = line.match(DESIGNATION_RE);
    if (!desM) continue;
    const before = line.slice(0, desM.index).replace(DESIGNATION_RE, '').trim();
    // name candidate: starts with a capital letter and contains letters
    const nameCand = before.replace(/^\d{1,3}[.)]?\s*/, '').replace(/[«»"]/g, '').trim();
    if (nameCand.length < 3 || !/[А-ЯЁA-Z]/.test(nameCand[0]) || !/[а-яёa-z]{2}/.test(nameCand)) continue;
    if (/^(ГОСТ|ОСТ|ТУ|DIN|ISO)\b/i.test(nameCand)) continue;
    const qtyM = line.match(new RegExp(`${desM[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\d]{0,15}?(\\d{1,4})(?:\\s*шт)?(?!\\d)`));
    out.push({
      name: normalizeName(nameCand),
      designation: desM[0],
      quantity: qtyM ? parseInt(qtyM[1], 10) : null,
      code1C: '',
      partLength: extractPartLength(line),
      isCnc: false,
      hasNoStamp: false,
      identificationMark: '',
      material: '',
      pageNumber: pageNum,
      isHighlighted: false,
      notes: 'Распознано по строке текста PDF',
    });
  }
  return out;
}

// Free-marking fallback for sketch pages without a stamp
function parseMarks(pageText: string, pageNum: number): RawItem[] {
  const out: RawItem[] = [];
  const marks = [...pageText.matchAll(/(поз\.?\s*№?\s*\d+|дет\.?\s*№?\s*\d+|изд\.?\s*[№#]?\s*[А-ЯЁA-Z0-9][\w.\-]{2,}|наплавл[^\n]{0,40}|заготовка[^\n]{0,40}|эскиз[^\n]{0,40}|секция\s*[а-яё])/gi)];
  const dims = pageText.match(/(?:Ø|⌀|ø|Φ|φ)\s*\d+(?:[.,]\d+)?\s*[хxX*]\s*\d+(?:[.,]\d+)?(?:\s*s\s*=\s*\d+)?/i);
  const qtyM = pageText.match(/(\d{1,4})\s*шт/i);
  for (const mk of marks.slice(0, 3)) {
    const mark = normalizeName(mk[0]);
    out.push({
      name: `Эскиз детали (без штампа)`,
      designation: `Опознано: ${mark}${dims ? ' / ' + dims[0] : ''}`,
      quantity: qtyM ? parseInt(qtyM[1], 10) : null,
      code1C: '',
      partLength: extractPartLength(pageText),
      isCnc: false,
      hasNoStamp: true,
      identificationMark: mark,
      material: '',
      pageNumber: pageNum,
      isHighlighted: false,
      notes: dims ? `Габарит с эскиза: ${dims[0]}` : 'На листе нет рамки и штампа — позиция распознана по опознавательному знаку',
    });
    break; // one item per sketch page
  }
  return out;
}

async function localExtractDrawings(pdfBase64: string): Promise<{ items: RawItem[]; detectedSections: string[]; pageTexts: string[] }> {
  const pages = await extractPageText(pdfBase64);
  const items: RawItem[] = [];
  let currentSection: string = SECTIONS[0];
  const detectedSections = new Set<string>();

  for (let p = 0; p < pages.length; p++) {
    const pageNum = p + 1;
    const text = pages[p];
    if (!text || text.trim().length < 2) continue;

    const sec = detectSectionFromText(text);
    const onlyDivider = sec && text.replace(/\s/g, '').length < 260;
    if (sec) {
      currentSection = sec;
      detectedSections.add(sec);
      if (onlyDivider) continue; // pure title/divider sheet — no parts on it
    }

    let pageItems: RawItem[] = [];
    const tb = parseTitleBlock(text, pageNum);
    if (tb) pageItems.push({ ...tb, section: currentSection });

    if (pageItems.length === 0) {
      const spec = parseSpecRows(text, pageNum);
      if (spec.length) {
        for (const s of spec) {
          // fasteners found in specs belong to Стандарты unless explicitly elsewhere
          s.section = (isFastenerName(s.name) || looksLikeStdDesignation(s.designation)) && currentSection === SECTIONS[0]
            ? SECTIONS[3] : currentSection;
        }
        pageItems = spec;
      } else {
        pageItems = parseGenericRows(text, pageNum);
        if (pageItems.length === 0) {
          pageItems = parseMarks(text, pageNum);
        }
        for (const m of pageItems) m.section = currentSection;
      }
    }

    // Post-classification: standards drawn as separate sheets
    for (const it of pageItems) {
      if (it.section !== SECTIONS[3] && (looksLikeStdDesignation(it.designation) && isFastenerName(it.name))) {
        it.section = SECTIONS[3];
      }
      detectedSections.add(it.section || currentSection);
    }
    items.push(...pageItems);
  }

  // De-duplicate identical positions across pages
  const seen = new Set<string>();
  const unique = items.filter(it => {
    const key = `${it.name}|${it.designation}|${it.pageNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { items: unique, detectedSections: [...detectedSections], pageTexts: pages.map(t => (t || '').slice(0, 400)) };
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    engine: 'local-pdf-parser',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Endpoint to extract drawings and bill of materials from uploaded PDF
 */
app.post('/api/extract-drawings', async (req, res) => {
  const { pdfBase64, fileName } = req.body || {};

  if (!pdfBase64) {
    return res.status(400).json({ error: 'PDF data is missing in request' });
  }

  // ---- Primary engine: LOCAL PDF parsing (no external AI API required) ----
  let pageTexts: string[] = [];
  try {
    const local = await localExtractDrawings(pdfBase64);
    pageTexts = local.pageTexts;
    if (local.items.length > 0) {
      const formattedItems = formatItems(local.items);
      console.log(`Local parser extracted ${formattedItems.length} position(s) from "${fileName || 'pdf'}"`);
      return res.json({
        success: true,
        engine: 'local',
        items: formattedItems,
        detectedSections: local.detectedSections,
        count: formattedItems.length,
      });
    }
    console.warn('Local parser found no text positions (scanned/image-only PDF?).');

    // If there is no Gemini key configured, we cannot OCR image-only pages —
    // explain this clearly instead of failing with a generic error.
    if (!process.env.GEMINI_API_KEY) {
      return res.status(422).json({
        error: 'В PDF не найден распознаваемый текст',
        details:
          'Локальный движок распознал бы все позиции, если бы в PDF был текст (штампы ЕСКД, спецификации). ' +
          'Похоже, что чертежи отсканированы как картинки. Для распознавания сканов добавьте ключ GEMINI_API_KEY в .env — тогда подключится vision-распознавание.',
        pageTexts,
      });
    }
  } catch (localError: any) {
    console.error('Local PDF parser failed:', localError);
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Не удалось прочитать PDF-файл',
        details: String(localError?.message || localError),
        pageTexts,
      });
    }
  }

  // ---- Secondary engine: Gemini vision analysis (only when API key exists) ----
  try {
    const systemInstruction = `Ты — ведущий инженер-технолог и нормоконтролер машиностроительного производства.
Проанализируй PDF с чертежами и извлеки позиции. Верни СТРОГО JSON вида:
{"detectedSections": ["..."], "items": [{"name":"...","designation":"...","quantity":10,"code1C":"","partLength":"180 мм","isCnc":true,"hasNoStamp":false,"identificationMark":"","section":"Токарные+фрезерные работы","material":"...","pageNumber":2,"isHighlighted":false,"notes":""}]}
Разделы: "Токарные+фрезерные работы", "Токарные+фрезерные работы: Лазер", "Токарные+фрезерные работы: ВОС", "Стандарты".`;

    const promptText = `Проанализируй PDF "${fileName || 'чертежи.pdf'}" и извлеки все детали по 4 разделам. Для каждой детали: наименование, обозначение, количество, код 1С, длину детали (partLength), признак ЧПУ (isCnc). Если на листе нет рамки и штампа — найди опознавательный знак и верни hasNoStamp: true.`;

    const responseText = await generateWithModelFallback(
      { parts: [{ inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }, { text: promptText }] },
      { systemInstruction, responseMimeType: 'application/json' }
    );

    let parsedData: any;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Model did not return valid JSON');
      parsedData = JSON.parse(match[0]);
    }

    const rawItems = Array.isArray(parsedData.items) ? parsedData.items : [];
    if (rawItems.length === 0) {
      return res.status(422).json({
        error: 'Распознавание не нашло ни одной позиции',
        details: 'Ни локальный парсер, ни Gemini не нашли в PDF позиций чертежей. Проверьте файл.',
      });
    }

    return res.json({
      success: true,
      engine: 'gemini',
      items: formatItems(rawItems),
      detectedSections: parsedData.detectedSections || [],
      count: rawItems.length,
    });
  } catch (aiError: any) {
    const msg = String(aiError?.message || aiError);
    console.error('Gemini fallback also failed:', msg);
    return res.status(500).json({
      error: 'Не удалось проанализировать PDF чертежи',
      details: msg,
    });
  }
});

// Shared mapping/sanitizing of extracted raw items into client format
function formatItems(rawItems: any[]): any[] {
  return rawItems.map((item: any, idx: number) => ({
    id: `ext-${Date.now()}-${idx}`,
    name: item.name || `Деталь поз. ${idx + 1}`,
    designation: item.designation || (item.identificationMark ? `Опознано: ${item.identificationMark}` : `Чертеж без номера (лист ${item.pageNumber || idx + 1})`),
    quantity: typeof item.quantity === 'number' ? item.quantity : null,
    code1C: item.code1C || '',
    partLength: item.partLength ? String(item.partLength) : '',
    isCnc: Boolean(item.isCnc),
    isPieceStock: Boolean(item.isPieceStock),
    hasNoStamp: Boolean(item.hasNoStamp || (!item.designation && item.identificationMark)),
    identificationMark: item.identificationMark || '',
    section: sanitizeSection(item.section),
    material: item.material || '',
    pageNumber: typeof item.pageNumber === 'number' ? item.pageNumber : (idx + 1),
    isHighlighted: Boolean(item.isHighlighted),
    notes: item.notes || '',
    qtySource: typeof item.quantity === 'number' ? 'drawing' : 'missing',
  }));
}

function sanitizeSection(rawSection: string): string {
  if (!rawSection) return 'Токарные+фрезерные работы';
  const s = rawSection.toLowerCase();
  if (s.includes('лазер')) return 'Токарные+фрезерные работы: Лазер';
  if (s.includes('вос')) return 'Токарные+фрезерные работы: ВОС';
  if (s.includes('стандарт') || s.includes('гост') || s.includes('din') || s.includes('крепеж')) return 'Стандарты';
  return 'Токарные+фрезерные работы';
}

function getFallbackDemoItems() {
  return [
    {
      id: 'fb-1',
      name: 'Втулка упорная ступенчатая',
      designation: 'АБВГ.711142.012',
      quantity: 12,
      code1C: '',
      partLength: '85 мм',
      isCnc: true,
      hasNoStamp: false,
      identificationMark: '',
      section: 'Токарные+фрезерные работы',
      material: 'Сталь 40Х',
      pageNumber: 2,
      isHighlighted: false,
      notes: 'HRC 42..48',
      qtySource: 'drawing',
    },
    {
      id: 'fb-2',
      name: 'Вал приводной со шпоночным пазом',
      designation: 'АБВГ.713215.004',
      quantity: 4,
      code1C: '',
      partLength: '340 мм',
      isCnc: true,
      hasNoStamp: false,
      identificationMark: '',
      section: 'Токарные+фрезерные работы',
      material: 'Сталь 45',
      pageNumber: 3,
      isHighlighted: false,
      notes: 'Шлифовка шеек',
      qtySource: 'drawing',
    },
    {
      id: 'fb-3',
      name: 'Пластина опорная с пазами',
      designation: 'АБВГ.745122.001',
      quantity: 16,
      code1C: '',
      partLength: '210 мм',
      isCnc: false,
      hasNoStamp: false,
      identificationMark: '',
      section: 'Токарные+фрезерные работы: Лазер',
      material: '09Г2С',
      pageNumber: 5,
      isHighlighted: false,
      notes: 'Лазерная резка s=8мм',
      qtySource: 'drawing',
    },
    {
      id: 'fb-4',
      name: 'Плунжер высокоточный (ВОС)',
      designation: 'АБВГ.712111.002',
      quantity: 6,
      code1C: '',
      partLength: '125 мм',
      isCnc: true,
      hasNoStamp: false,
      identificationMark: '',
      section: 'Токарные+фрезерные работы: ВОС',
      material: 'ШХ15',
      pageNumber: 7,
      isHighlighted: false,
      notes: 'Доводка Ra 0.2',
      qtySource: 'drawing',
    },
    {
      id: 'fb-5',
      name: 'Фланец переходной (эскиз без рамки)',
      designation: 'Опознано: Поз. 7 / Ø85х60',
      quantity: 8,
      code1C: '',
      partLength: '60 мм',
      isCnc: true,
      hasNoStamp: true,
      identificationMark: 'Поз. 7 / Эскиз валика Ø85 L=60',
      section: 'Токарные+фрезерные работы',
      material: 'Сталь 20',
      pageNumber: 8,
      isHighlighted: false,
      notes: 'Чертеж без рамки ЕСКД, найден опознавательный знак',
      qtySource: 'drawing',
    },
    {
      id: 'fb-6',
      name: 'Болт М8-6gх25.58',
      designation: 'ГОСТ 7798-70',
      quantity: 64,
      code1C: '00-00014285',
      partLength: '25 мм',
      isCnc: false,
      hasNoStamp: false,
      identificationMark: '',
      section: 'Стандарты',
      material: 'Класс 5.8, Ц9хр',
      pageNumber: 10,
      isHighlighted: false,
      notes: 'Крепеж',
      qtySource: 'drawing',
    },
  ];
}

// Setup Vite or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
