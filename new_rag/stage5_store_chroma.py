import os
import glob
import json
import hashlib
import chromadb
from rank_bm25 import BM25Okapi   # pip install rank-bm25

# ── Config ──────────────────────────────────────────────────────────────────
EMBEDDING_RESULTS_DIR = "new_rag/embedding2_results"
CHROMA_DB_DIR         = "new_rag/chroma_db"
COLLECTION_NAME       = "ui_components"
BATCH_SIZE            = 100
TOP_K                 = 20
ALPHA                 = 0.7   # 0.7 semantic, 0.3 keyword

os.makedirs(CHROMA_DB_DIR, exist_ok=True)

# ── Client & collection ──────────────────────────────────────────────────────
chroma_client = chromadb.PersistentClient(path=CHROMA_DB_DIR)

try:
    chroma_client.delete_collection(name=COLLECTION_NAME)
    print("🗑️  Deleted existing collection")
except Exception:
    pass

collection = chroma_client.create_collection(
    name=COLLECTION_NAME,
    metadata={"hnsw:space": "cosine"},
)

# ── Helpers ──────────────────────────────────────────────────────────────────
def stable_chunk_id(component_name: str, chunk: dict, text: str) -> str:
    key = f"{component_name}:{chunk.get('type','')}:{chunk.get('prop','')}:{text[:120]}"
    return hashlib.md5(key.encode()).hexdigest()


def batch_upsert(collection, ids, embeddings, metadatas, documents, batch_size=BATCH_SIZE):
    for i in range(0, len(ids), batch_size):
        collection.upsert(
            ids        = ids[i:i+batch_size],
            embeddings = embeddings[i:i+batch_size],
            metadatas  = metadatas[i:i+batch_size],
            documents  = documents[i:i+batch_size],
        )


def build_bm25_index(collection) -> tuple:
    """Pull all documents from ChromaDB and build an in-memory BM25 index."""
    result   = collection.get(include=["documents", "metadatas", "ids"])
    all_ids  = result["ids"]
    all_docs = result["documents"]
    all_meta = result["metadatas"]

    tokenized = [doc.lower().split() for doc in all_docs]
    bm25      = BM25Okapi(tokenized)

    print(f"📚 BM25 index built over {len(all_ids)} chunks")
    return bm25, all_ids, all_docs, all_meta


def simple_rerank(results: dict, query: str, top_n: int = 5) -> list[dict]:
    """Post-retrieval re-ranker: cosine similarity + exact token overlap bonus."""
    query_tokens = set(query.lower().split())
    hits = []

    docs      = results.get("documents", [[]])[0]
    metas     = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    for doc, meta, dist in zip(docs, metas, distances):
        base_score  = 1 - dist
        meta_str    = " ".join(str(v) for v in meta.values()).lower()
        overlap     = query_tokens & (set(doc.lower().split()) | set(meta_str.split()))
        bonus       = len(overlap) * 0.03

        hits.append({
            "score":    base_score + bonus,
            "text":     doc,
            "metadata": meta,
        })

    hits.sort(key=lambda x: x["score"], reverse=True)
    return hits[:top_n]


