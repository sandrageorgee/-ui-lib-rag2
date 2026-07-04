# new_rag/stage4_reembed.py
import os
import json
import requests
from dotenv import load_dotenv


load_dotenv()

INPUT_DIR = "new_rag/rechunked_results"
OUTPUT_DIR = "new_rag/embedding2_results"

MODEL_NAME = "jina-code-embeddings-1.5b"
JINA_API_KEY = os.getenv("JINA_API_KEY")

if not JINA_API_KEY:
    raise ValueError("❌ Missing JINA_API_KEY in .env")


# ================= EMBEDDING =================
def embed(texts, retries=3):
    url = "https://api.jina.ai/v1/embeddings"

    for attempt in range(1, retries + 1):
        try:
            response = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {JINA_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL_NAME,
                    "input": texts,
                },
                verify=False,
                timeout=60,
            )
            data = response.json()
            if "data" not in data:
                print(f"❌ Jina error (attempt {attempt}/{retries}):", data)
                continue
            return [d["embedding"] for d in data["data"]]
        except Exception as e:
            print(f"❌ Request failed (attempt {attempt}/{retries}): {e}")

    print(f"❌ All {retries} attempts failed — returning None embeddings")
    return [None] * len(texts)


# ================= MAIN =================
print("🚀 Starting per-component re-embedding...")

all_rechunked_path = os.path.join(INPUT_DIR, "ALL.rechunked.json")
with open(all_rechunked_path, "r") as f:
    all_chunks = json.load(f)

# Group by component
from collections import defaultdict
by_component = defaultdict(list)
for chunk in all_chunks:
    by_component[chunk["component"]].append(chunk)

for component_name, chunks in by_component.items():
    print(f"\n📦 Processing: {component_name} ({len(chunks)} chunks)")

    texts = [c["text"] for c in chunks]

    BATCH_SIZE = 10
    all_embeddings = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        batch_embeddings = embed(batch)
        all_embeddings.extend(batch_embeddings)
        print(f"   🔹 Batch {i // BATCH_SIZE + 1}")

    final_chunks = []
    for i, chunk in enumerate(chunks):
        final_chunks.append({
            "component":  chunk.get("component", component_name),
            "interface":  chunk.get("interface", ""),
            "prop":       chunk.get("props", [""])[0] if chunk.get("props") else "",
            "props":      chunk.get("props", []),
            "type":       chunk.get("type", ""),
            "keywords":   chunk.get("keywords", []),
            "cluster_id": chunk.get("cluster_id"),
            "text":       chunk.get("text", ""),
            "embedding":  all_embeddings[i],
        })

    save_path = os.path.join(OUTPUT_DIR, f"embeddings2.{component_name}.json")
    with open(save_path, "w") as f:
        json.dump(final_chunks, f, indent=2)

    print(f"✅ Saved: {save_path}")

print("\n🎉 DONE")