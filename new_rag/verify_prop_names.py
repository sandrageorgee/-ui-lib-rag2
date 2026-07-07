"""
After the Stage 3 type fix + re-running Stage 4/5, check specifically:
for chunks where type == 'prop', is the prop name actually filled in?

Run from new_rag/:
    python verify_prop_names.py
"""
import json
import glob
import os

EMBEDDING_RESULTS_DIR = "embedding2_results"

files = sorted(glob.glob(os.path.join(EMBEDDING_RESULTS_DIR, "embeddings2.*.json")))

total_prop_type = 0
blank_prop_name = 0
examples_blank = []

for path in files:
    with open(path) as f:
        chunks = json.load(f)

    for c in chunks:
        if c.get("type") == "prop":
            total_prop_type += 1
            prop_val = c.get("prop", "")
            if not prop_val:
                blank_prop_name += 1
                examples_blank.append({
                    "file": os.path.basename(path),
                    "component": c.get("component"),
                    "interface": c.get("interface"),
                    "text_preview": c.get("text", "")[:150],
                })

print(f"Total chunks with type='prop': {total_prop_type}")
print(f"Of those, chunks with a BLANK prop name: {blank_prop_name}")

if examples_blank:
    print(f"\nFirst {min(5, len(examples_blank))} examples still missing a prop name:\n")
    for ex in examples_blank[:5]:
        print(f"  file: {ex['file']}")
        print(f"  component: {ex['component']} | interface: {ex['interface']}")
        print(f"  text: {ex['text_preview']}")
        print()
else:
    print("\n✅ Every type='prop' chunk has a real prop name.")