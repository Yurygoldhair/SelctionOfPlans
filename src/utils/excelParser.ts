import * as XLSX from 'xlsx';
import { DrawingItem, ExcelColumnMapping, ExcelMatchResult, isRodOrStud } from '../types';

/**
 * Normalizes designation string for robust comparison:
 * removes spaces, dots, hyphens, underscores, slashes, and lowercases.
 * Standardizes common Cyrillic/Latin lookalike letters.
 */
export function normalizeCode(str: string | null | undefined): string {
  if (!str) return '';
  let s = String(str).trim().toLowerCase();
  // Remove formatting marks
  s = s.replace(/[\s\.\-_\\\/,;:'"«»]/g, '');
  // Map common Latin to Cyrillic equivalents that frequently get mixed in CAD codes
  const latinToCyr: Record<string, string> = {
    a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у'
  };
  return s.split('').map(char => latinToCyr[char] || char).join('');
}

/**
 * Parses ESKD drawing code into structural components:
 * base code (e.g. 711142.012) and execution suffix (e.g. -01).
 * Also extracts embedded ESKD code from descriptive strings (e.g. "Втулка АБВГ.711142.012").
 */
export interface EskdCodeInfo {
  raw: string;
  normalized: string;
  coreDigits: string;    // E.g. "711142012"
  execution: string;     // E.g. "01", "02", or "" for base
  isEskd: boolean;
}

export function parseEskdCode(str: string | null | undefined): EskdCodeInfo {
  if (!str) return { raw: '', normalized: '', coreDigits: '', execution: '', isEskd: false };
  const raw = String(str).trim();
  const normalized = normalizeCode(raw);

  // Look for execution suffix like -01, -02, -03 at the end of the code
  const execMatch = raw.match(/[-_](\d{2,3})\s*$/);
  const execution = execMatch ? execMatch[1] : '';

  // Check if string contains an embedded ESKD pattern: 6 digits + dot/dash + 3 digits
  const embeddedMatch = raw.match(/(\d{6})[.\-_](\d{3})/);
  if (embeddedMatch) {
    const coreDigits = `${embeddedMatch[1]}${embeddedMatch[2]}`;
    return {
      raw,
      normalized,
      coreDigits,
      execution,
      isEskd: true,
    };
  }

  // Extract core classification and serial digits (at least 6-9 digits)
  const withoutExec = execMatch ? raw.substring(0, execMatch.index) : raw;
  const digits = normalizeCode(withoutExec).replace(/[^0-9]/g, '');

  return {
    raw,
    normalized,
    coreDigits: digits,
    execution,
    isEskd: digits.length >= 6,
  };
}

/**
 * Extracts digits core for ESKD code comparison.
 * E.g. "АБВГ.711142.012" -> "711142012"
 */
export function extractDesigRoot(str: string | null | undefined): string {
  if (!str) return '';
  const info = parseEskdCode(str);
  return info.coreDigits;
}

/**
 * Cleans name string for comparison
 */
export function normalizeName(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\s\.\-_,;:\(\)'"«»]/g, '');
}

/**
 * Smart quantity parser: handles strings with units ("12 шт", "12.0", "1 200"),
 * SheetJS cell objects ({ v: 12 }), numbers, commas, and additions ("2+4").
 */
export function parseQuantity(raw: any): number | null {
  if (raw === null || raw === undefined || raw === '') return null;

  // Handle SheetJS cell objects where value is in .v or formatted text in .w
  if (typeof raw === 'object') {
    if (raw.v !== undefined && raw.v !== null && raw.v !== '') {
      raw = raw.v;
    } else if (raw.w !== undefined && raw.w !== null && raw.w !== '') {
      raw = raw.w;
    }
  }

  if (typeof raw === 'number') {
    if (isNaN(raw)) return null;
    return Math.round(raw);
  }

  let s = String(raw).trim();
  // Remove unit suffixes (шт, шт., pcs, ед, ед., компл, компл.)
  s = s.replace(/(шт|шт\.|pcs|ед|ед\.|компл|компл\.)/gi, '').trim();
  // Remove space thousands separators (e.g. "1 200" -> "1200")
  s = s.replace(/\s+/g, '');
  // Replace comma with dot
  s = s.replace(',', '.');

  // If it's a simple math expression like "4+2"
  if (/^\d+\+\d+$/.test(s)) {
    const parts = s.split('+');
    return Number(parts[0]) + Number(parts[1]);
  }

  // Remove any remaining non-numeric characters except dot and minus
  const clean = s.replace(/[^0-9.-]/g, '');
  if (!clean) return null;
  const num = parseFloat(clean);
  if (isNaN(num)) return null;
  return Math.round(num);
}

/**
 * Checks if a designation or name represents standard hardware (GOST, DIN, ISO, fasteners, bearings)
 */
export function isStandardHardware(str: string | null | undefined): boolean {
  if (!str) return false;
  const s = String(str).toLowerCase();
  return (
    s.includes('гост') ||
    s.includes('din') ||
    s.includes('iso') ||
    s.includes('ост') ||
    s.includes('ту ') ||
    s.includes('болт') ||
    s.includes('винт') ||
    s.includes('гайка') ||
    s.includes('шайба') ||
    s.includes('шплинт')
  );
}

/**
 * Extracts thread/diameter and length from hardware designation and name.
 * E.g. "Болт М8-6gх25.58" -> "м8х25"
 * "Гайка М8-6Н" -> "м8"
 * "Шайба 8.65Г" -> "8"
 * "DIN 912 М6х16" -> "м6х16"
 */
export function extractHardwareSize(desig: string | null | undefined, name: string | null | undefined): string {
  const combined = `${desig || ''} ${name || ''}`.toLowerCase();
  // Match thread and length like М8х25, M8x25, М8-6gх25, M10*50, M12x1.5x40
  const threadMatch = combined.match(/(?:м|m)\s*(\d+(?:\.\d+)?)(?:[^\d]{0,8}(?:х|x|×|\*)\s*(\d+(?:\.\d+)?))?/i);
  if (threadMatch) {
    return threadMatch[2] ? `м${threadMatch[1]}х${threadMatch[2]}` : `м${threadMatch[1]}`;
  }
  // Match diameter like Ø32, D=32
  const diamMatch = combined.match(/(?:ø|диам|d=)\s*(\d+)/i);
  if (diamMatch) {
    return `d${diamMatch[1]}`;
  }
  // Match washer diameter e.g. 8.65Г, 10 DIN 127
  const washerMatch = combined.match(/\b(\d+(?:\.\d+)?)\b/);
  if (washerMatch) {
    return washerMatch[1];
  }
  return '';
}

/**
 * Reads an ArrayBuffer or binary string into sheet rows.
 * Highly robust multi-row header scanner:
 * 1. Checks all sheets in workbook, ranks by relevance to BOM/parts list and row count.
 * 2. Scans up to first 25 rows for the true header row with smart scoring.
 * 3. Never truncates columns; captures all data rows.
 */
export function parseExcelFile(data: ArrayBuffer | Uint8Array): {
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  rows: Record<string, any>[];
} {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetNames = workbook.SheetNames || [];

  if (sheetNames.length === 0) {
    return { sheetNames: [], activeSheet: '', headers: [], rows: [] };
  }

  // Rank sheets: prefer sheets with names like "спецификация", "детали", "bom", "ведомость"
  let activeSheet = sheetNames[0];
  let bestSheetScore = -1;

  for (const sName of sheetNames) {
    const ws = workbook.Sheets[sName];
    if (!ws) continue;
    let rowCount = 0;
    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      rowCount = range.e.r - range.s.r + 1;
    } else {
      const m = XLSX.utils.sheet_to_json(ws, { header: 1 });
      rowCount = m.length;
    }
    if (rowCount <= 0) continue;

    const lowerName = sName.toLowerCase();
    let score = rowCount;
    if (lowerName.includes('специфик') || lowerName.includes('детал') || lowerName.includes('ведомост') || lowerName.includes('bom') || lowerName.includes('заказ')) {
      score += 10000;
    }
    if (score > bestSheetScore) {
      bestSheetScore = score;
      activeSheet = sName;
    }
  }

  const worksheet = workbook.Sheets[activeSheet];
  if (!worksheet) {
    return { sheetNames, activeSheet, headers: [], rows: [] };
  }

  // Get raw matrix (2D array of all cells)
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (rawMatrix.length === 0) {
    return { sheetNames, activeSheet, headers: [], rows: [] };
  }

  const idKeywords = ['обозначен', 'чертеж', 'чертёж', 'шифр', 'деталь', 'артикул', 'код', 'номенклатур', 'наименован', 'позици', 'товар'];
  const qtyKeywords = ['кол-во', 'количеств', 'к-во', 'кол.', 'кол_', 'кол', 'qty', 'шт', 'всего', 'заказ'];

  // Scan up to 25 rows to find the row with the best header match score
  let bestRowIdx = 0;
  let maxScore = -1;
  const scanLimit = Math.min(rawMatrix.length, 25);

  for (let r = 0; r < scanLimit; r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row)) continue;

    let idMatches = 0;
    let qtyMatches = 0;
    let nonBlankCells = 0;

    for (const cell of row) {
      const text = String(cell || '').trim().toLowerCase();
      if (!text) continue;
      nonBlankCells++;
      if (idKeywords.some(kw => text.includes(kw))) idMatches++;
      if (qtyKeywords.some(kw => text.includes(kw))) qtyMatches++;
    }

    let rowScore = (idMatches * 3) + (qtyMatches * 4);
    if (idMatches > 0 && qtyMatches > 0) rowScore += 10;
    if (nonBlankCells >= 2) rowScore += 2;

    if (rowScore > maxScore && rowScore >= 2) {
      maxScore = rowScore;
      bestRowIdx = r;
    }
  }

  // Determine max number of columns across header row and subsequent data rows
  const maxCols = Math.max(
    (rawMatrix[bestRowIdx] || []).length,
    ...rawMatrix.slice(bestRowIdx + 1, bestRowIdx + 15).map(r => (r && Array.isArray(r) ? r.length : 0))
  );

  const rawHeaders = rawMatrix[bestRowIdx] || [];
  const headers: string[] = [];
  const colIndices: number[] = [];

  for (let colIdx = 0; colIdx < maxCols; colIdx++) {
    const h = rawHeaders[colIdx];
    let title = String(h || '').trim();
    if (!title) {
      // Check if this column has non-empty values below it
      const hasColumnData = rawMatrix.slice(bestRowIdx + 1, bestRowIdx + 20).some(r => r && r[colIdx] !== '' && r[colIdx] !== undefined);
      if (hasColumnData) {
        title = `Колонка_${colIdx + 1}`;
      }
    }
    if (title) {
      let uniqueTitle = title;
      let counter = 1;
      while (headers.includes(uniqueTitle)) {
        uniqueTitle = `${title}_${counter++}`;
      }
      headers.push(uniqueTitle);
      colIndices.push(colIdx);
    }
  }

  const rows: Record<string, any>[] = [];
  for (let r = bestRowIdx + 1; r < rawMatrix.length; r++) {
    const rawRow = rawMatrix[r];
    if (!Array.isArray(rawRow)) continue;
    const hasData = rawRow.some(c => c !== '' && c !== null && c !== undefined);
    if (!hasData) continue;

    const rowObj: Record<string, any> = {};
    headers.forEach((hName, idx) => {
      const cIdx = colIndices[idx];
      rowObj[hName] = rawRow[cIdx] !== undefined ? rawRow[cIdx] : '';
    });
    rows.push(rowObj);
  }

  return {
    sheetNames,
    activeSheet,
    headers,
    rows,
  };
}

