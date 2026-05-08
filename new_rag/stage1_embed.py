# stage1_embed.py
import os
import json
import requests
import re
from dotenv import load_dotenv

load_dotenv()

ROOT = "data/mini-ui-lib/components"
OUTPUT_DIR = "new_rag"

MODEL_NAME = "jina-code-embeddings-1.5b"
JINA_API_KEY = os.getenv("JINA_API_KEY")

if not JINA_API_KEY:
    raise ValueError("❌ Missing JINA_API_KEY in .env")

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ================= CLEAN TEXT =================
def clean_text(text: str) -> str:
    text = re.sub(r"-{3,}", "", text)
    text = re.sub(r"={3,}", "", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    text = text.strip()
    return text


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


# ================= PARSE =================
def parse_chunks(text: str, component: str) -> list[dict]:
    blocks = text.strip().split("-" * 40)
    chunks = []
    seen = set()

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        lines = block.split("\n")
        non_empty_lines = [l for l in lines if l.strip()]
        if not non_empty_lines:
            continue

        # Skip indented/nested blocks
        if non_empty_lines[0].startswith("  "):
            continue

        # Skip already-documented reference notes — no semantic value
        if "↩ Already documented above" in block:
            continue

        # Skip section headers that have no prop content
        if not any(l.strip().startswith("Prop:") for l in lines):
            continue

        prop = None
        interface = None

        for line in lines:
            line_stripped = line.strip()
            if line_stripped.startswith("Prop:"):
                prop = line_stripped.replace("Prop:", "").strip()
            if line_stripped.startswith("Interface:"):
                interface = line_stripped.replace("Interface:", "").strip()

        if not prop:
            continue

        # Deduplicate — same component + interface + prop = skip
        key = (component, interface or "", prop)
        if key in seen:
            continue
        seen.add(key)

        block = clean_text(block)

        chunks.append({
            "component": component,
            "interface": interface or "",
            "prop": prop,
            "text": block,
        })

    return chunks


# ================= MAIN =================
print("🚀 Script started")

for component in os.listdir(ROOT):
    comp_path = os.path.join(ROOT, component)

    if not os.path.isdir(comp_path):
        continue

    text_file = os.path.join(comp_path, f"text.{component}.txt")

    if not os.path.exists(text_file):
        print(f"⚠️ Missing file for {component}")
        continue

    with open(text_file, "r") as f:
        text = f.read()

    chunks = parse_chunks(text, component)

    if not chunks:
        print(f"⚠️ No chunks for {component}")
        continue

    print(f"📦 {component}: {len(chunks)} chunks")

    texts = [c["text"] for c in chunks]

    BATCH_SIZE = 10
    embeddings = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        batch_embeddings = embed(batch)
        embeddings.extend(batch_embeddings)
        print(f"   🔹 batch {i // BATCH_SIZE + 1}")

    for i, chunk in enumerate(chunks):
        chunk["embedding"] = embeddings[i]

    save_path = os.path.join(OUTPUT_DIR, f"embeddings.{component.lower()}.json")
    with open(save_path, "w") as f:
        json.dump(chunks, f, indent=2)

    print(f"✅ Saved: {save_path}")

print("\n🎉 DONE")