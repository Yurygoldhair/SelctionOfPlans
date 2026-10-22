import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { DrawingItem, StampOptions, SECTIONS, SectionType } from '../types';
import { calculateBillet } from './billetCalculator';

/**
 * Creates an offscreen Canvas and renders the exact Arial text label.
 * Supersampled 2x for sharp 300-dpi print quality in PDF.
 */
export function createArialStampImage(
  text: string,
  options: {
    fontFamily?: string;
    fontSize?: number;
    withBorder?: boolean;
    stampColor?: string;
    bgColor?: string;
    fixedWidth?: number;  // Optional fixed box width (pt)
    fixedHeight?: number; // Optional fixed box height (pt)
  } = {}
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  return new Promise((resolve) => {
    const fontSizePt = options.fontSize || 13; // Scaled font for ESKD box
    const scale = 2; // 2x supersampling for crisp high-DPI PDF output
    const canvasFontSize = fontSizePt * scale;
    const fontFamily = options.fontFamily || 'Arial, sans-serif';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    ctx.font = `bold ${canvasFontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;

    const canvasWidth = options.fixedWidth
      ? Math.ceil(options.fixedWidth * scale)
      : Math.ceil(textWidth + 24 * scale);

    const canvasHeight = options.fixedHeight
      ? Math.ceil(options.fixedHeight * scale)
      : Math.ceil(canvasFontSize * 1.3 + 12 * scale);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Reset context state after resize
    ctx.font = `bold ${canvasFontSize}px ${fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Background fill (erases what is underneath)
    if (options.bgColor !== 'transparent') {
      ctx.fillStyle = options.bgColor || '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Border (Графа 26 frame)
    if (options.withBorder !== false) {
      ctx.strokeStyle = options.stampColor || '#000000';
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeRect(1 * scale, 1 * scale, canvasWidth - 2 * scale, canvasHeight - 2 * scale);
    }

    // Text (Arial, bold) centered in the box
    ctx.fillStyle = options.stampColor || '#000000';
    ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);

    canvas.toBlob((blob) => {
      if (!blob) {
        resolve({ bytes: new Uint8Array(), width: 0, height: 0 });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;
        resolve({
          bytes: new Uint8Array(buffer),
          width: canvasWidth / scale,
          height: canvasHeight / scale,
        });
      };
      reader.readAsArrayBuffer(blob);
    }, 'image/png');
  });
}

/**
 * Calculates page dimensions as perceived by the viewer (accounting for rotation)
 */
export function getViewerPageSize(page: any): { vWidth: number; vHeight: number; rotation: number } {
  const rotation = (page.getRotation().angle % 360 + 360) % 360;
  const rawW = page.getWidth();
  const rawH = page.getHeight();

  if (rotation === 90 || rotation === 270) {
    return { vWidth: rawH, vHeight: rawW, rotation };
  }
  return { vWidth: rawW, vHeight: rawH, rotation };
}

/**
 * Transforms a rectangle defined in Viewer Coordinates (where 0,0 is viewer bottom-left)
 * to Native PDF Page Coordinates with rotation angle and origin offset compensation
 */
export function transformViewerRectToNative(
  vx: number,
  vy: number,
  vWidth: number,
  vHeight: number,
  pageWidth: number,
  pageHeight: number,
  rotation: number,
  originX: number = 0,
  originY: number = 0
): { x: number; y: number; width: number; height: number; rotate: any } {
  if (rotation === 90) {
    // Page is rotated 90° clockwise by viewer
    return {
      x: originX + pageWidth - vy,
      y: originY + vx,
      width: vWidth,
      height: vHeight,
      rotate: degrees(90),
    };
  } else if (rotation === 180) {
    return {
      x: originX + pageWidth - vx - vWidth,
      y: originY + pageHeight - vy - vHeight,
      width: vWidth,
      height: vHeight,
      rotate: degrees(180),
    };
  } else if (rotation === 270) {
    // Page is rotated 270° clockwise (90° CCW)
    return {
      x: originX + vy + vHeight,
      y: originY + pageHeight - vx,
      width: vWidth,
      height: vHeight,
      rotate: degrees(270),
    };
  } else {
    // rotation === 0
    return {
      x: originX + vx,
      y: originY + vy,
      width: vWidth,
      height: vHeight,
      rotate: degrees(0),
    };
  }
}

/**
 * Generates or stamps the production PDF with the quantities and calculated billet format.
 * - Handles differences between vertical and horizontal drawings so Графа 26 is always flush with the frame.
 * - Erases duplicate designation in upper-left corner of ESKD border (Графа 26).
 * - Stamps the quantity horizontally (never vertical, accounts for all rotations).
 * - Allows fine millimeter micro-tuning (offsetX_mm, offsetY_mm).
 */
export async function generateProductionPdfWithQuantities(
  items: DrawingItem[],
  pdfBase64?: string,
  options: StampOptions = {
    position: 'top-left-eskd', // Default to upper-left ESKD box
    format: 'kd-billet',        // Default to Lзаг=[расчитанная заготовка]-[кол-во]
    fontSize: 13, // Scaled for the 14mm frame box
    fontFamily: 'Arial',
    withBorder: true,
    stampColor: '#000000',
    eraseOldDesignation: true,
    offsetX_mm: 0,
    offsetY_mm: 0,
  }
): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;

  if (pdfBase64 && pdfBase64.length > 100) {
    // 1. Process uploaded real PDF
    const binaryString = atob(pdfBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    pdfDoc = await PDFDocument.load(bytes);
    const totalPages = pdfDoc.getPageCount();

    // Group items by page number
    for (const item of items) {
      if (item.quantity === null || item.quantity === undefined) continue;

      const pageIdx = (item.pageNumber ? item.pageNumber - 1 : 0);
      if (pageIdx < 0 || pageIdx >= totalPages) continue;

      const page = pdfDoc.getPage(pageIdx);
      const rawW = page.getWidth();
      const rawH = page.getHeight();
      const { vWidth, vHeight, rotation } = getViewerPageSize(page);

      // Check if page has CropBox / MediaBox origin offset
      const mediaBox = page.getMediaBox();
      const originX = mediaBox ? (mediaBox.x || 0) : 0;
      const originY = mediaBox ? (mediaBox.y || 0) : 0;

      const isLandscape = vWidth > vHeight;
      const isEskdBox = options.position === 'top-left-eskd' || options.position === 'top-left';
      const fontSize = isEskdBox ? (options.fontSize || 13) : 22;

      let stampText = '';
      if (options.format === 'kd-billet') {
        const billet = calculateBillet(item);
        if (billet.hasLength && billet.kdString) {
          stampText = billet.kdString; // Format requested: Lзаг=[расчитанная заготовка]-[кол-во заготовок]
        } else {
          stampText = `${item.quantity ?? 1} шт.`;
        }
      } else if (options.format === 'with-prefix') {
        stampText = `Кол-во: ${item.quantity} шт.`;
      } else {
        stampText = `${item.quantity} шт.`;
      }

      // ESKD Графа 26 standard dimensions: ~70 mm x ~14 mm (198.4 pt x 39.7 pt)
      const boxW = isEskdBox ? 198 : 160;
      const boxH = isEskdBox ? 39 : 45;

      // Base margin calibration:
      // Vertical drawings: Left 20mm (56.7 pt), Top 5mm (14.2 pt)
      // Horizontal drawings: compensate for CAD frame shift (move 3.5mm left and 3.0mm up)
      let baseLeftMargin = 56.7; // 20 mm
      let baseTopMargin = 14.2;  // 5 mm

      if (isLandscape && isEskdBox) {
        // Calibration for horizontal drawings (prevents shifting right and down)
        baseLeftMargin = 47.0; // ~16.5 mm (shifted 3.5 mm left)
        baseTopMargin = 5.7;   // ~2.0 mm (shifted 3.0 mm up)
      }

      // User fine-tuning offsets in millimeters (converted to pt, 1mm = 2.83465 pt)
      const userShiftX = (options.offsetX_mm || 0) * 2.83465;
      const userShiftY = (options.offsetY_mm || 0) * 2.83465;

      let vx = baseLeftMargin + userShiftX;
      let vy = vHeight - baseTopMargin - boxH + userShiftY;

      if (options.position === 'top-right') {
        vx = vWidth - 14.2 - boxW - 20 + userShiftX;
        vy = vHeight - 14.2 - boxH - 20 + userShiftY;
      } else if (options.position === 'above-stamp') {
        vx = vWidth - 14.2 - boxW - 20 + userShiftX;
        vy = 160 + userShiftY;
      }

      // Generate the crisp Arial stamp image with white background (to erase old designation)
      const stampData = await createArialStampImage(stampText, {
        fontSize,
        fontFamily: options.fontFamily || 'Arial',
        withBorder: options.withBorder,
        stampColor: options.stampColor || '#000000',
        bgColor: '#ffffff', // Solid white to cover and erase old text
        fixedWidth: isEskdBox ? boxW : undefined,
        fixedHeight: isEskdBox ? boxH : undefined,
      });

      const stampImage = await pdfDoc.embedPng(stampData.bytes);
      const actualW = stampData.width;
      const actualH = stampData.height;

      // Transform Viewer Coordinates to Native Coordinates with rotation compensation
      const transformed = transformViewerRectToNative(
        vx,
        vy,
        actualW,
        actualH,
        rawW,
        rawH,
        rotation,
        originX,
        originY
      );

      // Draw the image (which has solid white background and crisp border, perfectly erasing old text)
      page.drawImage(stampImage, {
        x: transformed.x,
        y: transformed.y,
        width: transformed.width,
        height: transformed.height,
        rotate: transformed.rotate,
      });
    }

  } else {
    // 2. Synthesize complete manufacturing PDF package if no PDF was uploaded
    pdfDoc = await PDFDocument.create();

    for (const sectionName of SECTIONS) {
      const secItems = items.filter(it => it.section === sectionName);
      if (secItems.length === 0) continue;

      // Section Title Divider Sheet
      const titlePage = pdfDoc.addPage([841.89, 595.28]); // A4 Landscape
      const { width: tW, height: tH } = titlePage.getSize();

      titlePage.drawRectangle({
        x: 40,
        y: 30,
        width: tW - 70,
        height: tH - 60,
        borderColor: rgb(0.1, 0.2, 0.4),
        borderWidth: 2,
        color: rgb(0.97, 0.98, 1.0),
      });

      const secTitleStamp = await createArialStampImage(`РАЗДЕЛ: ${sectionName.toUpperCase()}`, {
        fontSize: 24,
        fontFamily: 'Arial',
        withBorder: true,
        stampColor: '#1e3a8a',
        bgColor: '#ffffff',
      });
      const secImg = await pdfDoc.embedPng(secTitleStamp.bytes);
      titlePage.drawImage(secImg, {
        x: (tW - secTitleStamp.width) / 2,
        y: tH / 2 + 20,
        width: secTitleStamp.width,
        height: secTitleStamp.height,
      });

      // Individual drawing sheets
      for (const item of secItems) {
        const page = pdfDoc.addPage([841.89, 595.28]); // A4 Landscape (842 x 595 pt)
        const { width, height } = page.getSize();

        // Outer border (20mm left, 5mm others)
        const leftMargin = 56.7;
        const rightMargin = 14.2;
        const topMargin = 14.2;
        const bottomMargin = 14.2;

        page.drawRectangle({
          x: leftMargin,
          y: bottomMargin,
          width: width - leftMargin - rightMargin,
          height: height - topMargin - bottomMargin,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1.5,
        });

        // ESKD Stamp in bottom right
        const stampW = 524;
        const stampH = 120;
        page.drawRectangle({
          x: width - rightMargin - stampW,
          y: bottomMargin,
          width: stampW,
          height: stampH,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1,
          color: rgb(1, 1, 1),
        });

        const stampInfoText = `${item.designation || 'ЧЕРТЕЖ'} | ${item.name} | ${item.material || 'Сталь 45'}`;
        const stampInfo = await createArialStampImage(stampInfoText, {
          fontSize: 12,
          fontFamily: 'Arial',
          withBorder: false,
          stampColor: '#000000',
          bgColor: 'transparent',
        });
        const stampInfoImg = await pdfDoc.embedPng(stampInfo.bytes);
        page.drawImage(stampInfoImg, {
          x: width - rightMargin - stampW + 10,
          y: bottomMargin + stampH / 2 - stampInfo.height / 2,
          width: stampInfo.width,
          height: stampInfo.height,
        });

        // STAMP QUANTITY IN TOP-LEFT ESKD BOX (Графа 26)
        const qtyVal = item.quantity ?? 1;
        let stampText = '';
        if (options.format === 'kd-billet') {
          const billet = calculateBillet(item);
          if (billet.hasLength && billet.kdString) {
            stampText = billet.kdString;
          } else {
            stampText = `${qtyVal} шт.`;
          }
        } else if (options.format === 'with-prefix') {
          stampText = `Кол-во: ${qtyVal} шт.`;
        } else {
          stampText = `${qtyVal} шт.`;
        }
        const boxW = 198;
        const boxH = 39.7;
        const boxX = leftMargin + ((options.offsetX_mm || 0) * 2.83465);
        const boxY = height - topMargin - boxH + ((options.offsetY_mm || 0) * 2.83465);

        const qtyStamp = await createArialStampImage(stampText, {
          fontSize: options.fontSize || 13,
          fontFamily: 'Arial',
          withBorder: true,
          stampColor: options.stampColor || '#000000',
          bgColor: '#ffffff',
          fixedWidth: boxW,
          fixedHeight: boxH,
        });

        const qtyImg = await pdfDoc.embedPng(qtyStamp.bytes);
        page.drawImage(qtyImg, {
          x: boxX,
          y: boxY,
          width: boxW,
          height: boxH,
        });
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * Helper to trigger immediate browser download of the generated PDF
 */
export function downloadPdfFile(pdfBytes: Uint8Array, fileName = 'Чертежи_с_количеством_(ЕСКД).pdf') {
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
