import os
from tree_sitter_languages import get_parser

ROOT = "./data/mini-ui-lib/components"

parser = get_parser("tsx")

results = []


def get_files(root):
    files = []
    for root_dir, _, filenames in os.walk(root):
        for f in filenames:
            if f.endswith(".tsx") or f.endswith(".ts"):
                files.append(os.path.join(root_dir, f))
    return files


def extract_component_name(code):
    tree = parser.parse(bytes(code, "utf8"))
    root = tree.root_node

    component = ""

    def walk(node):
        nonlocal component

        # function component
        if node.type == "function_declaration":
            name = node.child_by_field_name("name")
            if name:
                component = code[name.start_byte:name.end_byte]

        # arrow function component
        if node.type == "variable_declarator":
            name = node.child_by_field_name("name")
            value = node.child_by_field_name("value")

            if name and value:
                if value.type in ["arrow_function", "function"]:
                    component = code[name.start_byte:name.end_byte]

        for child in node.children:
            walk(child)

    walk(root)
    return component


files = get_files(ROOT)

for file in files:
    with open(file, "r") as f:
        code = f.read()

    component = extract_component_name(code)

    if component:
        results.append({
            "parser": "tree-sitter",
            "component": component,
            "file": file
        })

print(results)