import React, { useState, useEffect } from 'react';
import {
  DrawingItem,
  ExtractionProgress,
  SectionType,
  ExcelColumnMapping,
  BatchSession
} from './types';
import { INITIAL_DEMO_ITEMS, SAMPLE_EXCEL_BOM_ROWS } from './utils/demoData';
import { Header } from './components/Header';
import { DropzoneSection } from './components/DropzoneSection';
import { SectionTabs } from './components/SectionTabs';
import { DrawingsTable } from './components/DrawingsTable';
import { ExcelMatchModal } from './components/ExcelMatchModal';
import { ItemEditModal } from './components/ItemEditModal';
import { BlueprintModal } from './components/BlueprintModal';
import { GeneratePdfModal } from './components/GeneratePdfModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { parseExcelFile, autoDetectColumns } from './utils/excelParser';
import { downloadBlankQuantityTemplate } from './utils/excelExport';
import {
  loadAllSessions,
  saveAllSessions,
  createNewSession,
  updateSession,
  deleteSessionById,
  getActiveSessionId,
  setActiveSessionId
} from './utils/sessionStorage';
import { generatePdfPageThumbnails } from './utils/pdfRenderer';
import { recognizePdf, looksLikeScannedPdf } from './utils/recognize';
import { CheckCircle, AlertCircle, Info, Sparkles } from 'lucide-react';

