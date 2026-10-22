import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
const data = new Uint8Array(fs.readFileSync('/tmp/test_drawings.pdf'));
const task = pdfjsLib.getDocument({ data, standardFontDataUrl: '/workspace/node_modules/pdfjs-dist/standard_fonts/', isEvalSupported: false });
const doc = await task.promise;
const page = await doc.getPage(2);
const c = await page.getTextContent();
console.log('items:', c.items.length);
console.log(JSON.stringify(c.items.slice(0,6), null, 1).slice(0, 1500));
