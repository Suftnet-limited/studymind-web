"""Retrieval-threshold comparison against the REAL backend retriever, real embeddings and real Typesense. No LLM calls.

  PYTHONPATH=<backend repo> <backend venv>/bin/python tests/live/retrieval_eval.py <state.json> <out.json>
  (run with the backend's environment: OPENAI_API_BASE -> budget proxy, TYPESENSE_*, POSTGRES_* ...)

For every query the retriever is run once with threshold 0 (top_k as configured); each candidate threshold is then
applied to that ranked list. A sample is re-run through the real retriever at each threshold to prove the two agree.
"""
import json
import os
import statistics
import sys

import requests
from llama_index.core import QueryBundle

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "fixtures", "retrieval"))
from corpus_data import MODULES, OFF_TOPIC  # noqa: E402

from app.agents.rag_pipeline import _build_scope_from_request, get_pipeline  # noqa: E402
from app.config import get_settings  # noqa: E402

THRESHOLDS = [0.10, 0.15, 0.20, 0.25, 0.30]
state = json.load(open(sys.argv[1]))
TS = f"http://{os.environ.get('TYPESENSE_HOST', '127.0.0.1')}:{os.environ.get('TYPESENSE_PORT', '18108')}"
TSKEY = os.environ.get("TYPESENSE_API_KEY", "local-test-key")
TOP_K = get_settings().top_k_retrieval
pipe = get_pipeline()
norm = lambda s: " ".join(s.split()).lower()  # noqa: E731
FILE_MODULE = {f: m for m, v in MODULES.items() for f in v["docs"]}


def chunks_of(module_id):
    r = requests.get(f"{TS}/collections/document_chunks/documents/search", headers={"X-TYPESENSE-API-KEY": TSKEY},
                     params={"q": "*", "query_by": "content", "filter_by": f"module_id:={module_id}", "per_page": 250}).json()
    return [h["document"] for h in r.get("hits", [])]


# Gold chunks per topic = chunks containing the start or the end of the topic's text.
gold, chunk_count = {}, {}
for key, mod in MODULES.items():
    cs = chunks_of(state["moduleIds"][key])
    chunk_count[key] = len(cs)
    for fname, topics in mod["docs"].items():
        for tid, text, _q in topics:
            a, b = norm(text)[:60], norm(text)[-60:]
            gold[tid] = {(c.get("filename"), c.get("chunk_index")) for c in cs if a in norm(c["content"]) or b in norm(c["content"])}
            assert gold[tid], f"no gold chunk found for {tid}; fields: {sorted(cs[0]) if cs else 'no chunks'}"

per_doc = {}
for key in MODULES:
    for c in chunks_of(state["moduleIds"][key]):
        per_doc[c.get("filename")] = per_doc.get(c.get("filename"), 0) + 1
print("chunks per document:", per_doc)


def scope_for(key):
    return _build_scope_from_request(student_id="00000000-0000-4000-8000-000000000001", module_id=state["moduleIds"][key],
                                     course_code=None, scope_mode="everything", include_archived=False, semester_id=None, week_number=None)


def retrieve(key, query, threshold):
    nodes = pipe._make_retriever(scope_for(key), TOP_K, score_threshold=threshold).retrieve(QueryBundle(query_str=query))
    return [(n.node.metadata.get("filename"), n.node.metadata.get("chunk_index"), float(n.score)) for n in nodes]


# ── query sets ────────────────────────────────────────────────────────────
queries = []   # (category, module scope, text, gold topic id or None)
for key, mod in MODULES.items():
    for fname, topics in mod["docs"].items():
        for tid, _t, q in topics:
            queries.append(("relevant", key, q, tid))
for key in MODULES:
    for q in OFF_TOPIC:
        queries.append(("offtopic", key, q, None))
    foreign = [(t[2]) for k2, m2 in MODULES.items() if k2 != key for topics in m2["docs"].values() for t in topics]
    for q in foreign[::3][:6]:
        queries.append(("crossmodule", key, q, None))

ranked = {}
for i, (cat, key, q, tid) in enumerate(queries):
    ranked[(cat, key, q)] = (retrieve(key, q, 0.0), tid)
print(f"{len(queries)} queries scored")

