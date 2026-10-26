import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  Layers,
  X,
  RefreshCw,
  Search,
  Calculator,
  CheckSquare,
  Square
} from 'lucide-react';
import { DrawingItem, ExcelColumnMapping } from '../types';
import { reconcileQuantities } from '../utils/excelParser';

interface ExcelMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  headers: string[];
  rows: Record<string, any>[];
  currentItems: DrawingItem[];
  initialMapping: ExcelColumnMapping;
  onApplyMatches: (updatedItems: DrawingItem[]) => void;
  machinesCount?: number;
}

export const ExcelMatchModal: React.FC<ExcelMatchModalProps> = ({
  isOpen,
  onClose,
  fileName,
  headers,
  rows,
  currentItems,
  initialMapping,
  onApplyMatches,
  machinesCount = 1,
}) => {
  const [mapping, setMapping] = useState<ExcelColumnMapping>(initialMapping);
  const [searchQuery, setSearchQuery] = useState('');
  // Mode: whether quantities in Excel are for 1 machine (to be multiplied) or already exact totals
  const [excelMode, setExcelMode] = useState<'per_machine' | 'total'>('total');
  // Set of item IDs explicitly unchecked by user (empty by default -> all matches applied!)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  // Manual quantity overrides per item in the modal
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});

  // Calculate reconciliation with smart parser (BOM sum + desig root + generic name protection)
  const matchResult = useMemo(() => {
    return reconcileQuantities(currentItems, rows, mapping);
  }, [currentItems, rows, mapping]);

  if (!isOpen) return null;

  // Helper to get quick sample values of a column for user verification
  const getColPreview = (colName: string): string => {
    if (!colName) return '';
    const sampleVals: string[] = [];
    for (const r of rows) {
      const v = r[colName];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        sampleVals.push(String(v).trim());
        if (sampleVals.length >= 3) break;
      }
    }
    return sampleVals.length > 0 ? ` (прим.: ${sampleVals.join(', ')})` : '';
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setExcludedIds(new Set()); // include all
    } else {
      setExcludedIds(new Set(matchResult.updatedItems.map(u => u.item.id))); // exclude all
    }
  };

  const handleToggleItem = (id: string) => {
    const next = new Set(excludedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExcludedIds(next);
  };

  const handleApply = () => {
    // Generate new updated items map
    const updatedMap = new Map<string, {
      newQty: number;
      code1C?: string;
      lengthFound?: string;
      cncFound?: boolean;
    }>();

    matchResult.updatedItems.forEach((entry) => {
      // Only include if user has NOT excluded this item
      if (excludedIds.has(entry.item.id)) return;

      const effectiveQty = customQuantities[entry.item.id] !== undefined
        ? customQuantities[entry.item.id]
        : entry.newQty;

      let lengthFound: string | undefined;
      if (mapping.lengthCol && entry.matchedRow[mapping.lengthCol]) {
        lengthFound = String(entry.matchedRow[mapping.lengthCol]).trim();
      }

      let cncFound: boolean | undefined;
      if (mapping.cncCol && entry.matchedRow[mapping.cncCol] !== undefined && entry.matchedRow[mapping.cncCol] !== '') {
        const val = String(entry.matchedRow[mapping.cncCol]).toLowerCase();
        if (val === '1' || val === 'да' || val === 'true' || val === 'yes' || val === '+') {
          cncFound = true;
        } else if (val === '0' || val === 'нет' || val === 'false' || val === 'no' || val === '-') {
          cncFound = false;
        }
      }

      updatedMap.set(entry.item.id, {
        newQty: effectiveQty,
        code1C: entry.code1CFound,
        lengthFound,
        cncFound,
      });
    });

    const isMultiply = machinesCount > 1 && excelMode === 'per_machine';

    const newItems = currentItems.map((item) => {
      const match = updatedMap.get(item.id);
      if (match) {
        const excelQty = match.newQty;
        const totalQty = isMultiply ? excelQty * machinesCount : excelQty;
        const perMachQty = isMultiply
          ? excelQty
          : (machinesCount > 1 ? Math.round(excelQty / machinesCount) : excelQty);

        return {
          ...item,
          quantity: totalQty,
          quantityPerMachine: perMachQty,
          qtySource: 'excel' as const,
          originalDrawingQty: item.originalDrawingQty ?? item.quantity,
          code1C: match.code1C || item.code1C,
          partLength: match.lengthFound || item.partLength,
          isCnc: match.cncFound !== undefined ? match.cncFound : item.isCnc,
        };
      }
      return item;
    });

    onApplyMatches(newItems);
    onClose();
  };

  const activeMatchesCount = matchResult.updatedItems.filter(u => !excludedIds.has(u.item.id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Сверка количеств и кодов 1С из Excel</span>
                <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded border border-slate-700 font-mono">
                  {fileName}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Автоматическое сопоставление по ЕСКД кодам, суммирование строк BOM и защита от ошибок
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
          
          {/* Mode Selector for Machines Count */}
          {machinesCount > 1 && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2 text-amber-200">
                <Calculator className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="font-semibold text-white">В плане производства: {machinesCount} машин.</span>
                  <div className="text-[11px] text-slate-300">
                    Укажите, как интерпретировать числа в колонке количества Excel:
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3 bg-slate-900/80 p-1 rounded-lg border border-slate-700 text-xs shrink-0">
                <label className="flex items-center space-x-1.5 px-2.5 py-1 rounded cursor-pointer transition hover:bg-slate-800">
                  <input
                    type="radio"
                    name="excelMode"
                    checked={excelMode === 'total'}
                    onChange={() => setExcelMode('total')}
                    className="text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                  <span className={excelMode === 'total' ? 'text-emerald-300 font-semibold' : 'text-slate-400'}>
                    Точно как в Excel (на весь заказ)
                  </span>
                </label>

                <label className="flex items-center space-x-1.5 px-2.5 py-1 rounded cursor-pointer transition hover:bg-slate-800">
                  <input
                    type="radio"
                    name="excelMode"
                    checked={excelMode === 'per_machine'}
                    onChange={() => setExcelMode('per_machine')}
                    className="text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <span className={excelMode === 'per_machine' ? 'text-amber-300 font-semibold' : 'text-slate-400'}>
                    На 1 машину (умножить на {machinesCount})
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Column Mappings Configuration */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center justify-between">
              <span>Привязка колонок файла Excel:</span>
              <span className="text-[11px] text-slate-400 font-normal">
                Распознано строк с данными: <strong className="text-white">{rows.length}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              {/* Designation Col */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Обозначение чертежа:</label>
                <select
                  value={mapping.designationCol}
                  onChange={(e) => setMapping({ ...mapping, designationCol: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}{getColPreview(h)}</option>
                  ))}
                </select>
              </div>

              {/* Name Col */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Наименование:</label>
                <select
                  value={mapping.nameCol}
                  onChange={(e) => setMapping({ ...mapping, nameCol: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}{getColPreview(h)}</option>
                  ))}
                </select>
              </div>

              {/* Quantity Col (HIGHLIGHTED) */}
              <div>
                <label className="block text-emerald-400 mb-1 font-semibold flex items-center space-x-1">
                  <span>Количество *:</span>
                </label>
                <select
                  value={mapping.quantityCol}
                  onChange={(e) => setMapping({ ...mapping, quantityCol: e.target.value })}
                  className="w-full bg-slate-900 border border-emerald-500 rounded-lg px-2 py-1.5 text-emerald-300 focus:outline-none focus:border-emerald-400 font-semibold text-xs ring-1 ring-emerald-500/30"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}{getColPreview(h)}</option>
                  ))}
                </select>
              </div>

              {/* 1C Code Col */}
              <div>
                <label className="block text-indigo-400 mb-1 font-medium">Код 1С:</label>
                <select
                  value={mapping.code1CCol || ''}
                  onChange={(e) => setMapping({ ...mapping, code1CCol: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}{getColPreview(h)}</option>
                  ))}
                </select>
              </div>

              {/* Length Col */}
              <div>
                <label className="block text-blue-400 mb-1 font-medium">Длина детали:</label>
                <select
                  value={mapping.lengthCol || ''}
                  onChange={(e) => setMapping({ ...mapping, lengthCol: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}{getColPreview(h)}</option>
                  ))}
                </select>
              </div>

              {/* CNC Col */}
              <div>
                <label className="block text-cyan-400 mb-1 font-medium">ЧПУ:</label>
                <select
                  value={mapping.cncCol || ''}
                  onChange={(e) => setMapping({ ...mapping, cncCol: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500 text-xs"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}{getColPreview(h)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Match Statistics Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <div className="text-slate-400 mb-0.5">Совпало позиций:</div>
              <div className="text-xl font-bold text-emerald-400">
                {matchResult.matchedCount} / {currentItems.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {Math.round((matchResult.matchedCount / (currentItems.length || 1)) * 100)}% чертежей
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <div className="text-slate-400 mb-0.5">По Обозначению ЕСКД:</div>
              <div className="text-xl font-bold text-blue-400">
                {matchResult.matchedByDesignation}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Точный шифр / основа кода</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <div className="text-slate-400 mb-0.5">Сумм строк BOM:</div>
              <div className="text-xl font-bold text-purple-400">
                {matchResult.updatedItems.filter(u => (u.sumRowCount || 1) > 1).length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Объединено дубликатов строк</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <div className="text-slate-400 mb-0.5">Кодов 1С найдено:</div>
              <div className="text-xl font-bold text-indigo-400">
                +{matchResult.newCodes1CAdded}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Готово для стандартов и 1С</div>
            </div>
          </div>

          {/* Table Preview */}
          <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-900/90">
            <div className="p-3 bg-slate-800/60 border-b border-slate-700/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={matchResult.updatedItems.length > 0 && excludedIds.size === 0}
                  onChange={(e) => handleToggleSelectAll(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                />
                <span className="font-semibold text-white">
                  Предпросмотр обновления ({matchResult.updatedItems.length - excludedIds.size} из {matchResult.updatedItems.length} выбрано):
                </span>
              </div>

              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder="Поиск по обозначению / названию..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1 text-slate-200 text-xs w-60 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-800 text-slate-400 sticky top-0 border-b border-slate-700 z-10">
                  <tr>
                    <th className="py-2 px-3 w-8 text-center">✓</th>
                    <th className="py-2 px-3">Раздел</th>
                    <th className="py-2 px-3">Обозначение на чертеже</th>
                    <th className="py-2 px-3">Наименование</th>
                    <th className="py-2 px-3 text-center">Было</th>
                    <th className="py-2 px-3 text-center">В файле Excel</th>
                    <th className="py-2 px-3 text-center">Будет в таблице</th>
                    <th className="py-2 px-3">Код 1С</th>
                    <th className="py-2 px-3">Способ сопоставления</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {matchResult.updatedItems
                    .filter((u) => {
                      if (!searchQuery) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        u.item.name.toLowerCase().includes(q) ||
                        u.item.designation.toLowerCase().includes(q)
                      );
                    })
                    .map(({ item, oldQty, newQty, matchType, matchedRow, code1CFound, sumRowCount, sumDetails }) => {
                      const isSelected = !excludedIds.has(item.id);
                      const currentExcelQty = customQuantities[item.id] !== undefined ? customQuantities[item.id] : newQty;
                      const isMultiply = machinesCount > 1 && excelMode === 'per_machine';
                      const finalQtyToApply = isMultiply ? currentExcelQty * machinesCount : currentExcelQty;
                      const diff = finalQtyToApply - (oldQty || 0);
                      const matchedExcelDesig = matchedRow && mapping.designationCol ? String(matchedRow[mapping.designationCol] || '').trim() : '';

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-800/40 transition ${
                            isSelected ? 'bg-slate-800/20' : 'opacity-40'
                          }`}
                        >
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleItem(item.id)}
                              className="rounded border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-[130px]">
                            {item.section}
                          </td>
                          <td className="py-2 px-3 font-mono text-blue-300 font-semibold">
                            <div>{item.designation || '—'}</div>
                            {matchedExcelDesig && (
                              <div className="text-[10px] text-slate-400 font-normal truncate max-w-[150px]" title={`В Excel: ${matchedExcelDesig}`}>
                                Excel: {matchedExcelDesig}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-200 font-medium">
                            {item.name}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-400 font-mono">
                            {oldQty ?? '0'} шт
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              <input
                                type="number"
                                min="0"
                                value={currentExcelQty}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  setCustomQuantities(prev => ({
                                    ...prev,
                                    [item.id]: isNaN(val) ? 0 : val
                                  }));
                                }}
                                className="w-16 bg-slate-950 border border-slate-700 hover:border-slate-500 focus:border-amber-400 rounded px-1.5 py-0.5 text-center font-mono font-bold text-amber-300 text-xs focus:outline-none transition"
                                title="Нажмите, чтобы вручную скорректировать количество из Excel"
                              />
                              <span className="text-[10px] text-slate-400 font-mono">шт</span>
                            </div>
                            {sumRowCount && sumRowCount > 1 && (
                              <div className="text-[10px] text-purple-300 font-mono mt-0.5" title={sumDetails}>
                                {sumRowCount} строк BOM
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-emerald-400 font-mono">
                            {finalQtyToApply} шт
                            {isMultiply && (
                              <span className="text-[9px] text-amber-300 ml-1 font-normal">
                                ({currentExcelQty} × {machinesCount} маш.)
                              </span>
                            )}
                            {diff !== 0 && (
                              <span className={`text-[10px] ml-1.5 ${diff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ({diff > 0 ? `+${diff}` : diff})
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-indigo-300 font-mono text-[11px]">
                            {code1CFound || item.code1C || '—'}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-col space-y-0.5">
                              {matchType === 'designation' && (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  По Обозначению (точно)
                                </span>
                              )}
                              {matchType === 'desig_root' && (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30" title="Совпали цифры шифра детали (без буквенного кода организации)">
                                  По шифру детали
                                </span>
                              )}
                              {matchType === 'name' && (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  По Названию
                                </span>
                              )}
                              {sumRowCount && sumRowCount > 1 && (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono text-purple-300 bg-purple-950/60 border border-purple-500/30" title={sumDetails}>
                                  Сумма {sumRowCount} строк
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {activeMatchesCount > 0 ? (
              <span className="text-emerald-400 font-medium flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 inline" />
                <span>Будет обновлено {activeMatchesCount} позиций</span>
              </span>
            ) : (
              <span className="text-amber-400 font-medium flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 inline" />
                <span>Выберите позиции для применения</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700/80 rounded-xl transition"
            >
              Отмена
            </button>
            <button
              onClick={handleApply}
              disabled={activeMatchesCount === 0}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-emerald-600/30 flex items-center space-x-2 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Занести количества в таблицу ({activeMatchesCount})</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
