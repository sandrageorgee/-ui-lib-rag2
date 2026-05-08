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
        return [str(v) for v in val["enum"]]

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
    return f"The '{prop}' prop is used in the {interface_name} interface of the {component_name} component."


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
    already_written: set
):
    lines = []

    for prop, val in props.items():
        key = (interface_name, prop)

        # Skip already written props entirely — no note, no block
        if key in already_written:
            continue

        already_written.add(key)

        data_type = resolve_type(val)
        is_required = prop in required_list
        description = generate_description(prop, val)
        accepted = generate_accepted_values(val, data_type)

        # Rich semantic header — gives embedding model strong signal
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

    if "extends" in schema:
        extends = schema["extends"]
        if isinstance(extends, list):
            lines.append(f"Extends: {', '.join(extends)}")
        else:
            lines.append(f"Extends: {extends}")
        lines.append("")

    lines.append(
        f"Allows additional props: {schema.get('additionalProperties', False)}"
    )
    lines.append("")
    lines.append("-" * 60)
    lines.append("")

    definitions = schema.get("definitions", {})

    # Always process top-level properties
    top_props = schema.get("properties", {})
    top_required = schema.get("required", [])

    if top_props:
        lines.append("📌 Component Props:")
        lines.append("")
        lines.extend(
            parse_properties(
                top_props,
                top_required,
                schema.get("interface", ""),
                component_name,
                already_written
            )
        )

    # Process definitions — flat, no inline expansion
    if definitions:
        for def_name, definition in definitions.items():
            props = get_properties(definition)
            required = get_required(definition)

            if not props:
                continue

            lines.append(f"🔹 Definition: {def_name}")
            lines.append("")
            lines.extend(
                parse_properties(
                    props,
                    required,
                    def_name,
                    component_name,
                    already_written
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

        # Shared across ALL schemas in this component file
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