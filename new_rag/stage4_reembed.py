# new_rag/stage4_reembed.py
import os
import json
import requests
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv()

INPUT_DIR = "new_rag/rechunked_results"
OUTPUT_DIR = "new_rag/embedding2_results"

MODEL_NAME = "jina-code-embeddings-1.5b"
JINA_API_KEY = os.getenv("JINA_API_KEY")

if not JINA_API_KEY:
    raise ValueError("❌ Missing JINA_API_KEY in .env")


# ================= EMBEDDING =================
def embed_single(text):
    """Embed exactly one chunk. Returns (embedding_or_None, error_or_None)."""
    url = "https://api.jina.ai/v1/embeddings"
    headers = {
        "Authorization": f"Bearer {JINA_API_KEY}",
        "Content-Type": "application/json",
    }
    resp = requests.post(url, headers=headers, json={"model": MODEL_NAME, "input": [text]})
    data = resp.json()

    if "data" not in data:
        err = data.get("detail", data)
        return None, err

    return data["data"][0]["embedding"], None


def embed_batch(texts):
    """
    Try to embed a batch in one call. If it fails, fall back to embedding
    each chunk individually so no chunk is silently dropped.

    Returns a list of dicts, one per input text, in order:
        {"embedding": [...] or None, "error": None or <error info>}
    """
    url = "https://api.jina.ai/v1/embeddings"
    headers = {
        "Authorization": f"Bearer {JINA_API_KEY}",
        "Content-Type": "application/json",
    }

    response = requests.post(
        url,
        headers=headers,
        json={"model": MODEL_NAME, "input": texts},
    )
    data = response.json()

    if "data" in data:
        # Whole batch succeeded
        return [{"embedding": d["embedding"], "error": None} for d in data["data"]]

    # Batch failed -> fall back to one-by-one so every chunk gets a verdict
    print(f"   ❌ Batch embed failed: {data}")
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

    BATCH_SIZE = 10
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