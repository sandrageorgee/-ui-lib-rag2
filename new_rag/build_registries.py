"""
build_registries.py — Build export registry and prop/type registry
Outputs:
  new_rag/export_registry.json   — exported_symbol → { package, source_path }
  new_rag/prop_registry.json     — component_key → { interface, props, required, defaults, ... }

Run once after parser produces schemas, before stage5_store_chroma.py.
"""

import os
import re
import glob
import json

# ── Config ───────────────────────────────────────────────────────────────────
INDEX_TS_FILES = {
    "@siemens-disw-hav/common-ui":           "common-ui/packages/common-ui/src/index.ts",
    "@siemens-disw-hav/common-ui-icons":     "common-ui/packages/common-ui-icons/src/index.ts",
    "@siemens-disw-hav/common-ui-templates": "common-ui/packages/common-ui-templates/src/index.ts",
}

SCHEMA_DIR  = "parser/parsing-results"
OUTPUT_DIR  = "new_rag"

# ── Path resolution ──────────────────────────────────────────────────────────
_script_dir   = os.path.dirname(os.path.abspath(__file__))
_repo_root    = os.path.dirname(_script_dir)

SCHEMA_DIR_ABS = os.path.join(_repo_root, SCHEMA_DIR)
OUTPUT_DIR_ABS = os.path.join(_repo_root, OUTPUT_DIR)
os.makedirs(OUTPUT_DIR_ABS, exist_ok=True)


# ================= EXPORT REGISTRY =================

def build_export_registry() -> dict:
    """
    Parse each index.ts and record every exported symbol → { package, source_path }.
    Handles two patterns common in this codebase:

    Pattern A (re-export):
      export { Foo, Bar } from './components/foo/Foo';

    Pattern B (two-step, dominant in common-ui):
      import Foo from './components/foo/Foo';
      import { IFooProps } from './components/foo/ifoo';
      export { Foo, IFooProps };
    """
    registry = {}   # symbol → { package, source_path }

    for package, index_rel_path in INDEX_TS_FILES.items():
        index_abs = os.path.join(_repo_root, index_rel_path)
        if not os.path.exists(index_abs):
            print(f"WARNING: Not found: {index_abs}")
            continue

        with open(index_abs, "r", encoding="utf-8") as f:
            content = f.read()

        # ── Pass 1: collect import bindings  name → source_path ──────────────
        # Covers both:
        #   import Foo from './path'
        #   import { Foo, Bar } from './path'
        #   import Foo, { Bar } from './path'
        import_map = {}   # local_name → source_path
        for m in re.finditer(
            r"import\s+([\w\s,{}\*]+?)\s+from\s+['\"]([^'\"]+)['\"]", content
        ):
            raw_imports = m.group(1)
            src = m.group(2)
            # default import: the word before '{' or the whole thing if no '{'
            default_part = raw_imports.split("{")[0].strip().rstrip(",").strip()
            if default_part and re.match(r"^\w+$", default_part):
                import_map[default_part] = src
            # named imports inside { }
            brace = re.search(r"\{([^}]+)\}", raw_imports)
            if brace:
                for raw in brace.group(1).split(","):
                    raw = raw.strip()
                    # "default as Foo" → "Foo", "Foo as Bar" → "Bar"
                    name = re.sub(r"^.*\bas\s+", "", raw).strip()
                    if name and re.match(r"^\w+$", name):
                        import_map[name] = src

        # ── Pass 2: collect export { } blocks ────────────────────────────────
        for m in re.finditer(
            r"export\s+\{([^}]+)\}(?:\s+from\s+['\"]([^'\"]+)['\"])?", content
        ):
            src_override = m.group(2)   # None for two-step bare exports
            for raw in m.group(1).split(","):
                raw = raw.strip()
                name = re.sub(r"^.*\bas\s+", "", raw).strip()
                if not name or not re.match(r"^\w+$", name):
                    continue
                src = src_override or import_map.get(name, "")
                registry[name] = {"package": package, "source_path": src}

        print(f"OK {package}: {sum(1 for v in registry.values() if v['package'] == package)} symbols")

    return registry


# ================= COMPONENT HIERARCHY =================

def _is_type_symbol(name: str) -> bool:
    """Interface/type/style/ref exports — not runtime components."""
    if name.startswith("I") and len(name) > 1 and name[1].isupper():
        return True
    return name.endswith(("Props", "Type", "Style", "Ref"))


