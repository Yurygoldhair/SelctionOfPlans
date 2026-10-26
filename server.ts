import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// High payload limit for engineering PDF drawings
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Initialize GoogleGenAI client (Server-side only)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Endpoint to extract drawings and bill of materials from uploaded PDF
 */
app.post('/api/extract-drawings', async (req, res) => {
  try {
    const { pdfBase64, fileName } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: 'PDF data is missing in request' });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY is not set. Returning sample extracted blueprint data.');
      return res.json({
        success: true,
        isDemoFallback: true,
        message: 'Обработано в демонстрационном режиме (ключ API настраивается в Secrets).',
        items: getFallbackDemoItems(),
      });
    }

    const systemInstruction = `Ты — ведущий инженер-технолог и нормоконтролер машиностроительного производства.
Твоя задача — детально проанализировать предоставленный многостраничный PDF-документ с чертежами и титульными листами разделов.

СТРУКТУРА ДОКУМЕНТА И ОТСЛЕЖИВАНИЕ РАЗДЕЛОВ ПО ТИТУЛЬНЫМ ЛИСТАМ:
В производственном комплекте могут присутствовать НЕ ВСЕ разделы (например, могут быть только 'Токарные+фрезерные работы' и 'Стандарты', а 'Лазер' или 'ВОС' отсутствовать).
СТРОГО отслеживай структуру документа последовательно страница за страницей от 1 до конца:
1. Каждый раз, когда на странице встречается титульный лист / разделитель конкретного раздела:
   - "Токарные+фрезерные работы"
   - "Токарные+фрезерные работы: Лазер"
   - "Токарные+фрезерные работы: ВОС"
   - "Стандарты" (крепеж и стандартные изделия: ГОСТ, ОСТ, DIN, ISO, винты, болты, гайки, шайбы, подшипники, уплотнения с кодами 1С)
   ВСЕ последующие чертежи на следующих страницах ОБЯЗАТЕЛЬНО относятся ИСКЛЮЧИТЕЛЬНО к этому разделу, пока не встретится следующий титульный лист!
2. Если какой-то раздел в PDF отсутствует — НИ В КОЕМ СЛУЧАЕ не придумывай его и не вноси в него детали. Детали должны попадать строго под свой реальный титульник.

СТРОЖАЙШЕЕ ТРЕБОВАНИЕ — НЕ ВКЛЮЧАТЬ ТИТУЛЬНЫЕ ЛИСТЫ В СПИСОК ДЕТАЛЕЙ:
НИ В КОЕМ СЛУЧАЕ НЕ создавай элементы в массиве items для самих титульных листов / обложек / разделителей (страницы с надписями 'Токарные+фрезерные работы', 'Лазер', 'ВОС', 'Стандарты', 'Раздел 1', 'Титульный лист' и т.д.).
Титульные листы служат ИСКЛЮЧИТЕЛЬНО для определения того, к какому разделу относятся последующие чертежи!

ПРУТКИ И ШПИЛЬКИ (НЕ ВНОСИТЬ В ТАБЛИЦУ):
Если в PDF файле есть титульный лист или позиции "Прутки и шпильки" (или "Прутки", "Шпильки", мерный сортовой прокат):
СТРОГО НЕ ДОБАВЛЯЙ их в массив items! Эти страницы остаются в самом PDF файле при формировании комплекта, но в таблицу механических деталей не заносятся.

В массив items должны попадать ТОЛЬКО реальные чертежи деталей, эскизы и стандартные изделия!

ДЛЯ КАЖДОГО ЧЕРТЕЖА / ПОЗИЦИИ ИЗВЛЕКИ:
- name: "Наименование" (графа 1 основной надписи чертежа по ГОСТ 2.104, например 'Втулка упорная', 'Вал приводной', 'Пластина опорная', 'Болт М8х25')
- designation: "Обозначение" (графа 2 основной надписи, чертежный шифр ЕСКД, например 'АБВГ.711142.012', либо стандарт 'ГОСТ 7798-70', 'DIN 912')
- quantity: "Количество" (число штук, если указано в штампе чертежа, таблице спецификации или примечаниях. Если не указано — ставь 0 или null)
- code1C: "Код по 1С" (код номенклатуры 1С для стандартов или деталей, если указан на чертеже/спецификации; иначе пустая строка "")
- partLength: "Длина детали" (габаритная длина детали в мм из чертежа: размер L, осевой габарит вала/втулки/прутка/шпильки/пластины, например '180 мм', '350', 'L=240 мм', '125'. Для стандартного крепежа укажи длину стержня, например '25 мм' для болта М8х25; если неприменимо — оставь пустую строку "")
- isCnc: булево значение true / false (ЧПУ):
  * true — если на чертеже есть отметки ЧПУ, CNC, токарно-фрезерная с ЧПУ, 3D криволинейный контур, фрезеровка карманов со сложной геометрией, высокая точность обработки
  * false — если обычная обработка на универсальных станках или стандарты
- section: точное название раздела из найденного титульного листа:
  * "Токарные+фрезерные работы"
  * "Токарные+фрезерные работы: Лазер"
  * "Токарные+фрезерные работы: ВОС"
  * "Стандарты"
  * "Прутки и шпильки" (если в комплекте есть титульный лист/разделитель "Прутки и шпильки")
- isRodOrStud: булево значение true / false (ОБЯЗАТЕЛЬНО ставь true для любых деталей из раздела "Прутки и шпильки", а также для любых шпилек (ГОСТ 22032-22043, ГОСТ 9066, DIN 975/976), прутков, резьбовых штанг, стяжек и сортового проката; false для обычных токарно-фрезерных деталей)
- material: материал детали из графы 3 штампа (например 'Сталь 40Х', 'Д16Т', '12Х18Н10Т')
- pageNumber: номер страницы PDF, где расположен данный чертеж
- isHighlighted: true (если позиция визуально выделена маркером, цветом, рамкой, или помечена) / false
- notes: технические требования, покрытия или примечания

ВНИМАНИЕ — ЕСЛИ НА ЧЕРТЕЖЕ НЕТ РАМКИ И ШТАМПА (ОПОЗНАВАТЕЛЬНЫЙ ЗНАК):
Если на листе чертежа НЕТ рамки ЕСКД, нет углового штампа, нет официального обозначения и наименования:
1. Тщательно найди ЛЮБОЙ опознавательный знак на поле чертежа:
   - номер позиции, маркировку или надпись (например, 'Поз. 4', 'Дет. №12', '№3', 'Секция Б', 'Эскиз валика', текст выноски)
   - или габаритные размеры/формулу детали (например, 'Ø45х180', 'Пластина 120х60 s=4', 'Шестигранник 19 L=85')
   - любые рукописные или технологические пометки на эскизе
2. Заполни поля:
   - designation: точный текст найденного опознавательного знака (например, 'Опознано: Поз. 4' или 'Эскиз: Вал Ø30 L=180')
   - name: понятное наименование на основе эскиза (например, 'Эскиз детали (без штампа)' или 'Вал (без рамки)')
   - hasNoStamp: true
   - identificationMark: найденный опознавательный знак
   - partLength: длина детали из эскиза/размеров

ВЕРНИ ОТВЕТ ТОЛЬКО В ФОРМАТЕ JSON следующего вида:
{
  "detectedSections": ["Токарные+фрезерные работы", ...],
  "items": [
    {
      "name": "string",
      "designation": "string",
      "quantity": 10,
      "code1C": "string",
      "partLength": "180 мм",
      "isCnc": true,
      "isRodOrStud": false,
      "hasNoStamp": false,
      "identificationMark": "",
      "section": "Токарные+фрезерные работы",
      "material": "string",
      "pageNumber": 2,
      "isHighlighted": false,
      "notes": "string"
    }
  ]
}`;

    const promptText = `Пожалуйста, проанализируй загруженный PDF-файл "${fileName || 'чертежи.pdf'}".
ВНИМАНИЕ: В файле могут быть не все разделы (например, только "Токарные+фрезерные работы" и "Стандарты").
СТРОГО отслеживай последовательно по страницам, под каким именно титульником находятся детали, и вноси их именно в тот раздел!
ВАЖНЕЙШИЕ ПРАВИЛА:
1. Титульные листы разделов (страницы с названиями разделов) НЕ ДОБАВЛЯЙ в список деталей items!
2. Для ЛЮБЫХ шпилек (ГОСТ 22032..22043, ГОСТ 9066, DIN 975, DIN 976), прутков, резьбовых штанг или любых деталей, идущих за титульным листом "Прутки и шпильки": ОБЯЗАТЕЛЬНО установи "isRodOrStud": true и "section": "Прутки и шпильки"!
3. Для каждой детали обязательно извлеки:
   - "partLength" (Длину детали из размеров чертежа: L, длина вала/втулки/пластины в мм).
   - "isCnc" (Чекбокс ЧПУ: true если деталь требует обработки на ЧПУ).
4. Если на чертеже нет рамки и нет штампа — найди любой опознавательный знак (маркировку, номер позиции, габарит эскиза) и внеси в designation с флагом hasNoStamp: true.
Для стандартов извлеки код 1С.`;

    const pdfPart = {
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfBase64,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          pdfPart,
          { text: promptText },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    let parsedData: any;
    try {
      parsedData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Gemini JSON output:', responseText);
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedData = JSON.parse(match[0]);
      } else {
        throw new Error('Model did not return valid JSON');
      }
    }

    const rawItems = Array.isArray(parsedData.items) ? parsedData.items : [];

    // Filter out title sheets and cover pages (e.g. section dividers)
    const realRawItems = rawItems.filter((item: any) => !isTitleOrCoverSheet(item));

    // Map and sanitize items
    const formattedItems = processRawGeminiItems(realRawItems);

    return res.json({
      success: true,
      items: formattedItems,
      detectedSections: parsedData.detectedSections || [],
      count: formattedItems.length,
    });
  } catch (error: any) {
    console.error('Error in /api/extract-drawings:', error);
    const msg = error?.message || String(error);
    res.status(500).json({
      error: `Ошибка при обработке PDF: ${msg}`,
      details: msg,
    });
  }
});

