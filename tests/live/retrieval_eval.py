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
import corpus_extra  # noqa: E402

from app.agents.rag_pipeline import _build_scope_from_request, get_pipeline  # noqa: E402
from app.config import get_settings  # noqa: E402

THRESHOLDS = [0.10, 0.15, 0.20, 0.25, 0.30]
state = json.load(open(sys.argv[1]))
REALISTIC = bool(state.get("realistic"))
STUB = state.get("mode") == "stub"          # constant stand-in embeddings: only isolation/privacy results are meaningful
EXTRA = corpus_extra.EXTRA if REALISTIC else {}
Q2 = corpus_extra.Q2 if REALISTIC else {}
PRIVATE = corpus_extra.PRIVATE if REALISTIC else {}
TS = f"http://{os.environ.get('TYPESENSE_HOST', '127.0.0.1')}:{os.environ.get('TYPESENSE_PORT', '18108')}"
TSKEY = os.environ.get("TYPESENSE_API_KEY", "local-test-key")
TOP_K = get_settings().top_k_retrieval
pipe = get_pipeline()
norm = lambda s: " ".join(s.split()).lower()  # noqa: E731
FILE_MODULE = {f: m for m, v in MODULES.items() for f in v["docs"]}
FILE_MODULE.update({f: spec["module"] for f, spec in PRIVATE.items()})


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
            extra = EXTRA.get(tid, "")
            anchors = [norm(text)[:60], norm(extra)[:60] if extra else None, norm(extra or text)[-60:]]
            anchors = [a for a in anchors if a]
            gold[tid] = {(c.get("filename"), c.get("chunk_index")) for c in cs if any(a in norm(c["content"]) for a in anchors)}
            assert gold[tid], f"no gold chunk found for {tid}; fields: {sorted(cs[0]) if cs else 'no chunks'}"

per_doc = {}
for key in MODULES:
    for c in chunks_of(state["moduleIds"][key]):
        per_doc[c.get("filename")] = per_doc.get(c.get("filename"), 0) + 1
print("chunks per document:", per_doc)


ANON = "00000000-0000-4000-8000-000000000001"   # a viewer who owns nothing: sees class material only


def scope_for(key, viewer=ANON):
    return _build_scope_from_request(student_id=viewer, module_id=state["moduleIds"][key],
                                     course_code=None, scope_mode="everything", include_archived=False, semester_id=None, week_number=None)


def retrieve(key, query, threshold, viewer=ANON, with_text=False):
    nodes = pipe._make_retriever(scope_for(key, viewer), TOP_K, score_threshold=threshold).retrieve(QueryBundle(query_str=query))
    if with_text:
        return [(n.node.metadata.get("filename"), n.node.metadata.get("chunk_index"), float(n.score), n.node.text) for n in nodes]
    return [(n.node.metadata.get("filename"), n.node.metadata.get("chunk_index"), float(n.score)) for n in nodes]


# ── query sets ────────────────────────────────────────────────────────────
queries = []   # (category, module scope, text, gold topic id or None)
for key, mod in MODULES.items():
    for fname, topics in mod["docs"].items():
        for tid, _t, q in topics:
            queries.append(("relevant", key, q, tid))
            if tid in Q2:
                queries.append(("relevant", key, Q2[tid], tid))
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

