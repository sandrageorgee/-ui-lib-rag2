# new_rag/stage4_reembed.py
import os
import json
import requests
from dotenv import load_dotenv
import re


load_dotenv()

INPUT_DIR = "new_rag"
OUTPUT_DIR = "new_rag"

MODEL_NAME = "jina-code-embeddings-1.5b"
JINA_API_KEY = os.getenv("JINA_API_KEY")

if not JINA_API_KEY:
    raise ValueError("❌ Missing JINA_API_KEY in .env")


# ================= EMBEDDING =================
def embed(texts):
    url = "https://api.jina.ai/v1/embeddings"

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
    )

    data = response.json()

    if "data" not in data:
        print("❌ Jina error:", data)
        return [None] * len(texts)

    return [d["embedding"] for d in data["data"]]


# ================= MAIN =================
print("🚀 Starting per-component re-embedding...")

for file in os.listdir(INPUT_DIR):
    if not file.startswith("rechunked.") or not file.endswith(".txt"):
        continue

    component_name = file.replace("rechunked.", "").replace(".txt", "")
    input_path = os.path.join(INPUT_DIR, file)

    print(f"\n📦 Processing: {component_name}")
    chunks=""
    with open(input_path, "r") as f:
        chunks = f.read()

    if not chunks:
        print(f"⚠️ Empty file, skipping")
        continue
    
    pattern  = ""
    chunks = re.split(r"------+", chunks)
    print(f"   Total chunks: {len(chunks)}")

    # texts = [c["text"] for c in chunks]
    all_embeddings = []

    BATCH_SIZE = 10

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        batch_embeddings = embed(batch)
        all_embeddings.extend(batch_embeddings)
        print(f"   🔹 Batch {i // BATCH_SIZE + 1}")
    

    final_chunks = []
    for i, chunk_text in enumerate(chunks):
        final_chunks.append({
           "component": component_name,
           "text": chunk_text,
           "embedding": all_embeddings[i]
    })

    # Attach embeddings
    # for i, chunk in enumerate(chunks):
    #     chunk["embedding"] = all_embeddings[i]

    # Save as embeddings2.{component}.json
    save_path = os.path.join(OUTPUT_DIR, f"embeddings2.{component_name}.json")
    with open(save_path, "w") as f:
        json.dump(final_chunks, f, indent=2)


    print(f"✅ Saved: {save_path}")

print("\n🎉 DONE")