# stage1_embed.py
import os
import glob
import json
import re
import cohere
from collections import Counter
from dotenv import load_dotenv

load_dotenv()

TEXT_RESULTS_DIR = "../rag/text-results"
OUTPUT_DIR = "embedding_results"

MODEL_NAME = "embed-v4.0"
CO_API_KEY = os.getenv("CO_API_KEY")

if not CO_API_KEY:
    raise ValueError("❌ Missing CO_API_KEY in .env")

co = cohere.ClientV2(api_key=CO_API_KEY)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Set to True to print every embedded chunk's (component, interface, prop, type)
# plus a breakdown of how many DISTINCT "Component: X" headers exist inside the
# raw text file — this is what reveals whether a file like icons.icons.txt is
# actually one component or dozens of sub-components stacked together and
# collapsed under one filename-derived label.
DEBUG_CHUNKS = True


# ================= CLEAN TEXT =================
def clean_text(text: str) -> str:
    text = re.sub(r"-{3,}", "", text)
    text = re.sub(r"={3,}", "", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    text = text.strip()
    return text


# ================= DEBUG HELPERS =================

def debug_report_subcomponents(text: str, filename_component: str):
    """
    Scans the raw text for every 'Component: X' header actually written in
    the file, and compares that against the single filename-derived label
    that parse_chunks() will apply to ALL chunks from this file.

    If this finds more than one distinct name, it means the file bundles
    multiple real components/icons together, and every one of them is about
    to be tagged with the same generic label (e.g. all tagged "icons"
    instead of "activityicon", "homeicon", etc.) — which both explains an
    unexpectedly large chunk count AND means retrieval can't tell them apart.
    """
    real_names = re.findall(r"^Component:\s*(\S+)", text, re.MULTILINE)
    unique_names = sorted(set(real_names))

    print(f"   🔬 DEBUG sub-components found inside file: {len(unique_names)} distinct "
          f"(vs. 1 filename-derived label: '{filename_component}')")

    if len(unique_names) > 1:
        preview = unique_names[:10]
        more = f" ... (+{len(unique_names) - 10} more)" if len(unique_names) > 10 else ""
        print(f"   ⚠️  This file bundles MULTIPLE real components: {preview}{more}")
        print(f"   ⚠️  All of these will be embedded under the single label "
              f"'{filename_component}' unless parse_chunks() is updated to use "
              f"the real per-block 'Component:' name instead.")
    elif len(unique_names) == 1 and unique_names[0] != filename_component:
        print(f"   ⚠️  Real component name in file ('{unique_names[0]}') doesn't match "
              f"the filename-derived label ('{filename_component}')")

    return real_names


def debug_report_chunks(chunks: list, base: str):
    """
    Prints every chunk's (component, interface, prop, type) so you can see
    exactly what's being sent to Cohere — and a count of how many times each
    (interface, prop) pair repeats, which reveals duplication vs. genuine
    per-item variety (e.g. the same 'disabled'/'variant' props repeating
    once per icon is normal; the same exact prop appearing 50 times for the
    SAME icon would indicate a real duplication bug).
    """
    print(f"   🔬 DEBUG chunk-by-chunk breakdown for {base} ({len(chunks)} total):")

    prop_counter = Counter()
    for c in chunks:
        label = f"{c.get('component','')} | {c.get('interface','') or c.get('type','')} | {c.get('prop','') or '(no prop)'}"
        prop_counter[label] += 1

    # Only print each distinct (component, interface, prop) combination once,
    # with a count, instead of flooding the terminal with one line per chunk
    for label, count in prop_counter.most_common():
        marker = "🔴 DUPLICATE?" if count > 1 else ""
        print(f"      x{count:<3} {label} {marker}")


# ================= EMBEDDING =================
def embed(texts, input_type="search_document"):
    """
    input_type:
      - "search_document"  → use when embedding chunks for storage (default)
      - "search_query"     → use when embedding a user query at query time
    """
    response = co.embed(
        model=MODEL_NAME,
        texts=texts,
        input_type=input_type,
        embedding_types=["float"],
    )

    actual_dim = len(response.embeddings.float[0]) if response.embeddings.float else 0
    print(f"   ✅ Cohere response — model: {MODEL_NAME}, dim: {actual_dim}, "
          f"meta.api_version: {getattr(response.meta, 'api_version', 'n/a')}")

    return response.embeddings.float


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
text_files = sorted(glob.glob(os.path.join(TEXT_RESULTS_DIR, "text.*.txt")))

if not text_files:
    print(f"⚠️ No text files found in {TEXT_RESULTS_DIR}")
else:
    for text_file in text_files:
        filename = os.path.basename(text_file)
        base = filename[len("text."):-len(".txt")]          # e.g. "alert.alerts"
        component = base.split(".")[0]                      # e.g. "alert"

        with open(text_file, "r") as f:
            text = f.read()

        if DEBUG_CHUNKS:
            debug_report_subcomponents(text, component)

        chunks = parse_chunks(text, component)

        if not chunks:
            print(f"⚠️ No chunks for {base}")
            continue

        print(f"📦 {base}: {len(chunks)} chunks")

        if DEBUG_CHUNKS:
            debug_report_chunks(chunks, base)

        texts = [c["text"] for c in chunks]

        # Cohere supports up to 96 texts per batch; using 64 to stay safe
        BATCH_SIZE = 64
        embeddings = []

        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            batch_embeddings = embed(batch, input_type="search_document")
            embeddings.extend(batch_embeddings)
            print(f"   🔹 batch {i // BATCH_SIZE + 1}")

        for i, chunk in enumerate(chunks):
            chunk["embedding"] = embeddings[i]
            chunk["embedding_model"] = MODEL_NAME
            chunk["embedding_dim"] = len(embeddings[i])

        save_path = os.path.join(OUTPUT_DIR, f"embeddings.{base}.json")
        with open(save_path, "w") as f:
            json.dump(chunks, f, indent=2)

        print(f"✅ Saved: {save_path}")

print("\n🎉 DONE")