/**
 * Lightweight text-based extraction endpoint.
 * Accepts pre-extracted page texts from the client (15-50KB JSON payload),
 * completely eliminating network timeouts and payload limits on large PDF drawings.
 */
app.post('/api/extract-drawings-text', async (req, res) => {
  try {
    const { fileName, pageTexts } = req.body;

    if (!Array.isArray(pageTexts) || pageTexts.length === 0) {
      return res.status(400).json({ error: 'Page texts array is empty' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        success: true,
        isDemoFallback: true,
        items: getFallbackDemoItems(),
      });
    }

    const pagesSummary = pageTexts
      .map((p: any) => `[СТРАНИЦА ${p.pageNumber || '?'}]\n${String(p.text || '').slice(0, 1500)}`)
      .join('\n\n');

    const promptText = `Пожалуйста, проанализируй текстовый слой страниц комплекта чертежей "${fileName || 'чертежи.pdf'}".
Каждая страница чертежа представлена ниже с ее номером и текстом штампов/размеров/надписей:

${pagesSummary}

ВАЖНЕЙШИЕ ПРАВИЛА:
1. Титульные листы разделов (страницы с названиями разделов) НЕ ДОБАВЛЯЙ в список деталей items!
2. Для ЛЮБЫХ шпилек (ГОСТ 22032..22043, ГОСТ 9066, DIN 975, DIN 976), прутков, резьбовых штанг или любых деталей, идущих за титульным листом "Прутки и шпильки": ОБЯЗАТЕЛЬНО установи "isRodOrStud": true и "section": "Прутки и шпильки"!
3. Для каждой детали обязательно извлеки:
   - "name": наименование детали из штампа
   - "designation": обозначение чертежа ЕСКД
   - "partLength": длина детали L из размеров (например "180 мм", "350")
   - "isCnc": булево true если ЧПУ
   - "section": "Токарные+фрезерные работы" | "Токарные+фрезерные работы: Лазер" | "Токарные+фрезерные работы: ВОС" | "Стандарты" | "Прутки и шпильки"
   - "material": марка материала
   - "pageNumber": номер страницы
4. Если рамки и штампа нет — укажи найденный опознавательный знак в designation с hasNoStamp: true.`;

    const systemInstruction = `Ты — ведущий инженер-технолог и нормоконтролер машиностроительного производства.
Твоя задача — детально проанализировать текст страниц комплекта чертежей по ЕСКД и выделить спецификацию деталей.
Верни ответ в формате JSON:
{
  "detectedSections": ["Токарные+фрезерные работы", ...],
  "items": [
    {
      "name": "string",
      "designation": "string",
      "quantity": 10,
      "code1C": "string",
      "partLength": "180 мм",
      "isCnc": true,
      "isRodOrStud": false,
      "hasNoStamp": false,
      "identificationMark": "",
      "section": "Токарные+фрезерные работы",
      "material": "string",
      "pageNumber": 2,
      "isHighlighted": false,
      "notes": "string"
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    let parsedData: any;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) parsedData = JSON.parse(match[0]);
      else throw new Error('Model did not return valid JSON');
    }

    const rawItems = Array.isArray(parsedData.items) ? parsedData.items : [];
    const realRawItems = rawItems.filter((item: any) => !isTitleOrCoverSheet(item));
    const formattedItems = processRawGeminiItems(realRawItems);

    return res.json({
      success: true,
      items: formattedItems,
      detectedSections: parsedData.detectedSections || [],
      count: formattedItems.length,
    });
  } catch (error: any) {
    console.error('Error in /api/extract-drawings-text:', error);
    const msg = error?.message || String(error);
    res.status(500).json({
      error: `Ошибка при обработке текста PDF: ${msg}`,
      details: msg,
    });
  }
});

function processRawGeminiItems(realRawItems: any[]): any[] {
  return realRawItems.map((item: any, idx: number) => {
    const name = item.name || `Деталь поз. ${idx + 1}`;
    const des = item.designation || (item.identificationMark ? `Опознано: ${item.identificationMark}` : `Чертеж без номера (лист ${item.pageNumber || idx + 1})`);
    const notes = item.notes || '';
    const rawSec = String(item.section || '').trim();
    const sec = sanitizeSection(rawSec);

    const isRod = (
      Boolean(item.isRodOrStud) ||
      rawSec.toLowerCase().includes('прут') ||
      rawSec.toLowerCase().includes('шпильк') ||
      sec.toLowerCase().includes('прут') ||
      sec.toLowerCase().includes('шпильк') ||
      name.toLowerCase().includes('прут') ||
      name.toLowerCase().includes('шпильк') ||
      name.toLowerCase().includes('штанга') ||
      name.toLowerCase().includes('стержен') ||
      des.toLowerCase().includes('прут') ||
      des.toLowerCase().includes('шпильк') ||
      des.toLowerCase().includes('штанга') ||
      des.toLowerCase().includes('стержен') ||
      notes.toLowerCase().includes('прут') ||
      notes.toLowerCase().includes('шпильк') ||
      /220(3[2-9]|4[0-3])/i.test(des) ||
      /220(3[2-9]|4[0-3])/i.test(name) ||
      /9066/i.test(des) ||
      /9066/i.test(name) ||
      /97[56]/i.test(des) ||
      /97[56]/i.test(name)
    );

    return {
      id: `ext-${Date.now()}-${idx}`,
      name,
      designation: des,
      quantity: typeof item.quantity === 'number' ? item.quantity : null,
      code1C: item.code1C || '',
      partLength: item.partLength ? String(item.partLength) : '',
      isCnc: Boolean(item.isCnc),
      isPieceStock: Boolean(item.isPieceStock),
      isRodOrStud: Boolean(isRod),
      hasNoStamp: Boolean(item.hasNoStamp || (!item.designation && item.identificationMark)),
      identificationMark: item.identificationMark || '',
      section: sec,
      material: item.material || '',
      pageNumber: typeof item.pageNumber === 'number' ? item.pageNumber : (idx + 1),
      isHighlighted: Boolean(item.isHighlighted),
      notes,
      qtySource: typeof item.quantity === 'number' ? 'drawing' : 'missing',
    };
  });
}

function sanitizeSection(rawSection: string): string {
  if (!rawSection) return 'Токарные+фрезерные работы';
  const s = rawSection.toLowerCase();
  if (s.includes('прут') || s.includes('шпильк')) return 'Прутки и шпильки';
  if (s.includes('лазер')) return 'Токарные+фрезерные работы: Лазер';
  if (s.includes('вос')) return 'Токарные+фрезерные работы: ВОС';
  if (s.includes('стандарт') || s.includes('гост') || s.includes('din') || s.includes('крепеж')) return 'Стандарты';
  return 'Токарные+фрезерные работы';
}

function isTitleOrCoverSheet(item: any): boolean {
  if (!item) return true;
  const name = String(item.name || '').trim().toLowerCase();
  const des = String(item.designation || '').trim().toLowerCase();
  const notes = String(item.notes || '').trim().toLowerCase();

  // Obvious keywords marking title or cover sheets
  if (name.includes('титул') || des.includes('титул') || notes.includes('титул')) return true;
  if (name.includes('разделител') || des.includes('разделител') || notes.includes('разделител')) return true;
  if (name.startsWith('раздел:') || des.startsWith('раздел:') || name.startsWith('раздел ') || des.startsWith('раздел ')) return true;
  if (name === 'оглавление' || name === 'содержание' || des === 'оглавление' || des === 'содержание') return true;
  if (name.includes('ведомость документов') || des.includes('ведомость документов')) return true;

  // Exact section titles repeated without any real part details
  const sectionKeywords = [
    'токарные+фрезерные работы',
    'токарные и фрезерные работы',
    'токарно-фрезерные работы',
    'токарные+фрезерные работы: лазер',
    'токарные+фрезерные работы: вос',
    'лазер',
    'вос',
    'стандарты',
    'стандартные изделия',
  ];

  for (const kw of sectionKeywords) {
    if (name === kw || des === kw) {
      // If it doesn't have dimensions/length and has no material, it's just the section title page
      if (!item.partLength && !item.material) {
        return true;
      }
    }
  }

  return false;
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
