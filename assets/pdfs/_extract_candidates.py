from pypdf import PdfReader
import re
from pathlib import Path

pdf_dir = Path('assets/pdfs')
out_dir = Path('assets/pdfs')

keywords = ['시스템','솔루션','플랫폼','엔진','키오스크','서비스','모델','AI ','AI-','AI_','AI']

all_lines = []
for pdf in pdf_dir.glob('*.pdf'):
    reader = PdfReader(str(pdf))
    text_parts = []
    for p in reader.pages:
        try:
            text_parts.append(p.extract_text() or '')
        except Exception:
            pass
    text='\n'.join(text_parts)
    txt_path = out_dir / (pdf.stem + '.txt')
    txt_path.write_text(text, encoding='utf-8')

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines:
        if any(k in ln for k in keywords):
            all_lines.append(ln)

# clean and dedupe
clean=[]
for ln in all_lines:
    ln = re.sub(r'\s+',' ',ln)
    if len(ln) < 4 or len(ln) > 120:
        continue
    if re.fullmatch(r'[0-9\-\.\(\) ]+', ln):
        continue
    clean.append(ln)

# Keep likely titles
cands=[]
for ln in clean:
    if re.search(r'(시스템|솔루션|플랫폼|엔진|키오스크|Tennis|테니스|Smart|Quick|One ID|RuView|Moonshine)', ln, re.I):
        cands.append(ln)

# unique order
seen=set(); uniq=[]
for ln in cands:
    if ln not in seen:
        seen.add(ln)
        uniq.append(ln)

(Path('assets/pdfs/_candidates.txt')).write_text('\n'.join(uniq), encoding='utf-8')
print(f'candidates: {len(uniq)}')
print('saved:', 'assets/pdfs/_candidates.txt')
