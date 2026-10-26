import * as XLSX from 'xlsx';
import { DrawingItem, ExcelColumnMapping, ExcelMatchResult } from '../types';

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
 * Extracts digits core for ESKD code comparison.
 * E.g. "АБВГ.711142.012" -> "711142012"
 * "711142-012" -> "711142012"
 */
export function extractDesigRoot(str: string | null | undefined): string {
  if (!str) return '';
  const norm = normalizeCode(str);
  return norm.replace(/[^0-9]/g, '');
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
 * numbers, commas, and additions ("2+4").
 */
export function parseQuantity(raw: any): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (isNaN(raw)) return null;
    return Math.round(raw);
  }
  let s = String(raw).trim();
  // Remove unit suffixes
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
 * Reads an ArrayBuffer or binary string into sheet rows.
 * Highly robust:
 * 1. Checks all sheets in the workbook and selects the sheet with the most data.
 * 2. Tries standard SheetJS JSON parsing first.
 * 3. If standard headers are blank or empty (__EMPTY), scans the first 10 rows for the real header row.
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

  // Find the sheet with the most populated rows (prevents picking empty cover sheets)
  let activeSheet = sheetNames[0];
  let maxRowCount = 0;

  for (const sName of sheetNames) {
    const ws = workbook.Sheets[sName];
    if (ws && ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      const count = range.e.r - range.s.r + 1;
      if (count > maxRowCount) {
        maxRowCount = count;
        activeSheet = sName;
      }
    }
  }

  const worksheet = workbook.Sheets[activeSheet];
  if (!worksheet) {
    return { sheetNames, activeSheet, headers: [], rows: [] };
  }

  // Try standard parsing first
  const stdRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  const stdHeaders = stdRows.length > 0 ? Object.keys(stdRows[0]) : [];

  const headerKeywords = [
    'обозначен', 'чертеж', 'чертёж', 'шифр', 'деталь', 'артикул', 'код',
    'наименован', 'назван', 'описан', 'номенклатур', 'позици',
    'количеств', 'кол-во', 'кол_', 'кол.', 'кол', 'qty', 'шт', 'материал', 'длина'
  ];

  // Check if standard headers already contain at least one good column name
  const hasGoodStdHeader = stdHeaders.some(h => {
    const lower = h.trim().toLowerCase();
    return headerKeywords.some(kw => lower.includes(kw));
  });

  if (hasGoodStdHeader && stdRows.length > 0) {
    return {
      sheetNames,
      activeSheet,
      headers: stdHeaders,
      rows: stdRows,
    };
  }

  // Fallback: Multi-row scan in case row 0 was a title or empty block
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (rawMatrix.length === 0) {
    return { sheetNames, activeSheet, headers: stdHeaders, rows: stdRows };
  }

  let headerRowIndex = 0;
  let foundHeader = false;

  const maxScan = Math.min(rawMatrix.length, 10);
  for (let r = 0; r < maxScan; r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row)) continue;
    let matchCount = 0;
    for (const cell of row) {
      const text = String(cell || '').trim().toLowerCase();
      if (!text) continue;
      if (headerKeywords.some(kw => text.includes(kw))) {
        matchCount++;
      }
    }
    // If a row has at least 2 header keywords or is the first with matches
    if (matchCount >= 2 || (matchCount >= 1 && r === 0)) {
      headerRowIndex = r;
      foundHeader = true;
      break;
    }
  }

  if (foundHeader && headerRowIndex < rawMatrix.length) {
    const rawHeaders = rawMatrix[headerRowIndex] || [];
    const headers: string[] = [];
    const colIndices: number[] = [];

    rawHeaders.forEach((h: any, colIdx: number) => {
      const title = String(h || '').trim();
      if (title) {
        let uniqueTitle = title;
        let counter = 1;
        while (headers.includes(uniqueTitle)) {
          uniqueTitle = `${title}_${counter++}`;
        }
        headers.push(uniqueTitle);
        colIndices.push(colIdx);
      }
    });

    if (headers.length > 0) {
      const rows: Record<string, any>[] = [];
      for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
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

      if (rows.length > 0) {
        return { sheetNames, activeSheet, headers, rows };
      }
    }
  }

  // Default fallback if all scans failed
  return {
    sheetNames,
    activeSheet,
    headers: stdHeaders,
    rows: stdRows,
  };
}

