import * as XLSX from 'xlsx';
import { DrawingItem, ExcelColumnMapping, ExcelMatchResult } from '../types';

/**
 * Normalizes designation string for robust comparison:
 * removes spaces, dots, hyphens, underscores, slashes, and lowercases.
 * Also standardizes common Cyrillic/Latin lookalike letters.
 */
export function normalizeCode(str: string | null | undefined): string {
  if (!str) return '';
  let s = String(str).trim().toLowerCase();
  // Remove formatting marks
  s = s.replace(/[\s\.\-_\\\/,;:]/g, '');
  // Map common Latin to Cyrillic equivalents that frequently get mixed in CAD codes
  const latinToCyr: Record<string, string> = {
    a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у'
  };
  return s.split('').map(char => latinToCyr[char] || char).join('');
}

/**
 * Cleans name string for fallback matching
 */
export function normalizeName(str: string | null | undefined): string {
  if (!str) return '';
  return String(str).trim().toLowerCase().replace(/[\s\.\-_,;:\(\)]/g, '');
}

/**
 * Reads an ArrayBuffer or binary string into sheet rows
 */
export function parseExcelFile(data: ArrayBuffer | Uint8Array): {
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  rows: Record<string, any>[];
} {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  const activeSheet = sheetNames[0] || 'Sheet1';
  const worksheet = workbook.Sheets[activeSheet];

  // Convert to JSON with headers
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  const headers: string[] = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    sheetNames,
    activeSheet,
    headers,
    rows,
  };
}

/**
 * Auto-detects columns for designation, name, quantity, 1C code, length, CNC
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

  // 1. Designation (Обозначение / Чертеж / Код детали / Артикул)
  const desigCandidate = lowerHeaders.find(h =>
    h.lower.includes('обозначен') ||
    h.lower.includes('чертеж') ||
    h.lower.includes('чертёж') ||
    h.lower.includes('шифр') ||
    h.lower.includes('деталь') ||
    h.lower.includes('part')
  );
  if (desigCandidate) mapping.designationCol = desigCandidate.original;

  // 2. Name (Наименование / Название / Описание)
  const nameCandidate = lowerHeaders.find(h =>
    h.lower.includes('наименован') ||
    h.lower.includes('назван') ||
    h.lower.includes('описан') ||
    h.lower.includes('позици') ||
    h.lower.includes('item')
  );
  if (nameCandidate) mapping.nameCol = nameCandidate.original;

  // 3. Quantity (Количество / Кол-во / Кол / Шт)
  const qtyCandidate = lowerHeaders.find(h =>
    h.lower.includes('количеств') ||
    h.lower.includes('кол-во') ||
    h.lower.includes('кол_во') ||
    h.lower.includes('кол.') ||
    h.lower.includes('кол ') ||
    h.lower === 'кол' ||
    h.lower === 'шт' ||
    h.lower === 'qty' ||
    h.lower.includes('quantity')
  );
  if (qtyCandidate) mapping.quantityCol = qtyCandidate.original;

  // 4. 1C Code (Код 1С / Код по 1С / Артикул 1С / Номенклатура 1С)
  const code1CCandidate = lowerHeaders.find(h =>
    h.lower.includes('1с') ||
    h.lower.includes('1c') ||
    h.lower.includes('код номенклатур') ||
    h.lower.includes('код товара') ||
    (h.lower.includes('код') && !h.lower.includes('обозначен'))
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

  // Fallbacks if not detected
  if (!mapping.designationCol && headers.length > 0) mapping.designationCol = headers[0];
  if (!mapping.nameCol && headers.length > 1) mapping.nameCol = headers[1];
  if (!mapping.quantityCol && headers.length > 2) mapping.quantityCol = headers[2];

  return mapping;
}

/**
 * Reconciles current drawing items with rows from the Excel file
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

  // Create lookup maps from Excel rows
  const excelByDesig = new Map<string, Record<string, any>>();
  const excelByName = new Map<string, Record<string, any>>();

  for (const row of excelRows) {
    const rawDesig = mapping.designationCol ? String(row[mapping.designationCol] || '') : '';
    const rawName = mapping.nameCol ? String(row[mapping.nameCol] || '') : '';

    const normDesig = normalizeCode(rawDesig);
    const normName = normalizeName(rawName);

    if (normDesig) excelByDesig.set(normDesig, row);
    if (normName) excelByName.set(normName, row);
  }

  for (const item of currentItems) {
    const itemNormDesig = normalizeCode(item.designation);
    const itemNormName = normalizeName(item.name);

    let matchedRow: Record<string, any> | undefined;
    let matchType: 'designation' | 'name' = 'designation';

    // 1. First priority: match by Designation (exact normalized drawing code)
    if (itemNormDesig && excelByDesig.has(itemNormDesig)) {
      matchedRow = excelByDesig.get(itemNormDesig);
      matchType = 'designation';
      matchedByDesignation++;
    }
    // 2. Second priority: match by Name
    else if (itemNormName && excelByName.has(itemNormName)) {
      matchedRow = excelByName.get(itemNormName);
      matchType = 'name';
      matchedByName++;
    } else {
      // Substring fuzzy name match
      for (const [key, row] of excelByName.entries()) {
        if (key.length > 5 && (itemNormName.includes(key) || key.includes(itemNormName))) {
          matchedRow = row;
          matchType = 'name';
          matchedByName++;
          break;
        }
      }
    }

    if (matchedRow) {
      // Extract quantity
      const rawQty = mapping.quantityCol ? matchedRow[mapping.quantityCol] : undefined;
      let newQty = 0;
      if (rawQty !== undefined && rawQty !== null && rawQty !== '') {
        const parsed = Number(String(rawQty).replace(',', '.').replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed)) newQty = parsed;
      }

      // Extract 1C Code if available
      let code1CFound: string | undefined;
      if (mapping.code1CCol && matchedRow[mapping.code1CCol]) {
        code1CFound = String(matchedRow[mapping.code1CCol]).trim();
        if (code1CFound && !item.code1C) {
          newCodes1CAdded++;
        }
      }

      // Extract length if present
      if (mapping.lengthCol && matchedRow[mapping.lengthCol] && !item.partLength) {
        item.partLength = String(matchedRow[mapping.lengthCol]).trim();
      }

      // Extract CNC if present
      if (mapping.cncCol && matchedRow[mapping.cncCol] !== undefined && matchedRow[mapping.cncCol] !== '') {
        const val = String(matchedRow[mapping.cncCol]).toLowerCase();
        if (val === '1' || val === 'да' || val === 'true' || val === 'yes' || val === '+') {
          item.isCnc = true;
        } else if (val === '0' || val === 'нет' || val === 'false' || val === 'no' || val === '-') {
          item.isCnc = false;
        }
      }

      updatedItems.push({
        item,
        oldQty: item.quantity,
        newQty,
        matchType,
        matchedRow,
        code1CFound,
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
