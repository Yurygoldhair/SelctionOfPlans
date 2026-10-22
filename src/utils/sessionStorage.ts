import { BatchSession, DrawingItem } from '../types';
import { INITIAL_DEMO_ITEMS } from './demoData';

const SESSIONS_STORAGE_KEY = 'cad_drawing_parser_sessions_v3';
const ACTIVE_SESSION_KEY = 'cad_drawing_parser_active_id_v3';

export function loadAllSessions(): BatchSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) {
      // Create first default session
      const initial: BatchSession = {
        id: 'session-demo-initial',
        title: 'Демо-отбор №1 (4 раздела производства)',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pdfFileName: 'Комплект_чертежей_ЕСКД.pdf',
        items: INITIAL_DEMO_ITEMS,
        totalQty: INITIAL_DEMO_ITEMS.reduce((sum, i) => sum + (i.quantity || 0), 0),
        notes: 'Демонстрационный комплект чертежей с расчетом длины заготовки и штучной заготовки',
      };
      saveAllSessions([initial]);
      setActiveSessionId(initial.id);
      return [initial];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [];
  } catch (e) {
    console.error('Error loading sessions from localStorage:', e);
    return [];
  }
}

export function saveAllSessions(sessions: BatchSession[]): void {
  try {
    // Keep max 20 sessions to prevent localStorage overflow
    const trimmed = sessions.slice(0, 20);
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Error saving sessions to localStorage:', e);
  }
}

export function getActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setActiveSessionId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
  } catch (e) {
    console.error(e);
  }
}

export function createNewSession(
  title: string,
  items: DrawingItem[],
  pdfFileName?: string,
  pdfBase64?: string
): BatchSession {
  const newSession: BatchSession = {
    id: `session-${Date.now()}`,
    title: title || `Отбор от ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pdfFileName,
    pdfBase64,
    items,
    totalQty: items.reduce((sum, i) => sum + (i.quantity || 0), 0),
  };

  const currentSessions = loadAllSessions();
  const updated = [newSession, ...currentSessions];
  saveAllSessions(updated);
  setActiveSessionId(newSession.id);

  return newSession;
}

export function updateSession(sessionToUpdate: BatchSession): void {
  const current = loadAllSessions();
  const index = current.findIndex(s => s.id === sessionToUpdate.id);
  const updatedSession = {
    ...sessionToUpdate,
    updatedAt: new Date().toISOString(),
    totalQty: sessionToUpdate.items.reduce((sum, i) => sum + (i.quantity || 0), 0),
  };

  if (index >= 0) {
    current[index] = updatedSession;
  } else {
    current.unshift(updatedSession);
  }

  saveAllSessions(current);
}

export function deleteSessionById(id: string): BatchSession[] {
  const current = loadAllSessions();
  const filtered = current.filter(s => s.id !== id);
  saveAllSessions(filtered);
  if (getActiveSessionId() === id) {
    if (filtered.length > 0) {
      setActiveSessionId(filtered[0].id);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }
  return filtered;
}
