import React, { useState } from 'react';
import { DrawingItem, StampOptions, isRodOrStud } from '../types';
import {
  FileText,
  Download,
  X,
  Printer,
  CheckCircle2,
  Sliders,
  Sparkles,
  Layers,
  FileCheck,
  ShieldCheck,
  RotateCw,
  Move
} from 'lucide-react';
import { generateProductionPdfWithQuantities, downloadPdfFile } from '../utils/pdfStamper';

interface GeneratePdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: DrawingItem[];
  pdfBase64?: string;
  pdfFileName?: string;
}

export const GeneratePdfModal: React.FC<GeneratePdfModalProps> = ({
  isOpen,
  onClose,
  items,
  pdfBase64,
  pdfFileName,
}) => {
  const [position, setPosition] = useState<'top-left-eskd' | 'top-right' | 'above-stamp' | 'top-left'>('top-left-eskd');
  const [format, setFormat] = useState<'kd-billet' | 'qty-only' | 'with-prefix'>('qty-only');
  const [fontSize, setFontSize] = useState<number>(13); // 13pt scaled to fit the 14mm frame
  const [stampColor, setStampColor] = useState<string>('#000000');
  const [eraseOldDesignation, setEraseOldDesignation] = useState(true);
  const [offsetX, setOffsetX] = useState<number>(0); // mm
  const [offsetY, setOffsetY] = useState<number>(0); // mm
  const [printBillet, setPrintBillet] = useState<boolean>(true);
  const [billetOffsetX, setBilletOffsetX] = useState<number>(0); // mm
  const [billetOffsetY, setBilletOffsetY] = useState<number>(0); // mm
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const totalQty = items.reduce((sum, it) => sum + (it.quantity || 0), 0);
  const missingQtyCount = items.filter(it => it.quantity === null || it.quantity === 0).length;
  const rodsAndStuds = items.filter(it => isRodOrStud(it));

  const handleGenerate = async () => {
    try {
      setIsProcessing(true);
      const options: StampOptions = {
        position,
        format,
        fontSize: position === 'top-left-eskd' ? fontSize : 22,
        fontFamily: 'Arial',
        withBorder: true,
        stampColor,
        eraseOldDesignation,
        offsetX_mm: offsetX,
        offsetY_mm: offsetY,
        printBilletStamp: printBillet,
        billetOffsetX_mm: billetOffsetX,
        billetOffsetY_mm: billetOffsetY,
      };

      const pdfBytes = await generateProductionPdfWithQuantities(items, pdfBase64, options);
      const outputName = pdfFileName
        ? `${pdfFileName.replace(/\.pdf$/i, '')}_(с_количеством_и_Lзаг_ЕСКД).pdf`
        : `Комплект_чертежей_с_количеством_и_Lзаг_(ЕСКД).pdf`;

      downloadPdfFile(pdfBytes, outputName);
      onClose();
    } catch (e: any) {
      console.error(e);
      alert('Ошибка при генерации PDF: ' + (e.message || String(e)));
    } finally {
      setIsProcessing(false);
    }
  };

  const isEskdBox = position === 'top-left-eskd';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Сформировать ПДФ с количеством</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold">
                  ЕСКД ГОСТ 2.104
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Печать количества деталей в рамку без перекрытия размеров чертежа
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-slate-300 max-h-[75vh] overflow-y-auto scrollbar-thin">
          
          {/* Key Advantages Notice */}
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
            <div className="flex items-center space-x-2 text-white font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Точная посадка в рамку чертежа (Графа 26):</span>
            </div>
            <ul className="text-slate-300 space-y-1 text-[11px] list-disc list-inside">
              <li>
                <strong>Горизонтальные чертежи:</strong> настроена авто-компенсация отступа (сдвинуто влево и вверх строго по контуру рамки).
              </li>
              <li>
                <strong>Вертикальные чертежи:</strong> позиция сохранена по ГОСТ без изменений.
              </li>
              <li>
                <strong>Дубликат обозначения:</strong> аккуратно закрашивается белым прямоугольником, внутрь вносится количество.
              </li>
              {rodsAndStuds.length > 0 && (
                <li className="text-emerald-300 font-semibold">
                  <strong>Прутки и шпильки ({rodsAndStuds.length} поз.):</strong> включены в итоговый PDF-пакет с простановкой штампов (при этом они не отображаются в таблице механических деталей).
                </li>
              )}
            </ul>
          </div>

          {/* Form Settings */}
          <div className="space-y-3.5">
            
            {/* Stamp placement */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Место размещения количества:
              </label>
              <select
                value={position}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setPosition(val);
                  if (val === 'top-left-eskd') setFontSize(13);
                  else setFontSize(22);
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="top-left-eskd">
                  ★ Левый верхний угол: Графа 26 (вместо дубликата обозначения — Рекомендуется)
                </option>
                <option value="top-right">
                  Верхний правый угол чертежа (Свободное поле)
                </option>
                <option value="above-stamp">
                  Над основной надписью / штампом в правом нижнем углу
                </option>
              </select>
            </div>

            {/* Stamp format */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                <span>Формат надписи в КД:</span>
                <span className="text-[10px] text-blue-400 font-normal">ГОСТ 2.104 Графа 26</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat('kd-billet')}
                  className={`py-2 px-2 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                    format === 'kd-billet'
                      ? 'bg-blue-600/30 border-blue-500 text-white font-bold ring-1 ring-blue-500/50'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-xs font-mono font-bold text-amber-300">Lзаг=...-...</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">По ТЗ КД (Заготовка)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('qty-only')}
                  className={`py-2 px-2 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                    format === 'qty-only'
                      ? 'bg-blue-600/30 border-blue-500 text-white font-bold ring-1 ring-blue-500/50'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-xs font-mono font-bold">12 шт.</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">Только кол-во</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('with-prefix')}
                  className={`py-2 px-2 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                    format === 'with-prefix'
                      ? 'bg-blue-600/30 border-blue-500 text-white font-bold ring-1 ring-blue-500/50'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-xs font-mono font-bold">Кол-во: 12 шт.</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">С префиксом</span>
                </button>
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Размер шрифта Arial:
              </label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
              >
                <option value={11}>11 pt Arial (Компактный)</option>
                <option value={13}>13 pt Arial (Стандарт под рамочку 14мм — Рекомендуется)</option>
                <option value={16}>16 pt Arial</option>
                <option value={22}>22 pt Arial (Для свободного поля)</option>
              </select>
            </div>

            {/* Fine-Tuning Offsets (Смещение рамочки) */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2.5">
              <div className="flex items-center justify-between text-slate-200 font-semibold">
                <span className="flex items-center space-x-1.5">
                  <Move className="w-3.5 h-3.5 text-blue-400" />
                  <span>Тонкая подстройка положения рамочки (мм):</span>
                </span>
                {(offsetX !== 0 || offsetY !== 0) && (
                  <button
                    type="button"
                    onClick={() => { setOffsetX(0); setOffsetY(0); }}
                    className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                  >
                    Сбросить в 0
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Horizontal Shift */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400">По горизонтали (X):</span>
                    <span className="font-mono text-white font-semibold">
                      {offsetX > 0 ? `+${offsetX}` : offsetX} мм
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setOffsetX(prev => prev - 1)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 font-mono"
                      title="Сдвинуть влево на 1 мм"
                    >
                      ← влево
                    </button>
                    <button
                      type="button"
                      onClick={() => setOffsetX(prev => prev + 1)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 font-mono"
                      title="Сдвинуть вправо на 1 мм"
                    >
                      вправо →
                    </button>
                  </div>
                </div>

                {/* Vertical Shift */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400">По вертикали (Y):</span>
                    <span className="font-mono text-white font-semibold">
                      {offsetY > 0 ? `+${offsetY}` : offsetY} мм
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setOffsetY(prev => prev + 1)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 font-mono"
                      title="Сдвинуть вверх на 1 мм"
                    >
                      ↑ вверх
                    </button>
                    <button
                      type="button"
                      onClick={() => setOffsetY(prev => prev - 1)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 font-mono"
                      title="Сдвинуть вниз на 1 мм"
                    >
                      вниз ↓
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Erase old designation checkbox */}
            {isEskdBox && (
              <label className="flex items-center space-x-2.5 p-2 bg-slate-800/60 border border-slate-700 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={eraseOldDesignation}
                  onChange={(e) => setEraseOldDesignation(e.target.checked)}
                  className="rounded border-slate-700 text-blue-600 focus:ring-0"
                />
                <span className="text-slate-200 text-xs">
                  Закрасить дубликат обозначения белым цветом в Графе 26 (верхний левый угол)
                </span>
              </label>
            )}

            {/* Billet Stamp Options (слева от обозначения в рамке) */}
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2.5">
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={printBillet}
                  onChange={(e) => setPrintBillet(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-0"
                />
                <div>
                  <span className="text-amber-200 font-semibold text-xs block">
                    Записывать длину заготовки слева от обозначения в рамке (Lзаг)
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    Печатается в основной надписи чертежа на свободном месте слева от шифра детали
                  </span>
                </div>
              </label>

              {printBillet && (
                <div className="pt-2 border-t border-amber-600/30 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Смещение Lзаг (мм):</span>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setBilletOffsetX(prev => prev - 1)}
                        className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-amber-300"
                        title="Сдвиг влево на 1 мм"
                      >
                        ←
                      </button>
                      <span className="font-mono text-[11px] text-amber-200 w-8 text-center">
                        X:{billetOffsetX}
                      </span>
                      <button
                        type="button"
                        onClick={() => setBilletOffsetX(prev => prev + 1)}
                        className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-amber-300"
                        title="Сдвиг вправо на 1 мм"
                      >
                        →
                      </button>
                    </div>

                    <div className="flex items-center space-x-1 ml-1 pl-1 border-l border-amber-700/50">
                      <button
                        type="button"
                        onClick={() => setBilletOffsetY(prev => prev + 1)}
                        className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-amber-300"
                        title="Сдвиг вверх на 1 мм"
                      >
                        ↑
                      </button>
                      <span className="font-mono text-[11px] text-amber-200 w-8 text-center">
                        Y:{billetOffsetY}
                      </span>
                      <button
                        type="button"
                        onClick={() => setBilletOffsetY(prev => prev - 1)}
                        className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-amber-300"
                        title="Сдвиг вниз на 1 мм"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Live Preview Box */}
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 text-slate-900 space-y-2">
            <div className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
              <span>Вид двух надписей на чертеже:</span>
              <span className="text-[10px] text-blue-600 font-normal">ГОСТ 2.104</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Stamp 1: Quantity */}
              <div className="border border-slate-300 p-2 rounded bg-slate-50 flex flex-col items-center">
                <span className="text-[10px] text-slate-500 font-medium mb-1">
                  1. Верхний левый угол (кол-во):
                </span>
                <div
                  style={{
                    fontFamily: 'Arial, sans-serif',
                    fontSize: `${fontSize}px`,
                  }}
                  className="font-bold px-3 py-1 bg-white border-2 border-black rounded text-center shadow-sm font-mono tracking-wide w-full max-w-[150px]"
                >
                  {format === 'with-prefix' ? 'Кол-во: 12 шт.' : '12 шт.'}
                </div>
              </div>

              {/* Stamp 2: Billet Length */}
              <div className="border border-slate-300 p-2 rounded bg-slate-50 flex flex-col items-center">
                <span className="text-[10px] text-slate-500 font-medium mb-1">
                  2. Строго слева от обозначения:
                </span>
                <div
                  style={{
                    fontFamily: 'Arial, sans-serif',
                    fontSize: '11px',
                  }}
                  className="font-bold px-2 py-1 bg-white border-2 border-black rounded text-center shadow-sm font-mono tracking-tight w-full max-w-[155px]"
                >
                  Lзаг=955- 2 шт.
                </div>
                <span className="text-[9px] text-slate-500 mt-0.5">
                  (или «заг. на пред. чертеже»)
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-xl transition"
          >
            Отмена
          </button>
          
          <button
            onClick={handleGenerate}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 flex items-center space-x-2 transition"
          >
            <Download className="w-4 h-4" />
            <span>{isProcessing ? 'Формирование комплекта PDF...' : 'Сформировать и скачать PDF'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
