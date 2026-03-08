import os
from typing import List, Dict

# ===============================
# CONFIG
# ===============================

SUPPORTED_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx")

IGNORED_DIRS = {
    "node_modules",
    "dist",
    "build",
    ".git",
    ".storybook",
    "coverage",
    "__pycache__"
}


# ===============================
# HELPERS
# ===============================

def is_valid_file(filename: str) -> bool:
    return filename.endswith(SUPPORTED_EXTENSIONS)


def extract_component_name(path: str) -> str:
    """
    Assumes structure:
    components/Button/Button.tsx
    """
    parts = path.split(os.sep)

    if "components" in parts:
        idx = parts.index("components")
        if idx + 1 < len(parts):
            return parts[idx + 1]

    return "unknown"


# ===============================
# MAIN LOADER
# ===============================

def load_codebase(root_dir: str) -> List[Dict]:
    documents = []

    for root, dirs, files in os.walk(root_dir):

        # Remove ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]

        for file in files:

            if not is_valid_file(file):
                continue

            path = os.path.join(root, file)

            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()

                documents.append({
                    "file_path": path,
                    "file_name": file,
                    "component": extract_component_name(path),
                    "extension": os.path.splitext(file)[1],
                    "content": content
                })

            except Exception as e:
                print(f"❌ Failed loading {path}: {e}")

    return documents


# ===============================
# DEBUG RUN
# ===============================

if __name__ == "__main__":

    ROOT = "data"

    docs = load_codebase(ROOT)

    print(f"\n Loaded {len(docs)} files\n")

    for d in docs[:5]:
        print(d["file_path"])

        