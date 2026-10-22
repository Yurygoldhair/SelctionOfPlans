import { DrawingItem } from '../types';

export interface RecognizeResult {
  items: DrawingItem[];
  engine: 'local' | 'gemini' | 'none';
  pageTexts: string[]; // extracted text per page (for debugging / no-text detection)
  error?: { status: number; message: string; details?: string };
}

/**
 * Sends the PDF to the backend recognition endpoint.
 * Throws only on network-level failures; API errors are returned in `error`.
 */
export async function recognizePdf(
  pdfBase64: string,
  fileName: string,
): Promise<RecognizeResult> {
  const res = await fetch('/api/extract-drawings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfBase64, fileName }),
  });

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON response (proxy error etc.)
  }

  if (!res.ok) {
    return {
      items: [],
      engine: 'none',
      pageTexts: data.pageTexts || [],
      error: {
        status: res.status,
        message: data.error || `Ошибка сервера (${res.status})`,
        details: data.details,
      },
    };
  }

  return {
    items: Array.isArray(data.items) ? data.items : [],
    engine: data.engine || 'local',
    pageTexts: data.pageTexts || [],
  };
}

/** True if none of the pages contains a meaningful amount of text — likely a scan. */
export function looksLikeScannedPdf(pageTexts: string[]): boolean {
  if (!pageTexts.length) return true;
  const totalChars = pageTexts.reduce((acc, t) => acc + (t || '').replace(/\s/g, '').length, 0);
  return totalChars < 30;
}
