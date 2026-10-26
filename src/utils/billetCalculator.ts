import { DrawingItem } from '../types';

export interface BilletCalculationResult {
  hasLength: boolean;
  partLengthMm: number | null;
  billetLength: number | null;     // Length of one billet in mm
  billetCount: number | null;      // Number of billets
  kdString: string;               // e.g. "Lзаг=955- 2 шт."
  stampText: string;              // Text printed on drawing: either "Lзаг=955- 2 шт." or "заг на чертеже [шифр]"
  isSubsequentCombinedItem?: boolean; // True if this sheet is a subsequent sheet of a combined group
  targetDrawingDesignation?: string;  // Шифр детали, на которой записана заготовка
  firstSheetPageNumber?: number | null; // Page number of first sheet in group
  formulaDesc: string;            // Text explaining the calculation
  isRestrictedBy1000: boolean;    // Whether split occurred due to 1000mm limit
  isExceeding1000Part: boolean;   // Whether single part exceeds 1000mm (rule bypassed)
  isCombinedBillet?: boolean;     // Whether this is a combined billet of multiple parts
  combinedGroupName?: string;     // Group name e.g. "Заготовка №1"
  combinedItemsCount?: number;    // Number of parts in the combined billet
  isManualBillet?: boolean;       // Ручной ввод длины заготовки
}

/**
 * Formats the KD billet string strictly according to manufacturing specification:
 * Lзаг=[расчитаная заготовка]- [количество заготовок] шт.
 */
