"""
stage1_embed.py — Schema-to-text chunks + Jina embeddings
Reads  : parser/parsing-results/final.*.schema.json  (truth source)
Outputs: new_rag/embedding2_results/embeddings2.*.json

Chunk types produced per component:
  imports, component_overview, extends, css_classes,
  interface_summary, prop, enum, demo, story
"""

# stage1_embed.py
import os
import glob
import json
import requests
import re
import time
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv()

SCHEMA_DIR  = "parser/parsing-results"
OUTPUT_DIR  = "new_rag/embedding2_results"

EMBED_MODEL  = "Cohere-embed-v-4-0"   # 1536-dim, 128k context — best available in Model Manager
MODEL_NAME   = EMBED_MODEL   # backwards-compat alias
BATCH_SIZE   = 5  # Reduced from 10 for better reliability

MODEL_MANAGER_URL     = "https://orw-edai.wv.mentorg.com/model-manager/api/v1/embeddings"
MODEL_MANAGER_API_KEY = os.getenv("OLLAMA_API_KEY")   # same key used for LLM

if not MODEL_MANAGER_API_KEY:
    raise ValueError("❌ Missing OLLAMA_API_KEY in .env")

# Resolve paths relative to repo root (works whether run from root or new_rag/)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_repo_root  = os.path.dirname(_script_dir)
SCHEMA_DIR_ABS = os.path.join(_repo_root, SCHEMA_DIR)
OUTPUT_DIR_ABS = os.path.join(_repo_root, OUTPUT_DIR)
os.makedirs(OUTPUT_DIR_ABS, exist_ok=True)

# ================= CONNECTION POOLING WITH RETRY LOGIC =================
def create_session_with_retries():
    """Create a requests session with retry logic for robust API calls."""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["POST"]
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
    session.mount("https://", adapter)
    return session

embed_session = create_session_with_retries()


# ================= JINA EMBED =================

