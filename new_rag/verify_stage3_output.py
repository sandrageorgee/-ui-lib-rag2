"""
Quick check: does ALL.rechunked.json (Stage 3 output) now have a
non-default "type" on every chunk?

Run from new_rag/:
    python verify_stage3_output.py
"""
import json
from collections import Counter

with open("rechunked_results/ALL.rechunked.json") as f:
    chunks = json.load(f)

print(f"Total chunks: {len(chunks)}")

missing_type = [c for c in chunks if "type" not in c]
print(f"Chunks missing 'type' key entirely: {len(missing_type)}")

type_counts = Counter(c.get("type", "<MISSING>") for c in chunks)
print("\nType distribution across all components:")
for t, count in type_counts.most_common():
    print(f"  {t:<25} {count}")

# Specifically check button.button since that's what we diagnosed earlier
button_chunks = [c for c in chunks if c.get("component") == "button"]
print(f"\n--- button component: {len(button_chunks)} chunks ---")
for c in button_chunks:
    print(f"  type={c.get('type', '<MISSING>'):<20} props={c.get('props', [])}")