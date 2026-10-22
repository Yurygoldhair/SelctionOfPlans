import * as pdfjsLib from 'pdfjs-dist';
// Vite URL import for pdf.worker
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

// In-memory cache for rendered thumbnails to keep UI snappy
const pageThumbnailsCache = new Map<string, Map<number, string>>();

/**
 * Converts a base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Renders a specific page of a PDF document to an image data URL (PNG/JPEG).
 */
export async function renderPdfPageToDataUrl(
  pdfData: Uint8Array | ArrayBuffer | string,
  pageNumber: number,
  scale: number = 0.5
): Promise<string | null> {
  try {
    let data: Uint8Array;
    if (typeof pdfData === 'string') {
      data = base64ToUint8Array(pdfData);
    } else if (pdfData instanceof ArrayBuffer) {
      data = new Uint8Array(pdfData);
    } else {
      data = pdfData;
    }

    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDoc = await loadingTask.promise;

    if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
      return null;
    }

    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    // @ts-ignore
    await page.render(renderContext).promise;

    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (error) {
    console.error(`Failed to render PDF page ${pageNumber}:`, error);
    return null;
  }
}

/**
 * Renders all page thumbnails for an uploaded PDF in background and caches them
 */
export async function generatePdfPageThumbnails(
  pdfBase64: string,
  cacheKey: string,
  onProgress?: (current: number, total: number) => void
): Promise<Map<number, string>> {
  if (pageThumbnailsCache.has(cacheKey)) {
    return pageThumbnailsCache.get(cacheKey)!;
  }

  const thumbnails = new Map<number, string>();
  try {
    const data = base64ToUint8Array(pdfBase64);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    for (let p = 1; p <= totalPages; p++) {
      try {
        const page = await pdfDoc.getPage(p);
        // Thumbnail scale (height around 90-120px)
        const viewport = page.getViewport({ scale: 0.35 });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // @ts-ignore
          await page.render({ canvasContext: ctx, viewport }).promise;
          const url = canvas.toDataURL('image/jpeg', 0.8);
          thumbnails.set(p, url);
        }

        if (onProgress) {
          onProgress(p, totalPages);
        }
      } catch (err) {
        console.warn(`Error rendering thumbnail for page ${p}:`, err);
      }
    }

    pageThumbnailsCache.set(cacheKey, thumbnails);
    return thumbnails;
  } catch (error) {
    console.error('Error generating PDF thumbnails:', error);
    return thumbnails;
  }
}
