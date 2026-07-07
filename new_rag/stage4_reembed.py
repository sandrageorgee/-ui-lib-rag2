# new_rag/stage4_reembed.py
import os
import json
import cohere
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv()

INPUT_DIR = "rechunked_results"
OUTPUT_DIR = "embedding2_results"

MODEL_NAME = "embed-v4.0"
CO_API_KEY = os.getenv("CO_API_KEY")

if not CO_API_KEY:
    raise ValueError("❌ Missing CO_API_KEY in .env")

co = cohere.ClientV2(api_key=CO_API_KEY)


# ================= EMBEDDING =================
def embed_single(text):
    """Embed exactly one chunk. Returns (embedding_or_None, error_or_None)."""
    try:
        response = co.embed(
            model=MODEL_NAME,
            texts=[text],
            input_type="search_document",
            embedding_types=["float"],
        )
        return response.embeddings.float[0], None
    except Exception as e:
        return None, str(e)


def embed_batch(texts):
    """
    Try to embed a batch in one call. If it fails, fall back to embedding
    each chunk individually so no chunk is silently dropped.

    Returns a list of dicts, one per input text, in order:
        {"embedding": [...] or None, "error": None or <error info>}
    """
    try:
        response = co.embed(
            model=MODEL_NAME,
            texts=texts,
            input_type="search_document",
            embedding_types=["float"],
        )
        # Whole batch succeeded
        return [{"embedding": emb, "error": None} for emb in response.embeddings.float]

    except Exception as e:
        # Batch failed -> fall back to one-by-one so every chunk gets a verdict
        print(f"   ❌ Batch embed failed: {e}")
        print(f"   🔍 Falling back to per-chunk embedding for {len(texts)} chunks...")

        results = []
        for i, text in enumerate(texts):
            embedding, error = embed_single(text)
            if error:
                print(f"      ✗ chunk {i}: FAILED — {error}")
                print(f"        length={len(text)} preview={repr(text[:200])}")
                results.append({"embedding": None, "error": error})
            else:
                print(f"      ✓ chunk {i}: ok")
                results.append({"embedding": embedding, "error": None})

        return results


# ================= MAIN =================
print("🚀 Starting per-component re-embedding...")

os.makedirs(OUTPUT_DIR, exist_ok=True)

all_rechunked_path = os.path.join(INPUT_DIR, "ALL.rechunked.json")
with open(all_rechunked_path, "r") as f:
    all_chunks = json.load(f)

# Group by component
by_component = defaultdict(list)
for chunk in all_chunks:
    by_component[chunk["component"]].append(chunk)

summary = {}  # component -> (total, failed)

for component_name, chunks in by_component.items():
    print(f"\n📦 {component_name}: {len(chunks)} chunks")

    texts = [c["text"] for c in chunks]

    # Cohere supports up to 96 texts per batch; using 64 to stay safe
    BATCH_SIZE = 64
    all_results = []  # list of {"embedding":..., "error":...}

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        batch_results = embed_batch(batch)
        all_results.extend(batch_results)
        print(f"   🔹 batch {batch_num} done")

    final_chunks = []
    failed_count = 0
    for i, chunk in enumerate(chunks):
        result = all_results[i]
        is_ok = result["embedding"] is not None
        if not is_ok:
            failed_count += 1

        final_chunks.append({
            "component":  chunk.get("component", component_name),
            "interface":  chunk.get("interface", ""),
            "prop":       chunk.get("props", [""])[0] if chunk.get("props") else "",
            "props":      chunk.get("props", []),
            "type":       chunk.get("type", "prop"),
            "keywords":   chunk.get("keywords", []),
            "cluster_id": chunk.get("cluster_id"),
            "text":       chunk.get("text", ""),
            "embedding":  result["embedding"],
            "embedding_model": MODEL_NAME if is_ok else None,
            "embedded":   is_ok,
            "embedding_error": result["error"],
        })

    summary[component_name] = (len(chunks), failed_count)

    save_path = os.path.join(OUTPUT_DIR, f"embeddings2.{component_name}.json")
    with open(save_path, "w") as f:
        json.dump(final_chunks, f, indent=2)

    status = "✅" if failed_count == 0 else f"⚠️ {failed_count} FAILED"
    print(f"{status} Saved: {save_path}")

# ================= FINAL SUMMARY =================
print("\n" + "=" * 60)
print("🎉 DONE — Summary of failed chunks per component:")
total_failed = 0
for component_name, (total, failed) in summary.items():
    total_failed += failed
    if failed > 0:
        print(f"   ⚠️  {component_name}: {failed}/{total} chunks failed")

if total_failed == 0:
    print("   ✅ All chunks embedded successfully across all components.")
else:
    print(f"\n   ❌ Total failed chunks: {total_failed}")
    print("   These chunks are still saved in the JSON files with "
          "\"embedded\": false and \"embedding\": null,")
    print("   so you can filter and re-run them later without losing track of which ones failed.")