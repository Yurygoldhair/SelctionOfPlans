import { BatchSession, DrawingItem } from '../types';
import { INITIAL_DEMO_ITEMS } from './demoData';
import { savePdfToStorage, getPdfFromStorage, deletePdfFromStorage } from './pdfStorage';

const SESSIONS_STORAGE_KEY = 'cad_drawing_parser_sessions_v4';
const ACTIVE_SESSION_KEY = 'cad_drawing_parser_active_id_v4';

// Clean up old legacy keys to free browser storage quota
(function cleanupOldLegacyStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      ['cad_drawing_parser_sessions_v1', 'cad_drawing_parser_sessions_v2', 'cad_drawing_parser_sessions_v3'].forEach(k => {
        localStorage.removeItem(k);
      });
    }
  } catch (e) {
    // ignore
  }
})();

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

/**
 * Prepares sessions for localStorage by stripping heavy binary/base64 strings.
 * This guarantees the 5MB browser quota will NEVER be exceeded.
 */
function sanitizeSessionsForLocalStorage(sessions: BatchSession[]): any[] {
  return sessions.map(s => {
    // Strip heavy pdfBase64 (persisted in IndexedDB/memory instead)
    const { pdfBase64, ...rest } = s;

    // Clean items: remove heavy drawingImage data URLs if any
    const cleanedItems = (rest.items || []).map(it => {
      if (it.drawingImage && it.drawingImage.length > 500) {
        const { drawingImage, ...itRest } = it;
        return itRest;
      }
      return it;
    });

    return {
      ...rest,
      items: cleanedItems,
    };
  });
}

export function saveAllSessions(sessions: BatchSession[]): void {
  try {
    const sanitized = sanitizeSessionsForLocalStorage(sessions.slice(0, 15));
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (e: any) {
    console.warn('Quota exceeded in localStorage. Pruning older sessions to recover space...', e);
    try {
      // Emergency recovery: prune to latest 5 sessions with minimal fields
      const emergencyPruned = sanitizeSessionsForLocalStorage(sessions.slice(0, 5));
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(emergencyPruned));
    } catch (innerErr) {
      console.error('Could not save to localStorage even after pruning:', innerErr);
    }
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
  const sessionId = `session-${Date.now()}`;
  
  // Persist heavy PDF into IndexedDB and memory cache
  if (pdfBase64) {
    savePdfToStorage(sessionId, pdfBase64);
  }

  const newSession: BatchSession = {
    id: sessionId,
    title: title || `Отбор от ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pdfFileName,
    pdfBase64, // kept in returned object for current React state
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
  // If session has pdfBase64, ensure it is saved to IndexedDB/memory
  if (sessionToUpdate.pdfBase64) {
    savePdfToStorage(sessionToUpdate.id, sessionToUpdate.pdfBase64);
  }

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
  // Clean up PDF binary from IndexedDB
  deletePdfFromStorage(id);

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

export { getPdfFromStorage };
