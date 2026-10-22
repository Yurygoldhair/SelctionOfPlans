from pypdf import PdfWriter, PdfReader
import io
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import glob

# find a Cyrillic-capable TTF
cands = glob.glob('/usr/share/fonts/**/*.ttf', recursive=True) + glob.glob('/workspace/node_modules/pdfjs-dist/standard_fonts/*.ttf')
font_name = 'Helvetica'
for c in cands:
    try:
        pdfmetrics.getFont  # noop
        pdfmetrics.registerFont(TTFont('Cyr', c))
        f = TTFont('Cyr2', c)
        # check cyrillic glyph coverage
        cmap_keys = f.charToGlyph.keys() if hasattr(f,'charToGlyph') else None
        font_name = 'Cyr'
        print('using font', c)
        break
    except Exception as e:
        continue

def make_page(text_lines):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(842, 595))
    y = 540
    for l in text_lines:
        c.setFont(font_name if font_name!='Helvetica' else 'Helvetica', 12)
        c.drawString(60, y, l)
        y -= 18
    c.save()
    return buf.getvalue()

pages = [
    ["РАЗДЕЛ 1", "Токарные+фрезерные работы", "Титульный лист, лист 1 из 12"],
    ["Наименование", "Втулка упорная", "Обозначение", "АБВГ.711142.012", "Материал Сталь 40Х", "Кол-во 12 шт", "L=85 мм", "HRC 42..48", "ЧПУ"],
    ["Наименование Вал приводной", "Обозначение АБВГ.713215.004", "Материал Сталь 45", "кол-во: 4", "Ø30х340"],
    ["Раздел 2", "Токарные+фрезерные работы: Лазерная резка", "титульный лист"],
    ["Спецификация", "1 Пластина опорная 16 АБВГ.745122.001", "2 Корпус кронштейна 2 АБВГ.745122.002"],
    ["Раздел Стандарты: крепежные изделия", "титульный лист"],
    ["Наименование Болт М8-6gх25.58", "Обозначение ГОСТ 7798-70", "Кол-во 64", "Код 1С: 00-00014285"],
    ["Эскиз валика", "Поз. 7", "Ø85х60", "8 шт"],
]
writer = PdfWriter()
for pl in pages:
    r = PdfReader(io.BytesIO(make_page(pl)))
    writer.add_page(r.pages[0])
with open('/tmp/test_drawings2.pdf','wb') as f:
    writer.write(f)
print("ok")
