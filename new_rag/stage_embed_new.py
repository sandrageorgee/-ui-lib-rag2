# new_rag/stage_embed_new.py
#
# Embeds all text.common-ui.*.txt files that are NOT yet in embedding2_results.
# Reuses parse_chunks() logic with import-path injection so every chunk tells
# the LLM the correct import statement.
#
# Run from project root:
#   python new_rag/stage_embed_new.py
#
import os
import glob
import json
import re
import requests
from dotenv import load_dotenv

load_dotenv()

TEXT_RESULTS_DIR  = "rag/text-results"
OUTPUT_DIR        = "new_rag/embedding2_results"
MODEL_NAME        = "jina-code-embeddings-1.5b"
JINA_API_KEY      = os.getenv("JINA_API_KEY")
BATCH_SIZE        = 10

if not JINA_API_KEY:
    raise ValueError("❌ Missing JINA_API_KEY in .env")

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean_text(text: str) -> str:
    text = re.sub(r"-{3,}", "", text)
    text = re.sub(r"={3,}", "", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()


def embed(texts: list) -> list:
    response = requests.post(
        "https://api.jina.ai/v1/embeddings",
        headers={
            "Authorization": f"Bearer {JINA_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"model": MODEL_NAME, "input": texts},
        timeout=120,
    )
    data = response.json()
    if "data" not in data:
        print("❌ Jina error:", data)
        return [None] * len(texts)
    return [d["embedding"] for d in data["data"]]


def extract_import_line(text: str) -> str:
    """Pull the first 'import { ... } from ...' line after 'Import:' header."""
    match = re.search(r"Import:\s*\n\s*(import\s+\{[^\n]+\}[^\n]*)", text)
    if match:
        return match.group(1).strip()
    return ""


def extract_component_name(text: str) -> str:
    """Read the 'Component: X' declaration at the top of the file."""
    match = re.match(r"Component:\s*(\S+)", text.strip())
    if match:
        return match.group(1).strip()
    return ""


# ── Chunk parser (mirrors stage1_embed.py + import injection) ─────────────────

def parse_chunks(text: str, component: str, import_line: str) -> list[dict]:
    chunks = []
    seen   = set()
    import_prefix = f"Correct import: {import_line}\n\n" if import_line else ""

    # ── 1. Prop chunks ────────────────────────────────────────────────────────
    for block in text.split("-" * 40):
        block = block.strip()
        if not block:
            continue
        lines     = block.split("\n")
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
            "prop":      prop,
            "type":      "prop",
            "text":      import_prefix + clean_text(block),
        })

    # ── 2. Story chunks ───────────────────────────────────────────────────────
    for match in re.finditer(
        r"(Storybook Stories:\s*.+?)(?=\nStorybook Stories:|\n={60}|\Z)",
        text,
        re.DOTALL,
    ):
        block      = match.group(1).strip()
        first_line = block.split("\n")[0]
        label      = first_line.replace("Storybook Stories:", "").strip()
        if not label:
            continue
        key = (component, "__story__", label)
        if key in seen:
            continue
        seen.add(key)
        chunks.append({
            "component": component,
            "interface": "__story__",
            "prop":      label,
            "type":      "story",
            "text":      import_prefix + clean_text(block),
        })

    # ── 3. Demo chunks ────────────────────────────────────────────────────────
    demo_section = re.search(
        r"Demo Examples:(.*?)(?=Storybook Stories:|={60}|\Z)",
        text,
        re.DOTALL,
    )
    if demo_section:
        raw = demo_section.group(1)
        for match in re.finditer(
            r"---\s*(.+?)\s*---\s*\n(.*?)(?=---\s*.+?\s*---|\Z)",
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
                "type":      "demo",
                "title":     f"Demo: {component} {label}",
                "text":      import_prefix + clean_text(f"Demo: {label}\n\n{code}"),
            })

    # ── 4. Description chunk (header minus CSS) ───────────────────────────────
    header_match = re.search(
        r"^(Component:.+?)(?=Demo Examples:|Storybook Stories:|={60}\n\nComponent Props:)",
        text,
        re.DOTALL,
    )
    if header_match:
        header = header_match.group(1).strip()
        if header:
            # 4a. CSS classes — separate chunk
            css_match = re.search(r"(CSS Classes:\s*\n(?:  -[^\n]+\n?)+)", header)
            if css_match:
                css_text = css_match.group(1).strip()
                key_css  = (component, "__css__", "__css__")
                if key_css not in seen:
                    seen.add(key_css)
                    chunks.append({
                        "component": component,
                        "type":      "css_classes",
                        "text":      import_prefix + f"Component: {component}\n\n{css_text}",
                    })
                header = header[:css_match.start()].rstrip() + "\n" + header[css_match.end():]

            # 4b. Description
            key = (component, "__header__", "__header__")
            if key not in seen:
                seen.add(key)
                chunks.append({
                    "component": component,
                    "type":      "description",
                    "text":      import_prefix + clean_text(header),
                })

    # ── 5. Interface summary chunks ───────────────────────────────────────────
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
            type_line = next(
                (l.strip() for l in c["text"].split("\n") if l.strip().startswith("Type:")),
                "",
            )
            desc_lines = c["text"].split("\n")
            desc = next(
                (
                    l.strip()
                    for l in desc_lines
                    if l.strip().startswith("Description:")
                    or (
                        l.strip()
                        and not l.strip().startswith(
                            ("Component:", "Interface:", "Prop:", "Type:", "TypeName:",
                             "Required:", "Usage:", "Accepted", "Enum", "Signature",
                             "Correct import:")
                        )
                        and len(l.strip()) > 20
                    )
                ),
                "",
            )
            prop_lines.append(
                f"  - {prop_name}: {type_line.replace('Type:', '').strip()} — {desc}"
            )

        summary_text = (
            f"Interface: {iface}\n"
            f"Component: {component}\n\n"
            f"This interface defines the following props:\n"
            + "\n".join(prop_lines)
        )
        chunks.append({
            "component": component,
            "type":      f"{component.capitalize()} interface_summary",
            "text":      import_prefix + clean_text(summary_text),
        })

    return chunks


