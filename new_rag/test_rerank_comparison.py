# test_rerank_comparison.py — run from new_rag/ so imports work
from stage6_query import embed_text, search, rerank, TOP_K

test_queries = [
    "What props does IconButton accept?",
    "How do I add spacing between buttons in a group?",
    "What variants does Alert support?",
]

for query in test_queries:
    print(f"\n{'='*70}\nQUERY: {query}\n{'='*70}")

    embedding = embed_text(query)
    results = search(embedding, TOP_K)

    print("\n--- BEFORE (similarity order) ---")
    for i, r in enumerate(results[:8]):
        c = r["chunk"]
        print(f"  [{i+1}] {c['component']} | {c.get('prop','')} | sim={r['similarity']:.4f}")

    reranked = rerank(query, results, top_n=8)

    print("\n--- AFTER (reranked) ---")
    for i, r in enumerate(reranked):
        c = r["chunk"]
        print(f"  [{i+1}] {c['component']} | {c.get('prop','')} | sim={r['similarity']:.4f} | rerank={c['rerank_score']:.4f}")