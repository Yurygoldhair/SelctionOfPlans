import React, { useState } from 'react';
import {
  DrawingItem,
  SECTIONS,
  SectionType
} from '../types';
import {
  Edit3,
  Trash2,
  Plus,
  Search,
  Check,
  AlertCircle,
  FileSpreadsheet,
  ArrowUpDown,
  Filter,
  Layers,
  Wrench,
  Zap,
  Gauge,
  PackageCheck,
  CheckSquare,
  Square,
  Image as ImageIcon,
  Cpu,
  Ruler,
  AlertTriangle,
  HelpCircle,
  Box,
  Calculator
} from 'lucide-react';
import { BlueprintThumbnail } from './BlueprintPreview';
import { calculateBillet } from '../utils/billetCalculator';

interface DrawingsTableProps {
  items: DrawingItem[];
  selectedSection: SectionType | 'all';
  onUpdateItem: (updated: DrawingItem) => void;
  onDeleteItem: (id: string) => void;
  onAddItem: (section?: SectionType) => void;
  onBatchDelete: (ids: string[]) => void;
  onBatchMoveSection: (ids: string[], newSection: SectionType) => void;
  onBatchToggleCnc?: (ids: string[], isCnc: boolean) => void;
  onBatchTogglePieceStock?: (ids: string[], isPieceStock: boolean) => void;
  onEditModalOpen: (item: DrawingItem) => void;
  onOpenBlueprint: (item: DrawingItem) => void;
  pdfThumbnails?: Map<number, string>;
}

