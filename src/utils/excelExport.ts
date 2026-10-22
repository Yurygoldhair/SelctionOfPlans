import * as XLSX from 'xlsx';
import { DrawingItem, SECTIONS, SectionType } from '../types';
import { calculateBillet } from './billetCalculator';

/**
 * Exports drawing items in a unified single-sheet manufacturing template
 * with headers for each of the 4 sections, subtotals, and formatted columns.
 */
export function exportUnifiedExcel(items: DrawingItem[], filename = 'Спецификация_по_разделам.xlsx') {
  const wb = XLSX.utils.book_new();

  // Create unified rows array
  const rows: any[][] = [];

  // Title header block
  rows.push(['ЕДИНАЯ СПЕЦИФИКАЦИЯ ИЗДЕЛИЙ ПО РАЗДЕЛАМ ПРОИЗВОДСТВА']);
  rows.push([`Дата формирования: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`]);
  rows.push(['']); // Blank separator

  // Iterate through the 4 sections
  let grandTotalQty = 0;
  let grandTotalItems = 0;
  let grandTotalCnc = 0;

  SECTIONS.forEach((sectionName, secIndex) => {
    const sectionItems = items.filter(it => it.section === sectionName);
    const sectionTotalQty = sectionItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
    const sectionCncCount = sectionItems.filter(it => it.isCnc).length;
    grandTotalQty += sectionTotalQty;
    grandTotalItems += sectionItems.length;
    grandTotalCnc += sectionCncCount;

    // Section title banner
    const sectionBanner = `${secIndex + 1}. ${sectionName.toUpperCase()}`;
    rows.push([sectionBanner]);

    // Table Header Row
    rows.push([
      '№ п/п',
      'Наименование',
      'Обозначение / Опознано',
      'Длина детали (мм)',
      'ЧПУ',
      'Штучная заготовка',
      'Длина заготовки (мм)',
      'Формат КД (Lзаг)',
      'Количество (шт)',
      'Код по 1С (для стандартов)',
      'Материал',
      'Лист PDF',
      'Примечание / Опознавательный знак',
    ]);

    if (sectionItems.length === 0) {
      rows.push(['—', 'Позиции отсутствуют', '—', '—', '—', '—', '—', '—', 0, '—', '—', '—', '']);
    } else {
      sectionItems.forEach((item, itemIdx) => {
        const desigText = item.hasNoStamp && item.identificationMark
          ? `[Без рамки] ${item.identificationMark}`
          : item.designation;

        const billet = calculateBillet(item);

        rows.push([
          itemIdx + 1,
          item.name,
          desigText,
          item.partLength || '',
          item.isCnc ? 'Да' : 'Нет',
          item.isPieceStock ? 'Да' : 'Нет',
          billet.billetLength ?? '',
          billet.kdString || '',
          item.quantity ?? '',
          item.code1C || '',
          item.material || '',
          item.pageNumber ? `Лист ${item.pageNumber}` : '',
          item.notes || (item.hasNoStamp ? 'Найден опознавательный знак на эскизе' : ''),
        ]);
      });
    }

    // Subtotal Row
    rows.push([
      '',
      `ИТОГО ПО РАЗДЕЛУ "${sectionName}":`,
      `${sectionItems.length} поз.`,
      '',
      `ЧПУ: ${sectionCncCount}`,
      '',
      '',
      '',
      sectionTotalQty,
      '',
      '',
      '',
      '',
    ]);
    rows.push(['']); // Empty separator between sections
  });

  // Grand Total Summary
  rows.push([
    '',
    'ИТОГО ПО ВСЕМ РАЗДЕЛАМ ПРОИЗВОДСТВА:',
    `${grandTotalItems} позиций`,
    '',
    `Всего ЧПУ: ${grandTotalCnc}`,
    '',
    '',
    '',
    grandTotalQty,
    '',
    '',
    '',
    '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 8 },  // № п/п
    { wch: 38 }, // Наименование
    { wch: 32 }, // Обозначение / Опознано
    { wch: 18 }, // Длина детали (мм)
    { wch: 8 },  // ЧПУ
    { wch: 16 }, // Штучная заготовка
    { wch: 20 }, // Длина заготовки (мм)
    { wch: 18 }, // Формат КД (Lзаг)
    { wch: 16 }, // Количество
    { wch: 24 }, // Код по 1С
    { wch: 24 }, // Материал
    { wch: 12 }, // Лист PDF
    { wch: 35 }, // Примечание
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Единая спецификация');
  XLSX.writeFile(wb, filename);
}

/**
 * Exports to an Excel workbook with 4 separate tabs (one for each section) + a Summary tab
 */
export function exportMultiSheetExcel(items: DrawingItem[], filename = 'Спецификация_по_вкладкам.xlsx') {
  const wb = XLSX.utils.book_new();

  // 1. Summary sheet
  const summaryRows: any[][] = [
    ['СВОДНАЯ ВЕДОМОСТЬ ПО РАЗДЕЛАМ ПРОИЗВОДСТВА'],
    ['Раздел производства', 'Количество позиций', 'ЧПУ (поз.)', 'Суммарное количество (шт)', 'Заполнено кодов 1С'],
  ];

  let totalPos = 0;
  let totalQty = 0;
  let totalCnc = 0;

  SECTIONS.forEach((sectionName) => {
    const secItems = items.filter(it => it.section === sectionName);
    const secQty = secItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
    const secCnc = secItems.filter(it => it.isCnc).length;
    const sec1C = secItems.filter(it => Boolean(it.code1C)).length;
    totalPos += secItems.length;
    totalQty += secQty;
    totalCnc += secCnc;

    summaryRows.push([sectionName, secItems.length, secCnc, secQty, sec1C]);
  });

  summaryRows.push(['ИТОГО:', totalPos, totalCnc, totalQty, items.filter(it => Boolean(it.code1C)).length]);
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 14 }, { wch: 26 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Сводная ведомость');

  // 2. Individual section sheets
  SECTIONS.forEach((sectionName) => {
    const secItems = items.filter(it => it.section === sectionName);
    const secRows: any[][] = [
      [`РАЗДЕЛ: ${sectionName.toUpperCase()}`],
      [
        '№',
        'Наименование',
        'Обозначение',
        'Длина детали (мм)',
        'ЧПУ',
        'Штучная заготовка',
        'Длина заготовки (мм)',
        'Формат КД (Lзаг)',
        'Количество (шт)',
        'Код по 1С',
        'Материал',
        'Лист PDF',
        'Примечание',
      ],
    ];

    secItems.forEach((item, idx) => {
      const billet = calculateBillet(item);
      secRows.push([
        idx + 1,
        item.name,
        item.hasNoStamp && item.identificationMark ? `[Без рамки] ${item.identificationMark}` : item.designation,
        item.partLength || '',
        item.isCnc ? 'Да' : 'Нет',
        item.isPieceStock ? 'Да' : 'Нет',
        billet.billetLength ?? '',
        billet.kdString || '',
        item.quantity ?? '',
        item.code1C || '',
        item.material || '',
        item.pageNumber ? `Лист ${item.pageNumber}` : '',
        item.notes || '',
      ]);
    });

    const secWs = XLSX.utils.aoa_to_sheet(secRows);
    secWs['!cols'] = [
      { wch: 6 },
      { wch: 36 },
      { wch: 26 },
      { wch: 18 },
      { wch: 8 },
      { wch: 16 },
      { wch: 20 },
      { wch: 18 },
      { wch: 16 },
      { wch: 20 },
      { wch: 22 },
      { wch: 12 },
      { wch: 30 },
    ];

    const safeSheetName = sectionName
      .replace('Токарные+фрезерные работы: ', '')
      .replace('Токарные+фрезерные работы', 'Ток+Фрез')
      .substring(0, 31);

    XLSX.utils.book_append_sheet(wb, secWs, safeSheetName);
  });

  XLSX.writeFile(wb, filename);
}

/**
 * Exports in 1C-Enterprise ERP compatible format (tab-delimited or structured Excel)
 */
export function download1CCompatibleExcel(items: DrawingItem[], filename = 'Выгрузка_для_1С_Номенклатура.xlsx') {
  const wb = XLSX.utils.book_new();

  const rows: any[][] = [
    [
      'КодНоменклатуры1С',
      'Артикул / Обозначение',
      'НаименованиеПолное',
      'ДлинаДетали',
      'ЧПУ',
      'ШтучнаяЗаготовка',
      'ДлинаЗаготовки',
      'ОбозначениеКД_Lзаг',
      'Количество',
      'ЕдиницаИзмерения',
      'РазделПроизводства',
      'Материал',
      'Примечание',
    ],
  ];

  items.forEach((it) => {
    const billet = calculateBillet(it);
    rows.push([
      it.code1C || '',
      it.designation,
      it.name,
      it.partLength || '',
      it.isCnc ? '1' : '0',
      it.isPieceStock ? '1' : '0',
      billet.billetLength ?? '',
      billet.kdString || '',
      it.quantity ?? 1,
      'шт',
      it.section,
      it.material || '',
      it.notes || (it.hasNoStamp ? 'Опознано по знаку на чертеже' : ''),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 20 },
    { wch: 25 },
    { wch: 40 },
    { wch: 16 },
    { wch: 8 },
    { wch: 12 },
    { wch: 10 },
    { wch: 30 },
    { wch: 22 },
    { wch: 35 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Для_загрузки_в_1С');
  XLSX.writeFile(wb, filename);
}

/**
 * Downloads a blank Excel template that users can fill with quantities to import
 */
export function downloadBlankQuantityTemplate(currentItems?: DrawingItem[]) {
  const wb = XLSX.utils.book_new();

  const rows: any[][] = [
    ['Обозначение', 'Наименование', 'Количество', 'Длина детали', 'ЧПУ', 'Код 1С', 'Раздел'],
  ];

  if (currentItems && currentItems.length > 0) {
    currentItems.forEach((it) => {
      rows.push([
        it.designation,
        it.name,
        it.quantity ?? '',
        it.partLength || '',
        it.isCnc ? 'Да' : 'Нет',
        it.code1C || '',
        it.section,
      ]);
    });
  } else {
    rows.push(['АБВГ.711142.012', 'Втулка упорная', 12, '85 мм', 'Да', '', 'Токарные+фрезерные работы']);
    rows.push(['АБВГ.713215.004', 'Вал приводной', 4, '340 мм', 'Да', '', 'Токарные+фрезерные работы']);
    rows.push(['ГОСТ 7798-70', 'Болт М8-6gх25.58', 64, '25 мм', 'Нет', '00-00014285', 'Стандарты']);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 24 },
    { wch: 35 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
    { wch: 20 },
    { wch: 30 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Количества');
  XLSX.writeFile(wb, 'Шаблон_количеств_для_сверки.xlsx');
}