def hybrid_query(
    query_embedding: list[float],
    query_text: str,
    bm25,
    all_ids:  list,
    all_docs: list,
    all_meta: list,
    *,
    chunk_type: str | None = None,
    component:  str | None = None,
    alpha:      float = ALPHA,
    top_k:      int = TOP_K,
    top_n:      int = 5,
) -> list[dict]:
    """
    Hybrid search: dense (ChromaDB) + sparse (BM25) merged by weighted sum.
    alpha=1.0 → pure semantic | alpha=0.0 → pure keyword | alpha=0.7 → default
    """
    # ── 1. Metadata pre-filter ───────────────────────────────────────────────
    where = {}
    if chunk_type and component:
        where = {"$and": [{"type": chunk_type}, {"component": component}]}
    elif chunk_type:
        where = {"type": chunk_type}
    elif component:
        where = {"component": component}

    # ── 2. Dense: ChromaDB vector search ────────────────────────────────────
    query_kwargs = dict(
        query_embeddings = [query_embedding],
        n_results        = min(top_k, collection.count()),
        include          = ["documents", "metadatas", "distances", "ids"],
    )
    if where:
        query_kwargs["where"] = where

    dense_results = collection.query(**query_kwargs)
    dense_ids     = dense_results["ids"][0]
    dense_dists   = dense_results["distances"][0]
    dense_scores  = {id_: 1 - dist for id_, dist in zip(dense_ids, dense_dists)}

    # ── 3. Sparse: BM25 keyword search ──────────────────────────────────────
    tokens    = query_text.lower().split()
    bm25_raw  = bm25.get_scores(tokens)
    bm25_max  = max(bm25_raw) or 1
    bm25_norm = bm25_raw / bm25_max
    bm25_scores = {id_: float(bm25_norm[i]) for i, id_ in enumerate(all_ids)}

    # ── 4. Merge: weighted sum ───────────────────────────────────────────────
    candidate_ids = set(dense_ids) | set(all_ids)
    merged = []

    for id_ in candidate_ids:
        d_score  = dense_scores.get(id_, 0.0)
        b_score  = bm25_scores.get(id_, 0.0)
        combined = alpha * d_score + (1 - alpha) * b_score

        if combined > 0:
            idx = all_ids.index(id_)
            merged.append({
                "score":    combined,
                "text":     all_docs[idx],
                "metadata": all_meta[idx],
            })

    merged.sort(key=lambda x: x["score"], reverse=True)
    return merged[:top_n]


def query_components(
    query_embedding: list[float],
    query_text: str,
    *,
    chunk_type: str | None = None,
    component:  str | None = None,
    top_k:      int = TOP_K,
    top_n:      int = 5,
) -> list[dict]:
    """
    Dense-only query with metadata pre-filter + re-rank.
    Use this when BM25 index is not available.
    """
    where = {}
    if chunk_type and component:
        where = {"$and": [{"type": chunk_type}, {"component": component}]}
    elif chunk_type:
        where = {"type": chunk_type}
    elif component:
        where = {"component": component}

    query_kwargs = dict(
        query_embeddings = [query_embedding],
        n_results        = min(top_k, collection.count()),
        include          = ["documents", "metadatas", "distances"],
    )
    if where:
        query_kwargs["where"] = where

    raw = collection.query(**query_kwargs)
    return simple_rerank(raw, query_text, top_n=top_n)


# ── Ingestion ────────────────────────────────────────────────────────────────
embedding_files = sorted(glob.glob(os.path.join(EMBEDDING_RESULTS_DIR, "embeddings2.*.json")))

if not embedding_files:
    print(f"❌ No embedding files found in {EMBEDDING_RESULTS_DIR}")
    exit(1)

total = 0

for file_path in embedding_files:
    component_name = (
        os.path.basename(file_path)
        .replace("embeddings2.", "")
        .replace(".json", "")
    )
    print(f"📦 Loading: {component_name}")

    with open(file_path, "r") as f:
        chunks = json.load(f)

    ids        = []
    embeddings = []
    metadatas  = []
    documents  = []

    for chunk in chunks:
        embedding = chunk.get("embedding")
        text      = chunk.get("text", "").strip()

        if not embedding or not text:
            continue

        chunk_id = stable_chunk_id(component_name, chunk, text)

        metadata = {
            "component": component_name,
            "type":      chunk.get("type", ""),
            "title":     chunk.get("title", ""),
            "prop":      chunk.get("prop", ""),
            "interface": chunk.get("interface", ""),
            "parent_id": chunk.get("parent_id", ""),
            "token_est": len(text.split()),
        }

        ids.append(chunk_id)
        embeddings.append(embedding)
        metadatas.append(metadata)
        documents.append(text)

    if ids:
        batch_upsert(collection, ids, embeddings, metadatas, documents)
        print(f"   ✅ {len(ids)} chunks upserted")
        total += len(ids)
    else:
        print(f"   ⚠️  No valid chunks")

print(f"\n🎉 Done — {total} total chunks stored in ChromaDB at {CHROMA_DB_DIR}")
print(f"   Collection: {COLLECTION_NAME}  |  count: {collection.count()}")

# ── Build BM25 index after ingestion ─────────────────────────────────────────
bm25, all_ids, all_docs, all_meta = build_bm25_index(collection)


