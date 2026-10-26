import React, { useRef, useState } from 'react';
import {
  FileUp,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Sparkles,
  Download,
  Info,
  ChevronRight
} from 'lucide-react';
import { ExtractionProgress } from '../types';
import { parseExcelFile, autoDetectColumns, reconcileQuantities } from '../utils/excelParser';
import { SAMPLE_EXCEL_BOM_ROWS } from '../utils/demoData';

interface DropzoneSectionProps {
  progress: ExtractionProgress;
  onPdfSelected: (file: File) => void;
  onExcelSelected: (file: File) => void;
  onLoadDemo: () => void;
  onApplySampleExcel: () => void;
  onDownloadTemplate: () => void;
  itemsCount: number;
}

export const DropzoneSection: React.FC<DropzoneSectionProps> = ({
  progress,
  onPdfSelected,
  onExcelSelected,
  onLoadDemo,
  onApplySampleExcel,
  onDownloadTemplate,
  itemsCount,
}) => {
  const [pdfDragOver, setPdfDragOver] = useState(false);
  const [excelDragOver, setExcelDragOver] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const handlePdfDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setPdfDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        setPdfFileName(file.name);
        onPdfSelected(file);
      }
    }
  };

  const handleExcelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setExcelDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls') ||
        file.name.endsWith('.csv')
      ) {
        setExcelFileName(file.name);
        onExcelSelected(file);
      }
    }
  };

  const isAnalyzing = progress.status === 'analyzing_ai' || progress.status === 'reading_file';

  return (
    <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 shadow-sm backdrop-blur mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Step 1: PDF Upload Card */}
        <div
          onDragOver={(e) => { e.preventDefault(); setPdfDragOver(true); }}
          onDragLeave={() => setPdfDragOver(false)}
          onDrop={handlePdfDrop}
          className={`relative rounded-xl border-2 border-dashed p-5 transition flex flex-col justify-between ${
            pdfDragOver
              ? 'border-blue-500 bg-blue-950/30'
              : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
          }`}
        >
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                setPdfFileName(file.name);
                onPdfSelected(file);
              }
            }}
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                  Чертежи PDF с титульными листами
                </h3>
              </div>
              <span className="text-[11px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 font-medium">
                4 раздела
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Загрузите PDF с чертежами. Распознаются титульные листы 4 разделов, длина деталей, признаки ЧПУ и эскизы без рамки.
            </p>

            {/* Inner Drop Area */}
            <div
              onClick={() => !isAnalyzing && pdfInputRef.current?.click()}
              className="cursor-pointer bg-slate-900/80 border border-slate-700/80 hover:border-blue-500/60 rounded-xl p-4 text-center transition group"
            >
              {isAnalyzing ? (
                <div className="py-2 flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  <div className="text-xs font-semibold text-slate-200">
                    {progress.message || 'Анализ штампов и титульных листов...'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Распознавание ЕСКД, длины (L), ЧПУ, опознавательных знаков без рамки и стандартов
                  </div>
                </div>
              ) : pdfFileName ? (
                <div className="flex items-center justify-center space-x-3 py-1">
                  <FileText className="w-6 h-6 text-emerald-400" />
                  <div className="text-left">
                    <div className="text-xs font-semibold text-emerald-300 truncate max-w-[240px]">
                      {pdfFileName}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Нажмите, чтобы заменить файл чертежей
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-2 space-y-1.5">
                  <FileUp className="w-7 h-7 text-blue-400 group-hover:scale-110 transition" />
                  <div className="text-xs font-medium text-slate-200">
                    Перетащите <span className="text-blue-400 font-semibold">PDF с чертежами</span> сюда или нажмите для выбора
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Автоматически разделяет по 4 разделам и извлекает Наименование, Обозначение, Длину детали, ЧПУ, Количество
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Demo CTA */}
          <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">Нет файла прямо сейчас?</span>
            <button
              onClick={onLoadDemo}
              className="inline-flex items-center space-x-1.5 text-blue-400 hover:text-blue-300 font-medium transition text-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Загрузить готовый демо-чертеж</span>
            </button>
          </div>
        </div>

        {/* Step 2: Excel Quantity Upload Card */}
        <div
          onDragOver={(e) => { e.preventDefault(); setExcelDragOver(true); }}
          onDragLeave={() => setExcelDragOver(false)}
          onDrop={handleExcelDrop}
          className={`relative rounded-xl border-2 border-dashed p-5 transition flex flex-col justify-between ${
            excelDragOver
              ? 'border-emerald-500 bg-emerald-950/30'
              : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
          }`}
        >
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                setExcelFileName(file.name);
                onExcelSelected(file);
              }
            }}
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                  Файл Excel с количествами (BOM / 1C)
                </h3>
              </div>
              <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                По Обозначению / 1С
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Если на чертежах нет количества — подгрузите Excel со спецификацией заказа. Количество заполнится автоматически.
            </p>

            {/* Inner Drop Area */}
            <div
              onClick={() => excelInputRef.current?.click()}
              className="cursor-pointer bg-slate-900/80 border border-slate-700/80 hover:border-emerald-500/60 rounded-xl p-4 text-center transition group"
            >
              {excelFileName ? (
                <div className="flex items-center justify-center space-x-3 py-1">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                  <div className="text-left">
                    <div className="text-xs font-semibold text-emerald-300 truncate max-w-[240px]">
                      {excelFileName}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Нажмите, чтобы загрузить другой файл Excel
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-2 space-y-1.5">
                  <FileSpreadsheet className="w-7 h-7 text-emerald-400 group-hover:scale-110 transition" />
                  <div className="text-xs font-medium text-slate-200">
                    Перетащите <span className="text-emerald-400 font-semibold">Excel (.xlsx / .csv)</span> сюда
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Сопоставление по колонкам «Обозначение», «Наименование», «Количество», «Код 1С»
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions Footer */}
          <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
            <button
              onClick={onApplySampleExcel}
              className="inline-flex items-center space-x-1.5 text-emerald-400 hover:text-emerald-300 font-medium transition text-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Применить тестовый Excel (ведомость)</span>
            </button>
            <button
              onClick={onDownloadTemplate}
              className="inline-flex items-center space-x-1 text-slate-400 hover:text-slate-200 transition text-[11px]"
            >
              <Download className="w-3 h-3" />
              <span>Скачать чистый шаблон</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
