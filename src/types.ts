export type SectionType =
  | 'Токарные+фрезерные работы'
  | 'Токарные+фрезерные работы: Лазер'
  | 'Токарные+фрезерные работы: ВОС'
  | 'Стандарты';

export const SECTIONS: SectionType[] = [
  'Токарные+фрезерные работы',
  'Токарные+фрезерные работы: Лазер',
  'Токарные+фрезерные работы: ВОС',
  'Стандарты',
];

export interface DrawingItem {
  id: string;
  name: string;              // Наименование (Втулка, Вал, Болт М8х25)
  designation: string;       // Обозначение (АБВГ.711142.012, ГОСТ 7798-70, DIN 912 или найденный опознавательный знак)
  quantity: number | null;   // Количество (в шт)
  code1C: string;            // Код по 1С для стандартов (например "00-00014285")
  section: SectionType;      // Один из 4 разделов
  material?: string;         // Материал (Сталь 40Х, Д16Т, 12Х18Н10Т)
  partLength?: string;       // Длина детали из PDF (например "180 мм", "350", "L=240 мм")
  isCnc?: boolean;           // ЧПУ (обработка на станках с ЧПУ)
  isPieceStock?: boolean;    // Штучная заготовка (расчет исходя из 1 шт, без +30мм при ЧПУ)
  combinedBilletGroupId?: string; // ID группы объединенной заготовки
  combinedBilletName?: string;    // Название группы объединенной заготовки, например "Заготовка №1"
  manualBilletLength?: number | null; // Ручная длина заготовки (мм), переопределяет расчетную
  manualKdString?: string | null;     // Ручная строка обозначения заготовки в КД
  quantityPerMachine?: number | null; // Количество на 1 машину
  pageNumber?: number;       // Номер листа/страницы в PDF
  isHighlighted?: boolean;   // Выделенная позиция
  hasNoStamp?: boolean;      // Чертеж без рамки и штампа (опознан по знаку/эскизу)
  identificationMark?: string; // Найденный опознавательный знак на чертеже без рамки
  notes?: string;            // Примечание / тех. требования
  qtySource?: 'drawing' | 'excel' | 'manual' | 'missing'; // Источник количества
  originalDrawingQty?: number | null; // Исходное количество из чертежа (для сравнения)
  isRodOrStud?: boolean;    // Пруток или шпилька (НЕ отображается в таблице деталей, но сохраняется для формирования PDF)
  drawingImage?: string;     // URL или base64 чертежа
  previewType?: 'shaft' | 'bushing' | 'plate' | 'precision' | 'rod' | 'fastener' | 'custom';
}

/**
 * Robust check if item is a rod (пруток) or stud (шпилька).
 * These must be excluded from the machined parts table, but preserved for PDF package generation!
 */
export function isRodOrStud(it: any): boolean {
  if (!it) return false;
  if (it.isRodOrStud === true) return true;
  const n = String(it.name || '').toLowerCase();
  const d = String(it.designation || '').toLowerCase();
  const s = String(it.section || '').toLowerCase();
  const notes = String(it.notes || '').toLowerCase();
  const mat = String(it.material || '').toLowerCase();

  // 1. Direct keywords in any field
  if (
    n.includes('прут') ||
    n.includes('шпильк') ||
    n.includes('штанга') ||
    n.includes('стержен') ||
    d.includes('прут') ||
    d.includes('шпильк') ||
    d.includes('штанга') ||
    d.includes('стержен') ||
    s.includes('прут') ||
    s.includes('шпильк') ||
    notes.includes('прут') ||
    notes.includes('шпильк') ||
    mat.includes('пруток') ||
    mat.includes('прутк')
  ) {
    return true;
  }

  // 2. Official GOST and DIN standards for studs and threaded rods:
  // DIN 975, DIN 976 (шпильки резьбовые полнорезьбовые)
  // ГОСТ 22032 .. ГОСТ 22043 (шпильки с ввинчиваемым концом и для гладких отверстий)
  // ГОСТ 9066 (шпильки для фланцевых соединений)
  // ГОСТ 10494 (шпильки)
  if (
    d.includes('975') ||
    d.includes('976') ||
    n.includes('975') ||
    n.includes('976') ||
    /220(3[2-9]|4[0-3])/i.test(d) ||
    /220(3[2-9]|4[0-3])/i.test(n) ||
    /9066/i.test(d) ||
    /9066/i.test(n) ||
    /10494/i.test(d) ||
    /10494/i.test(n)
  ) {
    return true;
  }

  return false;
}

export interface BatchSession {
  id: string;
  title: string;             // Название отбора (например "Отбор №1 — Заказ 408")
  createdAt: string;         // Дата создания ISO
  updatedAt: string;         // Дата обновления ISO
  pdfFileName?: string;      // Имя исходного файла PDF
  pdfBase64?: string;        // Исходные данные PDF для наложения штампа
  excelFileName?: string;    // Имя загруженного Excel с количествами
  items: DrawingItem[];      // Позиции отбора
  totalQty: number;          // Суммарное количество шт.
  machinesCount?: number;    // Количество машин в плане
  notes?: string;            // Примечание к отбору
}

export interface StampOptions {
  position: 'top-left-eskd' | 'top-right' | 'above-stamp' | 'top-left';
  format: 'kd-billet' | 'qty-only' | 'with-prefix'; // 'kd-billet' (Lзаг=...-...), "12 шт." или "Кол-во: 12 шт."
  fontSize: number;                   // 13 pt для графы 26, либо 22 pt для свободного поля
  fontFamily: string;                 // 'Arial'
  withBorder: boolean;                // Рамка вокруг количества
  stampColor: string;                 // e.g. '#000000' or '#1e3a8a'
  eraseOldDesignation?: boolean;      // Очистить/закрасить дубликат обозначения в левом верхнем углу
  offsetX_mm?: number;                // Смещение X количества в мм (+ вправо, - влево)
  offsetY_mm?: number;                // Смещение Y количества в мм (+ вверх, - вниз)
  printBilletStamp?: boolean;         // Печатать ли длину заготовки слева от обозначения в рамке
  billetOffsetX_mm?: number;          // Смещение X заготовки слева от обозначения (мм)
  billetOffsetY_mm?: number;          // Смещение Y заготовки слева от обозначения (мм)
}

export interface ExcelColumnMapping {
  designationCol: string;
  nameCol: string;
  quantityCol: string;
  code1CCol?: string;
  sectionCol?: string;
  lengthCol?: string;
  cncCol?: string;
}

export interface ExcelMatchResult {
  totalRows: number;
  matchedCount: number;
  matchedByDesignation: number;
  matchedByName: number;
  unmatchedCount: number;
  newCodes1CAdded: number;
  updatedItems: Array<{
    item: DrawingItem;
    oldQty: number | null;
    newQty: number;
    matchType: 'designation' | 'name' | 'desig_root';
    matchedRow: Record<string, any>;
    code1CFound?: string;
    sumRowCount?: number;
    sumDetails?: string;
  }>;
  newItemsFromExcel?: DrawingItem[]; // Позиции из Excel, которых не было в таблице чертежей (доступны для добавления)
}

export interface ExtractionProgress {
  status: 'idle' | 'reading_file' | 'analyzing_ai' | 'success' | 'error';
  message: string;
  percent?: number;
}