/**
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
    s.includes('гайк') ||
    s.includes('шайб') ||
    s.includes('шплинт') ||
    s.includes('подшипник') ||
    s.includes('кольцо')
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
 * Auto-detects columns for designation, name, quantity, 1C code, length, CNC.
 */
export function autoDetectColumns(headers: string[]): ExcelColumnMapping {
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

  // 1. Designation (Обозначение / Чертеж / Код детали / Артикул / Шифр / Номенклатура / Позиция)
  const desigCandidate = lowerHeaders.find(h =>
    h.lower === 'обозначение' ||
    h.lower === 'чертеж' ||
    h.lower === 'чертёж' ||
    h.lower === 'шифр' ||
    h.lower.startsWith('обозначен') ||
    h.lower.startsWith('чертеж') ||
    h.lower.startsWith('чертёж') ||
    h.lower.startsWith('шифр') ||
    h.lower.includes('код детали') ||
    h.lower.includes('артикул')
  );
  if (desigCandidate) mapping.designationCol = desigCandidate.original;

  // 2. Name (Наименование / Название / Описание / Номенклатура / Деталь)
  const nameCandidate = lowerHeaders.find(h =>
    h.lower === 'наименование' ||
    h.lower === 'название' ||
    h.lower.startsWith('наименован') ||
    h.lower.startsWith('назван') ||
    h.lower.includes('номенклатур') ||
    h.lower.includes('описан') ||
    h.lower.includes('деталь')
  );
  if (nameCandidate) mapping.nameCol = nameCandidate.original;

  // 3. Quantity:
  // First check exact standard column names
  let qtyCandidate = lowerHeaders.find(h =>
    h.lower === 'кол-во' ||
    h.lower === 'количество' ||
    h.lower === 'кол.' ||
    h.lower === 'кол' ||
    h.lower === 'кол_во' ||
    h.lower === 'qty' ||
    h.lower === 'quantity' ||
    h.lower === 'шт' ||
    h.lower === 'шт.'
  );

  // If not found, look for columns containing quantity/count but NOT price, weight, length, code, or position number
  if (!qtyCandidate) {
    qtyCandidate = lowerHeaders.find(h => {
      const l = h.lower;
      if (l.includes('номер') || l.includes('№') || l.includes('масс') || l.includes('вес') || l.includes('длин') || l.includes('код') || l.includes('цен') || l.includes('стоим') || l.includes('руб')) {
        return false;
      }
      return (
        l.includes('кол-во') ||
        l.includes('количеств') ||
        l.includes('кол.') ||
        l.includes('qty') ||
        l.includes('(шт)') ||
        l.includes('шт.')
      );
    });
  }

  // Fallback: total / order count
  if (!qtyCandidate) {
    qtyCandidate = lowerHeaders.find(h => {
      const l = h.lower;
      return (l.includes('всего') || l.includes('заказ') || l.includes('план') || l.includes('итого')) && (l.includes('кол') || l.includes('шт'));
    });
  }

  if (qtyCandidate) mapping.quantityCol = qtyCandidate.original;

  // 4. 1C Code (Код 1С / Код по 1С / Артикул 1С / Номенклатура 1С)
  const code1CCandidate = lowerHeaders.find(h =>
    h.lower.includes('1с') ||
    h.lower.includes('1c') ||
    h.lower.includes('код номенклатур') ||
    h.lower.includes('код товара') ||
    (h.lower.includes('код') && !h.lower.includes('обозначен') && !h.lower.includes('чертеж') && !h.lower.includes('детал'))
  );
  if (code1CCandidate) mapping.code1CCol = code1CCandidate.original;

  // 5. Length (Длина / Длина детали / L, мм / Габарит L)
  const lengthCandidate = lowerHeaders.find(h =>
    h.lower.includes('длина') ||
    h.lower.includes('длинна') ||
    h.lower === 'l' ||
    h.lower.includes('l,') ||
    h.lower.includes('l (мм)') ||
    h.lower.includes('length')
  );
  if (lengthCandidate) mapping.lengthCol = lengthCandidate.original;

  // 6. CNC (ЧПУ / CNC / Станок с ЧПУ)
  const cncCandidate = lowerHeaders.find(h =>
    h.lower.includes('чпу') ||
    h.lower.includes('cnc')
  );
  if (cncCandidate) mapping.cncCol = cncCandidate.original;

  // 7. Section (Раздел)
  const secCandidate = lowerHeaders.find(h =>
    h.lower.includes('раздел') ||
    h.lower.includes('цех') ||
    h.lower.includes('вид работ')
  );
  if (secCandidate) mapping.sectionCol = secCandidate.original;

  if (!mapping.designationCol && headers.length > 0) mapping.designationCol = headers[0];
  if (!mapping.nameCol && headers.length > 1) mapping.nameCol = headers[1];
  if (!mapping.quantityCol && headers.length > 2) mapping.quantityCol = headers[2];

  return mapping;
}

