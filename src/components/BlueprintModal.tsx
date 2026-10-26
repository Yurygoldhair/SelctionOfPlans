import React, { useState, useEffect } from 'react';
import { DrawingItem, StampOptions } from '../types';
import { X, Download, Printer, ZoomIn, ZoomOut, Maximize2, Star, CheckCircle, Eye, RefreshCw, Move, Box, Calculator } from 'lucide-react';
import { generateProductionPdfWithQuantities, downloadPdfFile } from '../utils/pdfStamper';
import { renderPdfPageToDataUrl } from '../utils/pdfRenderer';
import { calculateBillet } from '../utils/billetCalculator';

interface BlueprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: DrawingItem | null;
  pdfBase64?: string;
  allItems?: DrawingItem[];
}

export const BlueprintModal: React.FC<BlueprintModalProps> = ({
  isOpen,
  onClose,
  item,
  pdfBase64,
  allItems,
}) => {
  const [stampPos, setStampPos] = useState<'top-left-eskd' | 'top-right' | 'above-stamp' | 'top-left'>('top-left-eskd');
  const [stampFormat, setStampFormat] = useState<'qty-only' | 'with-prefix'>('qty-only');
  const [fontSize, setFontSize] = useState<number>(13);
  const [offsetX, setOffsetX] = useState<number>(0); // mm
  const [offsetY, setOffsetY] = useState<number>(0); // mm
  const [printBillet, setPrintBillet] = useState<boolean>(true);
  const [billetOffsetX, setBilletOffsetX] = useState<number>(0); // mm
  const [billetOffsetY, setBilletOffsetY] = useState<number>(0); // mm
  const [isGenerating, setIsGenerating] = useState(false);
  const [realPageImg, setRealPageImg] = useState<string | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  // Load real PDF page if available
  useEffect(() => {
    if (isOpen && item && pdfBase64) {
      setIsLoadingPage(true);
      const pageNum = item.pageNumber || 1;
      renderPdfPageToDataUrl(pdfBase64, pageNum, 1.4)
        .then((url) => {
          setRealPageImg(url);
          setIsLoadingPage(false);
        })
        .catch((e) => {
          console.warn('Could not load real page image:', e);
          setRealPageImg(null);
          setIsLoadingPage(false);
        });
    } else {
      setRealPageImg(null);
      setIsLoadingPage(false);
    }
  }, [isOpen, item, pdfBase64]);

  if (!isOpen || !item) return null;

  const qty = item.quantity ?? 1;
  const billet = calculateBillet(item, allItems);
  const qtyStampText = stampFormat === 'with-prefix' ? `Кол-во: ${qty} шт.` : `${qty} шт.`;
  const billetStampText = billet.hasLength && (billet.stampText || billet.kdString) ? (billet.stampText || billet.kdString) : '';

  const handleDownloadSinglePdf = async () => {
    try {
      setIsGenerating(true);
      const pdfBytes = await generateProductionPdfWithQuantities(
        [item],
        pdfBase64,
        {
          position: stampPos,
          format: stampFormat,
          fontSize: stampPos === 'top-left-eskd' ? fontSize : 22,
          fontFamily: 'Arial',
          withBorder: true,
          stampColor: '#000000',
          eraseOldDesignation: true,
          offsetX_mm: offsetX,
          offsetY_mm: offsetY,
          printBilletStamp: printBillet,
          billetOffsetX_mm: billetOffsetX,
          billetOffsetY_mm: billetOffsetY,
        },
        allItems
      );
      downloadPdfFile(pdfBytes, `Чертеж_${item.designation || 'деталь'}_(кол-во_${qty}шт_Lзаг_ЕСКД).pdf`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-sm font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded border border-blue-500/20">
              {item.designation || 'ЧЕРТЕЖ'}
            </span>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2 flex-wrap gap-y-1">
                <span>{item.name}</span>
                {item.hasNoStamp && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-semibold flex items-center space-x-1">
                    <span>Без рамки: {item.identificationMark || 'опознавательный знак'}</span>
                  </span>
                )}
                {item.isCnc && (
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded font-semibold">
                    ЧПУ
                  </span>
                )}
                {item.isPieceStock && (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded font-semibold">
                    Штучная заг.
                  </span>
                )}
                {billet.hasLength && (billet.stampText || billet.kdString) && (
                  <span
                    className={`text-[10px] border px-2 py-0.5 rounded font-mono font-bold ${
                      billet.isSubsequentCombinedItem
                        ? 'bg-amber-500/25 text-amber-200 border-amber-500/50'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                    title={billet.formulaDesc}
                  >
                    {billet.stampText} {billet.billetLength && !billet.isSubsequentCombinedItem ? `(${billet.billetLength} мм)` : ''}
                  </span>
                )}
                {item.partLength && (
                  <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-mono">
                    L: {item.partLength}
                  </span>
                )}
                {item.isHighlighted && (
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded font-semibold flex items-center space-x-1">
                    <Star className="w-3 h-3 fill-rose-300" />
                    <span>Выделенная</span>
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                Раздел: {item.section} • Материал: {item.material || 'Сталь'} • Лист {item.pageNumber || 1}
                {item.partLength && <span className="ml-2 text-blue-300 font-medium">Длина: {item.partLength}</span>}
                {realPageImg && <span className="ml-2 text-emerald-400 font-medium">✓ Оригинальный чертеж из PDF</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownloadSinglePdf}
              disabled={isGenerating}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow flex items-center space-x-1.5 transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isGenerating ? 'Создание...' : 'Скачать этот лист'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: Stamp placement controls & Fine tuning */}
        <div className="px-5 py-2.5 bg-slate-800/80 border-b border-slate-700/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-4 flex-wrap gap-y-2">
            
            {/* Position selector */}
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 font-medium">Место:</span>
              <select
                value={stampPos}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setStampPos(val);
                  if (val === 'top-left-eskd') setFontSize(13);
                  else setFontSize(22);
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
              >
                <option value="top-left-eskd">
                  ★ Графа 26 (вместо дубликата)
                </option>
                <option value="top-right">
                  Верхний правый угол
                </option>
                <option value="above-stamp">
                  Над штампом
                </option>
              </select>
            </div>

            {/* Format selector */}
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 font-medium">Формат:</span>
              <select
                value={stampFormat}
                onChange={(e) => setStampFormat(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
              >
                <option value="qty-only">{qty} шт.</option>
                <option value="with-prefix">Кол-во: {qty} шт.</option>
              </select>
            </div>

            {/* Font size */}
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 font-medium">Шрифт:</span>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500 text-xs"
              >
                <option value={11}>11 pt</option>
                <option value={13}>13 pt</option>
                <option value={16}>16 pt</option>
                <option value={22}>22 pt</option>
              </select>
            </div>

            {/* Fine tuning offset in mm for Quantity */}
            <div className="flex items-center space-x-2 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-700">
              <span className="text-slate-400 font-medium flex items-center space-x-1" title="Смещение рамочки количества в верхнем левом углу">
                <Move className="w-3 h-3 text-blue-400" />
                <span>Сдвиг кол-ва:</span>
              </span>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setOffsetX(prev => prev - 1)}
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[11px] rounded font-mono"
                  title="Сдвиг влево на 1 мм"
                >
                  ←
                </button>
                <span className="font-mono text-[11px] text-white w-7 text-center">
                  X:{offsetX}
                </span>
                <button
                  type="button"
                  onClick={() => setOffsetX(prev => prev + 1)}
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[11px] rounded font-mono"
                  title="Сдвиг вправо на 1 мм"
                >
                  →
                </button>
              </div>

              <div className="flex items-center space-x-1 ml-1 pl-1 border-l border-slate-700">
                <button
                  type="button"
                  onClick={() => setOffsetY(prev => prev + 1)}
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[11px] rounded font-mono"
                  title="Сдвиг вверх на 1 мм"
                >
                  ↑
                </button>
                <span className="font-mono text-[11px] text-white w-7 text-center">
                  Y:{offsetY}
                </span>
                <button
                  type="button"
                  onClick={() => setOffsetY(prev => prev - 1)}
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[11px] rounded font-mono"
                  title="Сдвиг вниз на 1 мм"
                >
                  ↓
                </button>
              </div>
            </div>

            {/* Billet Stamp toggle and fine tuning */}
            {billetStampText && (
              <div className="flex items-center space-x-2 bg-amber-950/20 px-2.5 py-1 rounded-lg border border-amber-600/30">
                <label className="flex items-center space-x-1.5 cursor-pointer text-amber-300 font-semibold text-xs">
                  <input
                    type="checkbox"
                    checked={printBillet}
                    onChange={(e) => setPrintBillet(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>Lзаг слева от обозначения</span>
                </label>

                {printBillet && (
                  <div className="flex items-center space-x-1 ml-1 pl-1 border-l border-amber-600/30">
                    <button
                      type="button"
                      onClick={() => setBilletOffsetX(prev => prev - 1)}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[11px] rounded font-mono text-amber-300"
                      title="Сдвиг Lзаг влево на 1 мм"
                    >
                      ←
                    </button>
                    <span className="font-mono text-[11px] text-amber-200 w-7 text-center">
                      X:{billetOffsetX}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBilletOffsetX(prev => prev + 1)}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[11px] rounded font-mono text-amber-300"
                      title="Сдвиг Lзаг вправо на 1 мм"
                    >
                      →
                    </button>

                    <button
                      type="button"
                      onClick={() => setBilletOffsetY(prev => prev + 1)}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[11px] rounded font-mono text-amber-300 ml-1"
                      title="Сдвиг Lзаг вверх на 1 мм"
                    >
                      ↑
                    </button>
                    <span className="font-mono text-[11px] text-amber-200 w-7 text-center">
                      Y:{billetOffsetY}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBilletOffsetY(prev => prev - 1)}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[11px] rounded font-mono text-amber-300"
                      title="Сдвиг Lзаг вниз на 1 мм"
                    >
                      ↓
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

          <div className="text-[11px] text-emerald-400 flex items-center space-x-1.5 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 font-medium">
            <CheckCircle className="w-3.5 h-3.5 inline" />
            <span>2 штампа: <strong>Кол-во (верхний левый) + Lзаг (слева от обозначения)</strong></span>
          </div>
        </div>

        {/* Drawing Preview Area */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-950 flex items-center justify-center scrollbar-thin">
          <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-2xl p-4 text-slate-900 select-none border-2 border-slate-300 overflow-hidden min-h-[460px] flex items-center justify-center">
            
            {isLoadingPage ? (
              <div className="flex flex-col items-center justify-center text-slate-500 space-y-2">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                <span className="text-xs">Загрузка оригинальной страницы чертежа из PDF...</span>
              </div>
            ) : realPageImg ? (
              /* REAL PDF DRAWING PAGE */
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={realPageImg}
                  alt={item.name}
                  className="w-full h-auto max-h-[600px] object-contain shadow"
                />

                {/* 1. QUANTITY STAMP OVERLAY (Top-Left Box) */}
                <div
                  style={{
                    transform: `translate(${offsetX * 2.83}px, ${-offsetY * 2.83}px)`,
                  }}
                  className={`absolute pointer-events-auto transition-transform ${
                    stampPos === 'top-left-eskd'
                      ? 'top-2 left-4 sm:top-2.5 sm:left-6'
                      : stampPos === 'top-right'
                      ? 'top-4 right-4'
                      : 'bottom-20 right-4'
                  }`}
                >
                  <div
                    style={{
                      fontFamily: 'Arial, sans-serif',
                      fontSize: `${fontSize}px`,
                      width: stampPos === 'top-left-eskd' ? '180px' : 'auto',
                      height: stampPos === 'top-left-eskd' ? '36px' : 'auto',
                    }}
                    className="bg-white border-2 border-black text-black font-bold px-3 py-1 rounded shadow-md flex items-center justify-center text-center tracking-wide"
                  >
                    {qtyStampText}
                  </div>
                  {stampPos === 'top-left-eskd' && (
                    <div className="text-[9px] text-blue-700 font-sans text-center mt-0.5 font-bold uppercase bg-white/90 px-1 rounded shadow-sm">
                      Графа 26 • Старое обозначение скрыто
                    </div>
                  )}
                </div>

                {/* 2. BILLET LENGTH STAMP OVERLAY (строго слева от обозначения в рамке) */}
                {printBillet && billetStampText && (
                  <div
                    style={{
                      transform: `translate(${billetOffsetX * 2.83}px, ${-billetOffsetY * 2.83}px)`,
                    }}
                    className="absolute bottom-5 sm:bottom-6 right-56 sm:right-64 md:right-72 pointer-events-auto transition-transform z-10"
                  >
                    <div
                      style={{
                        fontFamily: 'Arial, sans-serif',
                        fontSize: '11px',
                        minWidth: '145px',
                        height: '30px',
                      }}
                      className="bg-white border-2 border-black text-black font-bold px-2.5 py-1 rounded shadow-md flex items-center justify-center text-center tracking-wide"
                    >
                      {billetStampText}
                    </div>
                    <div className="text-[9px] text-amber-900 font-sans text-center mt-0.5 font-bold uppercase bg-amber-100/90 px-1 rounded shadow-sm">
                      {billet.isSubsequentCombinedItem ? 'Лист 2+ группы • Заг. на 1-м листе' : 'Слева от обозначения в рамке'}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* FALLBACK ESKD SHEET IF NO PDF UPLOADED */
              <div className="relative w-full aspect-[1.414/1] flex flex-col justify-between">
                <div className="absolute inset-2 sm:inset-4 border-2 border-black flex flex-col justify-between">
                  
                  {/* 1. STAMPED QUANTITY BADGE (Графа 26 или свободное поле) */}
                  <div
                    style={{
                      transform: `translate(${offsetX * 2.83}px, ${-offsetY * 2.83}px)`,
                    }}
                    className={`absolute pointer-events-auto transition-transform ${
                      stampPos === 'top-left-eskd'
                        ? 'top-0 left-0'
                        : stampPos === 'top-right'
                        ? 'top-4 right-4'
                        : 'bottom-36 right-4'
                    }`}
                  >
                    <div
                      style={{
                        fontFamily: 'Arial, sans-serif',
                        fontSize: `${fontSize}px`,
                        width: stampPos === 'top-left-eskd' ? '185px' : 'auto',
                        height: stampPos === 'top-left-eskd' ? '38px' : 'auto',
                      }}
                      className="bg-white border-2 border-black text-black font-bold px-4 py-1.5 shadow flex items-center justify-center text-center tracking-wide"
                    >
                      {qtyStampText}
                    </div>
                    {stampPos === 'top-left-eskd' && (
                      <div className="text-[9px] text-blue-700 font-sans text-left ml-1 mt-0.5 font-semibold uppercase">
                        Графа 26 (дубликат скрыт)
                      </div>
                    )}
                  </div>

                  {/* CAD lines */}
                  <div className="flex-1 flex flex-col items-center justify-center p-8">
                    <div className="w-full max-w-md h-60 relative flex items-center justify-center">
                      <svg className="w-full h-full text-slate-900" viewBox="0 0 400 240" fill="none" stroke="currentColor">
                        <line x1="60" y1="30" x2="340" y2="30" stroke="#0284c7" strokeWidth="1" />
                        <line x1="60" y1="25" x2="60" y2="35" stroke="#0284c7" strokeWidth="1" />
                        <line x1="340" y1="25" x2="340" y2="35" stroke="#0284c7" strokeWidth="1" />
                        <text x="200" y="24" fill="#0284c7" fontSize="11" textAnchor="middle" fontFamily="sans-serif">
                          L = {item.partLength || '240±0.2'}
                        </text>
                        <rect x="80" y="50" width="80" height="130" strokeWidth="2.5" fill="#f8fafc" />
                        <rect x="160" y="70" width="120" height="90" strokeWidth="2.5" fill="#f1f5f9" />
                        <rect x="280" y="85" width="45" height="60" strokeWidth="2.5" fill="#f8fafc" />
                        <line x1="40" y1="115" x2="360" y2="115" stroke="#dc2626" strokeWidth="1" strokeDasharray="10,4,2,4" />
                      </svg>
                    </div>
                  </div>

                  {/* Standard ESKD Title Stamp */}
                  <div className="self-end w-full max-w-lg border-t-2 border-l-2 border-black text-[10px] grid grid-cols-12 bg-white relative">
                    {/* Top Row: Left area for Billet, Right area for Designation */}
                    <div className="col-span-5 border-r border-b border-black p-1.5 flex items-center justify-center bg-amber-50/50">
                      {printBillet && billetStampText ? (
                        <div
                          style={{
                            transform: `translate(${billetOffsetX * 2.83}px, ${-billetOffsetY * 2.83}px)`,
                          }}
                          className="bg-white border-2 border-black px-2 py-1 rounded text-[10px] font-mono font-bold text-black shadow-sm text-center"
                          title="Длина заготовки строго слева от обозначения в рамке"
                        >
                          {billetStampText}
                        </div>
                      ) : (
                        <span className="text-[9px] text-slate-400 italic">Слева от обозначения</span>
                      )}
                    </div>
                    <div className="col-span-7 border-b border-black p-1.5 text-center font-mono font-bold text-xs flex items-center justify-center">
                      {item.designation || 'АБВГ.XXXXXX.XXX'}
                    </div>

                    {/* Lower Rows */}
                    <div className="col-span-3 border-r border-b border-black p-1">
                      <div className="text-[8px] text-slate-500">Разраб.</div>
                      <div className="font-semibold">Инженер</div>
                    </div>
                    <div className="col-span-6 border-r border-b border-black p-1 text-center">
                      <div className="text-[8px] text-slate-500">Наименование</div>
                      <div className="font-bold text-xs truncate">{item.name}</div>
                    </div>
                    <div className="col-span-3 border-b border-black p-1 text-center font-mono font-bold">
                      1 / 1
                    </div>
                    <div className="col-span-3 border-r border-black p-1 font-semibold">
                      Контролер
                    </div>
                    <div className="col-span-6 border-r border-black p-1 text-center font-semibold text-[9px] truncate">
                      {item.material || 'Сталь 45'}
                    </div>
                    <div className="col-span-3 p-1 text-center font-semibold text-[9px] text-slate-500">
                      Лист {item.pageNumber || 1}
                    </div>
                  </div>

                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-xs text-slate-400">
          <div>
            Деталь: <strong className="text-white">{item.name}</strong> • Обозначение: <strong className="text-blue-300 font-mono">{item.designation}</strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
          >
            Закрыть
          </button>
        </div>

      </div>
    </div>
  );
};
