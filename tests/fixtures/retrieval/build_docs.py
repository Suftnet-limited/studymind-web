"""Builds the synthetic DOCX files:  python build_docs.py <out_dir>   (needs python-docx)."""
import os
import sys

from docx import Document

sys.path.insert(0, os.path.dirname(__file__))
from corpus_data import MODULES  # noqa: E402

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for mod in MODULES.values():
    for fname, topics in mod["docs"].items():
        d = Document()
        d.add_heading(fname.replace(".docx", "").replace("-", " ").title(), 1)
        for _tid, text, _q in topics:
            d.add_paragraph(text)
        d.save(os.path.join(out, fname))
print("built", sum(len(m["docs"]) for m in MODULES.values()), "documents")
