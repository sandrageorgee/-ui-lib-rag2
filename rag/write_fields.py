# write_fields.py
import json
import os
import glob

# New schema files live in parser/parsing-results/
SCHEMA_DIR = os.path.join(
    os.path.dirname(__file__),
    "../parser/parsing-results"
)

# Text output goes to rag/text-results/
OUTPUT_DIR = os.path.join(
    os.path.dirname(__file__),
    "text-results"
)


# ================= TYPE RESOLUTION =================
def resolve_type(val):
    if "anyOf" in val:
        types = []
        for item in val["anyOf"]:
            if item.get("type") == "null":
                continue
            if "$ref" in item:
                types.append(item["$ref"].split("/")[-1])
            elif "type" in item:
                types.append(item["type"])
        return " | ".join(types) if types else "any"

    if "$ref" in val:
        return val["$ref"].split("/")[-1]

    if val.get("type") == "array":
        items = val.get("items", {})
        if "$ref" in items:
            return items["$ref"].split("/")[-1] + "[]"
        if "type" in items:
            return items["type"] + "[]"
        return "array"

    if isinstance(val.get("type"), list):
        return " | ".join(t for t in val["type"] if t != "null")

    if isinstance(val.get("type"), dict):
        return str(val["type"])

    return val.get("type", "any")


# ================= DESCRIPTION =================
def generate_description(prop, val):
    if "description" in val:
        return val["description"]

    prop_lower = prop.lower()

    if prop_lower == "children":
        return "Nested elements inside this structure."
    if prop_lower == "data":
        return "Data used to populate the component."
    if "expand" in prop_lower:
        return "Controls expand and collapse behavior."

    return f"Controls the '{prop}' behavior of the component."


# ================= ACCEPTED VALUES =================
def generate_accepted_values(val, data_type):
    if val.get("enum"):
        enum = val["enum"]
        if isinstance(enum, dict):
            return list(enum.values())
        return [str(v) for v in enum]

    if "anyOf" in val:
        types = []
        for item in val["anyOf"]:
            if item.get("type") == "null":
                continue
            if "$ref" in item:
                types.append(item["$ref"].split("/")[-1])
            elif "type" in item:
                types.append(item["type"])
        return types if types else [data_type]

    if isinstance(data_type, str) and data_type.endswith("[]"):
        return [f"Array of {data_type.replace('[]', '')}"]

    return [str(data_type)]


# ================= USAGE =================
def generate_usage(prop, interface_name, component_name):
    return (
        f"The '{prop}' prop is used in the {interface_name} "
        f"interface of the {component_name} component."
    )


# ================= EXTENDS SENTENCE =================
def build_extends_sentence(extends_info: str) -> list:
    if not extends_info:
        return []

    lines = []
    extends_list = (
        [e.strip() for e in extends_info.split(",")]
        if "," in extends_info
        else [extends_info.strip()]
    )

    for ext in extends_list:
        ext = ext.strip()
        if not ext:
            continue

        if ext.startswith("React."):
            base = ext.replace("React.", "")
            if "<" in base:
                attr_type = base.split("<")[0]
                element_type = base.split("<")[1].rstrip(">")
                lines.append(
                    f"Extends: {ext} — this interface inherits all standard "
                    f"{attr_type} props for {element_type}, meaning it accepts "
                    f"all native HTML attributes for that element in addition to "
                    f"its own props."
                )
            else:
                lines.append(
                    f"Extends: {ext} — this interface inherits React "
                    f"{base} props in addition to its own props."
                )
        else:
            lines.append(
                f"Extends: {ext} — this interface inherits all props "
                f"from {ext} in addition to its own props."
            )

    return lines


# ================= HANDLE allOf =================
def get_properties(definition):
    props = {}
    if "properties" in definition:
        props.update(definition["properties"])
    if "allOf" in definition:
        for item in definition["allOf"]:
            if "properties" in item:
                props.update(item["properties"])
    return props


def get_required(definition):
    required = set()
    if "required" in definition:
        required.update(definition["required"])
    if "allOf" in definition:
        for item in definition["allOf"]:
            if "required" in item:
                required.update(item["required"])
    return list(required)


# ================= PROP PARSER =================
def parse_properties(
    props,
    required_list,
    interface_name,
    component_name,
    already_written: set,
    extends_info: str = ""
):
    lines = []

    extends_sentences = build_extends_sentence(extends_info)
    if extends_sentences:
        for sentence in extends_sentences:
            lines.append(sentence)
        lines.append("")

    for prop, val in props.items():
        key = (interface_name, prop)

        if key in already_written:
            continue
        already_written.add(key)

        data_type   = resolve_type(val)
        is_required = prop in required_list
        description = generate_description(prop, val)
        accepted    = generate_accepted_values(val, data_type)

        lines.append(f"Component: {component_name}")
        lines.append(f"Interface: {interface_name}")
        lines.append(f"Prop: {prop}")
        lines.append("")
        lines.append(
            f"The '{prop}' prop belongs to the {interface_name} interface "
            f"in the {component_name} component."
        )
        lines.append(f"Type: {data_type}")
        lines.append(f"Required: {'Yes' if is_required else 'No'}")
        lines.append("")

        lines.append("Description:")
        lines.append(description)
        lines.append("")

        lines.append("Accepted values:")
        for v in accepted:
            lines.append(f"- {v}")
        lines.append("")

        lines.append("Usage:")
        lines.append(generate_usage(prop, interface_name, component_name))
        lines.append("")

        lines.append("-" * 40)
        lines.append("")

    return lines