/**
 * Auto-detects columns for designation, name, quantity, 1C code, length, CNC.
 * Supports content-aware detection based on actual cell values if header names are generic.
 */
export function autoDetectColumns(headers: string[], sampleRows?: Record<string, any>[]): ExcelColumnMapping {
  const mapping: ExcelColumnMapping = {
    designationCol: '',
    nameCol: '',
    quantityCol: '',
    code1CCol: '',
    sectionCol: '',
    lengthCol: '',
    cncCol: '',
  };

  const lowerHeaders = headers.map(h => ({ original: h, lower: h.trim().toLowerCase() }));

  // 1. Designation (Обозначение / Чертеж / № чертежа / Код детали / Артикул / Шифр / Номенклатура)
  const desigCandidate = lowerHeaders.find(h =>
    h.lower.includes('чертеж') ||
    h.lower.includes('чертёж') ||
    h.lower.includes('обозначен') ||
    h.lower.includes('шифр') ||
    h.lower.includes('артикул') ||
    h.lower.includes('код детали') ||
    h.lower.includes('part') ||
    h.lower.includes('drawing')
  );
  if (desigCandidate) mapping.designationCol = desigCandidate.original;

  // 2. Name (Наименование / Название / Описание / Номенклатура / Деталь)
  const nameCandidate = lowerHeaders.find(h =>
    h.lower.includes('наименован') ||
    h.lower.includes('назван') ||
    h.lower.includes('номенклатур') ||
    h.lower.includes('описан') ||
    h.lower.includes('деталь') ||
    h.lower.includes('item') ||
    h.lower.includes('name') ||
    h.lower.includes('desc')
  );
  if (nameCandidate) mapping.nameCol = nameCandidate.original;

  // 3. Quantity:
  let qtyCandidate = lowerHeaders.find(h => {
    const l = h.lower;
    return (
      l.includes('кол-во на заказ') ||
      l.includes('кол-во всего') ||
      l.includes('количество на заказ') ||
      l.includes('количество всего') ||
      l.includes('итого кол') ||
      l.includes('всего кол')
    );
  });

  if (!qtyCandidate) {
    qtyCandidate = lowerHeaders.find(h => {
      const l = h.lower;
      if (
        l.includes('номер') ||
        l.includes('№') ||
        l.includes('масс') ||
        l.includes('вес') ||
        l.includes('длин') ||
        l.includes('код') ||
        l.includes('цен') ||
        l.includes('стоим') ||
        l.includes('руб') ||
        l.includes('позиц')
      ) {
        return false;
      }
      return (
        l.includes('кол-во') ||
        l.includes('количеств') ||
        l.includes('к-во') ||
        l.includes('кол.') ||
        l.includes('кол_во') ||
        l.includes('кол ') ||
        l === 'кол' ||
        l.includes('qty') ||
        l.includes('quantity') ||
        l.includes('шт.') ||
        l.includes('штук') ||
        l === 'шт'
      );
    });
  }

  if (!qtyCandidate) {
    qtyCandidate = lowerHeaders.find(h => {
      const l = h.lower;
      return (l.includes('всего') || l.includes('заказ') || l.includes('план')) && (l.includes('кол') || l.includes('шт'));
    });
  }

  if (qtyCandidate) mapping.quantityCol = qtyCandidate.original;

  // 4. 1C Code
  const code1CCandidate = lowerHeaders.find(h =>
    h.lower.includes('1с') ||
    h.lower.includes('1c') ||
    h.lower.includes('код номенклатур') ||
    h.lower.includes('код товара') ||
    (h.lower.includes('код') && !h.lower.includes('обозначен') && !h.lower.includes('чертеж') && !h.lower.includes('детал'))
  );
  if (code1CCandidate) mapping.code1CCol = code1CCandidate.original;

  // 5. Length
  const lengthCandidate = lowerHeaders.find(h =>
    h.lower.includes('длина') ||
    h.lower.includes('длинна') ||
    h.lower === 'l' ||
    h.lower.includes('l,') ||
    h.lower.includes('l (мм)') ||
    h.lower.includes('length')
  );
  if (lengthCandidate) mapping.lengthCol = lengthCandidate.original;

  // 6. CNC
  const cncCandidate = lowerHeaders.find(h =>
    h.lower.includes('чпу') ||
    h.lower.includes('cnc')
  );
  if (cncCandidate) mapping.cncCol = cncCandidate.original;

  // 7. Section
  const secCandidate = lowerHeaders.find(h =>
    h.lower.includes('раздел') ||
    h.lower.includes('цех') ||
    h.lower.includes('вид работ')
  );
  if (secCandidate) mapping.sectionCol = secCandidate.original;

  // CONTENT-AWARE FALLBACK (inspecting cell values if headers didn't match)
  if (sampleRows && sampleRows.length > 0) {
    const rowsToCheck = sampleRows.slice(0, 10);

    // If designationCol is missing, look for column containing ESKD / drawing patterns or GOST/DIN
    if (!mapping.designationCol) {
      for (const h of headers) {
        if (h === mapping.quantityCol || h === mapping.lengthCol) continue;
        const hasEskd = rowsToCheck.some(r => {
          const val = String(r[h] || '');
          return /[а-яa-z]{4}\.?\d{6}/i.test(val) || /\d{6}\.\d{3}/.test(val) || /гост/i.test(val) || /din/i.test(val);
        });
        if (hasEskd) {
          mapping.designationCol = h;
          break;
        }
      }
    }

    // If quantityCol is missing, look for column with numeric values
    if (!mapping.quantityCol) {
      for (const h of headers) {
        if (h === mapping.designationCol || /^(№|№\s*п\/п|п\/п|n|pos|id)$/i.test(h.trim())) continue;
        const allNumbers = rowsToCheck.every(r => {
          const val = r[h];
          return val === '' || val === undefined || parseQuantity(val) !== null;
        });
        const hasPositive = rowsToCheck.some(r => (parseQuantity(r[h]) || 0) > 0);
        if (allNumbers && hasPositive) {
          mapping.quantityCol = h;
          break;
        }
      }
    }

    // If nameCol is missing, pick column with text part names
    if (!mapping.nameCol) {
      for (const h of headers) {
        if (h === mapping.designationCol || h === mapping.quantityCol || /^(№|№\s*п\/п|п\/п|n|pos|id)$/i.test(h.trim())) continue;
        const hasWords = rowsToCheck.some(r => {
          const s = String(r[h] || '').toLowerCase();
          return s.length >= 4 && /[а-яa-z]{3,}/i.test(s);
        });
        if (hasWords) {
          mapping.nameCol = h;
          break;
        }
      }
    }
  }

  // Safe non-index fallbacks
  if (!mapping.designationCol && headers.length > 0) {
    const nonIndex = headers.find(h => !/^(№|№\s*п\/п|п\/п|n|pos|id)$/i.test(h.trim()));
    mapping.designationCol = nonIndex || headers[0];
  }
  if (!mapping.nameCol && headers.length > 1) {
    const nonDesig = headers.find(h => h !== mapping.designationCol && !/^(№|№\s*п\/п|п\/п|n|pos|id)$/i.test(h.trim()));
    mapping.nameCol = nonDesig || headers[1];
  }
  if (!mapping.quantityCol && headers.length > 2) {
    const nonUsed = headers.find(h => h !== mapping.designationCol && h !== mapping.nameCol && !/^(№|№\s*п\/п|п\/п|n|pos|id)$/i.test(h.trim()));
    mapping.quantityCol = nonUsed || headers[2];
  }

  return mapping;
}

