import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

async function extract(pdfPath, opts) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, ...opts }).promise;
  const page = await doc.getPage(2);
  const c = await page.getTextContent();
  await doc.destroy();
  return c.items.map(i=>i.str).join(' ');
}

const fonts = '/workspace/node_modules/pdfjs-dist/standard_fonts/';
console.log('A:', await extract('/tmp/test_drawings.pdf', { standardFontDataUrl: fonts, isEvalSupported: false }));
console.log('B:', await extract('/tmp/test_drawings.pdf', { useSystemFonts: true, standardFontDataUrl: fonts, isEvalSupported: false }));
