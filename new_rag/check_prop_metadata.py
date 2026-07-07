"""
Diagnostic: check whether 'prop' is missing at the SOURCE (embedding json files)
or gets lost when written into ChromaDB (stage5_store_chroma.py).

Run from new_rag/:
    python check_prop_metadata.py
"""
import json
import glob
import os

EMBEDDING_RESULTS_DIR = "embedding2_results"

# Look at button.button specifically since that's what showed blank prop
target_files = glob.glob(os.path.join(EMBEDDING_RESULTS_DIR, "embeddings2.button.button.json"))

if not target_files:
    print(f"❌ Could not find embeddings2.button.button.json in {EMBEDDING_RESULTS_DIR}")
    print("   Available files:")
    for f in sorted(glob.glob(os.path.join(EMBEDDING_RESULTS_DIR, "*.json")))[:10]:
        print(f"     {f}")
else:
    for path in target_files:
        print(f"\n📄 {path}")
        with open(path) as f:
            data = json.load(f)

        # data shape may be a list of chunks or a dict with a chunks key —
        # print raw structure first so we know what we're dealing with
        if isinstance(data, list):
            chunks = data
        elif isinstance(data, dict):
            chunks = data.get("chunks", data.get("items", [data]))
        else:
            chunks = []

        print(f"   {len(chunks)} chunks found\n")

        for i, chunk in enumerate(chunks[:10]):
            # print whatever keys exist so we can see the real field names
            keys = list(chunk.keys()) if isinstance(chunk, dict) else "not a dict"
            prop_val = chunk.get("prop", "<no 'prop' key>") if isinstance(chunk, dict) else "?"
            type_val = chunk.get("type", "<no 'type' key>") if isinstance(chunk, dict) else "?"
            print(f"   [{i}] keys={keys}")
            print(f"       type={type_val!r}  prop={prop_val!r}")