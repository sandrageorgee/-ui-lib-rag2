# write_fields.py
import json
import os

ROOT = "data/mini-ui-lib/components"


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
    """
    Build natural language sentences about inheritance.
    Rules:
    - If extends is a React type → explain it gives access to HTML element props
    - If extends is a custom type → explain it inherits those props
    - If multiple extends → describe each one
    - Never hardcode component names — derive from the extends value itself
    """
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


# ================= PARSER =================
def parse_properties(
    props,
    required_list,
    interface_name,
    component_name,
    already_written: set,
    extends_info: str = ""
):
    lines = []

    # ✅ Build extends sentences once per interface block
    extends_sentences = build_extends_sentence(extends_info)

    # ✅ Write extends ONCE at the top of this interface block
    # Clearly attached to the interface — not to any individual prop
    if extends_sentences:
        for sentence in extends_sentences:
            lines.append(sentence)
        lines.append("")

    for prop, val in props.items():
        key = (interface_name, prop)

        # Skip already written props entirely
        if key in already_written:
            continue

        already_written.add(key)

        data_type = resolve_type(val)
        is_required = prop in required_list
        description = generate_description(prop, val)
        accepted = generate_accepted_values(val, data_type)

        # Each prop block is fully self-contained
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


# ================= MAIN EXTRACTION =================
def extract_schema(schema, component_name, already_written: set):
    lines = []

    lines.append(f"Component: {component_name}")
    lines.append("=" * 60)
    lines.append("")

    if "interface" in schema:
        lines.append(f"Interface: {schema['interface']}")
        lines.append("")

    # ✅ Build extends_info string from schema — single source of truth
    extends_info = ""
    if "extends" in schema:
        extends = schema["extends"]
        if isinstance(extends, list):
            extends_info = ", ".join(extends)
        else:
            extends_info = extends

        lines.append(f"Extends: {extends_info}")
        lines.append("")

    lines.append(
        f"Allows additional props: {schema.get('additionalProperties', False)}"
    )
    lines.append("")
    lines.append("-" * 60)
    lines.append("")

    definitions = schema.get("definitions", {})

    # ✅ Top-level props — interface header shown before props
    top_props = schema.get("properties", {})
    top_required = schema.get("required", [])

    if top_props:
        lines.append("Component Props:")
        lines.append("")
        lines.append(f"Interface: {schema.get('interface', '')}")
        lines.append("")
        lines.extend(
            parse_properties(
                top_props,
                top_required,
                schema.get("interface", ""),
                component_name,
                already_written,
                extends_info  # ✅ extends passed — written once at top of block
            )
        )

    # ✅ Definitions — each gets its own interface header
    if definitions:
        for def_name, definition in definitions.items():
            props = get_properties(definition)
            required = get_required(definition)

            if not props:
                continue

            lines.append(f"Definition: {def_name}")
            lines.append(f"Interface: {def_name}")
            lines.append("")
            lines.extend(
                parse_properties(
                    props,
                    required,
                    def_name,
                    component_name,
                    already_written,
                    extends_info  # ✅ extends passed — written once at top of block
                )
            )

    return lines


# ================= MAIN =================
def main():
    for component in os.listdir(ROOT):
        comp_path = os.path.join(ROOT, component)

        if not os.path.isdir(comp_path):
            continue

        schema_file = os.path.join(
            comp_path,
            f"final.{component}.schema.json"
        )

        if not os.path.exists(schema_file):
            continue

        with open(schema_file, "r") as f:
            content = f.read().strip()

        if not content:
            print(f"⚠️  Skipping {component}: schema file is empty")
            continue

        try:
            schemas = json.loads(content)
        except json.JSONDecodeError as e:
            print(f"⚠️  Skipping {component}: invalid JSON — {e}")
            continue

        lines = []
        already_written: set = set()

        if isinstance(schemas, list):
            for schema in schemas:
                lines.extend(extract_schema(schema, component, already_written))
                lines.append("\n" + "=" * 80 + "\n")
        else:
            lines = extract_schema(schemas, component, already_written)

        output_file = os.path.join(
            comp_path,
            f"text.{component}.txt"
        )

        with open(output_file, "w") as file:
            file.write("\n".join(lines))

        print(f"✅ Generated: {output_file}")


if __name__ == "__main__":
    main()