def embed(texts):
    """Embed a batch of texts via Model Manager API with retry logic. Returns list of float vectors."""
    max_retries = 3
    base_delay = 2  # seconds
    
    for attempt in range(max_retries):
        try:
            response = embed_session.post(
                MODEL_MANAGER_URL,
                headers={
                    "Authorization": f"Bearer {MODEL_MANAGER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": EMBED_MODEL,
                    "input": texts,
                },
                timeout=120,  # Increased from 60s to handle larger batches
                verify=False,
            )
            response.raise_for_status()  # Raise exception for HTTP errors
            data = response.json()
            
            if "data" not in data:
                print(f"⚠️ Model Manager error (attempt {attempt + 1}):", data)
                if attempt < max_retries - 1:
                    time.sleep(base_delay * (attempt + 1))
                    continue
                return [None] * len(texts)
            
            return [d["embedding"] for d in data["data"]]
            
        except requests.exceptions.RequestException as e:
            print(f"⚠️ Request failed (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                delay = base_delay * (attempt + 1)
                print(f"   Retrying in {delay}s...")
                time.sleep(delay)
            else:
                print("❌ Max retries reached")
                return [None] * len(texts)


# ================= SYMBOL / PACKAGE HELPERS =================

def extract_exported_symbols(import_str: str) -> list:
    """Extract { Symbol1, Symbol2 } from an import statement string."""
    match = re.search(r"\{([^}]+)\}", import_str)
    if match:
        return [s.strip() for s in match.group(1).split(",")
                if s.strip() and s.strip()[0].isalpha()]
    return []


def get_main_symbol(symbols: list) -> str:
    """Return first PascalCase symbol (the component, not a helper function)."""
    for s in symbols:
        if s and s[0].isupper():
            return s
    return symbols[0] if symbols else ""


def get_package_from_import(import_str: str) -> str:
    match = re.search(r"from\s+['\"]([^'\"]+)['\"]", import_str)
    return match.group(1) if match else ""


# ================= SCHEMA → TYPED CHUNKS =================

def schema_to_chunks(schema: dict, component_key: str) -> list:
    """Convert one schema object to a list of typed text chunks (no embeddings yet)."""
    chunks = []

    interface_name = schema.get("interface", "")
    description    = schema.get("description", "")
    extends        = schema.get("extends", [])
    if isinstance(extends, str):
        extends = [extends]
    css_classes    = schema.get("cssClasses", [])
    default_values = schema.get("defaultValues", {})
    docs           = schema.get("docs", {})
    properties     = schema.get("properties", {})
    required_props = schema.get("required", [])

    import_str  = docs.get("imports", "")
    symbols     = extract_exported_symbols(import_str) if import_str else []
    main_symbol = get_main_symbol(symbols) or schema.get("component", component_key.split(".")[-1]).capitalize()
    package     = get_package_from_import(import_str) if import_str else ""

    base_meta = {
        "component":       component_key,
        "exported_symbol": main_symbol,
        "package":         package,
        "interface":       interface_name,
        "source_schema":   component_key,
        "prop":            "",
        "enum_values":     "",
    }

    # ── 1. imports ───────────────────────────────────────────────────────────
    if import_str:
        symbols_str = ", ".join(symbols)
        chunks.append({
            **base_meta, "chunk_type": "imports", "type": "imports",
            "title": f"{main_symbol} imports",
            "text": (
                f"Import {main_symbol} from {package}. "
                f"Exported symbols: {symbols_str}. "
                f"Import statement: {import_str}"
            ),
        })

    # ── 2. component_overview ────────────────────────────────────────────────
    extends_str = ", ".join(extends) if extends else ""
    overview_parts = [f"Component: {main_symbol}."]
    if interface_name:
        overview_parts.append(f"Interface: {interface_name}.")
    if package:
        overview_parts.append(f"Package: {package}.")
    if description:
        overview_parts.append(f"Description: {description}")
    if extends_str:
        overview_parts.append(f"Extends: {extends_str}.")
    if symbols:
        overview_parts.append(f"Exported symbols: {', '.join(symbols)}.")
    chunks.append({
        **base_meta, "chunk_type": "component_overview", "type": "component_overview",
        "title": f"{main_symbol} overview",
        "text": " ".join(overview_parts),
    })

    # ── 3. extends ───────────────────────────────────────────────────────────
    if extends:
        chunks.append({
            **base_meta, "chunk_type": "extends", "type": "extends",
            "title": f"{main_symbol} extends",
            "text": (
                f"Component: {main_symbol}. Interface: {interface_name} extends {', '.join(extends)}. "
                f"Inherits all props from {', '.join(extends)}. "
                f"Only props declared directly on {interface_name} are listed below."
            ),
        })

    # ── 4. css_classes ───────────────────────────────────────────────────────
    if css_classes:
        chunks.append({
            **base_meta, "chunk_type": "css_classes", "type": "css_classes",
            "title": f"{main_symbol} CSS classes",
            "text": (
                f"Component: {main_symbol}. Interface: {interface_name}. "
                f"CSS class names: {', '.join(css_classes)}."
            ),
        })

    # ── 5. prop + enum chunks ─────────────────────────────────────────────────
    prop_summary_lines = []
    for prop_name, prop_def in properties.items():
        is_required = prop_name in required_props
        prop_type   = prop_def.get("type", prop_def.get("typeName", "unknown"))
        prop_desc   = prop_def.get("description", "")
        enum_values = prop_def.get("enum", [])
        type_name   = prop_def.get("typeName", prop_type)
        default_val = default_values.get(prop_name, prop_def.get("default", ""))
        enum_str    = ", ".join(str(v) for v in enum_values) if enum_values else ""

        prop_summary_lines.append(
            f"  - {prop_name}: {type_name}"
            + (f" [{enum_str}]" if enum_str else "")
            + (" (required)" if is_required else "")
            + (f" — {prop_desc[:80]}" if prop_desc else "")
        )

        parts = [
            f"Component: {main_symbol}.",
            f"Interface: {interface_name}." if interface_name else "",
            f"Prop: {prop_name}.",
            f"Type: {type_name}.",
            f"Required: {'yes' if is_required else 'no'}.",
        ]
        if default_val != "":
            parts.append(f"Default: {default_val}.")
        if enum_str:
            parts.append(f"Accepted values: {enum_str}.")
        if prop_desc:
            parts.append(f"Description: {prop_desc}")

        chunks.append({
            **base_meta,
            "chunk_type":  "prop",
            "type":        "prop",
            "prop":        prop_name,
            "required":    "yes" if is_required else "no",
            "enum_values": enum_str,
            "title":       f"{main_symbol}.{prop_name}",
            "text":        " ".join(p for p in parts if p),
        })

        if len(enum_values) >= 2:
            chunks.append({
                **base_meta,
                "chunk_type":  "enum",
                "type":        "enum",
                "prop":        prop_name,
                "enum_values": enum_str,
                "title":       f"{main_symbol}.{prop_name} values",
                "text": (
                    f"Component: {main_symbol}. Interface: {interface_name}. "
                    f"Prop: {prop_name}. Type: {type_name}. "
                    f"Accepted enum values: {enum_str}. "
                    + (f"Description: {prop_desc}" if prop_desc else "")
                ),
            })

    # ── 6. interface_summary ─────────────────────────────────────────────────
    if prop_summary_lines and interface_name:
        chunks.append({
            **base_meta,
            "chunk_type": "interface_summary", "type": "interface_summary",
            "title":      f"{interface_name} summary",
            "text": (
                f"Interface: {interface_name}. Component: {main_symbol}. Package: {package}.\n"
                f"All props:\n" + "\n".join(prop_summary_lines)
            ),
        })

    # ── 7. demo chunks ───────────────────────────────────────────────────────
    for i, demo in enumerate(docs.get("demos", [])):
        label      = demo.get("label", f"Demo {i+1}")
        code_lines = demo.get("code", [])
        code       = "\n".join(code_lines)
        chunks.append({
            **base_meta,
            "chunk_type": "demo", "type": "demo",
            "title": f"{main_symbol} demo: {label}",
            "text": (
                f"Component: {main_symbol}. Package: {package}. "
                f"Demo: {label}. "
                f"Import: {import_str} "
                f"Code:\n{code}"
            ),
        })

    # ── 8. story chunks ──────────────────────────────────────────────────────
    for story in docs.get("stories", []):
        label      = story.get("label", "Story")
        args       = story.get("args", {})
        code_lines = story.get("code", [])
        args_str   = ", ".join(f"{k}={v!r}" for k, v in args.items())
        code       = "\n".join(code_lines)
        chunks.append({
            **base_meta,
            "chunk_type": "story", "type": "story",
            "title": f"{main_symbol} story: {label}",
            "text": (
                f"Component: {main_symbol}. Package: {package}. "
                f"Storybook story: {label}. "
                f"Args: {args_str}. "
                f"Code:\n{code}"
            ),
        })

    return chunks


# ================= MAIN =================
print("🚀 Schema-to-text embedding pipeline started")

schema_files = sorted(glob.glob(os.path.join(SCHEMA_DIR_ABS, "final.*.schema.json")))
if not schema_files:
    print(f"❌ No schema files found in {SCHEMA_DIR_ABS}")
    exit(1)

print(f"📂 Found {len(schema_files)} schema files")

for schema_path in schema_files:
    filename = os.path.basename(schema_path)
    # "final.common-ui.alert.alerts.schema.json" → "common-ui.alert.alerts"
    base = filename.replace("final.", "").replace(".schema.json", "")

    with open(schema_path, "r", encoding="utf-8") as f:
        content = f.read().strip()

    if not content:
        print(f"⚠️  Skipping {filename}: empty")
        continue

    try:
        schemas = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"⚠️  Skipping {filename}: invalid JSON — {e}")
        continue

    if not isinstance(schemas, list):
        schemas = [schemas]

    all_chunks = []
    for schema in schemas:
        all_chunks.extend(schema_to_chunks(schema, base))

    if not all_chunks:
        print(f"⚠️  No chunks for {base}")
        continue

    texts         = [c["text"] for c in all_chunks]
    embeddings    = []
    total_batches = (len(texts) - 1) // BATCH_SIZE + 1

    for i in range(0, len(texts), BATCH_SIZE):
        batch_emb = embed(texts[i:i + BATCH_SIZE])
        embeddings.extend(batch_emb)
        print(f"   🔹 {base}: batch {i // BATCH_SIZE + 1}/{total_batches}")

    for chunk, emb in zip(all_chunks, embeddings):
        chunk["embedding"] = emb

    out_path = os.path.join(OUTPUT_DIR_ABS, f"embeddings2.{base}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, indent=2)

    print(f"✅ {base}: {len(all_chunks)} chunks → {out_path}")

print("\n🎉 Done — all schema files embedded")