/**
 * Reconciles current drawing items with rows from the Excel file.
 * Handles:
 * - Exact designation matching
 * - ESKD part codes root matching (>= 8 digits)
 * - Standard hardware matching (standard designation + exact size M8x25)
 * - Exact name matching (>= 8 characters)
 * - Summation of exact duplicate BOM rows
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
    normDesig: string;
    desigRoot: string;
    normName: string;
    rawDesig: string;
    rawName: string;
    isStandard: boolean;
    hardwareSize: string;
    qty: number;
  }

  // Pre-process all Excel rows
  const parsedExcelEntries: ExcelEntry[] = excelRows.map((row, idx) => {
    const rawDesig = mapping.designationCol ? String(row[mapping.designationCol] || '').trim() : '';
    const rawName = mapping.nameCol ? String(row[mapping.nameCol] || '').trim() : '';
    const rawQty = mapping.quantityCol ? row[mapping.quantityCol] : undefined;

    const normDesig = normalizeCode(rawDesig);
    const desigRoot = extractDesigRoot(rawDesig);
    const normName = normalizeName(rawName);
    const isStandard = isStandardHardware(rawDesig) || isStandardHardware(rawName);
    const hardwareSize = isStandard ? extractHardwareSize(rawDesig, rawName) : '';

    return {
      rowIndex: idx + 1,
      row,
      normDesig,
      desigRoot,
      normName,
      rawDesig,
      rawName,
      isStandard,
      hardwareSize,
      qty: parseQuantity(rawQty) ?? 0,
    };
  });

  // Reconcile each drawing item
  for (const item of currentItems) {
    const itemNormDesig = normalizeCode(item.designation);
    const itemRoot = extractDesigRoot(item.designation);
    const itemNormName = normalizeName(item.name);
    const itemIsStandard = isStandardHardware(item.designation) || isStandardHardware(item.name);
    const itemHardwareSize = itemIsStandard ? extractHardwareSize(item.designation, item.name) : '';
    const itemNorm1C = normalizeCode(item.code1C);

    let matchedEntries: ExcelEntry[] = [];
    let matchType: 'designation' | 'name' | 'desig_root' = 'designation';

    // A. 1C Code Match (if both item and Excel row have 1C code)
    if (itemNorm1C && mapping.code1CCol) {
      const by1C = parsedExcelEntries.filter(e => {
        const row1C = normalizeCode(e.row[mapping.code1CCol!]);
        return row1C && row1C === itemNorm1C;
      });
      if (by1C.length > 0) {
        matchedEntries = by1C;
        matchType = 'designation';
      }
    }

    // B. Standard Hardware (ГОСТ, DIN, ISO крепеж):
    // MUST match BOTH the standard and the thread/size (e.g. M8x25)!
    if (matchedEntries.length === 0 && itemIsStandard) {
      const byStandardAndSize = parsedExcelEntries.filter(e => {
        if (!e.isStandard) return false;

        const stdMatch = (
          (itemRoot && itemRoot.length >= 4 && e.desigRoot === itemRoot) ||
          (itemNormDesig && e.normDesig && (itemNormDesig.includes(e.normDesig) || e.normDesig.includes(itemNormDesig)))
        );

        if (!stdMatch) return false;

        // Size check: If item has a size (e.g. "м8х25"), Excel MUST match that size!
        if (itemHardwareSize && e.hardwareSize) {
          return itemHardwareSize === e.hardwareSize;
        }

        // Fallback: exact full name match
        return e.normName === itemNormName;
      });

      if (byStandardAndSize.length > 0) {
        matchedEntries = byStandardAndSize;
        matchType = 'designation';
      }
    }

    // C. Non-standard CAD Drawing Item:
    if (matchedEntries.length === 0 && !itemIsStandard) {
      // 1. Exact normalized designation match (highest confidence)
      if (itemNormDesig) {
        const exactDesigMatches = parsedExcelEntries.filter(e => e.normDesig === itemNormDesig);
        if (exactDesigMatches.length > 0) {
          matchedEntries = exactDesigMatches;
          matchType = 'designation';
        }
      }

      // 2. ESKD code root match (digits only, e.g. "АБВГ.711142.012" vs "711142.012" or "711142-012")
      // MUST have at least 8 digits (6 class + 2-3 registration number) to be unique!
      // NEVER match short 5-6 digit roots (which are just subassembly group numbers)!
      if (matchedEntries.length === 0 && itemRoot && itemRoot.length >= 8) {
        const rootMatches = parsedExcelEntries.filter(e => !e.isStandard && e.desigRoot === itemRoot);
        if (rootMatches.length > 0) {
          matchedEntries = rootMatches;
          matchType = 'desig_root';
        }
      }

      // 3. Strict prefix/suffix match (e.g. drawing has company prefix "АБВГ.711142.012", Excel has "711142.012")
      if (matchedEntries.length === 0 && itemNormDesig && itemNormDesig.length >= 8) {
        const prefixMatches = parsedExcelEntries.filter(e => {
          if (e.isStandard || !e.normDesig || e.normDesig.length < 8) return false;
          const isSuffix = itemNormDesig.endsWith(e.normDesig) || e.normDesig.endsWith(itemNormDesig);
          const diff = Math.abs(itemNormDesig.length - e.normDesig.length);
          return isSuffix && diff <= 5;
        });
        if (prefixMatches.length > 0) {
          matchedEntries = prefixMatches;
          matchType = 'designation';
        }
      }

      // 4. Exact full name match (only if designation wasn't matched and name is specific, >= 8 chars)
      if (matchedEntries.length === 0 && itemNormName && itemNormName.length >= 8) {
        const nameMatches = parsedExcelEntries.filter(e => e.normName === itemNormName);
        if (nameMatches.length > 0) {
          matchedEntries = nameMatches;
          matchType = 'name';
        }
      }
    }

    if (matchedEntries.length > 0) {
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

  const matchedCount = updatedItems.length;
  const unmatchedCount = currentItems.length - matchedCount;

  return {
    totalRows: excelRows.length,
    matchedCount,
    matchedByDesignation,
    matchedByName,
    unmatchedCount,
    newCodes1CAdded,
    updatedItems,
  };
}
