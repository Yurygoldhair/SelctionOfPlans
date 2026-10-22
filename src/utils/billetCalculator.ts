import { DrawingItem } from '../types';

export interface BilletCalculationResult {
  hasLength: boolean;
  partLengthMm: number | null;
  billetLength: number | null;     // Length of one billet in mm
  billetCount: number | null;      // Number of billets
  kdString: string;               // e.g. "Lзаг=955-2"
  formulaDesc: string;            // Text explaining the calculation
  isRestrictedBy1000: boolean;    // Whether split occurred due to 1000mm limit
  isExceeding1000Part: boolean;   // Whether single part exceeds 1000mm (rule bypassed)
}

/**
 * Parses numeric part length in mm from string inputs like:
 * "180 мм", "340", "L=240", "125.5", "Ø32х190", etc.
 */
export function parsePartLengthMm(partLengthStr?: string): number | null {
  if (!partLengthStr) return null;
  const str = String(partLengthStr).trim().replace(',', '.');
  if (!str) return null;

  // Try extracting L=... or length after 'x' / 'х'
  const matchL = str.match(/L\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (matchL) {
    const val = parseFloat(matchL[1]);
    if (!isNaN(val) && val > 0) return val;
  }

  // Try extracting dimensions after 'х' or 'x' e.g. "Ø32х190" -> 190
  const matchX = str.match(/[хx]\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (matchX) {
    const val = parseFloat(matchX[1]);
    if (!isNaN(val) && val > 0) return val;
  }

  // General first numeric match
  const matchNum = str.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (matchNum) {
    const val = parseFloat(matchNum[1]);
    if (!isNaN(val) && val > 0) return val;
  }

  return null;
}

/**
 * Calculates billet length and billet quantity according to the manufacturing specification:
 * 
 * 1. Piece Stock (Штучная заготовка - isPieceStock = true):
 *    - Calculated for 1 piece.
 *    - With CNC: (L + 5 mm)
 *    - Without CNC: (L + 5 mm)
 *    - Billet count = Quantity of parts (each piece is an individual billet).
 *    - KD string: Lзаг=[L+5]-[Количество]
 * 
 * 2. Regular Stock (Штучная заготовка = false):
 *    - Without CNC (!isCnc): (L + 5 mm) * Quantity
 *    - With CNC (isCnc): ((L + 5 mm) * Quantity) + 30 mm
 *    - 1000 mm Length Restriction:
 *      * If part length > 1000 mm (L > 1000): rule does NOT apply, stock calculated as usual.
 *      * If L <= 1000 mm and total > 1000 mm: billets are restricted to <= 1000 mm.
 *        Max parts per billet = floor((1000 - allowance) / (L + 5)).
 *        Number of billets = ceil(Quantity / maxParts).
 *        Calculated billet length = ceil(partsPerBillet * (L + 5)) + allowance (<= 1000 mm).
 * 
 * 3. Output KD format:
 *    "Lзаг=[расчитанная заготовка]-[количество заготовок]"
 */
export function calculateBillet(item: {
  partLength?: string;
  quantity: number | null;
  isCnc?: boolean;
  isPieceStock?: boolean;
}): BilletCalculationResult {
  const L = parsePartLengthMm(item.partLength);
  if (L === null || L <= 0) {
    return {
      hasLength: false,
      partLengthMm: null,
      billetLength: null,
      billetCount: null,
      kdString: '',
      formulaDesc: 'Длина детали не указана',
      isRestrictedBy1000: false,
      isExceeding1000Part: false,
    };
  }

  const rawQty = item.quantity;
  const N = (rawQty !== null && rawQty !== undefined && rawQty > 0) ? rawQty : 1;
  const isCnc = Boolean(item.isCnc);
  const isPieceStock = Boolean(item.isPieceStock);

  // Allowance per part cut = 5 mm
  const partCutLength = L + 5;
  // CNC chuck clamp allowance = 30 mm
  const cncAllowance = isCnc ? 30 : 0;

  // Case 1: Piece Stock (Штучная заготовка)
  if (isPieceStock) {
    // Formula for 1 piece: (L + 5 mm) whether CNC or not
    const billetLen = Math.ceil(partCutLength);
    const billetCount = N;
    const kdString = `Lзаг=${billetLen}-${billetCount}`;
    const formulaDesc = isCnc
      ? `Штучная заготовка ЧПУ: (${L}+5) = ${billetLen} мм × ${billetCount} шт.`
      : `Штучная заготовка: (${L}+5) = ${billetLen} мм × ${billetCount} шт.`;

    return {
      hasLength: true,
      partLengthMm: L,
      billetLength: billetLen,
      billetCount,
      kdString,
      formulaDesc,
      isRestrictedBy1000: false,
      isExceeding1000Part: L > 1000,
    };
  }

  // Case 2: Part length exceeds 1000 mm -> 1000mm restriction does NOT apply
  if (L > 1000) {
    const totalLen = Math.ceil((partCutLength * N) + cncAllowance);
    const billetCount = 1;
    const kdString = `Lзаг=${totalLen}-${billetCount}`;
    const formulaDesc = isCnc
      ? `Деталь > 1000 мм (без ограничения): ((${L}+5)*${N})+30 = ${totalLen} мм`
      : `Деталь > 1000 мм (без ограничения): (${L}+5)*${N} = ${totalLen} мм`;

    return {
      hasLength: true,
      partLengthMm: L,
      billetLength: totalLen,
      billetCount,
      kdString,
      formulaDesc,
      isRestrictedBy1000: false,
      isExceeding1000Part: true,
    };
  }

  // Case 3: L <= 1000 mm, regular calculation
  const totalLen = Math.ceil((partCutLength * N) + cncAllowance);

  // Subcase 3a: Total length does not exceed 1000 mm
  if (totalLen <= 1000) {
    const billetCount = 1;
    const kdString = `Lзаг=${totalLen}-${billetCount}`;
    const formulaDesc = isCnc
      ? `ЧПУ: ((${L}+5)*${N})+30 = ${totalLen} мм`
      : `Без ЧПУ: (${L}+5)*${N} = ${totalLen} мм`;

    return {
      hasLength: true,
      partLengthMm: L,
      billetLength: totalLen,
      billetCount,
      kdString,
      formulaDesc,
      isRestrictedBy1000: false,
      isExceeding1000Part: false,
    };
  }

  // Subcase 3b: Total length exceeds 1000 mm -> apply 1000 mm billet restriction!
  // Max length available for parts inside a 1000mm billet:
  const maxAvailLength = 1000 - cncAllowance;
  const maxPartsPerBillet = Math.max(1, Math.floor(maxAvailLength / partCutLength));

  // Total billets required to produce N parts
  const billetCount = Math.ceil(N / maxPartsPerBillet);

  // Balanced distribution of parts across billets
  const partsPerBillet = Math.ceil(N / billetCount);

  // Calculated length for each of the billets (guaranteed <= 1000 mm)
  const billetLen = Math.ceil((partsPerBillet * partCutLength) + cncAllowance);
  const kdString = `Lзаг=${billetLen}-${billetCount}`;

  const formulaDesc = isCnc
    ? `Ограничение 1000 мм: ${billetCount} заг. по ${partsPerBillet} шт. (((${L}+5)*${partsPerBillet})+30 = ${billetLen} мм)`
    : `Ограничение 1000 мм: ${billetCount} заг. по ${partsPerBillet} шт. ((${L}+5)*${partsPerBillet} = ${billetLen} мм)`;

  return {
    hasLength: true,
    partLengthMm: L,
    billetLength: billetLen,
    billetCount,
    kdString,
    formulaDesc,
    isRestrictedBy1000: true,
    isExceeding1000Part: false,
  };
}
