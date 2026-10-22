import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
const data = new Uint8Array(fs.readFileSync('/tmp/test_drawings2.pdf'));
const doc = await pdfjsLib.getDocument({ data, standardFontDataUrl: '/workspace/node_modules/pdfjs-dist/standard_fonts/', isEvalSupported: false }).promise;
const page = await doc.getPage(2);
const c = await page.getTextContent();
console.log(JSON.stringify(c.items.map(i=>i.str).join(' ')));
