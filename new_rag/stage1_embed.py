# stage1_embed.py
import os
import glob
import json
import requests
import re
from dotenv import load_dotenv

load_dotenv()

TEXT_RESULTS_DIR = "rag/text-results"
OUTPUT_DIR = "new_rag/embedding_results"

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
        verify=False
    )

    data = response.json()

    if "data" not in data:
        print("❌ Jina error:", data)
        return [None] * len(texts)

    return [d["embedding"] for d in data["data"]]


# ================= PARSE =================
def parse_chunks(text: str, component: str) -> list[dict]:
    chunks = []
    seen = set()

    # ---- 1. Prop chunks — split by 40-dash lines ----
    for block in text.split("-" * 40):
        block = block.strip()
        if not block:
            continue
        lines = block.split("\n")
        non_empty = [l for l in lines if l.strip()]
        if not non_empty or non_empty[0].startswith("  "):
            continue
        if "↩ Already documented above" in block:
            continue
        if not any(l.strip().startswith("Prop:") for l in lines):
            continue

        prop = interface = None
        for line in lines:
            s = line.strip()
            if s.startswith("Prop:"):
                prop = s[5:].strip()
            if s.startswith("Interface:"):
                interface = s[10:].strip()
        if not prop:
            continue

        key = (component, interface or "", prop)
        if key in seen:
            continue
        seen.add(key)
        chunks.append({
            "component": component,
            "interface": interface or "",
            "prop": prop,
            "type": "prop",
            "text": clean_text(block),
        })

    # ---- 2. Story chunks — each "Storybook Stories: Label" block ----
    for match in re.finditer(
        r'(Storybook Stories:\s*.+?)(?=\nStorybook Stories:|\n={60}|\Z)',
        text,
        re.DOTALL,
    ):
        block = match.group(1).strip()
        first_line = block.split("\n")[0]
        label = first_line.replace("Storybook Stories:", "").strip()
        if not label:
            continue
        key = (component, "__story__", label)
        if key in seen:
            continue
        seen.add(key)
        chunks.append({
            "component": component,
            "interface": "__story__",
            "prop": label,
            "type": "story",
            "text": clean_text(block),
        })

    # ---- 3. Demo chunks — each "--- Label ---" block inside Demo Examples ----
    demo_section = re.search(
        r'Demo Examples:(.*?)(?=Storybook Stories:|={60}|\Z)',
        text,
        re.DOTALL,
    )
    if demo_section:
        raw = demo_section.group(1)
        for match in re.finditer(
            r'---\s*(.+?)\s*---\s*\n(.*?)(?=---\s*.+?\s*---|\Z)',
            raw,
            re.DOTALL,
        ):
            label = match.group(1).strip()
            code  = match.group(2).strip()
            if not label or not code:
                continue
            key = (component, "__demo__", label)
            if key in seen:
                continue
            seen.add(key)
            chunks.append({
                "component": component,
                "type": "demo",
                "title": f"Demo: {component} {label}",
                "text": clean_text(f"Demo: {label}\n\n{code}"),
            })

    # ---- 4. Component header chunk — description, imports, defaults, CSS ----
    # Capture from Component: up to (but not including) Demo Examples / Storybook
    # Stories / or the Component Props separator — whichever comes first.
    header_match = re.search(
        r'^(Component:.+?)(?=Demo Examples:|Storybook Stories:|={60}\n\nComponent Props:)',
        text,
        re.DOTALL,
    )
    if header_match:
        header = header_match.group(1).strip()
        if header:
            # ---- 4a. CSS Classes — separate chunk ----
            css_match = re.search(r'(CSS Classes:\s*\n(?:  -[^\n]+\n?)+)', header)
            if css_match:
                css_text = css_match.group(1).strip()
                key_css = (component, "__css__", "__css__")
                if key_css not in seen:
                    seen.add(key_css)
                    chunks.append({
                        "component": component,
                        "type": "css_classes",
                        "text": f"Component: {component}\n\n{css_text}",
                    })
                # remove CSS Classes block from description text
                header = header[:css_match.start()].rstrip() + "\n" + header[css_match.end():]

            # ---- 4b. Description chunk (without CSS classes) ----
            key = (component, "__header__", "__header__")
            if key not in seen:
                seen.add(key)
                chunks.append({
                    "component": component,
                    "type": "description",
                    "text": clean_text(header),
                })

    # ---- 5. Interface summary chunks — one per interface, lists all its props ----
    iface_props: dict = {}
    for chunk in chunks:
        iface = chunk.get("interface", "")
        if not iface or iface.startswith("__"):
            continue
        iface_props.setdefault(iface, []).append(chunk)

    for iface, iface_chunks in iface_props.items():
        key = (component, iface, "__summary__")
        if key in seen:
            continue
        seen.add(key)

        prop_lines = []
        for c in iface_chunks:
            prop_name = c["prop"]
            # pull Type line from the chunk text
            type_line = next(
                (l.strip() for l in c["text"].split("\n") if l.strip().startswith("Type:")),
                ""
            )
            desc_lines = c["text"].split("\n")
            desc = next(
                (l.strip() for l in desc_lines if l.strip().startswith("Description:") or
                 (l.strip() and not l.strip().startswith(("Component:", "Interface:", "Prop:", "Type:", "TypeName:", "Required:", "Usage:", "Accepted", "Enum", "Signature"))
                  and len(l.strip()) > 20)),
                ""
            )
            prop_lines.append(f"  - {prop_name}: {type_line.replace('Type:', '').strip()} — {desc}")

        summary_text = (
            f"Interface: {iface}\n"
            f"Component: {component}\n\n"
            f"This interface defines the following props:\n"
            + "\n".join(prop_lines)
        )
        chunks.append({
            "component": component,
            "type": f"{component.capitalize()} interface_summary",
            "text": clean_text(summary_text),
        })

    return chunks


# ================= MAIN =================
print("🚀 Script started")

parentPath = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) 
print("TEXTFILES: ", parentPath)
text_files = sorted(glob.glob(os.path.join(parentPath, TEXT_RESULTS_DIR, "text.*.txt")))

path = os.path.abspath(__file__)
print("FULL PATH: ",  text_files) # This is your Project Root
if not text_files:
    print(f"⚠️ No text files found in {TEXT_RESULTS_DIR}")
else:
    for text_file in text_files:
        # text.alert.alerts.txt → base = "alert.alerts"
        filename = os.path.basename(text_file)
        base = filename[len("text."):-len(".txt")]          # e.g. "alert.alerts"
        component = base.split(".")[0]                      # e.g. "alert"

        with open(text_file, "r") as f:
            text = f.read()

        chunks = parse_chunks(text, component)

        if not chunks:
            print(f"⚠️ No chunks for {base}")
            continue

        print(f"📦 {base}: {len(chunks)} chunks")

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

        save_path = os.path.join(OUTPUT_DIR, f"embeddings.{base}.json")
        with open(save_path, "w") as f:
            json.dump(chunks, f, indent=2)

        print(f"✅ Saved: {save_path}")

print("\n🎉 DONE")