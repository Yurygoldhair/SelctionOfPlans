import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Layers,
  Database,
  RefreshCw,
  Sparkles,
  HelpCircle,
  FileCheck2,
  TableProperties,
  History,
  Printer,
  Ruler,
  Cpu,
  AlertTriangle
} from 'lucide-react';
import { DrawingItem } from '../types';
import {
  exportUnifiedExcel,
  exportMultiSheetExcel,
  download1CCompatibleExcel,
  downloadBlankQuantityTemplate
} from '../utils/excelExport';

interface HeaderProps {
  items: DrawingItem[];
  onLoadDemo: () => void;
  onClear: () => void;
  onApplySampleExcel: () => void;
  onOpenHistory: () => void;
  sessionsCount: number;
  activeSessionTitle?: string;
  onOpenGeneratePdf: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  items,
  onLoadDemo,
  onClear,
  onApplySampleExcel,
  onOpenHistory,
  sessionsCount,
  activeSessionTitle,
  onOpenGeneratePdf,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const totalQty = items.reduce((sum, it) => sum + (it.quantity || 0), 0);
  const with1C = items.filter(it => Boolean(it.code1C)).length;
  const withCnc = items.filter(it => it.isCnc).length;
  const withoutStamp = items.filter(it => it.hasNoStamp).length;
  const missingQty = items.filter(it => it.quantity === null || it.quantity === 0).length;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Title & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-inner border border-blue-400/30">
              <TableProperties className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-100">
                  ПАРСЕР ЧЕРТЕЖЕЙ И СПЕЦИФИКАЦИЙ
                </h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  4 Раздела + Длина + ЧПУ
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                {activeSessionTitle ? (
                  <span className="text-blue-300 font-medium truncate max-w-sm">
                    {activeSessionTitle}
                  </span>
                ) : (
                  <span>Автоматическое извлечение чертежей по титульным листам, габаритам и штамп количества</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="px-3 py-1.5 rounded-md bg-slate-800/80 border border-slate-700/60 flex items-center space-x-1.5">
              <span className="text-slate-400">Позиций:</span>
              <span className="font-bold text-white">{items.length}</span>
            </div>
            <div className="px-3 py-1.5 rounded-md bg-slate-800/80 border border-slate-700/60 flex items-center space-x-1.5">
              <span className="text-slate-400">Всего шт:</span>
              <span className="font-bold text-emerald-400">{totalQty.toLocaleString('ru-RU')}</span>
            </div>
            <div className="px-3 py-1.5 rounded-md bg-slate-800/80 border border-slate-700/60 flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">ЧПУ:</span>
              <span className="font-bold text-cyan-300">{withCnc}</span>
            </div>
            <div className="px-3 py-1.5 rounded-md bg-slate-800/80 border border-slate-700/60 flex items-center space-x-1.5">
              <span className="text-slate-400">Кодов 1С:</span>
              <span className="font-bold text-indigo-400">{with1C}</span>
            </div>
            {withoutStamp > 0 && (
              <div className="px-3 py-1.5 rounded-md bg-amber-950/40 border border-amber-600/50 flex items-center space-x-1.5 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Без рамки:</span>
                <span className="font-bold">{withoutStamp}</span>
              </div>
            )}
            {missingQty > 0 && (
              <div className="px-3 py-1.5 rounded-md bg-amber-950/40 border border-amber-600/50 flex items-center space-x-1.5 text-amber-300">
                <span>Без количества:</span>
                <span className="font-bold">{missingQty}</span>
              </div>
            )}
          </div>

          {/* Top Actions: History, Сформировать ПДФ, Export Excel */}
          <div className="flex items-center space-x-2 flex-wrap">
            {/* History Button */}
            <button
              onClick={onOpenHistory}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700/80 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center space-x-1.5 transition"
              title="История всех предыдущих отборов"
            >
              <History className="w-4 h-4 text-blue-400" />
              <span>История ({sessionsCount})</span>
            </button>

            {/* Сформировать ПДФ */}
            <button
              onClick={onOpenGeneratePdf}
              disabled={items.length === 0}
              className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm flex items-center space-x-1.5 transition"
              title="Сформировать ПДФ с впечатыванием количества в рамочку ЕСКД"
            >
              <Printer className="w-4 h-4" />
              <span>Сформировать ПДФ</span>
            </button>

            <button
              onClick={() => setShowInfo(!showInfo)}
              title="Справка по разделам и правилам"
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            {/* Export Menu */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={items.length === 0}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Сохранить в Excel</span>
              </button>

              {showExportMenu && (
                <div
                  className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl z-50 py-1 text-xs animate-fade-in"
                  onClick={() => setShowExportMenu(false)}
                >
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/60">
                    Форматы сохранения
                  </div>
                  <button
                    onClick={() => exportUnifiedExcel(items)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-slate-700/60 flex items-start space-x-2.5 text-slate-200 transition"
                  >
                    <TableProperties className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-white">Единый шаблон (4 раздела)</div>
                      <div className="text-[11px] text-slate-400">
                        Один лист с шапками разделов, длиной детали, ЧПУ и итогами
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => exportMultiSheetExcel(items)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-slate-700/60 flex items-start space-x-2.5 text-slate-200 transition"
                  >
                    <Layers className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-white">По отдельным вкладкам</div>
                      <div className="text-[11px] text-slate-400">
                        Отдельный лист на каждый раздел + лист Сводная
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => download1CCompatibleExcel(items)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-slate-700/60 flex items-start space-x-2.5 text-slate-200 transition"
                  >
                    <Database className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-white">Выгрузка для 1С:Предприятие</div>
                      <div className="text-[11px] text-slate-400">
                        Формат для загрузки в справочник номенклатуры 1С
                      </div>
                    </div>
                  </button>

                  <div className="my-1 border-t border-slate-700/60"></div>

                  <button
                    onClick={() => downloadBlankQuantityTemplate()}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-700/60 flex items-center space-x-2 text-slate-300 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Скачать шаблон Excel для количеств</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Info on Rules */}
        {showInfo && (
          <div className="mt-4 p-4 rounded-xl bg-slate-800/90 border border-slate-700 text-xs text-slate-300">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-white text-sm">Правила обработки чертежей по 4 разделам:</span>
              <button onClick={() => setShowInfo(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-300">
              <li className="flex items-start space-x-2">
                <span className="text-blue-400 font-bold">1.</span>
                <span><strong>Токарные+фрезерные работы:</strong> основные детали механообработки (валы, втулки, фланцы, корпуса, шпильки).</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-amber-400 font-bold">2.</span>
                <span><strong>Токарные+фрезерные работы: Лазер:</strong> листовые детали после лазерной резки с фрезеровкой/токаркой.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-purple-400 font-bold">3.</span>
                <span><strong>Токарные+фрезерные работы: ВОС:</strong> прецизионные высокоточные детали с особыми требованиями.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-emerald-400 font-bold">4.</span>
                <span><strong>Стандарты:</strong> метизы и покупные изделия (ГОСТ, ОСТ, DIN, крепеж) с кодами 1С.</span>
              </li>
              <li className="flex items-start space-x-2 md:col-span-2 pt-1 border-t border-slate-700">
                <Ruler className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span><strong>Столбец «Длина детали»:</strong> автоматически извлекается габаритный размер длины детали (L) из чертежа в мм.</span>
              </li>
              <li className="flex items-start space-x-2 md:col-span-2">
                <Cpu className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span><strong>Столбец «ЧПУ»:</strong> интерактивные чекбоксы для отметки деталей, требующих обработки на станках с ЧПУ.</span>
              </li>
              <li className="flex items-start space-x-2 md:col-span-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span><strong>Чертежи без рамки и штампа:</strong> нейросеть сканирует лист, находит любой опознавательный знак (номер позиции, габаритный эскиз, маркировку) и вносит его в таблицу.</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
};
