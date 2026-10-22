import { PDFParse } from 'pdf-parse';
import fs from 'fs';
const data = new Uint8Array(fs.readFileSync('/tmp/test_drawings.pdf'));
const parser = new PDFParse({ data });
const res = await parser.getText();
console.log(JSON.stringify(res.text.slice(0, 600)));
await parser.destroy();