# ================= DEFAULT VALUES SECTION =================
def write_default_values(default_values: dict) -> list:
    if not default_values:
        return []
    lines = ["Default Values:"]
    for prop, value in default_values.items():
        lines.append(f"  {prop}: {value}")
    lines.append("")
    return lines


# ================= CSS CLASSES SECTION =================
def write_css_classes(css_classes: list) -> list:
    if not css_classes:
        return []
    lines = ["CSS Classes:"]
    for cls in css_classes:
        lines.append(f"  - {cls}")
    lines.append("")
    return lines


# ================= DOCS SECTION =================
def write_docs(docs: dict) -> list:
    if not docs:
        return []

    lines = []

    # --- import statement ---
    if docs.get("imports"):
        lines.append("Import:")
        lines.append(f"  {docs['imports']}")
        lines.append("")

    # --- demo examples ---
    demos = docs.get("demos", [])
    if demos:
        lines.append("Demo Examples:")
        lines.append("")
        for demo in demos:
            lines.append(f"  --- {demo['label']} ---")
            # code is stored as string[] (one entry per line)
            for code_line in demo.get("code", []):
                lines.append(f"  {code_line}")
            lines.append("")

    # --- storybook stories ---
    stories = docs.get("stories", [])
    if stories:
        lines.append("Storybook Stories:")
        lines.append("")
        for story in stories:
            lines.append(f"  --- {story['label']} ---")
            args = story.get("args", {})
            if args:
                arg_pairs = ", ".join(f"{k}={v}" for k, v in args.items())
                lines.append(f"  Props: {arg_pairs}")
            lines.append("")

    return lines


# ================= MAIN EXTRACTION (per schema item) =================
def extract_schema(schema, already_written: set) -> list:
    lines = []

    component_name  = schema.get("component", "unknown")
    interface_name  = schema.get("interface", "")
    description     = schema.get("description", "")
    dependencies    = schema.get("dependencies", [])
    default_values  = schema.get("defaultValues", {})
    css_classes     = schema.get("cssClasses", [])
    docs            = schema.get("docs", {})

    # --- header ---
    lines.append(f"Component: {component_name}")
    lines.append("=" * 60)
    lines.append("")

    if interface_name:
        lines.append(f"Interface: {interface_name}")
        lines.append("")

    if description:
        lines.append("Description:")
        lines.append(description)
        lines.append("")

    if dependencies:
        lines.append(f"Dependencies: {', '.join(dependencies)}")
        lines.append("")

    lines.append(
        f"Allows additional props: {schema.get('additionalProperties', False)}"
    )
    lines.append("")
    lines.append("-" * 60)
    lines.append("")

    # --- extends (kept for backwards compat if field ever exists) ---
    extends_info = ""
    if "extends" in schema:
        extends = schema["extends"]
        extends_info = ", ".join(extends) if isinstance(extends, list) else extends
        lines.append(f"Extends: {extends_info}")
        lines.append("")

    # --- default values ---
    lines.extend(write_default_values(default_values))

    # --- css classes ---
    lines.extend(write_css_classes(css_classes))

    # --- docs (import + demos + stories) ---
    lines.extend(write_docs(docs))

    # --- props ---
    top_props    = get_properties(schema)
    top_required = get_required(schema)

    if top_props:
        lines.append("Component Props:")
        lines.append("")
        lines.append(f"Interface: {interface_name}")
        lines.append("")
        lines.extend(
            parse_properties(
                top_props,
                top_required,
                interface_name,
                component_name,
                already_written,
                extends_info
            )
        )

    return lines


# ================= MAIN =================
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    schema_files = sorted(glob.glob(os.path.join(SCHEMA_DIR, "final.*.schema.json")))

    if not schema_files:
        print(f"⚠️  No schema files found in {SCHEMA_DIR}")
        return

    for schema_path in schema_files:
        filename = os.path.basename(schema_path)  # e.g. final.alert.alerts.schema.json

        with open(schema_path, "r", encoding="utf-8") as f:
            content = f.read().strip()

        if not content:
            print(f"⚠️  Skipping {filename}: empty file")
            continue

        try:
            schemas = json.loads(content)
        except json.JSONDecodeError as e:
            print(f"⚠️  Skipping {filename}: invalid JSON — {e}")
            continue

        if not isinstance(schemas, list):
            schemas = [schemas]

        lines: list = []
        already_written: set = set()

        for schema in schemas:
            lines.extend(extract_schema(schema, already_written))
            lines.append("\n" + "=" * 80 + "\n")

        # output name mirrors the schema filename: text.alert.alerts.txt
        txt_name    = filename.replace("final.", "text.").replace(".schema.json", ".txt")
        output_path = os.path.join(OUTPUT_DIR, txt_name)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        print(f"✅ Generated: {txt_name}")


if __name__ == "__main__":
    main()
