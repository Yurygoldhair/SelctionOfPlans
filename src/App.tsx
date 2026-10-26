import React, { useState, useEffect } from 'react';
import {
  DrawingItem,
  ExtractionProgress,
  SectionType,
  ExcelColumnMapping,
  BatchSession,
  isRodOrStud
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
  setActiveSessionId,
  getPdfFromStorage
} from './utils/sessionStorage';
import { generatePdfPageThumbnails, extractPdfTextPages } from './utils/pdfRenderer';
import { CheckCircle, AlertCircle, Info, Sparkles } from 'lucide-react';

export default function App() {
  const [sessions, setSessions] = useState<BatchSession[]>([]);
  const [activeSessionId, setActiveSessionState] = useState<string | null>(null);
  const [pdfThumbnails, setPdfThumbnails] = useState<Map<number, string>>(new Map());

  const [items, setItems] = useState<DrawingItem[]>(INITIAL_DEMO_ITEMS);
  const [machinesCount, setMachinesCount] = useState<number>(1);
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
        setCurrentPdfName(active.pdfFileName);
        if (active.machinesCount && active.machinesCount > 0) {
          setMachinesCount(active.machinesCount);
        }
        getPdfFromStorage(active.id).then((b64: string | undefined) => {
          const finalB64 = b64 || active.pdfBase64;
          if (finalB64) {
            setCurrentPdfBase64(finalB64);
            generatePdfPageThumbnails(finalB64, active.id).then(thumbs => {
              setPdfThumbnails(thumbs);
            });
          }
        });
      }
    }
  }, []);

  // Sync active session when items or machine count change
  const syncItemsToActiveSession = (
    newItems: DrawingItem[],
    pdfName?: string,
    pdfB64?: string,
    newMachinesCount?: number
  ) => {
    setItems(newItems);
    const mCount = newMachinesCount !== undefined ? newMachinesCount : machinesCount;
    if (activeSessionId) {
      const active = sessions.find(s => s.id === activeSessionId);
      if (active) {
        const updated: BatchSession = {
          ...active,
          items: newItems,
          totalQty: newItems.reduce((acc, it) => acc + (it.quantity || 0), 0),
          machinesCount: mCount,
          pdfFileName: pdfName !== undefined ? pdfName : active.pdfFileName,
          pdfBase64: pdfB64 !== undefined ? pdfB64 : active.pdfBase64,
          updatedAt: new Date().toISOString(),
        };
        updateSession(updated);
        setSessions(prev => prev.map(s => (s.id === updated.id ? updated : s)));
      }
    }
  };

  /**
   * Handle changing the machine count multiplier.
   * Multiplies the base quantities (per machine) by the target machine count.
   */
  const handleMachinesCountChange = (newCount: number) => {
    const targetCount = Math.max(1, Math.round(newCount));
    setMachinesCount(targetCount);

    const updated = items.map(it => {
      // Determine base quantity per 1 machine
      let perMachine = it.quantityPerMachine;
      if (perMachine === undefined || perMachine === null) {
        perMachine = (it.quantity !== null && it.quantity !== undefined)
          ? Math.max(1, Math.round(it.quantity / (machinesCount || 1)))
          : null;
      }

      const totalQty = perMachine !== null ? perMachine * targetCount : null;
      return {
        ...it,
        quantityPerMachine: perMachine,
        quantity: totalQty,
      };
    });

    syncItemsToActiveSession(updated, currentPdfName, currentPdfBase64, targetCount);
    showToast(`Количество машин изменено на ${targetCount}. Все количества и расчеты заготовок пересчитаны!`, 'info');
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
            message: 'Нейросеть Gemini анализирует титульные листы 4 разделов и штампы чертежей...',
          });

          let data: any;

          // Strategy 1: For files <= 8MB, try direct visual binary extraction first
          if (file.size <= 8 * 1024 * 1024) {
            try {
              const res = await fetch('/api/extract-drawings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  pdfBase64: base64Data,
                  fileName: file.name,
                }),
              });
              if (res.ok) {
                data = await res.json();
              }
            } catch (netErr) {
              console.warn('Binary upload failed, falling back to client-side text layer extraction...', netErr);
            }
          }

          // Strategy 2: If binary upload was skipped (large file) or failed (network/timeout),
          // extract the text layer in the client and call the lightweight text endpoint (15-50KB)
          if (!data || !data.items || data.items.length === 0) {
            setProgress({
              status: 'analyzing_ai',
              message: 'Извлечение текстового слоя чертежей и отправка на анализ...',
            });

            const pageTexts = await extractPdfTextPages(base64Data);
            if (pageTexts.length === 0) {
              throw new Error('Не удалось прочитать страницы PDF. Проверьте файл на повреждения.');
            }

            const textRes = await fetch('/api/extract-drawings-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName: file.name,
                pageTexts,
              }),
            });

            if (!textRes.ok) {
              const errData = await textRes.json().catch(() => ({}));
              throw new Error(errData.error || errData.details || `Ошибка сервера: ${textRes.status}`);
            }

            data = await textRes.json();
          }

          if (data && data.items && Array.isArray(data.items)) {
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
            showToast(`Создан новый отбор! Извлечено ${data.items.length} чертежей по 4 разделам.`, 'success');
          } else {
            throw new Error('Чертежи не обнаружены в ответе');
          }
        } catch (err: any) {
          console.error(err);
          setProgress({
            status: 'error',
            message: err.message || 'Ошибка распознавания PDF',
          });
          showToast(`Ошибка распознавания: ${err.message}`, 'error');
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
        const autoMapping = autoDetectColumns(parsed.headers, parsed.rows);

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
    const autoMapping = autoDetectColumns(headers, SAMPLE_EXCEL_BOM_ROWS);

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
  const handleApplyExcelMatches = (
    updatedMachinedItems: DrawingItem[],
    newExcelItems: DrawingItem[] = []
  ) => {
    // 1. Separate existing items into rod/stud vs machined items
    const existingRodStuds = items.filter(it => isRodOrStud(it));
    const existingMachined = items.filter(it => !isRodOrStud(it));

    // 2. Map existing machined items to updated versions
    const updatedMap = new Map(updatedMachinedItems.map(it => [it.id, it]));
    const updatedMachined = existingMachined.map(it => updatedMap.get(it.id) || it);

    // 3. Process new items from Excel
    const newMachinedToAdd: DrawingItem[] = [];
    const newRodsToAdd: DrawingItem[] = [];

    newExcelItems.forEach(newItem => {
      if (isRodOrStud(newItem)) {
        newRodsToAdd.push({
          ...newItem,
          isRodOrStud: true,
        });
      } else {
        newMachinedToAdd.push({
          ...newItem,
          isRodOrStud: false,
        });
      }
    });

    // 4. Combine all items:
    // Machined parts will show in the interactive table!
    // Rods and studs are saved with isRodOrStud: true, so they remain excluded from DrawingsTable,
    // but are fully included for PDF generation and stamping!
    const finalItems = [...updatedMachined, ...newMachinedToAdd, ...existingRodStuds, ...newRodsToAdd];
    syncItemsToActiveSession(finalItems);

    const updatedCount = updatedMachinedItems.length;
    const addedMachinedCount = newMachinedToAdd.length;
    const addedRodsCount = newRodsToAdd.length;

    let msg = '';
    if (updatedCount > 0 && addedMachinedCount > 0) {
      msg = `Обновлено ${updatedCount} чертежей, добавлено ${addedMachinedCount} новых деталей из Excel в таблицу!`;
    } else if (addedMachinedCount > 0) {
      msg = `Добавлено ${addedMachinedCount} новых деталей из Excel в таблицу чертежей!`;
    } else if (updatedCount > 0) {
      msg = `Обновлено ${updatedCount} чертежей из файла Excel!`;
    } else {
      msg = `Данные из Excel успешно применены!`;
    }

    if (addedRodsCount > 0) {
      msg += ` (${addedRodsCount} прутков/шпилек отфильтровано из таблицы, но сохранено для PDF)`;
    }

    showToast(msg, 'success');
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

  const handleBatchCombineBillet = (ids: string[]) => {
    if (ids.length < 2) {
      showToast('Выберите как минимум 2 детали для объединения в одну заготовку', 'info');
      return;
    }
    const idSet = new Set(ids);
    const grpId = `billet-grp-${Date.now()}`;

    // Count existing combined groups to name consecutively
    const existingGroups = new Set<string>();
    items.forEach(it => {
      if (it.combinedBilletGroupId) existingGroups.add(it.combinedBilletGroupId);
    });
    const groupName = `Заготовка №${existingGroups.size + 1}`;

    const next = items.map(it => {
      if (idSet.has(it.id)) {
        return {
          ...it,
          combinedBilletGroupId: grpId,
          combinedBilletName: groupName,
        };
      }
      return it;
    });

    syncItemsToActiveSession(next);
    showToast(`Позиции (${ids.length} шт) объединены в "${groupName}"`, 'success');
  };

  const handleBatchUncombineBillet = (ids: string[]) => {
    const idSet = new Set(ids);
    const next = items.map(it => {
      if (idSet.has(it.id)) {
        return {
          ...it,
          combinedBilletGroupId: undefined,
          combinedBilletName: undefined,
        };
      }
      return it;
    });
    syncItemsToActiveSession(next);
    showToast(`Позиции (${ids.length} шт) исключены из объединенной заготовки`, 'info');
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
      setCurrentPdfName(s.pdfFileName);

      getPdfFromStorage(s.id).then((b64: string | undefined) => {
        const finalB64 = b64 || s.pdfBase64;
        setCurrentPdfBase64(finalB64);
        if (finalB64) {
          generatePdfPageThumbnails(finalB64, s.id).then(thumbs => {
            setPdfThumbnails(thumbs);
          });
        } else {
          setPdfThumbnails(new Map());
        }
      });
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
        machinesCount={machinesCount}
        onMachinesCountChange={handleMachinesCountChange}
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
            showToast('Загружен комплект чертежей (17 деталей в 4 разделах)', 'success');
          }}
          onApplySampleExcel={handleApplySampleExcel}
          onDownloadTemplate={downloadBlankQuantityTemplate}
          itemsCount={items.filter(it => !isRodOrStud(it)).length}
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
          onCombineBillet={handleBatchCombineBillet}
          onUncombineBillet={handleBatchUncombineBillet}
          onEditModalOpen={(item) => setEditModalData({ isOpen: true, item })}
          onOpenBlueprint={(item) => setBlueprintModalItem(item)}
          pdfThumbnails={pdfThumbnails}
          machinesCount={machinesCount}
        />

      </main>

      {/* Blueprint Inspector Modal (full resolution drawing with Arial 22pt preview) */}
      {blueprintModalItem && (
        <BlueprintModal
          isOpen={Boolean(blueprintModalItem)}
          onClose={() => setBlueprintModalItem(null)}
          item={blueprintModalItem}
          pdfBase64={currentPdfBase64}
          allItems={items}
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
          currentItems={items.filter(it => !isRodOrStud(it))}
          initialMapping={excelModalData.mapping}
          onApplyMatches={handleApplyExcelMatches}
          machinesCount={machinesCount}
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