export const DrawingsTable: React.FC<DrawingsTableProps> = ({
  items,
  selectedSection,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onBatchDelete,
  onBatchMoveSection,
  onBatchToggleCnc,
  onBatchTogglePieceStock,
  onEditModalOpen,
  onOpenBlueprint,
  pdfThumbnails,
}) => {
  const [search, setSearch] = useState('');
  const [filterMissingQtyOnly, setFilterMissingQtyOnly] = useState(false);
  const [filterCncOnly, setFilterCncOnly] = useState(false);
  const [filterPieceStockOnly, setFilterPieceStockOnly] = useState(false);
  const [filterNoStampOnly, setFilterNoStampOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter items
  const filteredItems = items.filter((item) => {
    // Section filter
    if (selectedSection !== 'all' && item.section !== selectedSection) {
      return false;
    }
    // Missing Qty filter
    if (filterMissingQtyOnly && item.quantity !== null && item.quantity > 0) {
      return false;
    }
    // CNC filter
    if (filterCncOnly && !item.isCnc) {
      return false;
    }
    // Piece stock filter
    if (filterPieceStockOnly && !item.isPieceStock) {
      return false;
    }
    // No stamp filter
    if (filterNoStampOnly && !item.hasNoStamp) {
      return false;
    }
    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesig = item.designation.toLowerCase().includes(q);
      const match1C = item.code1C.toLowerCase().includes(q);
      const matchMat = (item.material || '').toLowerCase().includes(q);
      const matchNotes = (item.notes || '').toLowerCase().includes(q);
      const matchLength = (item.partLength || '').toLowerCase().includes(q);
      const matchMark = (item.identificationMark || '').toLowerCase().includes(q);
      return matchName || matchDesig || match1C || matchMat || matchNotes || matchLength || matchMark;
    }
    return true;
  });

  // Group by sections if 'all' is selected
  const sectionsToRender = selectedSection === 'all' ? SECTIONS : [selectedSection];

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleToggleCnc = (item: DrawingItem) => {
    onUpdateItem({ ...item, isCnc: !item.isCnc });
  };

  const handleTogglePieceStock = (item: DrawingItem) => {
    onUpdateItem({ ...item, isPieceStock: !item.isPieceStock });
  };

  const handleBatchCnc = (cncVal: boolean) => {
    if (onBatchToggleCnc) {
      onBatchToggleCnc(Array.from(selectedIds), cncVal);
    } else {
      items.forEach(it => {
        if (selectedIds.has(it.id)) {
          onUpdateItem({ ...it, isCnc: cncVal });
        }
      });
    }
  };

  const handleBatchPieceStock = (val: boolean) => {
    if (onBatchTogglePieceStock) {
      onBatchTogglePieceStock(Array.from(selectedIds), val);
    } else {
      items.forEach(it => {
        if (selectedIds.has(it.id)) {
          onUpdateItem({ ...it, isPieceStock: val });
        }
      });
    }
  };

  const getSectionIcon = (sec: SectionType) => {
    switch (sec) {
      case 'Токарные+фрезерные работы':
        return <Wrench className="w-4 h-4 text-blue-400" />;
      case 'Токарные+фрезерные работы: Лазер':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'Токарные+фрезерные работы: ВОС':
        return <Gauge className="w-4 h-4 text-purple-400" />;
      case 'Стандарты':
        return <PackageCheck className="w-4 h-4 text-emerald-400" />;
    }
  };

  const cncCount = items.filter(it => it.isCnc).length;
  const pieceStockCount = items.filter(it => it.isPieceStock).length;
  const noStampCount = items.filter(it => it.hasNoStamp).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      
      {/* Table Toolbar */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по наименованию, обозначению, коду 1С, длине..."
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* CNC filter button */}
          <button
            onClick={() => setFilterCncOnly(!filterCncOnly)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border ${
              filterCncOnly
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Только ЧПУ ({cncCount})</span>
          </button>

          {/* Piece stock filter button */}
          <button
            onClick={() => setFilterPieceStockOnly(!filterPieceStockOnly)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border ${
              filterPieceStockOnly
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Box className="w-3.5 h-3.5 text-indigo-400" />
            <span>Штучная заг. ({pieceStockCount})</span>
          </button>

          {/* Missing Qty Filter */}
          <button
            onClick={() => setFilterMissingQtyOnly(!filterMissingQtyOnly)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border ${
              filterMissingQtyOnly
                ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Без количества</span>
          </button>

          {/* No stamp filter */}
          {noStampCount > 0 && (
            <button
              onClick={() => setFilterNoStampOnly(!filterNoStampOnly)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border ${
                filterNoStampOnly
                  ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-purple-400" />
              <span>Без рамки ({noStampCount})</span>
            </button>
          )}

          {/* Add Item Button */}
          <button
            onClick={() => onAddItem(selectedSection !== 'all' ? selectedSection : undefined)}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center space-x-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить позицию</span>
          </button>
        </div>
      </div>

      {/* Batch Operations Bar (when rows are selected) */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-950/40 border-b border-blue-900/60 px-4 py-2.5 flex items-center justify-between text-xs text-blue-200 animate-fade-in flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <CheckSquare className="w-4 h-4 text-blue-400" />
            <span>
              Выбрано: <strong className="text-white">{selectedIds.size}</strong> из {filteredItems.length}
            </span>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            {/* CNC Batch actions */}
            <button
              onClick={() => handleBatchCnc(true)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
            >
              <Cpu className="w-3 h-3" />
              <span>Отметить ЧПУ</span>
            </button>

            <button
              onClick={() => handleBatchCnc(false)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs transition"
            >
              <span>Снять ЧПУ</span>
            </button>

            {/* Piece Stock Batch actions */}
            <button
              onClick={() => handleBatchPieceStock(true)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
            >
              <Box className="w-3 h-3" />
              <span>Отметить штучную</span>
            </button>

            <button
              onClick={() => handleBatchPieceStock(false)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs transition"
            >
              <span>Снять штучную</span>
            </button>

            {/* Move to section dropdown */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">Переместить в:</span>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    onBatchMoveSection(Array.from(selectedIds), e.target.value as SectionType);
                    setSelectedIds(new Set());
                  }
                }}
                defaultValue=""
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none"
              >
                <option value="" disabled>Выберите раздел...</option>
                {SECTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Batch delete */}
            <button
              onClick={() => {
                if (confirm(`Удалить выбранные позиции (${selectedIds.size} шт)?`)) {
                  onBatchDelete(Array.from(selectedIds));
                  setSelectedIds(new Set());
                }
              }}
              className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-800/90 text-slate-300 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-700/80">
            <tr>
              <th className="py-3 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                />
              </th>
              <th className="py-3 px-2 w-10 text-center">№</th>
              <th className="py-3 px-2 w-24 text-center">Чертёж</th>
              <th className="py-3 px-4 min-w-[200px]">Наименование</th>
              <th className="py-3 px-4 min-w-[180px]">Обозначение / Опознано</th>
              <th className="py-3 px-3 min-w-[110px] text-center" title="Длина детали из размеров чертежа (L)">
                <div className="flex items-center justify-center space-x-1">
                  <Ruler className="w-3.5 h-3.5 text-blue-400" />
                  <span>Длина детали</span>
                </div>
              </th>
              <th className="py-3 px-2 w-16 text-center" title="Обработка детали на станке с ЧПУ">
                <div className="flex items-center justify-center space-x-1">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>ЧПУ</span>
                </div>
              </th>
              <th className="py-3 px-2 min-w-[90px] text-center" title="Штучная заготовка (расчет исходя из 1 шт, без +30 мм при ЧПУ)">
                <div className="flex items-center justify-center space-x-1">
                  <Box className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Штучная заг.</span>
                </div>
              </th>
              <th className="py-3 px-3 min-w-[140px] text-center" title="Длина заготовки исходя из длины детали, количества, ЧПУ, штучной заготовки и ограничения 1000 мм">
                <div className="flex items-center justify-center space-x-1">
                  <Calculator className="w-3.5 h-3.5 text-amber-400" />
                  <span>Длина заготовки</span>
                </div>
              </th>
              <th className="py-3 px-3 min-w-[110px] text-center">Количество</th>
              <th className="py-3 px-3 min-w-[120px]">Код по 1С</th>
              <th className="py-3 px-3 min-w-[170px]">Раздел</th>
              <th className="py-3 px-3 min-w-[120px]">Материал</th>
              <th className="py-3 px-2 w-14 text-center">Лист</th>
              <th className="py-3 px-3 w-16 text-center">Действия</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800">
            {sectionsToRender.map((sectionName) => {
              const secItems = filteredItems.filter(i => i.section === sectionName);
              const secTotalQty = secItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
              const secCncCount = secItems.filter(i => i.isCnc).length;
              const secPieceStockCount = secItems.filter(i => i.isPieceStock).length;

              return (
                <React.Fragment key={sectionName}>
                  {/* Section Title Banner in Table */}
                  <tr className="bg-slate-800/40 border-y border-slate-700/80">
                    <td colSpan={15} className="py-2.5 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className="p-1 rounded-md bg-slate-800 border border-slate-700">
                            {getSectionIcon(sectionName)}
                          </div>
                          <span className="font-bold text-slate-100 uppercase tracking-wide text-xs">
                            {sectionName}
                          </span>

                          {sectionName === 'Стандарты' && (
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded text-[10px] font-semibold">
                              ГОСТ / DIN / Код 1С
                            </span>
                          )}

                          {secCncCount > 0 && (
                            <span className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center space-x-1">
                              <Cpu className="w-3 h-3" />
                              <span>ЧПУ: {secCncCount} поз.</span>
                            </span>
                          )}

                          {secPieceStockCount > 0 && (
                            <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center space-x-1">
                              <Box className="w-3 h-3" />
                              <span>Штучная: {secPieceStockCount} поз.</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-3 text-xs text-slate-400">
                          <span>Позиций: <strong className="text-white">{secItems.length}</strong></span>
                          <span>Сумма: <strong className="text-emerald-400">{secTotalQty} шт</strong></span>
                          <button
                            onClick={() => onAddItem(sectionName)}
                            className="p-1 hover:bg-slate-700 text-slate-300 hover:text-white rounded transition"
                            title={`Добавить позицию в раздел ${sectionName}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>

                  {secItems.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="py-4 text-center text-slate-500 text-xs italic">
                        Позиции отсутствуют в данном разделе
                      </td>
                    </tr>
                  ) : (
                    secItems.map((item, idx) => {
                      const isSelected = selectedIds.has(item.id);
                      const isNoQty = item.quantity === null || item.quantity === 0;

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-800/50 transition group ${
                            isSelected ? 'bg-blue-950/20' : ''
                          } ${item.hasNoStamp ? 'bg-amber-950/15' : ''}`}
                        >
                          {/* Checkbox */}
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(item.id)}
                              className="rounded border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                            />
                          </td>

                          {/* Index */}
                          <td className="py-2.5 px-2 text-center text-slate-500 font-mono text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Blueprint thumbnail */}
                          <td className="py-2 px-2 text-center">
                            <BlueprintThumbnail
                              item={item}
                              thumbnailUrl={item.pageNumber ? pdfThumbnails?.get(item.pageNumber) : undefined}
                              onClick={() => onOpenBlueprint(item)}
                            />
                          </td>

                          {/* Name (Наименование) */}
                          <td className="py-2.5 px-4">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => onUpdateItem({ ...item, name: e.target.value })}
                              className="w-full bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 text-slate-100 font-medium px-2 py-1 rounded border border-transparent focus:border-blue-500 focus:outline-none transition"
                            />
                            {item.notes && (
                              <div className="text-[10px] text-slate-400 px-2 mt-0.5 truncate max-w-sm">
                                {item.notes}
                              </div>
                            )}
                          </td>

                          {/* Designation (Обозначение / Опознавательный знак) */}
                          <td className="py-2.5 px-4 font-mono">
                            <input
                              type="text"
                              value={item.designation}
                              onChange={(e) => onUpdateItem({ ...item, designation: e.target.value })}
                              placeholder={item.hasNoStamp ? 'Опознавательный знак...' : 'АБВГ.XXXXXX.XXX'}
                              className={`w-full bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 font-semibold px-2 py-1 rounded border border-transparent focus:border-blue-500 focus:outline-none transition ${
                                item.hasNoStamp ? 'text-amber-300' : 'text-blue-300'
                              }`}
                            />
                            {/* Special badge if no stamp / frame found */}
                            {item.hasNoStamp && (
                              <div className="flex items-center space-x-1 text-[10px] text-amber-400 px-2 mt-0.5">
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="truncate" title={item.identificationMark || 'Без рамки ЕСКД'}>
                                  Без рамки (опознано: {item.identificationMark || item.designation})
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Part Length (Длина детали) */}
                          <td className="py-2.5 px-2 text-center">
                            <div className="inline-flex items-center justify-center space-x-1">
                              <input
                                type="text"
                                value={item.partLength || ''}
                                onChange={(e) => onUpdateItem({ ...item, partLength: e.target.value })}
                                placeholder="—"
                                className="w-20 text-center font-medium bg-slate-800/80 hover:bg-slate-800 border border-slate-700 focus:border-blue-500 text-slate-200 px-1.5 py-1 rounded text-xs focus:outline-none"
                              />
                            </div>
                          </td>

                          {/* CNC (ЧПУ с чекбоксами) */}
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleCnc(item)}
                              className={`w-6 h-6 rounded-md flex items-center justify-center mx-auto transition border cursor-pointer ${
                                item.isCnc
                                  ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm shadow-cyan-500/20'
                                  : 'bg-slate-800/80 text-slate-500 border-slate-700 hover:border-slate-600'
                              }`}
                              title={item.isCnc ? 'ЧПУ: Да (нажмите для выключения)' : 'ЧПУ: Нет (нажмите для включения)'}
                            >
                              {item.isCnc ? <Check className="w-4 h-4 stroke-[3]" /> : null}
                            </button>
                          </td>

                          {/* Piece Stock (Штучная заготовка с чекбоксами) */}
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleTogglePieceStock(item)}
                              className={`w-6 h-6 rounded-md flex items-center justify-center mx-auto transition border cursor-pointer ${
                                item.isPieceStock
                                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm shadow-indigo-500/20'
                                  : 'bg-slate-800/80 text-slate-500 border-slate-700 hover:border-slate-600'
                              }`}
                              title={
                                item.isPieceStock
                                  ? 'Штучная заготовка: Да (расчет по 1 шт, без +30мм при ЧПУ). Клик для выключения'
                                  : 'Штучная заготовка: Нет. Клик для включения'
                              }
                            >
                              {item.isPieceStock ? <Check className="w-4 h-4 stroke-[3]" /> : null}
                            </button>
                          </td>

                          {/* Billet Length (Длина заготовки) */}
                          <td className="py-2.5 px-2 text-center">
                            {(() => {
                              const billet = calculateBillet(item);
                              if (!billet.hasLength || billet.billetLength === null) {
                                return (
                                  <span className="text-slate-600 text-xs font-mono" title="Укажите длину детали для расчета заготовки">
                                    —
                                  </span>
                                );
                              }
                              return (
                                <div className="flex flex-col items-center justify-center space-y-0.5">
                                  <div className="flex items-center space-x-1 font-mono font-bold text-amber-300 text-xs">
                                    <span>{billet.billetLength} мм</span>
                                    {billet.billetCount && billet.billetCount > 1 && (
                                      <span className="text-[10px] text-amber-400/80 font-normal">
                                        ({billet.billetCount} шт.)
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight border cursor-help ${
                                      billet.isRestrictedBy1000
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                        : item.isPieceStock
                                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                                        : 'bg-slate-800 text-slate-300 border-slate-700'
                                    }`}
                                    title={`${billet.formulaDesc}${billet.isRestrictedBy1000 ? ' (сработало ограничение 1000 мм: разбито на несколько заготовок)' : ''}`}
                                  >
                                    {billet.kdString}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>

                          {/* Quantity (Количество) */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center space-x-1">
                              <input
                                type="number"
                                min="0"
                                value={item.quantity ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? null : Number(e.target.value);
                                  onUpdateItem({ ...item, quantity: val, qtySource: 'manual' });
                                }}
                                placeholder="0"
                                className={`w-16 text-center font-bold px-2 py-1 rounded border text-xs focus:outline-none ${
                                  isNoQty
                                    ? 'bg-amber-950/50 border-amber-500/60 text-amber-300'
                                    : 'bg-slate-800/80 border-slate-700 text-emerald-400 focus:border-emerald-500'
                                }`}
                              />
                              <span className="text-[10px] text-slate-500">шт</span>
                            </div>

                            {/* Source Badge */}
                            <div className="mt-1">
                              {item.qtySource === 'excel' && (
                                <span className="inline-block text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-medium">
                                  Из Excel
                                </span>
                              )}
                              {item.qtySource === 'drawing' && (
                                <span className="inline-block text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.2 rounded">
                                  Чертеж
                                </span>
                              )}
                              {item.qtySource === 'manual' && (
                                <span className="inline-block text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.2 rounded">
                                  Вручную
                                </span>
                              )}
                              {isNoQty && (
                                <span className="inline-block text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded">
                                  Нет кол-ва
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Code 1C (Код по 1С) */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={item.code1C}
                              onChange={(e) => onUpdateItem({ ...item, code1C: e.target.value })}
                              placeholder={sectionName === 'Стандарты' ? '00-00000000' : '—'}
                              className="w-full bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 text-slate-200 font-mono px-2 py-1 rounded border border-transparent focus:border-blue-500 focus:outline-none transition"
                            />
                          </td>

                          {/* Section selector */}
                          <td className="py-2.5 px-3">
                            <select
                              value={item.section}
                              onChange={(e) => onUpdateItem({ ...item, section: e.target.value as SectionType })}
                              className="w-full bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 focus:outline-none focus:border-blue-500 text-xs"
                            >
                              {SECTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Material */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={item.material || ''}
                              onChange={(e) => onUpdateItem({ ...item, material: e.target.value })}
                              placeholder="Сталь 45..."
                              className="w-full bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 text-slate-300 px-2 py-1 rounded border border-transparent focus:border-blue-500 focus:outline-none transition"
                            />
                          </td>

                          {/* PDF Page */}
                          <td className="py-2.5 px-2 text-center text-slate-400 font-mono">
                            {item.pageNumber ? `Л.${item.pageNumber}` : '—'}
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center space-x-1 opacity-80 group-hover:opacity-100 transition">
                              <button
                                onClick={() => onEditModalOpen(item)}
                                className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition"
                                title="Редактировать параметры"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onDeleteItem(item.id)}
                                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                                title="Удалить строку"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Footer Summary */}
      <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 gap-2">
        <div className="flex items-center space-x-4 flex-wrap">
          <span>Всего деталей: <strong className="text-white">{filteredItems.length}</strong></span>
          <span>
            Общее кол-во:{' '}
            <strong className="text-emerald-400">
              {filteredItems.reduce((acc, it) => acc + (it.quantity || 0), 0)} шт
            </strong>
          </span>
          <span>
            Деталей с ЧПУ:{' '}
            <strong className="text-cyan-400">
              {filteredItems.filter(it => it.isCnc).length}
            </strong>
          </span>
          {filteredItems.some(it => it.hasNoStamp) && (
            <span className="text-amber-400 font-medium">
              Опознано без рамки: {filteredItems.filter(it => it.hasNoStamp).length}
            </span>
          )}
        </div>

        <div className="text-[11px] text-slate-500">
          Кликните по превью в столбце «Чертёж» для просмотра чертежа и проверки рамочки
        </div>
      </div>

    </div>
  );
};
