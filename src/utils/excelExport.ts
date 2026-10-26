import * as XLSX from 'xlsx';
import { DrawingItem, SECTIONS, SectionType } from '../types';
import { calculateBillet } from './billetCalculator';

/**
 * Exports drawing items in a unified single-sheet manufacturing template
 * with headers for each of the 4 sections, subtotals, and formatted columns.
 */
export function exportUnifiedExcel(items: DrawingItem[], filename = 'Спецификация_по_разделам.xlsx', machinesCount = 1) {
  const wb = XLSX.utils.book_new();

  // Create unified rows array
  const rows: any[][] = [];

  // Title header block
  const titleText = machinesCount > 1
    ? `ЕДИНАЯ СПЕЦИФИКАЦИЯ ИЗДЕЛИЙ ПО РАЗДЕЛАМ ПРОИЗВОДСТВА (ПЛАН НА ${machinesCount} МАШ.)`
    : 'ЕДИНАЯ СПЕЦИФИКАЦИЯ ИЗДЕЛИЙ ПО РАЗДЕЛАМ ПРОИЗВОДСТВА';
  rows.push([titleText]);
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
    const headerRow = [
      '№ п/п',
      'Наименование',
      'Обозначение / Опознано',
      'Длина детали (мм)',
      'ЧПУ',
      'Штучная заготовка',
      'Объединенная заготовка',
      'Длина заготовки (мм)',
      'Формат КД (Lзаг)',
    ];
    if (machinesCount > 1) {
      headerRow.push('Кол-во на 1 маш.');
      headerRow.push(`Всего шт. (${machinesCount} маш.)`);
    } else {
      headerRow.push('Количество (шт)');
    }
    headerRow.push(
      'Код по 1С (для стандартов)',
      'Материал',
      'Лист PDF',
      'Примечание / Опознавательный знак'
    );
    rows.push(headerRow);

    if (sectionItems.length === 0) {
      const emptyRow = ['—', 'Позиции отсутствуют', '—', '—', '—', '—', '—', '—', '—'];
      if (machinesCount > 1) emptyRow.push('—', '0');
      else emptyRow.push('0');
      emptyRow.push('—', '—', '—', '');
      rows.push(emptyRow);
    } else {
      sectionItems.forEach((item, itemIdx) => {
        const desigText = item.hasNoStamp && item.identificationMark
          ? `[Без рамки] ${item.identificationMark}`
          : item.designation;

        const billet = calculateBillet(item, items);
        const kdCellText = billet.stampText || billet.kdString || '';

        const row: any[] = [
          itemIdx + 1,
          item.name,
          desigText,
          item.partLength || '',
          item.isCnc ? 'Да' : 'Нет',
          item.isPieceStock ? 'Да' : 'Нет',
          item.combinedBilletName || (item.combinedBilletGroupId ? 'Да' : 'Нет'),
          billet.billetLength ?? '',
          kdCellText,
        ];
        if (machinesCount > 1) {
          const perMach = item.quantityPerMachine ?? (item.quantity !== null && item.quantity !== undefined ? Math.round(item.quantity / machinesCount) : '');
          row.push(perMach);
          row.push(item.quantity ?? '');
        } else {
          row.push(item.quantity ?? '');
        }
        row.push(
          item.code1C || '',
          item.material || '',
          item.pageNumber ? `Лист ${item.pageNumber}` : '',
          item.notes || (item.hasNoStamp ? 'Найден опознавательный знак на эскизе' : ''),
        );
        rows.push(row);
      });
    }

    // Subtotal Row
    const subtotalRow: any[] = [
      '',
      `ИТОГО ПО РАЗДЕЛУ "${sectionName}":`,
      `${sectionItems.length} поз.`,
      '',
      `ЧПУ: ${sectionCncCount}`,
      '',
      '',
      '',
      '',
    ];
    if (machinesCount > 1) {
      subtotalRow.push('');
      subtotalRow.push(sectionTotalQty);
    } else {
      subtotalRow.push(sectionTotalQty);
    }
    rows.push(subtotalRow);
    rows.push(['']); // Empty separator between sections
  });

  // Grand Total Summary
  const grandTotalRow: any[] = [
    '',
    'ИТОГО ПО ВСЕМ РАЗДЕЛАМ ПРОИЗВОДСТВА:',
    `${grandTotalItems} позиций`,
    '',
    `Всего ЧПУ: ${grandTotalCnc}`,
    '',
    '',
    '',
    '',
  ];
  if (machinesCount > 1) {
    grandTotalRow.push('');
    grandTotalRow.push(grandTotalQty);
  } else {
    grandTotalRow.push(grandTotalQty);
  }
  rows.push(grandTotalRow);

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
    { wch: 28 }, // Формат КД (Lзаг)
    { wch: 16 }, // Количество
    { wch: 16 }, // Доп. кол-во при >1 машин
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
export function exportMultiSheetExcel(items: DrawingItem[], filename = 'Спецификация_по_вкладкам.xlsx', machinesCount = 1) {
  const wb = XLSX.utils.book_new();

  // 1. Summary sheet
  const summaryTitle = machinesCount > 1
    ? `СВОДНАЯ ВЕДОМОСТЬ ПО РАЗДЕЛАМ ПРОИЗВОДСТВА (ПЛАН НА ${machinesCount} МАШ.)`
    : 'СВОДНАЯ ВЕДОМОСТЬ ПО РАЗДЕЛАМ ПРОИЗВОДСТВА';
  const summaryRows: any[][] = [
    [summaryTitle],
    ['Раздел производства', 'Количество позиций', 'ЧПУ (поз.)', machinesCount > 1 ? `Суммарно шт (${machinesCount} маш.)` : 'Суммарное количество (шт)', 'Заполнено кодов 1С'],
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
    const secHeaderRow = [
      '№',
      'Наименование',
      'Обозначение',
      'Длина детали (мм)',
      'ЧПУ',
      'Штучная заготовка',
      'Длина заготовки (мм)',
      'Формат КД (Lзаг)',
    ];
    if (machinesCount > 1) {
      secHeaderRow.push('Кол-во на 1 маш.');
      secHeaderRow.push(`Всего шт. (${machinesCount} маш.)`);
    } else {
      secHeaderRow.push('Количество (шт)');
    }
    secHeaderRow.push('Код по 1С', 'Материал', 'Лист PDF', 'Примечание');

    const secRows: any[][] = [
      [`РАЗДЕЛ: ${sectionName.toUpperCase()}${machinesCount > 1 ? ` (ПЛАН НА ${machinesCount} МАШ.)` : ''}`],
      secHeaderRow,
    ];

    secItems.forEach((item, idx) => {
      const billet = calculateBillet(item, items);
      const kdCellText = billet.stampText || billet.kdString || '';
      const r: any[] = [
        idx + 1,
        item.name,
        item.hasNoStamp && item.identificationMark ? `[Без рамки] ${item.identificationMark}` : item.designation,
        item.partLength || '',
        item.isCnc ? 'Да' : 'Нет',
        item.isPieceStock ? 'Да' : 'Нет',
        billet.billetLength ?? '',
        kdCellText,
      ];
      if (machinesCount > 1) {
        const perMach = item.quantityPerMachine ?? (item.quantity !== null && item.quantity !== undefined ? Math.round(item.quantity / machinesCount) : '');
        r.push(perMach);
        r.push(item.quantity ?? '');
      } else {
        r.push(item.quantity ?? '');
      }
      r.push(
        item.code1C || '',
        item.material || '',
        item.pageNumber ? `Лист ${item.pageNumber}` : '',
        item.notes || '',
      );
      secRows.push(r);
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
      { wch: 28 },
      { wch: 16 },
      { wch: 18 },
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
export function download1CCompatibleExcel(items: DrawingItem[], filename = 'Выгрузка_для_1С_Номенклатура.xlsx', machinesCount = 1) {
  const wb = XLSX.utils.book_new();

  const header = [
    'КодНоменклатуры1С',
    'Артикул / Обозначение',
    'НаименованиеПолное',
    'ДлинаДетали',
    'ЧПУ',
    'ШтучнаяЗаготовка',
    'ДлинаЗаготовки',
    'ОбозначениеКД_Lзаг',
  ];
  if (machinesCount > 1) {
    header.push('КолВоНа1Маш');
    header.push(`ВсегоШт_${machinesCount}Маш`);
  } else {
    header.push('Количество');
  }
  header.push('ЕдиницаИзмерения', 'РазделПроизводства', 'Материал', 'Примечание');

  const rows: any[][] = [header];

  items.forEach((it) => {
    const billet = calculateBillet(it, items);
    const kdCellText = billet.stampText || billet.kdString || '';
    const r: any[] = [
      it.code1C || '',
      it.designation,
      it.name,
      it.partLength || '',
      it.isCnc ? '1' : '0',
      it.isPieceStock ? '1' : '0',
      billet.billetLength ?? '',
      kdCellText,
    ];
    if (machinesCount > 1) {
      const perMach = it.quantityPerMachine ?? (it.quantity !== null && it.quantity !== undefined ? Math.round(it.quantity / machinesCount) : '');
      r.push(perMach);
      r.push(it.quantity ?? 1);
    } else {
      r.push(it.quantity ?? 1);
    }
    r.push(
      'шт',
      it.section,
      it.material || '',
      it.notes || (it.hasNoStamp ? 'Опознано по знаку на чертеже' : ''),
    );
    rows.push(r);
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
    { wch: 14 },
    { wch: 16 },
    { wch: 8 },
    { wch: 22 },
    { wch: 20 },
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
