# RAG Pipeline — Changes & Fixes

> For interns. Plain English. Real examples.

---

## What is this system?

This is a RAG (Retrieval-Augmented Generation) pipeline. It reads our `common-ui` component library, indexes all the props and usage examples into a vector database (ChromaDB), and lets developers ask questions like:

> "Create a page with a table and a filter panel"

The system finds the right components, then generates working React/TypeScript code.

---

## Pipeline Order (how data flows)

```
Stage 0  parser/pipeline.ts         → reads TypeScript source → schema JSON files
Stage 1  rag/write_fields.py        → reads schemas → writes text files (rag/text-results/)
Stage 2  new_rag/stage1_embed.py    → reads text files → embeds them (NOT used by ChromaDB)
Stage 3  new_rag/stage2_cluster.ts  → clusters chunks by similarity
Stage 4  new_rag/stage3_rechunk.py  → re-chunks → new_rag/rechunked_results/ALL.rechunked.json
Stage 5  new_rag/stage4_reembed.py  → re-embeds rechunked data → new_rag/embedding2_results/
Stage 6  new_rag/stage5_store_chroma.py → loads embedding2_results → stores in ChromaDB
Stage 7  new_rag/stage6_query.py    → developer asks question → code is generated
```

> **Note:** `stage_embed_new.py` is a shortcut/bypass script. It skips cluster+rechunk. Not part of the main flow above.

---

## Change 1 — Fix broken file path in `stage1_embed.py`

**File:** `new_rag/stage1_embed.py` line 11

**Problem:** Script looked for text files in wrong folder. Used `../rag/text-results` (goes up one level, then into rag). But script runs from project root, so path was wrong. No files found → no embeddings.

**Before:**
```python
TEXT_RESULTS_DIR = "../rag/text-results"
```

**After:**
```python
TEXT_RESULTS_DIR = "rag/text-results"
```

**Simple analogy:** You're standing in your house. You want to go to the kitchen. You said "go outside, then go to the kitchen" — but the kitchen is already inside. Just say "go to the kitchen."

---

## Change 2 — Fix duplicate ID crash in `stage5_store_chroma.py`

**File:** `new_rag/stage5_store_chroma.py`

**Problem:** ChromaDB rejected batches when two chunks had the same ID. This happened because some components produced identical chunk content (same prop name, same text). The script crashed with `DuplicateIDError`.

**Fix:** Track IDs already added in a `seen_ids` set. Skip any chunk whose ID was already added.

**Before:**
```python
for chunk in chunks:
    chunk_id = stable_chunk_id(...)
    ids.append(chunk_id)
    # ← no check, crash if duplicate
```

**After:**
```python
seen_ids = set()

for chunk in chunks:
    chunk_id = stable_chunk_id(...)
    if chunk_id in seen_ids:
        continue          # skip duplicate, no crash
    seen_ids.add(chunk_id)
    ids.append(chunk_id)
```

**Simple analogy:** You're adding people to a guest list. You check "is this person already on the list?" before writing their name. If yes, skip. No duplicates.

---

## Change 3 — Fix 46 empty schemas in `parser/stage4_schema.ts`

**File:** `parser/stage4_schema.ts`

**Problem:** Parser looked for a single `.d.ts` file instead of all files in a folder. Result: 46 components had empty schema `{}` — no props, no types, nothing to index.

**Before (wrong — reads one file):**
```ts
const file = "path/to/one-file.d.ts";
```

**After (correct — reads all files in folder):**
```ts
const files = glob.sync("path/to/folder/**/*.d.ts");
```

**Simple analogy:** You want to read all books in a library. Before, you only picked up one book. Now you grab everything on the shelf.

---

## Change 4 — Fix Unicode crash in `rag/write_fields.py`

**Problem:** Script crashed on Windows when a component had non-ASCII characters (e.g. accented letters, arrows like `→`). Python's default encoding on Windows is not UTF-8.

