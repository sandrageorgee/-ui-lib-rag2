"""
run_pipeline.py
Runs all RAG pipeline stages in order.
"""

import subprocess
import sys


def run(label: str, cmd: list[str]):
    print(f"\n{'='*60}")
    print(f"▶  {label}")
    print(f"{'='*60}\n")

    result = subprocess.run(cmd)

    if result.returncode != 0:
        print(f"\n❌ {label} failed (exit code {result.returncode}). Stopping.")
        sys.exit(result.returncode)

    print(f"\n✅ {label} done.")


if __name__ == "__main__":
    run("Stage 0 — Parser Pipeline",  ["npx", "tsx", "parser/pipeline.ts"])
    run("Stage 1 — Write Fields",     ["python3", "rag/write_fields.py"])
    run("Stage 2 — Embed",            ["python3", "stage1_embed.py"])
    run("Stage 3 — Cluster",          ["npx", "tsx", "stage2_cluster.ts"])
    run("Stage 4 — Rechunk",          ["python3", "stage3_rechunk.py"])
    run("Stage 5 — Reembed",          ["python3", "stage4_reembed.py"])
    run("Stage 6 — Store Chroma",     ["python3", "stage5_store_chroma.py"])
    run("Stage 7 — Query",            ["python3", "stage6_query.py"])