# ── metrics ───────────────────────────────────────────────────────────────
isolation_violations = 0
results = {}
for tau in THRESHOLDS:
    rel = dict(n=0, recall=0, gold_doc_cited=0, retrieved=0, gold_chunks=0, wrong_doc=0, ungrounded=0)
    neg = {c: dict(n=0, grounded=0, chunks=0) for c in ("offtopic", "crossmodule")}
    for (cat, key, q), (nodes, tid) in ranked.items():
        kept = [n for n in nodes if n[2] >= tau]
        for fname, _ci, _s in kept:
            if FILE_MODULE.get(fname) != key:
                isolation_violations += 1
        if cat == "relevant":
            gdocs = {f for f, _ in gold[tid]}
            rel["n"] += 1
            rel["recall"] += any((f, c) in gold[tid] for f, c, _ in kept)
            rel["gold_doc_cited"] += any(f in gdocs for f, _, _ in kept)
            rel["retrieved"] += len(kept)
            rel["gold_chunks"] += sum((f, c) in gold[tid] for f, c, _ in kept)
            rel["wrong_doc"] += sum(f not in gdocs for f, _, _ in kept)
            rel["ungrounded"] += not kept
        else:
            neg[cat]["n"] += 1; neg[cat]["grounded"] += bool(kept); neg[cat]["chunks"] += len(kept)
    results[tau] = {
        "relevant_recall": rel["recall"] / rel["n"],
        "relevant_ungrounded": rel["ungrounded"] / rel["n"],
        "gold_doc_cited": rel["gold_doc_cited"] / rel["n"],
        "chunk_precision": (rel["gold_chunks"] / rel["retrieved"]) if rel["retrieved"] else 0.0,
        "wrong_doc_citation_share": (rel["wrong_doc"] / rel["retrieved"]) if rel["retrieved"] else 0.0,
        "mean_chunks_relevant": rel["retrieved"] / rel["n"],
        "offtopic_false_grounding": neg["offtopic"]["grounded"] / neg["offtopic"]["n"],
        "crossmodule_false_grounding": neg["crossmodule"]["grounded"] / neg["crossmodule"]["n"],
        "mean_chunks_offtopic": neg["offtopic"]["chunks"] / neg["offtopic"]["n"],
        "mean_chunks_crossmodule": neg["crossmodule"]["chunks"] / neg["crossmodule"]["n"],
    }

best = lambda cat: [max((s for *_x, s in nodes), default=0.0) for (c, _k, _q), (nodes, _t) in ranked.items() if c == cat]  # noqa: E731
dist = {c: {"min": min(best(c)), "median": statistics.median(best(c)), "max": max(best(c))} for c in ("relevant", "offtopic", "crossmodule")}

# ── faithfulness: real retriever at each threshold == client-side filter of the unfiltered ranking ───────────
sample = [k for k in ranked if k[0] == "relevant"][::5][:10] + [k for k in ranked if k[0] != "relevant"][::9][:4]
mismatch = 0
for (cat, key, q) in sample:
    for tau in (0.15, 0.20, 0.25):
        real = {(f, c) for f, c, _ in retrieve(key, q, tau)}
        mine = {(f, c) for f, c, s in ranked[(cat, key, q)][0] if s >= tau}
        mismatch += real != mine
out = {"top_k": TOP_K, "queries": len(queries), "chunks": chunk_count, "chunks_per_document": per_doc, "thresholds": results,
       "best_score_distribution": dist, "isolation_violations": isolation_violations, "faithfulness_mismatches": mismatch,
       "faithfulness_checks": len(sample) * 3}
json.dump(out, open(sys.argv[2], "w"), indent=2)

cols = ["relevant_recall", "gold_doc_cited", "chunk_precision", "wrong_doc_citation_share", "offtopic_false_grounding", "crossmodule_false_grounding", "mean_chunks_offtopic"]
print("\n tau  | " + " | ".join(c[:18].ljust(18) for c in cols))
for tau, r in results.items():
    print(f" {tau:.2f} | " + " | ".join(f"{r[c]:.3f}".ljust(18) for c in cols))
print("\nbest-score distribution:", {k: {a: round(b, 3) for a, b in v.items()} for k, v in dist.items()})
print(f"isolation violations (foreign-module chunks returned): {isolation_violations}")
print(f"faithfulness (real retriever vs client-side filter): {out['faithfulness_checks'] - mismatch}/{out['faithfulness_checks']} identical")
