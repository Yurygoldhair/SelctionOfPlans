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
  pageNumber?: number;       // Номер листа/страницы в PDF
  isHighlighted?: boolean;   // Выделенная позиция
  hasNoStamp?: boolean;      // Чертеж без рамки и штампа (опознан по знаку/эскизу)
  identificationMark?: string; // Найденный опознавательный знак на чертеже без рамки
  notes?: string;            // Примечание / тех. требования
  qtySource?: 'drawing' | 'excel' | 'manual' | 'missing'; // Источник количества
  originalDrawingQty?: number | null; // Исходное количество из чертежа (для сравнения)
  drawingImage?: string;     // URL или base64 чертежа
  previewType?: 'shaft' | 'bushing' | 'plate' | 'precision' | 'rod' | 'fastener' | 'custom';
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
  offsetX_mm?: number;                // Смещение X в мм (+ вправо, - влево)
  offsetY_mm?: number;                // Смещение Y в мм (+ вверх, - вниз)
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
    matchType: 'designation' | 'name';
    matchedRow: Record<string, any>;
    code1CFound?: string;
  }>;
}

export interface ExtractionProgress {
  status: 'idle' | 'reading_file' | 'analyzing_ai' | 'success' | 'error';
  message: string;
  percent?: number;
}
