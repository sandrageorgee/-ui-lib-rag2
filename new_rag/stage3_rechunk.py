# new_rag/stage3_rechunk.py
import json
import os
from collections import defaultdict

INPUT_DIR = "new_rag/clustering_results"
OUTPUT_DIR = "new_rag/rechunked_results"

print("🚀 Starting rechunking...")

all_rechunked = []

for file in os.listdir(INPUT_DIR):
    if not file.startswith("clustering.") or not file.endswith(".json"):
        continue

    component_name = file.replace("clustering.", "").replace(".json", "")
    input_path = os.path.join(INPUT_DIR, file)

    print(f"\n📦 Processing: {component_name}")

    with open(input_path, "r", encoding='utf-8') as f:
        clusters = json.load(f)

    component_rechunked = []

    for cluster in clusters:
        cluster_id = cluster["cluster_id"]
        size = cluster["size"]
        keywords = cluster["keywords"]
        items = cluster["items"]

        # Single item cluster — keep as is, no merging needed
        if size == 1:
            item = items[0]
            component_rechunked.append({
                "cluster_id": cluster_id,
                "component": component_name,
                "interface": item.get("interface", ""),
                "props": [item.get("prop", "")],
                "keywords": keywords,
                "size": 1,
                "text": item.get("text", "").strip()
            })
            continue

        # Multiple items — merge into one rich context block
        interfaces = list({item.get("interface", "") for item in items})
        props = [item.get("prop", "") for item in items]

        merged_text = (
            f"Component: {component_name}\n"
            f"Cluster: {cluster_id}\n"
            f"Related props: {', '.join(props)}\n"
            f"Interfaces: {', '.join(interfaces)}\n"
            f"Keywords: {', '.join(keywords)}\n"
            + "=" * 60 + "\n\n"
        )

        for item in items:
            merged_text += (
                f"[{component_name} / "
                f"{item.get('interface', '')} / "
                f"{item.get('prop', '')}]\n"
            )
            merged_text += item.get("text", "").strip()
            merged_text += "\n\n" + "-" * 40 + "\n\n"

        component_rechunked.append({
            "cluster_id": cluster_id,
            "component": component_name,
            "interfaces": interfaces,
            "props": props,
            "keywords": keywords,
            "size": size,
            "text": merged_text
        })

    # Save per component
    output_path = os.path.join(OUTPUT_DIR, f"rechunked.{component_name}.txt")
    print("output_path: ", output_path, OUTPUT_DIR)
    with open(output_path, "w") as f:
        for chunk in component_rechunked:
            f.write(chunk.get("text") + "\n ------------------- \n")

    print(f"  ✅ {len(component_rechunked)} chunks → {output_path}")

    all_rechunked.extend(component_rechunked)

# Save one global file too
global_path = os.path.join(OUTPUT_DIR, "ALL.rechunked.json")
with open(global_path, "w") as f:
    json.dump(all_rechunked, f, indent=2)

print(f"\n📊 Total rechunked blocks: {len(all_rechunked)}")
print(f"✅ Saved global: {global_path}")
print("🎉 DONE")