export default function App() {
  const [sessions, setSessions] = useState<BatchSession[]>([]);
  const [activeSessionId, setActiveSessionState] = useState<string | null>(null);
  const [pdfThumbnails, setPdfThumbnails] = useState<Map<number, string>>(new Map());

  const [items, setItems] = useState<DrawingItem[]>(INITIAL_DEMO_ITEMS);
  const [selectedSection, setSelectedSection] = useState<SectionType | 'all'>('all');
  const [currentPdfBase64, setCurrentPdfBase64] = useState<string | undefined>(undefined);
  const [currentPdfName, setCurrentPdfName] = useState<string | undefined>(undefined);
  
  const [progress, setProgress] = useState<ExtractionProgress>({
    status: 'idle',
    message: '',
  });

  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>({
    type: 'info',
    message: 'Загружен отбор по 4 разделам. Добавлены столбцы Длина детали и ЧПУ, а также распознавание чертежей без рамки.',
  });

  // Modal states
  const [excelModalData, setExcelModalData] = useState<{
    isOpen: boolean;
    fileName: string;
    headers: string[];
    rows: Record<string, any>[];
    mapping: ExcelColumnMapping;
  } | null>(null);

  const [editModalData, setEditModalData] = useState<{
    isOpen: boolean;
    item: DrawingItem | null;
    defaultSection?: SectionType;
  } | null>(null);

  const [blueprintModalItem, setBlueprintModalItem] = useState<DrawingItem | null>(null);
  const [isGeneratePdfOpen, setIsGeneratePdfOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Initialize sessions from local storage
  useEffect(() => {
    const loadedSessions = loadAllSessions();
    setSessions(loadedSessions);

    const activeId = getActiveSessionId() || (loadedSessions.length > 0 ? loadedSessions[0].id : null);
    if (activeId) {
      setActiveSessionState(activeId);
      const active = loadedSessions.find(s => s.id === activeId);
      if (active) {
        setItems(active.items);
        setCurrentPdfBase64(active.pdfBase64);
        setCurrentPdfName(active.pdfFileName);
        if (active.pdfBase64) {
          generatePdfPageThumbnails(active.pdfBase64, active.id).then(thumbs => {
            setPdfThumbnails(thumbs);
          });
        }
      }
    }
  }, []);

  // Sync active session when items change
  const syncItemsToActiveSession = (newItems: DrawingItem[], pdfName?: string, pdfB64?: string) => {
    setItems(newItems);
    if (activeSessionId) {
      const active = sessions.find(s => s.id === activeSessionId);
      if (active) {
        const updated: BatchSession = {
          ...active,
          items: newItems,
          totalQty: newItems.reduce((acc, it) => acc + (it.quantity || 0), 0),
          pdfFileName: pdfName !== undefined ? pdfName : active.pdfFileName,
          pdfBase64: pdfB64 !== undefined ? pdfB64 : active.pdfBase64,
          updatedAt: new Date().toISOString(),
        };
        updateSession(updated);
        setSessions(prev => prev.map(s => (s.id === updated.id ? updated : s)));
      }
    }
  };

  // Trigger temporary notification toast
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(prev => (prev?.message === message ? null : prev));
    }, 5000);
  };

  /**
   * Handles user PDF upload.
   * "новая загрузка пдф это новый отбор" -> Creates a brand new BatchSession!
   */
  const handlePdfSelected = async (file: File) => {
    try {
      setProgress({
        status: 'reading_file',
        message: `Чтение файла ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} МБ)...`,
      });

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const result = reader.result as string;
          const base64Data = result.split(',')[1] || result;

          setProgress({
            status: 'analyzing_ai',
            message: 'Локальный движок анализирует титульные листы разделов и штампы чертежей...',
          });

          const data = await recognizePdf(base64Data, file.name);

          if (data.error) {
            // Special case: PDF without a text layer (scan) — explain how to fix it.
            if (data.error.status === 422 && looksLikeScannedPdf(data.pageTexts)) {
              const msg = 'Похоже, PDF является сканом (картинки без текстового слоя). Локальный движок видит только векторные/текстовые PDF. Отсканируйте чертежи качественнее или добавьте ключ GEMINI_API_KEY в .env для распознавания сканов.';
              setProgress({ status: 'error', message: msg });
              showToast(msg, 'error');
            } else {
              const msg = data.error.details ? `${data.error.message}. ${data.error.details}` : data.error.message;
              setProgress({ status: 'error', message: msg });
              showToast(`Ошибка распознавания: ${msg}`, 'error');
            }
            return;
          }

          if (!data.items.length) {
            throw new Error('В PDF не найдено ни одной позиции чертежей');
          }

          // "новая загрузка пдф это новый отбор"
          const newTitle = `Отбор №${sessions.length + 1} — ${file.name.replace(/\.pdf$/i, '')}`;
          const newSession = createNewSession(newTitle, data.items, file.name, base64Data);

          setSessions(loadAllSessions());
          setActiveSessionState(newSession.id);
          setItems(data.items);
          setCurrentPdfBase64(base64Data);
          setCurrentPdfName(file.name);

          // Generate thumbnails for the newly uploaded PDF
          generatePdfPageThumbnails(base64Data, newSession.id).then(thumbs => {
            setPdfThumbnails(thumbs);
          });

          setProgress({
            status: 'success',
            message: `Создан новый отбор: ${newTitle}! Извлечено ${data.items.length} чертежей.`,
          });
          showToast(`Создан новый отбор! Извлечено ${data.items.length} чертежей (${data.engine === 'gemini' ? 'распознано Gemini' : 'локальный движок'}).`, 'success');
        } catch (err: any) {
          console.error(err);
          const msg = err?.message === 'Failed to fetch'
            ? 'Сервер недоступен. Убедитесь, что запущен командой npm run dev, и обновите страницу.'
            : (err.message || 'Ошибка распознавания PDF');
          setProgress({
            status: 'error',
            message: msg,
          });
          showToast(`Ошибка распознавания: ${msg}`, 'error');
        }
      };

      reader.onerror = () => {
        setProgress({ status: 'error', message: 'Не удалось прочитать файл PDF' });
        showToast('Не удалось прочитать локальный файл PDF', 'error');
      };

      reader.readAsDataURL(file);
    } catch (e: any) {
      setProgress({ status: 'error', message: e.message || 'Ошибка' });
      showToast(e.message, 'error');
    }
  };

  /**
   * Handles user Excel file upload for quantity replenishment
   */
  const handleExcelSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const parsed = parseExcelFile(buffer);
        const autoMapping = autoDetectColumns(parsed.headers);

        setExcelModalData({
          isOpen: true,
          fileName: file.name,
          headers: parsed.headers,
          rows: parsed.rows,
          mapping: autoMapping,
        });
      } catch (err: any) {
        console.error(err);
        showToast('Не удалось распарсить Excel: проверьте формат (.xlsx, .xls, .csv)', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  /**
   * Quick action: apply sample Excel BOM to test reconciliation
   */
  const handleApplySampleExcel = () => {
    const headers = Object.keys(SAMPLE_EXCEL_BOM_ROWS[0]);
    const autoMapping = autoDetectColumns(headers);

    setExcelModalData({
      isOpen: true,
      fileName: 'Пример_Спецификации_Заказа_408.xlsx',
      headers,
      rows: SAMPLE_EXCEL_BOM_ROWS,
      mapping: autoMapping,
    });
  };

  /**
   * Handler when matches from Excel are applied
   */
  const handleApplyExcelMatches = (updatedItems: DrawingItem[]) => {
    syncItemsToActiveSession(updatedItems);
    showToast('Количества и коды 1С успешно обновлены из файла Excel!', 'success');
  };

  /**
   * Item actions
   */
  const handleUpdateItem = (updated: DrawingItem) => {
    const next = items.map(it => (it.id === updated.id ? updated : it));
    syncItemsToActiveSession(next);
  };

  const handleDeleteItem = (id: string) => {
    const next = items.filter(it => it.id !== id);
    syncItemsToActiveSession(next);
    showToast('Позиция удалена', 'info');
  };

  const handleBatchDelete = (ids: string[]) => {
    const idSet = new Set(ids);
    const next = items.filter(it => !idSet.has(it.id));
    syncItemsToActiveSession(next);
    showToast(`Удалено ${ids.length} позиций`, 'info');
  };

  const handleBatchMoveSection = (ids: string[], newSection: SectionType) => {
    const idSet = new Set(ids);
    const next = items.map(it => (idSet.has(it.id) ? { ...it, section: newSection } : it));
    syncItemsToActiveSession(next);
    showToast(`Перемещено ${ids.length} позиций в раздел "${newSection}"`, 'success');
  };

  const handleBatchToggleCnc = (ids: string[], isCnc: boolean) => {
    const idSet = new Set(ids);
    const next = items.map(it => (idSet.has(it.id) ? { ...it, isCnc } : it));
    syncItemsToActiveSession(next);
    showToast(`Для ${ids.length} деталей установлен статус ЧПУ: ${isCnc ? 'Да' : 'Нет'}`, 'success');
  };

  const handleBatchTogglePieceStock = (ids: string[], isPieceStock: boolean) => {
    const idSet = new Set(ids);
    const next = items.map(it => (idSet.has(it.id) ? { ...it, isPieceStock } : it));
    syncItemsToActiveSession(next);
    showToast(`Для ${ids.length} деталей установлен статус штучной заготовки: ${isPieceStock ? 'Да' : 'Нет'}`, 'success');
  };

  const handleAddItem = (section?: SectionType) => {
    setEditModalData({
      isOpen: true,
      item: null,
      defaultSection: section || (selectedSection === 'all' ? 'Токарные+фрезерные работы' : selectedSection),
    });
  };

  const handleSaveModalItem = (itemToSave: DrawingItem) => {
    const exists = items.some(i => i.id === itemToSave.id);
    let next: DrawingItem[];
    if (exists) {
      next = items.map(i => (i.id === itemToSave.id ? itemToSave : i));
      showToast('Позиция обновлена', 'success');
    } else {
      next = [itemToSave, ...items];
      showToast('Новая позиция добавлена', 'success');
    }
    syncItemsToActiveSession(next);
  };

  /**
   * History session handlers
   */
  const handleSelectSession = (id: string) => {
    const s = sessions.find(sess => sess.id === id);
    if (s) {
      setActiveSessionId(id);
      setActiveSessionState(id);
      setItems(s.items);
      setCurrentPdfBase64(s.pdfBase64);
      setCurrentPdfName(s.pdfFileName);
      if (s.pdfBase64) {
        generatePdfPageThumbnails(s.pdfBase64, s.id).then(thumbs => {
          setPdfThumbnails(thumbs);
        });
      } else {
        setPdfThumbnails(new Map());
      }
      showToast(`Открыт отбор: "${s.title}"`, 'info');
    }
  };

  const handleCreateNewEmptySession = () => {
    const title = `Новый отбор №${sessions.length + 1}`;
    const newSession = createNewSession(title, []);
    setSessions(loadAllSessions());
    setActiveSessionState(newSession.id);
    setItems([]);
    setCurrentPdfBase64(undefined);
    setCurrentPdfName(undefined);
    showToast(`Создан новый пустой ${title}`, 'success');
  };

  const handleDeleteSession = (id: string) => {
    const remaining = deleteSessionById(id);
    setSessions(remaining);
    if (activeSessionId === id) {
      if (remaining.length > 0) {
        handleSelectSession(remaining[0].id);
      } else {
        handleCreateNewEmptySession();
      }
    }
    showToast('Отбор удален из истории', 'info');
  };

  const handleRenameSession = (id: string, newTitle: string) => {
    const s = sessions.find(sess => sess.id === id);
    if (s) {
      const updated = { ...s, title: newTitle };
      updateSession(updated);
      setSessions(loadAllSessions());
      showToast(`Отбор переименован: "${newTitle}"`, 'success');
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <Header
        items={items}
        onLoadDemo={() => {
          syncItemsToActiveSession(INITIAL_DEMO_ITEMS);
          showToast('Демонстрационные чертежи восстановлены', 'info');
        }}
        onClear={() => {
          syncItemsToActiveSession([]);
          showToast('Таблица очищена', 'info');
        }}
        onApplySampleExcel={handleApplySampleExcel}
        onOpenHistory={() => setIsHistoryOpen(true)}
        sessionsCount={sessions.length}
        activeSessionTitle={activeSession?.title}
        onOpenGeneratePdf={() => setIsGeneratePdfOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Toast Notification */}
        {notification && (
          <div
            className={`mb-4 p-3.5 rounded-xl border text-xs flex items-center justify-between shadow-lg transition animate-fade-in ${
              notification.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                : notification.type === 'error'
                ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                : 'bg-blue-950/60 border-blue-500/50 text-blue-200'
            }`}
          >
            <div className="flex items-center space-x-2">
              {notification.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
              {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              {notification.type === 'info' && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-white ml-3 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Dual Upload Card: PDF drawings + Excel quantities */}
        <DropzoneSection
          progress={progress}
          onPdfSelected={handlePdfSelected}
          onExcelSelected={handleExcelSelected}
          onLoadDemo={() => {
            syncItemsToActiveSession(INITIAL_DEMO_ITEMS);
            showToast('Загружен комплект чертежей (17 деталей в 5 разделах)', 'success');
          }}
          onApplySampleExcel={handleApplySampleExcel}
          onDownloadTemplate={downloadBlankQuantityTemplate}
          itemsCount={items.length}
        />

        {/* Section Tabs */}
        <SectionTabs
          selectedSection={selectedSection}
          onSelectSection={setSelectedSection}
          items={items}
        />

        {/* Interactive Drawings & 1C Table (includes new Чертёж column) */}
        <DrawingsTable
          items={items}
          selectedSection={selectedSection}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onAddItem={handleAddItem}
          onBatchDelete={handleBatchDelete}
          onBatchMoveSection={handleBatchMoveSection}
          onBatchToggleCnc={handleBatchToggleCnc}
          onBatchTogglePieceStock={handleBatchTogglePieceStock}
          onEditModalOpen={(item) => setEditModalData({ isOpen: true, item })}
          onOpenBlueprint={(item) => setBlueprintModalItem(item)}
          pdfThumbnails={pdfThumbnails}
        />

      </main>

      {/* Blueprint Inspector Modal (full resolution drawing with Arial 22pt preview) */}
      {blueprintModalItem && (
        <BlueprintModal
          isOpen={Boolean(blueprintModalItem)}
          onClose={() => setBlueprintModalItem(null)}
          item={blueprintModalItem}
          pdfBase64={currentPdfBase64}
        />
      )}

      {/* Generate Stamped PDF Modal (шрифт 22 ариал) */}
      <GeneratePdfModal
        isOpen={isGeneratePdfOpen}
        onClose={() => setIsGeneratePdfOpen(false)}
        items={items}
        pdfBase64={currentPdfBase64}
        pdfFileName={currentPdfName}
      />

      {/* History Drawer (История отборов) */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onCreateNewSession={handleCreateNewEmptySession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />

      {/* Excel Matching Modal */}
      {excelModalData && (
        <ExcelMatchModal
          isOpen={excelModalData.isOpen}
          onClose={() => setExcelModalData(null)}
          fileName={excelModalData.fileName}
          headers={excelModalData.headers}
          rows={excelModalData.rows}
          currentItems={items}
          initialMapping={excelModalData.mapping}
          onApplyMatches={handleApplyExcelMatches}
        />
      )}

      {/* Item Add/Edit Modal */}
      {editModalData && (
        <ItemEditModal
          isOpen={editModalData.isOpen}
          onClose={() => setEditModalData(null)}
          item={editModalData.item}
          defaultSection={editModalData.defaultSection}
          onSave={handleSaveModalItem}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        Система извлечения чертежей по 5 производственным разделам • Печать количества на чертежах (шрифт 22 Arial) • История отборов
      </footer>
    </div>
  );
}