# ── privacy: a personal document may be retrieved ONLY by its owner ───────────────────────────────────────────
privacy = {"checks": 0, "violations": [], "owner_found": 0, "owner_checks": 0}
if PRIVATE:
    viewers = {"student": state["userIds"]["student"], "lecturer": state["userIds"]["lecturer"], "stranger": "11111111-2222-4333-8444-555555555555", "anonymous": ANON}
    for fname, spec in PRIVATE.items():
        canaries = [w for _t, text, _q in spec["topics"] for w in text.split() if "CANARY" in w]
        for _tid, _text, question in spec["topics"]:
            for vname, vid in viewers.items():
                for tau in (0.0, 0.10, 0.20):
                    got = retrieve(spec["module"], question, tau, viewer=vid, with_text=True)
                    seen_file = any(f == fname for f, *_ in got)
                    seen_canary = any(c.strip(".,") in t for *_x, t in got for c in canaries)
                    if vname == spec["owner"]:
                        if tau == 0.0:
                            privacy["owner_checks"] += 1; privacy["owner_found"] += seen_file
                    else:
                        privacy["checks"] += 1
                        if seen_file or seen_canary:
                            privacy["violations"].append({"viewer": vname, "file": fname, "tau": tau, "file_seen": seen_file, "canary_seen": seen_canary})
    # Embedding-independent proof: run the scope's own filter expression against Typesense for every viewer. The owner must see
    # their private document, nobody else may, and class material must stay visible to everyone (private docs must not hide it).
    def visible_files(module, viewer):
        r = requests.get(f"{TS}/collections/document_chunks/documents/search", headers={"X-TYPESENSE-API-KEY": TSKEY},
                         params={"q": "*", "query_by": "content", "filter_by": scope_for(module, viewer).build_filter(), "per_page": 250}).json()
        return {h["document"]["filename"] for h in r.get("hits", [])}
    privacy.update({"filter_checks": 0, "filter_violations": [], "owner_sees_own": 0, "owner_checks_filter": 0, "class_visible_failures": []})
    for fname, spec in PRIVATE.items():
        class_files = set(MODULES[spec["module"]]["docs"])
        for vname, vid in viewers.items():
            seen = visible_files(spec["module"], vid)
            privacy["filter_checks"] += 1
            if vname == spec["owner"]:
                privacy["owner_checks_filter"] += 1; privacy["owner_sees_own"] += fname in seen
            elif fname in seen:
                privacy["filter_violations"].append({"viewer": vname, "file": fname})
            if not class_files <= seen:
                privacy["class_visible_failures"].append({"viewer": vname, "missing": sorted(class_files - seen)})
    print(f"privacy filter (deterministic): {privacy['filter_checks']} viewer checks, {len(privacy['filter_violations'])} leaks; "
          f"owner sees own private doc {privacy['owner_sees_own']}/{privacy['owner_checks_filter']}; class material hidden from someone: {len(privacy['class_visible_failures'])}")
    print(f"privacy: {privacy['checks']} cross-viewer checks, {len(privacy['violations'])} violations; owner found own private doc {privacy['owner_found']}/{privacy['owner_checks']}")

# ── faithfulness: real retriever at each threshold == client-side filter of the unfiltered ranking ───────────
sample = [k for k in ranked if k[0] == "relevant"][::5][:10] + [k for k in ranked if k[0] != "relevant"][::9][:4]
mismatch = 0
for (cat, key, q) in sample:
    for tau in (0.15, 0.20, 0.25):
        real = {(f, c) for f, c, _ in retrieve(key, q, tau)}
        mine = {(f, c) for f, c, s in ranked[(cat, key, q)][0] if s >= tau}
        mismatch += real != mine
out = {"top_k": TOP_K, "queries": len(queries), "chunks": chunk_count, "chunks_per_document": per_doc, "thresholds": results,
       "best_score_distribution": dist, "mode": state.get("mode"), "realistic": REALISTIC, "privacy": privacy, "isolation_violations": isolation_violations, "faithfulness_mismatches": mismatch,
       "faithfulness_checks": len(sample) * 3}
json.dump(out, open(sys.argv[2], "w"), indent=2)

cols = ["relevant_recall", "gold_doc_cited", "chunk_precision", "wrong_doc_citation_share", "offtopic_false_grounding", "crossmodule_false_grounding", "mean_chunks_offtopic"]
print("\n tau  | " + " | ".join(c[:18].ljust(18) for c in cols))
for tau, r in results.items():
    print(f" {tau:.2f} | " + " | ".join(f"{r[c]:.3f}".ljust(18) for c in cols))
print("\nbest-score distribution:", {k: {a: round(b, 3) for a, b in v.items()} for k, v in dist.items()})
print(f"isolation violations (foreign-module chunks returned): {isolation_violations}")
if STUB:
    print("NOTE: stand-in (constant) embeddings - relevance/precision/recall numbers above are NOT meaningful; isolation and privacy are.")
print(f"faithfulness (real retriever vs client-side filter): {out['faithfulness_checks'] - mismatch}/{out['faithfulness_checks']} identical")
