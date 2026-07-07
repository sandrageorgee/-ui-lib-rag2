"""
Look closely at the chunks where prop='' to see what they actually are.
Run from new_rag/:
    python check_blank_prop_chunks.py
"""
import json

with open("embedding2_results/embeddings2.button.button.json") as f:
    data = json.load(f)

chunks = data if isinstance(data, list) else data.get("chunks", data.get("items", [data]))

print(f"Total chunks: {len(chunks)}\n")

blank_count = 0
for i, chunk in enumerate(chunks):
    prop_val = chunk.get("prop", "")
    if prop_val == "":
        blank_count += 1
        print(f"{'='*70}")
        print(f"[{i}] BLANK PROP CHUNK")
        print(f"{'='*70}")
        print(f"  type:       {chunk.get('type')!r}")
        print(f"  prop:       {chunk.get('prop')!r}")
        print(f"  props:      {chunk.get('props')!r}")
        print(f"  interface:  {chunk.get('interface')!r}")
        print(f"  keywords:   {chunk.get('keywords')!r}")
        print(f"  text:\n{chunk.get('text', '')[:500]}")
        print()

print(f"\n{blank_count} / {len(chunks)} chunks have a blank 'prop' field")