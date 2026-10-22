import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
const data = new Uint8Array(fs.readFileSync('/tmp/test_drawings.pdf'));
const task = pdfjsLib.getDocument({ data, standardFontDataUrl: '/workspace/node_modules/pdfjs-dist/standard_fonts/', isEvalSupported: false });
try {
  const doc = await task.promise;
  console.log('pages:', doc.numPages);
  for (const pn of [2,5]) {
    const page = await doc.getPage(pn);
    const c = await page.getTextContent();
    console.log(pn, JSON.stringify(c.items.map(i=>i.str).join(' | ')));
  }
} catch(e){ console.error('ERR', e.message, e.stack?.slice(0,400)); }
