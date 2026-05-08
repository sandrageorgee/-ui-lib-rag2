# new_rag/stage5_store_chroma.py
import json
import os
import chromadb

INPUT_DIR = "new_rag"
CHROMA_PATH = "new_rag/chroma_db"
COLLECTION_NAME = "ui_components"

# ================= CHROMA SETUP =================
client = chromadb.PersistentClient(path=CHROMA_PATH)

try:
    client.delete_collection(COLLECTION_NAME)
    print("🗑️  Deleted existing collection")
except:
    pass

collection = client.create_collection(
    name=COLLECTION_NAME,
    metadata={"hnsw:space": "cosine"}
)

print("🚀 Starting per-component storage...\n")

total_stored = 0
chunk_counter = 0  # global counter for unique IDs across components

for file in os.listdir(INPUT_DIR):
    if not file.startswith("embeddings2.") or not file.endswith(".json"):
        continue

    component_name = file.replace("embeddings2.", "").replace(".json", "")
    input_path = os.path.join(INPUT_DIR, file)

    print(f"📦 Processing: {component_name}")

    with open(input_path, "r") as f:
        chunks = json.load(f)

    if not chunks:
        print(f"⚠️ Empty file, skipping\n")
        continue

    ids = []
    embeddings = []
    documents = []
    metadatas = []

    for chunk in chunks:
        if not chunk.get("embedding"):
            print(f"⚠️ Skipping chunk — no embedding")
            continue

        ids.append(f"chunk_{chunk_counter}")
        chunk_counter += 1

        embeddings.append(chunk["embedding"])
        documents.append(chunk["text"])

        # Handle both single-prop and multi-prop chunks
        props = chunk.get("props", [])
        if isinstance(props, list):
            props_str = ", ".join(props)
        else:
            props_str = str(props)

        interfaces = chunk.get("interfaces", chunk.get("interface", ""))
        if isinstance(interfaces, list):
            interfaces_str = ", ".join(interfaces)
        else:
            interfaces_str = str(interfaces)

        metadatas.append({
            "component": chunk.get("component", component_name),
            "interfaces": interfaces_str,
            "props": props_str,
            "cluster_id": str(chunk.get("cluster_id", "")),
            "size": str(chunk.get("size", 1)),
        })

    if not ids:
        print(f"⚠️ No valid chunks for {component_name}\n")
        continue

    # Insert in batches
    BATCH_SIZE = 50
    for i in range(0, len(ids), BATCH_SIZE):
        collection.add(
            ids=ids[i:i + BATCH_SIZE],
            embeddings=embeddings[i:i + BATCH_SIZE],
            documents=documents[i:i + BATCH_SIZE],
            metadatas=metadatas[i:i + BATCH_SIZE],
        )

    total_stored += len(ids)
    print(f"✅ Stored {len(ids)} chunks for {component_name}\n")

print(f"📊 Total stored: {total_stored} chunks")
print(f"   Path: {CHROMA_PATH}")
print(f"   Collection: {COLLECTION_NAME}")
print("🎉 DONE")