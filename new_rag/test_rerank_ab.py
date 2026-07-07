# test_rerank_ab.py
#
# Run from inside new_rag/ (same folder as stage6_query.py):
#   python test_rerank_ab.py
#
# Requires stage6_query.py to have the `if __name__ == "__main__":` guard
# around its Ollama check + query loop — otherwise this import will hang
# waiting for CLI input.

from stage6_query import embed_text, search, rerank, TOP_K

# Edit these to match real questions your handoff deck / demo will use
TEST_QUERIES = [
    "What props does IconButton accept?",
    "How do I add spacing between buttons in a group?",
    "What variants does Alert support?",
]

# How many chunks to show per side (keep small so it's easy to eyeball)
SHOW_N = 6


def print_chunks(label: str, results: list):
    print(f"\n  --- {label} ---")
    if not results:
        print("    (no results)")
        return
    for i, r in enumerate(results[:SHOW_N]):
        c = r["chunk"]
        rerank_score = c.get("rerank_score")
        score_str = f" | rerank={rerank_score:.4f}" if rerank_score is not None else ""
        print(
            f"    [{i+1}] {c.get('component', 'unknown'):<20} "
            f"prop={c.get('prop', ''):<15} "
            f"sim={r['similarity']:.4f}{score_str}"
        )


def compare(query: str):
    print(f"\n{'='*80}")
    print(f"QUERY: {query}")
    print(f"{'='*80}")

    embedding = embed_text(query)
    raw_results = search(embedding, TOP_K * 2)

    # ---- WITHOUT rerank: just similarity-sorted, top N ----
    without_rerank = sorted(raw_results, key=lambda r: r["similarity"], reverse=True)

    # ---- WITH rerank ----
    # rerank() mutates chunk dicts in place (adds rerank_score), so run it
    # on a copy of the results to keep the "without" list clean for display.
    import copy
    with_rerank = rerank(query, copy.deepcopy(raw_results), top_n=SHOW_N)

    print_chunks("WITHOUT RERANK (similarity order)", without_rerank)
    print_chunks("WITH RERANK (Cohere rerank-v3.5)", with_rerank)

    # Highlight if the #1 result actually changed
    top_without = without_rerank[0]["chunk"].get("component") if without_rerank else None
    top_with = with_rerank[0]["chunk"].get("component") if with_rerank else None
    if top_without != top_with:
        print(f"\n  ⚡ TOP RESULT CHANGED: '{top_without}' → '{top_with}'")
    else:
        print(f"\n  = Top result unchanged: '{top_without}'")


if __name__ == "__main__":
    for q in TEST_QUERIES:
        compare(q)

    print(f"\n{'='*80}")
    print("Done. Look for '⚡ TOP RESULT CHANGED' lines above — those are the")
    print("clearest evidence reranking is doing something, not just adding latency.")
    print(f"{'='*80}\n")