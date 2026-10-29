"""Reproduce the public excerpt and MIT synthetic supplement. No browser is used.

uv run --with pypdf==6.21.4 --with reportlab==5.1.0 python generate.py <full-NIST-PDF>
"""
from pathlib import Path
import sys
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle
from reportlab.lib import colors

root = Path(__file__).parent
public = root / "nist-sp1108r4"
synthetic = root / "synthetic"
public.mkdir(exist_ok=True)
synthetic.mkdir(exist_ok=True)
writer = PdfWriter()
reader = PdfReader(sys.argv[1])
for page in reader.pages[27:38]:  # PDF pages 28-38; printed pages 12-22.
    writer.add_page(page)
writer.add_metadata({"/Title": "NIST SP 1108r4, printed pages 12-22 (excerpt)"})
with (public / "source.pdf").open("wb") as out:
    writer.write(out)

c = canvas.Canvas(str(synthetic / "source.pdf"), pagesize=(612, 792), invariant=1)
c.setTitle("IeumDoc synthetic structural supplement (MIT)")

def text(x, y, value, size=11, font="Helvetica"):
    c.setFont(font, size)
    c.drawString(x, y, value)

text(48, 744, "Synthetic structural supplement", 17, "Helvetica-Bold")
text(48, 712, "1.1 Merged headers and table notes", 14, "Helvetica-Bold")
t = Table([
    ["Operating envelope", "", "", "Review result"],
    ["Band", "Minimum", "Maximum", "Status"],
    ["Normal", "0.2", "0.8", "Accept"],
    ["Emergency", "0.8", "1.0", "Review"],
], colWidths=[120, 110, 110, 110], rowHeights=30)
t.setStyle(TableStyle([
    ("SPAN", (0, 0), (2, 0)), ("BACKGROUND", (0, 0), (-1, 1), colors.HexColor("#e6edf2")),
    ("FONTNAME", (0, 0), (-1, 1), "Helvetica-Bold"),
    ("GRID", (0, 0), (-1, -1), .6, colors.grey),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
]))
t.wrapOn(c, 500, 200)
t.drawOn(c, 48, 550)
text(48, 532, "Table 1 - Operating envelope")
text(48, 512, "NOTE 1 - A boundary value requires manual review.")
text(48, 472, "1.2 Display expression and equation number", 14, "Helvetica-Bold")
text(100, 435, "Q / P = (a + b) / (1 + c)                 (A.1)", 14, "Times-Italic")
text(48, 395, "1.3 Nested alphabetical clauses", 14, "Helvetica-Bold")
text(60, 366, "a) Verify the nominal input.")
text(84, 342, "1) Measure the first channel.")
text(84, 318, "2) Measure the second channel.")
text(60, 294, "b) Retain the recorded values.")
text(48, 254, "Annex A (informative)", 14, "Helvetica-Bold")
text(48, 225, "NOTE - This is synthetic test content, released under the repository MIT license.")
text(48, 195, "Numbers such as 108 are literal text; they are not inferred endnote calls.")
text(48, 36, "IeumDoc fixture - MIT | 1")
c.save()
print("Created NIST excerpt (11 pages) and synthetic supplement (1 page).")
