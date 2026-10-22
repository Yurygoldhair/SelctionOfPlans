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
  Search
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
}) => {
  const [mapping, setMapping] = useState<ExcelColumnMapping>(initialMapping);
  const [filterMatchedOnly, setFilterMatchedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate reconciliation
  const matchResult = useMemo(() => {
    return reconcileQuantities(currentItems, rows, mapping);
  }, [currentItems, rows, mapping]);

  if (!isOpen) return null;

  const handleApply = () => {
    // Generate new updated items array
    const updatedMap = new Map<string, { newQty: number; code1C?: string; lengthFound?: string; cncFound?: boolean }>();
    matchResult.updatedItems.forEach((entry) => {
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
        newQty: entry.newQty,
        code1C: entry.code1CFound,
        lengthFound,
        cncFound,
      });
    });

    const newItems = currentItems.map((item) => {
      const match = updatedMap.get(item.id);
      if (match) {
        return {
          ...item,
          quantity: match.newQty,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Сопоставление количеств из Excel</span>
                <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                  {fileName}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Автоматическое сопоставление количеств и кодов 1С с чертежами
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
        <div className="p-6 overflow-y-auto space-y-5 flex-1 scrollbar-thin">
          
          {/* Column Mappings Configuration */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center justify-between">
              <span>Колонки в файле Excel:</span>
              <span className="text-[11px] text-slate-400 font-normal">
                Всего строк в Excel: {rows.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              {/* Designation Col */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Обозначение:</label>
                <select
                  value={mapping.designationCol}
                  onChange={(e) => setMapping({ ...mapping, designationCol: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Name Col */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Наименование:</label>
                <select
                  value={mapping.nameCol}
                  onChange={(e) => setMapping({ ...mapping, nameCol: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Length Col */}
              <div>
                <label className="block text-blue-400 mb-1 font-medium">Длина детали:</label>
                <select
                  value={mapping.lengthCol || ''}
                  onChange={(e) => setMapping({ ...mapping, lengthCol: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* CNC Col */}
              <div>
                <label className="block text-cyan-400 mb-1 font-medium">ЧПУ (CNC):</label>
                <select
                  value={mapping.cncCol || ''}
                  onChange={(e) => setMapping({ ...mapping, cncCol: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Quantity Col */}
              <div>
                <label className="block text-emerald-400 mb-1 font-semibold">Количество *:</label>
                <select
                  value={mapping.quantityCol}
                  onChange={(e) => setMapping({ ...mapping, quantityCol: e.target.value })}
                  className="w-full bg-slate-900 border border-emerald-600/60 rounded-lg px-2.5 py-1.5 text-emerald-300 focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* 1C Code Col */}
              <div>
                <label className="block text-indigo-400 mb-1 font-medium">Код 1С:</label>
                <select
                  value={mapping.code1CCol || ''}
                  onChange={(e) => setMapping({ ...mapping, code1CCol: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Не выбрано --</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
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
              <div className="text-[11px] text-slate-500 mt-0.5">Точное совпадение шифра</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <div className="text-slate-400 mb-0.5">По Наименованию:</div>
              <div className="text-xl font-bold text-amber-400">
                {matchResult.matchedByName}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Стандарты / по названию</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <div className="text-slate-400 mb-0.5">Кодов 1С добавлено:</div>
              <div className="text-xl font-bold text-indigo-400">
                +{matchResult.newCodes1CAdded}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Для стандартов и деталей</div>
            </div>
          </div>

          {/* Table Preview */}
          <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-900/90">
            <div className="p-3 bg-slate-800/60 border-b border-slate-700/80 flex items-center justify-between text-xs">
              <div className="font-semibold text-white">
                Предпросмотр обновления количеств ({matchResult.updatedItems.length} строк):
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type="text"
                  placeholder="Поиск по деталям..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs w-48 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-800 text-slate-400 sticky top-0 border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Раздел</th>
                    <th className="py-2 px-3">Обозначение</th>
                    <th className="py-2 px-3">Наименование</th>
                    <th className="py-2 px-3 text-center">Было (чертеж)</th>
                    <th className="py-2 px-3 text-center">Будет (Excel)</th>
                    <th className="py-2 px-3">Код 1С</th>
                    <th className="py-2 px-3">Способ поиска</th>
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
                    .map(({ item, oldQty, newQty, matchType, code1CFound }) => {
                      const diff = (newQty || 0) - (oldQty || 0);
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-[140px]">
                            {item.section}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-200 font-medium">
                            {item.designation || '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-300 font-medium">
                            {item.name}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-400">
                            {oldQty ?? '0'} шт
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-emerald-400">
                            {newQty} шт
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
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                matchType === 'designation'
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {matchType === 'designation' ? 'По Обозначению' : 'По Названию'}
                            </span>
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
            {matchResult.matchedCount > 0 ? (
              <span className="text-emerald-400 font-medium flex items-center space-x-1">
                <CheckCircle2 className="w-4 h-4 inline" />
                <span>Будет обновлено {matchResult.matchedCount} позиций</span>
              </span>
            ) : (
              <span className="text-amber-400 font-medium flex items-center space-x-1">
                <AlertTriangle className="w-4 h-4 inline" />
                <span>Совпадений не обнаружено. Проверьте выбор колонок выше.</span>
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
              disabled={matchResult.matchedCount === 0}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-emerald-600/30 flex items-center space-x-2 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Применить количества к таблице</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
