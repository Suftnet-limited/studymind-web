"""Builds the synthetic DOCX files:  python build_docs.py <out_dir> [--realistic]   (needs python-docx).

Default: the original compact corpus (about 2 chunks per document).
--realistic: second paragraph per topic (about 3-5 chunks per document at 512 tokens) plus the private privacy-canary documents.
"""
import os
import sys

from docx import Document

sys.path.insert(0, os.path.dirname(__file__))
from corpus_data import MODULES  # noqa: E402

out = sys.argv[1]
realistic = "--realistic" in sys.argv
if realistic:
    from corpus_extra import EXTRA, PRIVATE  # noqa: E402
os.makedirs(out, exist_ok=True)
for mod in MODULES.values():
    for fname, topics in mod["docs"].items():
        d = Document()
        d.add_heading(fname.replace(".docx", "").replace("-", " ").title(), 1)
        for tid, text, _q in topics:
            d.add_paragraph(text)
            if realistic:
                d.add_paragraph(EXTRA[tid])
        d.save(os.path.join(out, fname))
n = sum(len(m["docs"]) for m in MODULES.values())
if realistic:
    for fname, spec in PRIVATE.items():
        d = Document(); d.add_heading(fname.replace(".docx", "").replace("-", " ").title(), 1)
        for _tid, text, _q in spec["topics"]:
            d.add_paragraph(text)
        d.save(os.path.join(out, fname)); n += 1
print("built", n, "documents", "(realistic)" if realistic else "")
