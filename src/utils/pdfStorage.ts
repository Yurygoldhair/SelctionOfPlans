/**
 * Robust storage for large PDF documents using IndexedDB and in-memory cache.
 * Completely avoids localStorage 5MB quota limits!
 */

const DB_NAME = 'cad_drawing_parser_pdf_db';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';

// Fast in-memory cache for current active sessions
const memoryCache = new Map<string, string>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event: any) => {
      resolve(event.target.result as IDBDatabase);
    };

    request.onerror = (event: any) => {
      reject(event.target.error || new Error('Failed to open IndexedDB'));
    };
  });
}

/**
 * Saves a PDF base64 string to IndexedDB and in-memory cache.
 */
export async function savePdfToStorage(sessionId: string, pdfBase64: string): Promise<void> {
  if (!sessionId || !pdfBase64) return;

  // 1. Store in fast memory cache immediately
  memoryCache.set(sessionId, pdfBase64);

  // 2. Persist to IndexedDB
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(pdfBase64, sessionId);

      request.onsuccess = () => resolve();
      request.onerror = (e: any) => {
        console.warn('Could not save PDF to IndexedDB:', e.target?.error);
        resolve(); // Non-blocking: memory cache still holds it
      };
    });
  } catch (err) {
    console.warn('IndexedDB unavailable, using in-memory PDF cache:', err);
  }
}

/**
 * Retrieves a PDF base64 string for a session.
 * Checks memory cache first, then falls back to IndexedDB.
 */
export async function getPdfFromStorage(sessionId: string): Promise<string | undefined> {
  if (!sessionId) return undefined;

  // 1. Check memory cache first
  if (memoryCache.has(sessionId)) {
    return memoryCache.get(sessionId);
  }

  // 2. Check IndexedDB
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(sessionId);

      request.onsuccess = (event: any) => {
        const val = event.target.result as string | undefined;
        if (val) {
          memoryCache.set(sessionId, val);
        }
        resolve(val);
      };

      request.onerror = () => {
        resolve(undefined);
      };
    });
  } catch (err) {
    return undefined;
  }
}

/**
 * Deletes a PDF from storage
 */
export async function deletePdfFromStorage(sessionId: string): Promise<void> {
  if (!sessionId) return;
  memoryCache.delete(sessionId);

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(sessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch (err) {
    // ignore
  }
}