def build_component_hierarchy(export_registry: dict) -> tuple:
    """
    Derive the component tree from source_path nesting.

    A "value component" is a runtime export (not an interface/type) that lives at
    the leaf convention  ./components/<x>/<x>  (file basename == folder basename).

    Component A is a SUB-COMPONENT of B when A's folder is nested inside B's folder.
    Real example: FilterPanel, TablePanel, AddRowPanel live under dynamictable/ →
    they are parts of DynamicTable, not standalone tables.

    Returns:
      top_level   → { name: { package, source_path } }  (components with no parent)
      hierarchy   → { child_name: parent_name }
    """
    comp_folder = {}   # name → folder dir
    for name, info in export_registry.items():
        src = info.get("source_path", "")
        if not src.startswith("./components/") or _is_type_symbol(name):
            continue
        folder = os.path.dirname(src)
        fbase  = os.path.basename(src)
        dbase  = os.path.basename(folder)
        # leaf convention: file basename == folder basename (case-insensitive)
        if fbase.lower() == dbase.lower():
            comp_folder[name] = folder

    hierarchy = {}   # child → parent (deepest enclosing component)
    for a, da in comp_folder.items():
        best_parent, best_len = None, -1
        for b, db in comp_folder.items():
            if a == b:
                continue
            if da.startswith(db + "/") and len(db) > best_len:
                best_parent, best_len = b, len(db)
        if best_parent:
            hierarchy[a] = best_parent

    top_level = {
        name: export_registry[name]
        for name in comp_folder
        if name not in hierarchy
    }

    print(f"OK Hierarchy: {len(comp_folder)} components, {len(hierarchy)} sub-components, {len(top_level)} top-level")
    return top_level, hierarchy


# ================= PROP REGISTRY =================

def build_prop_registry() -> dict:
    """
    Read every schema JSON file and build:
      component_key → {
        interface,  exported_symbol,  package,
        props: { prop_name: { type, required, enum, default, description } },
        required_props: [...],
        default_values: {...},
        extends: [...],
        css_classes: [...],
        helper_symbols: [...],   # e.g. showAlert
        allows_additional_props: bool,
      }
    """
    registry = {}

    schema_files = sorted(glob.glob(os.path.join(SCHEMA_DIR_ABS, "final.*.schema.json")))
    if not schema_files:
        print(f"ERROR: No schema files in {SCHEMA_DIR_ABS}")
        return registry

    for schema_path in schema_files:
        filename = os.path.basename(schema_path)
        base = filename.replace("final.", "").replace(".schema.json", "")

        with open(schema_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if not content:
            continue

        try:
            schemas = json.loads(content)
        except json.JSONDecodeError:
            continue

        if not isinstance(schemas, list):
            schemas = [schemas]

        for schema in schemas:
            interface_name = schema.get("interface", "")
            docs           = schema.get("docs", {})
            import_str     = docs.get("imports", "")

            # extract exported symbols from import line
            sym_match  = re.search(r"\{([^}]+)\}", import_str)
            all_syms   = []
            main_sym   = ""
            package    = ""
            if sym_match:
                all_syms = [s.strip() for s in sym_match.group(1).split(",") if s.strip() and s.strip()[0].isalpha()]
                main_sym  = next((s for s in all_syms if s and s[0].isupper()), all_syms[0] if all_syms else "")
            pkg_match = re.search(r"from\s+['\"]([^'\"]+)['\"]", import_str)
            if pkg_match:
                package = pkg_match.group(1)

            # helper functions (lowercase exported symbols like showAlert)
            helpers = [s for s in all_syms if s and s[0].islower()]

            props = {}
            for prop_name, prop_def in schema.get("properties", {}).items():
                props[prop_name] = {
                    "type":        prop_def.get("typeName", prop_def.get("type", "unknown")),
                    "required":    prop_name in schema.get("required", []),
                    "enum":        prop_def.get("enum", []),
                    "default":     schema.get("defaultValues", {}).get(prop_name, prop_def.get("default", None)),
                    "description": prop_def.get("description", ""),
                }

            extends = schema.get("extends", [])
            if isinstance(extends, str):
                extends = [extends]

            registry[base] = {
                "interface":             interface_name,
                "exported_symbol":       main_sym,
                "package":               package,
                "props":                 props,
                "required_props":        schema.get("required", []),
                "default_values":        schema.get("defaultValues", {}),
                "extends":               extends,
                "css_classes":           schema.get("cssClasses", []),
                "helper_symbols":        helpers,
                "allows_additional_props": schema.get("additionalProperties", False),
            }

    print(f"OK Prop registry: {len(registry)} components")
    return registry


# ================= MAIN =================

print("Building registries...")

export_registry = build_export_registry()
top_level, hierarchy = build_component_hierarchy(export_registry)
prop_registry   = build_prop_registry()

export_path    = os.path.join(OUTPUT_DIR_ABS, "export_registry.json")
prop_path      = os.path.join(OUTPUT_DIR_ABS, "prop_registry.json")
top_level_path = os.path.join(OUTPUT_DIR_ABS, "top_level_components.json")
hierarchy_path = os.path.join(OUTPUT_DIR_ABS, "component_hierarchy.json")

with open(export_path, "w", encoding="utf-8") as f:
    json.dump(export_registry, f, indent=2)
print(f"Export registry -> {export_path}  ({len(export_registry)} symbols)")

with open(top_level_path, "w", encoding="utf-8") as f:
    json.dump(top_level, f, indent=2)
print(f"Top-level       -> {top_level_path}  ({len(top_level)} components)")

with open(hierarchy_path, "w", encoding="utf-8") as f:
    json.dump(hierarchy, f, indent=2)
print(f"Hierarchy       -> {hierarchy_path}  ({len(hierarchy)} sub-components)")

with open(prop_path, "w", encoding="utf-8") as f:
    json.dump(prop_registry, f, indent=2)
print(f"Prop registry   -> {prop_path}  ({len(prop_registry)} components)")

print("\nDone")