# ── Main ──────────────────────────────────────────────────────────────────────

print("🚀 stage_embed_new — embedding un-indexed common-ui components")

all_text_files  = sorted(glob.glob(os.path.join(TEXT_RESULTS_DIR, "text.common-ui.*.txt")))
existing_output = set(os.listdir(OUTPUT_DIR))

skipped = 0
processed = 0

for text_file in all_text_files:
    filename = os.path.basename(text_file)                   # text.common-ui.barchart.barchart.txt
    base     = filename[len("text."):-len(".txt")]            # common-ui.barchart.barchart
    out_name = f"embeddings2.{base}.json"

    if out_name in existing_output:
        skipped += 1
        continue

    print(f"\n📄 {base}")

    with open(text_file, "r", encoding="utf-8") as f:
        text = f.read()

    component  = extract_component_name(text)
    import_line = extract_import_line(text)

    if not component:
        print(f"   ⚠️  Could not extract component name — skipping")
        continue

    print(f"   component={component}  import={import_line or '(none)'}")

    chunks = parse_chunks(text, component, import_line)
    if not chunks:
        print(f"   ⚠️  No chunks extracted — skipping")
        continue

    print(f"   {len(chunks)} chunks")

    texts      = [c["text"] for c in chunks]
    embeddings = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch            = texts[i : i + BATCH_SIZE]
        batch_embeddings = embed(batch)
        embeddings.extend(batch_embeddings)
        print(f"   🔹 batch {i // BATCH_SIZE + 1}/{(len(texts) - 1) // BATCH_SIZE + 1}")

    for i, chunk in enumerate(chunks):
        chunk["embedding"] = embeddings[i]

    save_path = os.path.join(OUTPUT_DIR, out_name)
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(chunks, f, indent=2)

    print(f"   ✅ saved → {save_path}")
    processed += 1

print(f"\n🎉 Done — {processed} new files embedded, {skipped} already existed")
print("Next: run  python new_rag/stage5_store_chroma.py  to reload ChromaDB")
