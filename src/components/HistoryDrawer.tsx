import React, { useState } from 'react';
import { BatchSession, SECTIONS } from '../types';
import {
  History,
  FolderOpen,
  Calendar,
  FileSpreadsheet,
  Trash2,
  X,
  Plus,
  CheckCircle2,
  FileText,
  Clock,
  Printer,
  Edit2,
  Check
} from 'lucide-react';
import { exportUnifiedExcel } from '../utils/excelExport';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: BatchSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateNewSession,
  onDeleteSession,
  onRenameSession,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  if (!isOpen) return null;

  const startRename = (session: BatchSession) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const saveRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full flex flex-col shadow-2xl overflow-hidden">
        
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">История отборов</h2>
              <p className="text-[11px] text-slate-400">
                Каждая загрузка PDF автоматически сохраняется как новый отбор
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

        {/* Action button: Create fresh session */}
        <div className="p-3 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Сохранено отборов: <strong className="text-white">{sessions.length}</strong>
          </span>
          <button
            onClick={() => {
              onCreateNewSession();
              onClose();
            }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center space-x-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Новый отбор</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              История отборов пуста. Загрузите PDF или нажмите «Новый отбор».
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const dateStr = new Date(session.createdAt).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
              const timeStr = new Date(session.createdAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={session.id}
                  className={`p-3.5 rounded-xl border transition group relative ${
                    isActive
                      ? 'bg-blue-950/40 border-blue-500/80 ring-1 ring-blue-500/30'
                      : 'bg-slate-800/60 border-slate-700/70 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    {editingId === session.id ? (
                      <div className="flex items-center space-x-1 flex-1">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveRename(session.id)}
                          className="w-full bg-slate-900 border border-blue-500 rounded px-2 py-0.5 text-xs text-white"
                          autoFocus
                        />
                        <button
                          onClick={() => saveRename(session.id)}
                          className="p-1 text-emerald-400 hover:bg-slate-700 rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 flex-1">
                        <span className="font-semibold text-xs text-white group-hover:text-blue-300 transition">
                          {session.title}
                        </span>
                        <button
                          onClick={() => startRename(session)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition p-0.5"
                          title="Переименовать"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {isActive && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.2 rounded font-semibold shrink-0">
                        Текущий
                      </span>
                    )}
                  </div>

                  {/* Metadata line */}
                  <div className="flex items-center space-x-3 text-[11px] text-slate-400 mb-2">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{dateStr} {timeStr}</span>
                    </span>
                    {session.pdfFileName && (
                      <span className="truncate max-w-[150px] text-slate-400" title={session.pdfFileName}>
                        • {session.pdfFileName}
                      </span>
                    )}
                  </div>

                  {/* Stats pills */}
                  <div className="flex items-center space-x-2 text-[10px] text-slate-300 mb-3">
                    <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700/80 font-medium">
                      Позиций: <strong className="text-white">{session.items.length}</strong>
                    </span>
                    <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700/80 font-medium text-emerald-400">
                      Всего: <strong className="text-emerald-300">{session.totalQty} шт</strong>
                    </span>
                  </div>

                  {/* Actions footer */}
                  <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between text-xs">
                    <button
                      onClick={() => {
                        onSelectSession(session.id);
                        onClose();
                      }}
                      className="px-2.5 py-1 bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white rounded-lg transition font-medium flex items-center space-x-1"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Открыть отбор</span>
                    </button>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => exportUnifiedExcel(session.items, `${session.title}.xlsx`)}
                        className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-700/60 rounded transition"
                        title="Экспортировать в Excel"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteSession(session.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded transition"
                        title="Удалить отбор"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/90 text-center text-[11px] text-slate-500">
          Отборы автоматически сохраняются в вашем браузере
        </div>

      </div>
    </div>
  );
};
