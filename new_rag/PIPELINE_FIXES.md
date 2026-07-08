# RAG Pipeline Fixes

## Problems Found

### Problem 1: stage2_cluster.ts read from wrong folder

`stage2_cluster.ts` was reading from `new_rag/embedding_results/` (old stale pipeline output) instead of `new_rag/embedding2_results/` (stage1's output).

The old `embedding_results/` folder contained files where **all icons were merged into a single file** (e.g., `embeddings.common-ui-icons.activityicon.activityicon.json` actually contained chunks from all 50+ icons). This caused stage2 to cluster props **across different icon components**, mixing `ActivityiconProps.variant` with `AddiconProps.variant`, `StopiconProps.variant`, etc.

### Problem 2: stage2 file filter did not match stage1 output filenames

Stage1 outputs files named `embeddings2.*.json` (with the "2").
Stage2 filtered for `embeddings.*.json` (without the "2") — so it would find zero files from stage1 even after fixing the folder.

### Problem 3: stage4_reembed.py overwrote stage1's output

`stage4_reembed.py` wrote its re-embedded cluster chunks to `new_rag/embedding2_results/` — the same folder stage1 writes to. This caused stage4's mega-cluster blobs to overwrite stage1's clean per-component chunks.

The stage4 output was corrupted: each file contained a single chunk with:
- A `props` array of 50+ repeated prop names (one entry per icon that shared that prop)
- A `text` field concatenating all 50+ icons' prop descriptions into one wall of text
- An `Interfaces` list containing every icon interface (e.g., `ActivityiconProps`, `AddiconProps`, `StopiconProps`, ...)

### Problem 4: stage5_store_chroma.py read from the overwritten folder

`stage5_store_chroma.py` read from `new_rag/embedding2_results/`, which after stage4 ran contained the corrupted cluster blobs rather than clean stage1 chunks.

---

## Root Cause Chain

```
Old embedding_results/ had ALL icons in one file
  → stage2 read that file → clustered across icons (all share variant/disabled → high cosine similarity)
  → stage3 merged them into giant multi-icon text blobs
  → stage4 re-embedded those blobs → wrote to embedding2_results/ (overwriting stage1 output)
  → stage5 read embedding2_results/ → stored corrupted data in ChromaDB
```

---

## Fixes Applied

### Fix 1: `new_rag/stage2_cluster.ts` — line 4

Changed the input directory to point to stage1's output:

```typescript
// Before:
const EMBEDDING_DIR = "new_rag/embedding_results";

// After:
const EMBEDDING_DIR = "new_rag/embedding2_results";
```

### Fix 2: `new_rag/stage2_cluster.ts` — line 179 (file filter)

Updated the file name filter to match stage1's output naming convention:

```typescript
// Before:
const files = fs.readdirSync(EMBEDDING_DIR).filter(
    (f: string) => f.startsWith("embeddings.") && f.endsWith(".json")
);

// After:
const files = fs.readdirSync(EMBEDDING_DIR).filter(
    (f: string) => f.startsWith("embeddings2.") && f.endsWith(".json")
);
```

### Fix 3: `new_rag/stage2_cluster.ts` — line 94 (component name extraction)

Updated the component name extraction to strip the correct prefix:

```typescript
// Before:
const componentName = file.replace("embeddings.", "").replace(".json", "");

// After:
const componentName = file.replace("embeddings2.", "").replace(".json", "");
```

### Fix 4: `new_rag/stage4_reembed.py` — line 11

Changed stage4's output directory so it no longer overwrites stage1's output:

```python
# Before:
OUTPUT_DIR = "new_rag/embedding2_results"

# After:
OUTPUT_DIR = "new_rag/embedding3_results"
```

### Fix 5: `new_rag/stage5_store_chroma.py` — line 9

Updated stage5 to read from stage4's new output directory:

```python
# Before:
EMBEDDING_RESULTS_DIR = "new_rag/embedding2_results"

# After:
EMBEDDING_RESULTS_DIR = "new_rag/embedding3_results"
```

---

## Corrected Pipeline Flow

```
stage1_embed.py
  Reads  : parser/parsing-results/final.*.schema.json
  Writes : new_rag/embedding2_results/embeddings2.*.json
  Output : one file per component, clean typed chunks (prop/enum/imports/demo/story/...)

stage2_cluster.ts
  Reads  : new_rag/embedding2_results/embeddings2.*.json   ← FIXED
  Writes : new_rag/clustering_results/clustering.*.json
  Output : clusters of related props WITHIN the same component only

stage3_rechunk.py
  Reads  : new_rag/clustering_results/clustering.*.json
  Writes : new_rag/rechunked_results/rechunked.*.json
  Output : merged text chunks per cluster

stage4_reembed.py
  Reads  : new_rag/rechunked_results/rechunked.*.json
  Writes : new_rag/embedding3_results/                      ← FIXED (was embedding2_results)
  Output : re-embedded cluster chunks

stage5_store_chroma.py
  Reads  : new_rag/embedding3_results/                      ← FIXED (was embedding2_results)
  Writes : new_rag/chroma_db/
  Output : ChromaDB vector store

stage6_query.py
  Reads  : new_rag/chroma_db/
```

---

## Effect of Fixes

Before: clustering mixed props from all 50+ icon components together (because they all shared `variant` and `disabled` props with high cosine similarity, and all lived in one file).

After: each `embeddings2.*.json` file contains exactly one icon component's chunks. Stage2 processes each file independently, so clustering is scoped to that single component. `ActivityiconProps.variant` will only cluster with other `ActivityiconProps` chunks, never with `AddiconProps.variant`.