export function formatKdBilletString(billetLength: number, billetCount: number): string {
  return `Lзаг=${billetLength}- ${billetCount} шт.`;
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
 * Calculates a combined billet for multiple parts grouped into a single stock piece.
 * User formula:
 * - If CNC is marked (any part): (((длина 1дет.+5мм)*кол-во)+((длина 2дет.+5мм)*кол-во)+...)+30мм
 * - If CNC is NOT marked: (((длина 1дет.+5мм)*кол-во)+((длина 2дет.+5мм)*кол-во)+...)+5мм
 * - 1000mm length limit applies (unless a single part in the group exceeds 1000mm).
 */
export function calculateCombinedBillet(
  groupItems: DrawingItem[],
  groupName?: string
): BilletCalculationResult {
  if (!groupItems || groupItems.length === 0) {
    return {
      hasLength: false,
      partLengthMm: null,
      billetLength: null,
      billetCount: null,
      kdString: '',
      stampText: '',
      formulaDesc: 'Нет деталей в группе',
      isRestrictedBy1000: false,
      isExceeding1000Part: false,
      isCombinedBillet: true,
      combinedGroupName: groupName,
      combinedItemsCount: 0,
    };
  }

  // Parse items with lengths
  const validParts = groupItems
    .map(it => ({
      item: it,
      L: parsePartLengthMm(it.partLength),
      qty: (it.quantity !== null && it.quantity !== undefined && it.quantity > 0) ? it.quantity : 1,
      isCnc: Boolean(it.isCnc),
    }))
    .filter(p => p.L !== null && p.L > 0);

  if (validParts.length === 0) {
    return {
      hasLength: false,
      partLengthMm: null,
      billetLength: null,
      billetCount: null,
      kdString: '',
      stampText: '',
      formulaDesc: 'Длины деталей в группе не указаны',
      isRestrictedBy1000: false,
      isExceeding1000Part: false,
      isCombinedBillet: true,
      combinedGroupName: groupName,
      combinedItemsCount: groupItems.length,
    };
  }

  // CNC rule: if ANY part is marked CNC -> +30mm; otherwise -> +5mm
  const isCnc = validParts.some(p => p.isCnc);
  const extraAllowance = isCnc ? 30 : 5;

  let baseSum = 0;
  const partsFormulaTerms: string[] = [];
  let anyPartOver1000 = false;

  for (const p of validParts) {
    const L = p.L!;
    if (L > 1000) anyPartOver1000 = true;
    const termVal = (L + 5) * p.qty;
    baseSum += termVal;
    partsFormulaTerms.push(`((${L}+5)*${p.qty})`);
  }

  const rawCombinedTotal = Math.ceil(baseSum + extraAllowance);
  const formulaPrefix = partsFormulaTerms.join(' + ');

  // 1000mm restriction check
  if (rawCombinedTotal <= 1000 || anyPartOver1000) {
    const billetCount = 1;
    const kdString = formatKdBilletString(rawCombinedTotal, billetCount);
    const formulaDesc = isCnc
      ? `Объединение ЧПУ: (${formulaPrefix})+30 = ${rawCombinedTotal} мм`
      : `Объединение без ЧПУ: (${formulaPrefix})+5 = ${rawCombinedTotal} мм`;

    return {
      hasLength: true,
      partLengthMm: Math.round(baseSum),
      billetLength: rawCombinedTotal,
      billetCount,
      kdString,
      stampText: kdString,
      formulaDesc,
      isRestrictedBy1000: false,
      isExceeding1000Part: anyPartOver1000,
      isCombinedBillet: true,
      combinedGroupName: groupName,
      combinedItemsCount: validParts.length,
    };
  }

  // If > 1000mm and no single part > 1000mm: split into billets <= 1000mm
  const billetCount = Math.ceil(rawCombinedTotal / 1000);
  const billetLen = Math.ceil(rawCombinedTotal / billetCount);
  const kdString = formatKdBilletString(billetLen, billetCount);
  const formulaDesc = isCnc
    ? `Объединение ЧПУ (огр. 1000мм): ${billetCount} заг. по ${billetLen} мм [(${formulaPrefix})+30 = ${rawCombinedTotal} мм]`
    : `Объединение без ЧПУ (огр. 1000мм): ${billetCount} заг. по ${billetLen} мм [(${formulaPrefix})+5 = ${rawCombinedTotal} мм]`;

  return {
    hasLength: true,
    partLengthMm: Math.round(baseSum),
    billetLength: billetLen,
    billetCount,
    kdString,
    stampText: kdString,
    formulaDesc,
    isRestrictedBy1000: true,
    isExceeding1000Part: false,
    isCombinedBillet: true,
    combinedGroupName: groupName,
    combinedItemsCount: validParts.length,
  };
}

/**
 * Calculates billet length and billet quantity according to the manufacturing specification:
 * 
 * 1. Manual Override: if item.manualBilletLength is set, use it directly.
 * 
 * 2. Combined Billet (Объединение в одну заготовку):
 *    - With CNC: (((L1+5)*Q1) + ((L2+5)*Q2) + ... ) + 30mm
 *    - Without CNC: (((L1+5)*Q1) + ((L2+5)*Q2) + ... ) + 5mm
 *    - First sheet gets: Lзаг=[длина]- [кол-во] шт.
 *    - Subsequent sheets get: "заг на чертеже [шифр детали на которой записана заготовка]"
 * 
 * 3. Piece Stock (Штучная заготовка - isPieceStock = true):
 *    - Calculated for 1 piece: (L + 5 mm)
 *    - Billet count = Quantity of parts.
 *    - KD string: Lзаг=[L+5]- [Количество] шт.
 * 
 * 4. Regular Stock (Штучная заготовка = false):
 *    - Without CNC (!isCnc): (L + 5 mm) * Quantity
 *    - With CNC (isCnc): ((L + 5 mm) * Quantity) + 30 mm
 *    - 1000 mm Length Restriction applies if L <= 1000 mm and total > 1000 mm.
 */
export function calculateBillet(
  item: {
    id?: string;
    partLength?: string;
    quantity: number | null;
    isCnc?: boolean;
    isPieceStock?: boolean;
    combinedBilletGroupId?: string;
    combinedBilletName?: string;
    pageNumber?: number;
    manualBilletLength?: number | null;
    manualKdString?: string | null;
    designation?: string;
    identificationMark?: string;
    name?: string;
  },
  allItems?: DrawingItem[]
): BilletCalculationResult {
  // Case 0: Manual Override for billet length (ручная корректировка длины заготовки)
  if (typeof item.manualBilletLength === 'number' && item.manualBilletLength > 0) {
    const mLen = Math.round(item.manualBilletLength);
    const mCount = 1;
    const mKd = item.manualKdString || formatKdBilletString(mLen, mCount);
    return {
      hasLength: true,
      partLengthMm: parsePartLengthMm(item.partLength),
      billetLength: mLen,
      billetCount: mCount,
      kdString: mKd,
      stampText: mKd,
      isSubsequentCombinedItem: false,
      formulaDesc: `Ручной ввод длины: ${mKd} (${mLen} мм)`,
      isRestrictedBy1000: mLen > 1000,
      isExceeding1000Part: mLen > 1000,
      isCombinedBillet: Boolean(item.combinedBilletGroupId),
      combinedGroupName: item.combinedBilletName,
      isManualBillet: true,
    };
  }

  // If item is part of a combined billet group and full items list is provided
  if (item.combinedBilletGroupId && allItems && allItems.length > 0) {
    const groupItems = allItems.filter(it => it.combinedBilletGroupId === item.combinedBilletGroupId);
    if (groupItems.length > 1) {
      const combinedRes = calculateCombinedBillet(groupItems, item.combinedBilletName);

      // Sort items in this combined group by pageNumber or list order to determine the first sheet
      const sortedGroup = [...groupItems].sort((a, b) => {
        const pA = a.pageNumber ?? 999999;
        const pB = b.pageNumber ?? 999999;
        if (pA !== pB) return pA - pB;
        return allItems.indexOf(a) - allItems.indexOf(b);
      });

      const firstItem = sortedGroup[0];
      const isSubsequent = (item.id && firstItem.id) ? (item.id !== firstItem.id) : false;

      if (isSubsequent) {
        // Format strictly: "заг на чертеже [шифр детали на которой записана заготовка]"
        const targetDesignation = firstItem.designation || firstItem.identificationMark || firstItem.name || '1-й чертеж';
        const subsequentStampText = `заг на чертеже ${targetDesignation}`;

        return {
          ...combinedRes,
          stampText: subsequentStampText,
          isSubsequentCombinedItem: true,
          targetDrawingDesignation: targetDesignation,
          firstSheetPageNumber: firstItem.pageNumber ?? null,
          formulaDesc: `Объединенная заготовка: на чертеже пишется "${subsequentStampText}". Длина (${combinedRes.kdString}) записана на чертеже ${targetDesignation} (Л.${firstItem.pageNumber || 1}). ${combinedRes.formulaDesc}`,
        };
      }

      // First sheet in group: prints full Lзаг=...- N шт.
      return {
        ...combinedRes,
        stampText: combinedRes.kdString,
        isSubsequentCombinedItem: false,
        firstSheetPageNumber: firstItem.pageNumber ?? null,
      };
    }
  }

  const L = parsePartLengthMm(item.partLength);
  if (L === null || L <= 0) {
    return {
      hasLength: false,
      partLengthMm: null,
      billetLength: null,
      billetCount: null,
      kdString: '',
      stampText: '',
      formulaDesc: 'Длина детали не указана',
      isRestrictedBy1000: false,
      isExceeding1000Part: false,
      isCombinedBillet: false,
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
    const kdString = formatKdBilletString(billetLen, billetCount);
    const formulaDesc = isCnc
      ? `Штучная заготовка ЧПУ: (${L}+5) = ${billetLen} мм × ${billetCount} шт.`
      : `Штучная заготовка: (${L}+5) = ${billetLen} мм × ${billetCount} шт.`;

    return {
      hasLength: true,
      partLengthMm: L,
      billetLength: billetLen,
      billetCount,
      kdString,
      stampText: kdString,
      formulaDesc,
      isRestrictedBy1000: false,
      isExceeding1000Part: L > 1000,
      isCombinedBillet: false,
    };
  }

  // Case 2: Part length exceeds 1000 mm -> 1000mm restriction does NOT apply
  if (L > 1000) {
    const totalLen = Math.ceil((partCutLength * N) + cncAllowance);
    const billetCount = 1;
    const kdString = formatKdBilletString(totalLen, billetCount);
    const formulaDesc = isCnc
      ? `Деталь > 1000 мм (без ограничения): ((${L}+5)*${N})+30 = ${totalLen} мм`
      : `Деталь > 1000 мм (без ограничения): (${L}+5)*${N} = ${totalLen} мм`;

    return {
      hasLength: true,
      partLengthMm: L,
      billetLength: totalLen,
      billetCount,
      kdString,
      stampText: kdString,
      formulaDesc,
      isRestrictedBy1000: false,
      isExceeding1000Part: true,
      isCombinedBillet: false,
    };
  }

  // Case 3: L <= 1000 mm, regular calculation
  const totalLen = Math.ceil((partCutLength * N) + cncAllowance);

  // Subcase 3a: Total length does not exceed 1000 mm
  if (totalLen <= 1000) {
    const billetCount = 1;
    const kdString = formatKdBilletString(totalLen, billetCount);
    const formulaDesc = isCnc
      ? `ЧПУ: ((${L}+5)*${N})+30 = ${totalLen} мм`
      : `Без ЧПУ: (${L}+5)*${N} = ${totalLen} мм`;

    return {
      hasLength: true,
      partLengthMm: L,
      billetLength: totalLen,
      billetCount,
      kdString,
      stampText: kdString,
      formulaDesc,
      isRestrictedBy1000: false,
      isExceeding1000Part: false,
      isCombinedBillet: false,
    };
  }

  // Subcase 3b: Total length exceeds 1000 mm -> apply 1000 mm billet restriction!
  const maxAvailLength = 1000 - cncAllowance;
  const maxPartsPerBillet = Math.max(1, Math.floor(maxAvailLength / partCutLength));

  // Total billets required to produce N parts
  const billetCount = Math.ceil(N / maxPartsPerBillet);

  // Balanced distribution of parts across billets
  const partsPerBillet = Math.ceil(N / billetCount);

  // Calculated length for each of the billets (guaranteed <= 1000 mm)
  const billetLen = Math.ceil((partsPerBillet * partCutLength) + cncAllowance);
  const kdString = formatKdBilletString(billetLen, billetCount);

  const formulaDesc = isCnc
    ? `Ограничение 1000 мм: ${billetCount} заг. по ${partsPerBillet} шт. (((${L}+5)*${partsPerBillet})+30 = ${billetLen} мм)`
    : `Ограничение 1000 мм: ${billetCount} заг. по ${partsPerBillet} шт. ((${L}+5)*${partsPerBillet} = ${billetLen} мм)`;

  return {
    hasLength: true,
    partLengthMm: L,
    billetLength: billetLen,
    billetCount,
    kdString,
    stampText: kdString,
    formulaDesc,
    isRestrictedBy1000: true,
    isExceeding1000Part: false,
    isCombinedBillet: false,
  };
}