**Fix:** Run the script with UTF-8 forced:

```bash
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python rag/write_fields.py
```

**Simple analogy:** Your printer only prints English letters by default. You tell it "also print special characters" before printing.

---

## Change 5 — Add `package` metadata to ChromaDB chunks

**File:** `new_rag/stage5_store_chroma.py`

**Problem:** ChromaDB stored each chunk with `component: "alert"` but no info on *which npm package* that component comes from. So when the LLM generated code, it guessed the import:

```tsx
import { Alert } from "???";  // hallucinated or wrong
```

**Fix:** Added a `get_package()` function that reads the component filename prefix to derive the npm package name automatically.

```python
PACKAGE_NAMES = {
    "common-ui":           "@siemens-disw-hav/common-ui",
    "common-ui-icons":     "@siemens-disw-hav/common-ui-icons",
    "common-ui-templates": "@siemens-disw-hav/common-ui-templates",
}

def get_package(component_name: str) -> str:
    for prefix, pkg in PACKAGE_NAMES.items():
        if component_name.startswith(prefix):
            return pkg
    return ""
```

**How it works:** Component files are named like `common-ui.alert.alerts`. The prefix `common-ui` maps to `@siemens-disw-hav/common-ui`. So:

| File name | Detected package |
|-----------|-----------------|
| `common-ui.alert.alerts` | `@siemens-disw-hav/common-ui` |
| `common-ui-icons.addicon.addicon` | `@siemens-disw-hav/common-ui-icons` |
| `common-ui-templates.aboutdialog.aboutdialog` | `@siemens-disw-hav/common-ui-templates` |

Now every chunk stored in ChromaDB has `package: "@siemens-disw-hav/common-ui"` in its metadata. The query stage can read this and tell the LLM the correct import path.

**Result — generated code now gets correct import:**
```tsx
import { Alert } from "@siemens-disw-hav/common-ui";
```

---

## Change 6 — Store `keywords` and `cluster_id` in ChromaDB metadata

**File:** `new_rag/stage5_store_chroma.py`

**Problem:** The rechunking stage (`stage4_reembed.py`) produces structured `keywords` and `cluster_id` per chunk. These were thrown away at ingest time — not stored in ChromaDB. Wasted signal for search.

**Fix:** Added two fields to the metadata dict:

```python
metadata = {
    "component": component_name,
    "package":   get_package(component_name),   # NEW (Change 5)
    "type":      chunk.get("type", ""),
    "title":     chunk.get("title", ""),
    "prop":      chunk.get("prop", ""),
    "interface": chunk.get("interface", ""),
    "keywords":  " ".join(chunk.get("keywords", [])),   # NEW
    "cluster_id": str(chunk.get("cluster_id", "")),     # NEW
    "parent_id": chunk.get("parent_id", ""),
    "token_est": len(text.split()),
}
```

**Why keywords matter:** A chunk about the `onClick` prop might have keywords `["click", "event", "handler", "button"]`. BM25 keyword search now has structured signal, not just raw text.

**Why cluster_id matters:** Chunks from the same semantic cluster can be grouped together in retrieval results, giving the LLM better context.

---

## What still needs doing (not built yet)

| Gap | What it fixes |
|-----|--------------|
| Prop registry + hard check | LLM generates fake props → system catches and rejects |
| tsc compile loop | Generated code has type errors → auto-fix before showing user |
| Canonical example per component | LLM copies real usage shape instead of guessing |
| Inject `package` into query prompt | LLM uses correct import path in generated code |
| Eval set | Measure if changes actually make system better or worse |

---

## How to re-run the pipeline after changes

After any code change to stages 5–6, rebuild ChromaDB:

```bash
# From project root
python new_rag/stage4_reembed.py    # re-embed rechunked data
python new_rag/stage5_store_chroma.py  # rebuild ChromaDB with new metadata
```

Then test a query:
```bash
python new_rag/stage6_query.py
```