/**
 * Reconciles current drawing items with rows from the Excel file:
 * - Matches existing items (exact designation, 1C code, standard hardware + size, ESKD root, embedded codes, name)
 * - Sums genuine duplicate BOM rows
 * - Collects unmatched rows from Excel into newItemsFromExcel so they can be added to the table!
 */
export function reconcileQuantities(
  currentItems: DrawingItem[],
  excelRows: Record<string, any>[],
  mapping: ExcelColumnMapping
): ExcelMatchResult {
  const updatedItems: ExcelMatchResult['updatedItems'] = [];
  let matchedByDesignation = 0;
  let matchedByName = 0;
  let newCodes1CAdded = 0;

  interface ExcelEntry {
    rowIndex: number;
    row: Record<string, any>;
    rawDesig: string;
    rawName: string;
    normDesig: string;
    normName: string;
    eskdInfo: EskdCodeInfo;
    isStandard: boolean;
    hardwareSize: string;
    qty: number;
  }

  // Pre-process all Excel rows
  const parsedExcelEntries: ExcelEntry[] = excelRows.map((row, idx) => {
    const rawDesig = mapping.designationCol ? String(row[mapping.designationCol] || '').trim() : '';
    const rawName = mapping.nameCol ? String(row[mapping.nameCol] || '').trim() : '';
    const rawQty = mapping.quantityCol ? row[mapping.quantityCol] : undefined;

    let normDesig = normalizeCode(rawDesig);
    const normName = normalizeName(rawName);
    
    // Parse ESKD code from designation, or fallback to extracting embedded code from name
    let eskdInfo = parseEskdCode(rawDesig);
    if (!eskdInfo.isEskd && rawName) {
      const nameEskd = parseEskdCode(rawName);
      if (nameEskd.isEskd) {
        eskdInfo = nameEskd;
        if (!normDesig) {
          normDesig = normalizeCode(nameEskd.raw);
        }
      }
    }

    const isStandard = isStandardHardware(rawDesig) || isStandardHardware(rawName);
    const hardwareSize = isStandard ? extractHardwareSize(rawDesig, rawName) : '';

    return {
      rowIndex: idx + 1,
      row,
      rawDesig,
      rawName,
      normDesig,
      normName,
      eskdInfo,
      isStandard,
      hardwareSize,
      qty: parseQuantity(rawQty) ?? 0,
    };
  });

  // Track which Excel row indices matched an existing drawing item
  const matchedExcelRowIndices = new Set<number>();

  // Reconcile each drawing item
  for (const item of currentItems) {
    const itemNormDesig = normalizeCode(item.designation);
    const itemEskd = parseEskdCode(item.designation);
    const itemNormName = normalizeName(item.name);
    const itemIsStandard = isStandardHardware(item.designation) || item.section === 'Стандарты';
    const itemHardwareSize = extractHardwareSize(item.designation, item.name);
    const itemNorm1C = normalizeCode(item.code1C);

    let matchedEntries: ExcelEntry[] = [];
    let matchType: 'designation' | 'name' | 'desig_root' = 'designation';

    // 1. Exact normalized designation match (highest confidence)
    if (itemNormDesig) {
      const exactDesigMatches = parsedExcelEntries.filter(e => e.normDesig === itemNormDesig);
      if (exactDesigMatches.length > 0) {
        matchedEntries = exactDesigMatches;
        matchType = 'designation';
      }
    }

    // 2. 1C Code Match (if both item and Excel row have 1C code)
    if (matchedEntries.length === 0 && itemNorm1C && mapping.code1CCol) {
      const by1C = parsedExcelEntries.filter(e => {
        const row1C = normalizeCode(e.row[mapping.code1CCol!]);
        return row1C && row1C === itemNorm1C;
      });
      if (by1C.length > 0) {
        matchedEntries = by1C;
        matchType = 'designation';
      }
    }

    // 3. Standard Hardware (ГОСТ, DIN, ISO крепеж):
    // Standard designation + STRICT size match (M8x25 must NEVER match M8x30!)
    if (matchedEntries.length === 0 && itemIsStandard) {
      const byStandardAndSize = parsedExcelEntries.filter(e => {
        if (!e.isStandard) return false;

        const stdDesigMatch = (
          (itemEskd.coreDigits && e.eskdInfo.coreDigits && itemEskd.coreDigits === e.eskdInfo.coreDigits) ||
          (itemNormDesig && e.normDesig && (itemNormDesig.includes(e.normDesig) || e.normDesig.includes(itemNormDesig)))
        );
        if (!stdDesigMatch) return false;

        // Size check: If item has a size (e.g. "м8х25"), Excel MUST match that exact size!
        if (itemHardwareSize && e.hardwareSize) {
          return itemHardwareSize === e.hardwareSize;
        }

        return e.normName === itemNormName || (itemNormName && e.normName.includes(itemNormName));
      });

      if (byStandardAndSize.length > 0) {
        matchedEntries = byStandardAndSize;
        matchType = 'designation';
      }
    }

    // 4. CAD Drawing Item (ESKD machined parts):
    if (matchedEntries.length === 0 && !itemIsStandard && itemEskd.isEskd) {
      // 4a. ESKD core digits + exact execution matching
      const eskdExactMatches = parsedExcelEntries.filter(e => {
        if (!e.eskdInfo.isEskd) return false;
        const coreMatch = e.eskdInfo.coreDigits === itemEskd.coreDigits;
        const execMatch = e.eskdInfo.execution === itemEskd.execution;
        return coreMatch && execMatch;
      });

      if (eskdExactMatches.length > 0) {
        matchedEntries = eskdExactMatches;
        matchType = 'desig_root';
      }

      // 4b. Prefix difference match (e.g. drawing has prefix "АБВГ.711142.012", Excel has "711142.012")
      if (matchedEntries.length === 0 && itemNormDesig.length >= 6) {
        const affixMatches = parsedExcelEntries.filter(e => {
          if (!e.normDesig || e.normDesig.length < 6) return false;
          const endsWithSame = itemNormDesig.endsWith(e.normDesig) || e.normDesig.endsWith(itemNormDesig);
          const execMatch = e.eskdInfo.execution === itemEskd.execution;
          const diff = Math.abs(itemNormDesig.length - e.normDesig.length);
          return endsWithSame && execMatch && diff <= 5;
        });

        if (affixMatches.length > 0) {
          matchedEntries = affixMatches;
          matchType = 'designation';
        }
      }
    }

    // 5. Embedded ESKD code or drawing number in row text (e.g. name contains the drawing designation)
    if (matchedEntries.length === 0) {
      if (itemEskd.isEskd) {
        const embeddedMatches = parsedExcelEntries.filter(e => {
          const fullRowText = `${e.rawDesig} ${e.rawName}`.toLowerCase();
          return fullRowText.includes(itemEskd.raw.toLowerCase()) || (itemEskd.coreDigits && fullRowText.includes(itemEskd.coreDigits));
        });
        if (embeddedMatches.length > 0) {
          matchedEntries = embeddedMatches;
          matchType = 'designation';
        }
      } else if (itemNormDesig && itemNormDesig.length >= 5) {
        const containsMatches = parsedExcelEntries.filter(e => {
          const fullRowText = `${e.rawDesig} ${e.rawName}`.toLowerCase();
          return fullRowText.includes(itemNormDesig.toLowerCase());
        });
        if (containsMatches.length > 0) {
          matchedEntries = containsMatches;
          matchType = 'designation';
        }
      }
    }

    // 6. Distinct full name match (last resort, only if name is distinctive)
    if (matchedEntries.length === 0 && itemNormName && itemNormName.length >= 6) {
      const nameMatches = parsedExcelEntries.filter(e => {
        return e.normName === itemNormName || (e.normName.length >= 8 && e.normName.includes(itemNormName));
      });
      if (nameMatches.length === 1) { // Only unambiguous 1-to-1 name match
        matchedEntries = nameMatches;
        matchType = 'name';
      }
    }

    if (matchedEntries.length > 0) {
      matchedEntries.forEach(e => matchedExcelRowIndices.add(e.rowIndex));

      const calculatedQty = matchedEntries.reduce((sum, e) => sum + e.qty, 0);
      const primaryRow = matchedEntries[0].row;

      // Extract 1C Code if available
      let code1CFound: string | undefined;
      if (mapping.code1CCol && primaryRow[mapping.code1CCol]) {
        code1CFound = String(primaryRow[mapping.code1CCol]).trim();
        if (code1CFound && !item.code1C) {
          newCodes1CAdded++;
        }
      }

      // Extract length if present
      if (mapping.lengthCol && primaryRow[mapping.lengthCol] && !item.partLength) {
        item.partLength = String(primaryRow[mapping.lengthCol]).trim();
      }

      // Extract CNC if present
      if (mapping.cncCol && primaryRow[mapping.cncCol] !== undefined && primaryRow[mapping.cncCol] !== '') {
        const val = String(primaryRow[mapping.cncCol]).toLowerCase();
        if (val === '1' || val === 'да' || val === 'true' || val === 'yes' || val === '+') {
          item.isCnc = true;
        } else if (val === '0' || val === 'нет' || val === 'false' || val === 'no' || val === '-') {
          item.isCnc = false;
        }
      }

      let sumDetails: string | undefined;
      if (matchedEntries.length > 1) {
        sumDetails = `${matchedEntries.map(e => e.qty).join(' + ')} = ${calculatedQty} шт. (строк Excel: ${matchedEntries.length})`;
      }

      if (matchType === 'name') matchedByName++;
      else matchedByDesignation++;

      updatedItems.push({
        item,
        oldQty: item.quantity,
        newQty: calculatedQty,
        matchType,
        matchedRow: primaryRow,
        code1CFound,
        sumRowCount: matchedEntries.length,
        sumDetails,
      });
    }
  }

  // 7. Collect UNMATCHED rows from Excel as brand new parts available to be added to the table!
  const newItemsMap = new Map<string, DrawingItem>();
  const junkPatterns = /^(итого|всего|лист|подпись|справка|примечание|масса|вес|разраб|пров|т\.контр|утв)$/i;

  parsedExcelEntries.forEach((entry, idx) => {
    if (!matchedExcelRowIndices.has(entry.rowIndex)) {
      let rawDesig = entry.rawDesig;
      let rawName = entry.rawName;

      // If designation is empty but name has embedded ESKD code, split them cleanly
      if (!rawDesig && rawName) {
        const eskd = parseEskdCode(rawName);
        if (eskd.isEskd) {
          rawDesig = eskd.raw;
          rawName = rawName.replace(eskd.raw, '').replace(/[()]/g, '').trim() || rawName;
        }
      }

      if (!rawDesig && !rawName) return;
      if (junkPatterns.test(rawDesig.trim()) || junkPatterns.test(rawName.trim())) return;

      const effectiveQty = entry.qty > 0 ? entry.qty : 1;
      const isStd = entry.isStandard || isStandardHardware(rawName) || isStandardHardware(rawDesig);
      const isRod = isRodOrStud({ name: rawName, designation: rawDesig });

      let sec: any = 'Токарные+фрезерные работы';
      if (isRod) sec = 'Прутки и шпильки';
      else if (isStd) sec = 'Стандарты';
      else if (rawName.toLowerCase().includes('лазер') || rawDesig.toLowerCase().includes('лазер')) sec = 'Токарные+фрезерные работы: Лазер';
      else if (rawName.toLowerCase().includes('вос') || rawDesig.toLowerCase().includes('вос')) sec = 'Токарные+фрезерные работы: ВОС';

      let code1C = '';
      if (mapping.code1CCol && entry.row[mapping.code1CCol]) {
        code1C = String(entry.row[mapping.code1CCol]).trim();
      }

      let length = '';
      if (mapping.lengthCol && entry.row[mapping.lengthCol]) {
        length = String(entry.row[mapping.lengthCol]).trim();
      }

      let isCnc = false;
      if (mapping.cncCol && entry.row[mapping.cncCol] !== undefined) {
        const val = String(entry.row[mapping.cncCol]).toLowerCase();
        isCnc = val === '1' || val === 'да' || val === 'true' || val === 'yes' || val === '+';
      }

      const dedupeKey = `${(rawDesig || '').trim().toLowerCase()}:::${(rawName || '').trim().toLowerCase()}`;
      if (newItemsMap.has(dedupeKey)) {
        const existing = newItemsMap.get(dedupeKey)!;
        existing.quantity = (existing.quantity || 0) + effectiveQty;
        existing.quantityPerMachine = existing.quantity;
        if (!existing.code1C && code1C) existing.code1C = code1C;
        if (!existing.partLength && length) existing.partLength = length;
        if (isCnc) existing.isCnc = true;
      } else {
        newItemsMap.set(dedupeKey, {
          id: `excel-new-${Date.now()}-${idx}`,
          name: rawName || rawDesig || `Деталь из Excel ${idx + 1}`,
          designation: rawDesig || rawName || `Позиция ${entry.rowIndex}`,
          quantity: effectiveQty,
          quantityPerMachine: effectiveQty,
          code1C,
          section: sec,
          partLength: length,
          isCnc,
          isPieceStock: false,
          isRodOrStud: isRod,
          hasNoStamp: false,
          identificationMark: '',
          qtySource: 'excel',
          pageNumber: 1,
        });
      }
    }
  });

  const newItemsFromExcel = Array.from(newItemsMap.values());

  return {
    totalRows: excelRows.length,
    matchedCount: updatedItems.length,
    matchedByDesignation,
    matchedByName,
    unmatchedCount: currentItems.length - updatedItems.length,
    newCodes1CAdded,
    updatedItems,
    newItemsFromExcel,
  };
}
