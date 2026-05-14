# Bug Fix: Alert `severity` Enum Missing from Generated Schema

## Symptom

After running `Enhanced_ts-json-schema-generator.ts`, the generated `final.alert.alerts.schema.json` contained a dangling `$ref` for the `severity` property with no corresponding definition in the output:

```json
"severity": {
  "$ref": "#/definitions/AlertSeverity",
  "description": "The severity of the alert...",
  "default": "info"
}
```

The `AlertSeverity` enum values (`"info"`, `"success"`, `"warning"`, `"error"`) were completely absent from the schema. Any consumer of this schema could not determine what values `severity` accepts.

---

## Source of `AlertSeverity`

Defined in `mini-commonui/packages/common-ui/src/components/alert/ialerts.ts`:

```ts
export type AlertSeverity = "info" | "success" | "warning" | "error";
```

`ts-json-schema-generator` correctly resolved this into the raw schema as:

```json
"definitions": {
  "AlertSeverity": {
    "type": "string",
    "enum": ["info", "success", "warning", "error"]
  },
  "IAlertProps": { ... }
}
```

---

## Root Cause

### Problem 1 — `cleanDefinitions` filtered out `AlertSeverity`

`cleanDefinitions` iterated the raw schema definitions and silently dropped any definition whose name did not include `"Props"` or start with `"I"`:

```ts
// parser/Enhanced_ts-json-schema-generator.ts (before fix)
function cleanDefinitions(definitions: any) {
    const cleaned: any = {};
    for (const [name, def] of Object.entries(definitions)) {
        if (isDomOrBrowserType(name)) continue;
        cleaned[name] = sanitizeDefinition(def);  // no raw defs passed
    }
    return cleaned;
}
```

```ts
// transformSchema — the filter that dropped AlertSeverity
for (const [name, def] of Object.entries(cleanedDefinitions)) {
    if (
        !name.includes("Props") &&
        !name.startsWith("I")
    ) {
        continue;   // <-- AlertSeverity silently dropped here
    }
    ...
}
```

`AlertSeverity` contains neither `"Props"` nor starts with `"I"`, so it was discarded.

### Problem 2 — `deepSanitizeRefs` only replaced DOM refs

After `AlertSeverity` was removed from the definitions, the `severity` property still held `$ref: "#/definitions/AlertSeverity"`. The ref-sanitizer only replaced refs for DOM/browser types; all other refs were passed through unchanged:

```ts
// before fix
function deepSanitizeRefs(obj: any): any {
    ...
    if (obj.$ref) {
        const refName = decodeURIComponent(obj.$ref.replace("#/definitions/", ""));
        if (isDomOrBrowserType(refName)) {
            return { type: "object", description: `DOM type: ${refName}` };
        }
        // non-DOM refs (like AlertSeverity) fall through — left as dangling $ref
    }
    ...
}
```

The result was a `$ref` that pointed to a definition that no longer existed in the output.

---

## Edits Made

### 1. `deepSanitizeRefs` — inline non-DOM refs from raw definitions

Added a `rawDefinitions` parameter and a `visited` set for cycle protection. When a non-DOM `$ref` is encountered, the function now looks up the definition in the raw schema and inlines it recursively instead of leaving the `$ref` as-is.

```ts
// after fix
function deepSanitizeRefs(obj: any, rawDefinitions?: any, visited = new Set<string>()): any {
    ...
    if (obj.$ref) {
        const refName = decodeURIComponent(obj.$ref.replace("#/definitions/", ""));

        if (isDomOrBrowserType(refName)) {
            return { type: "object", description: `DOM type: ${refName}` };
        }

        // Inline non-DOM refs instead of leaving dangling $refs
        if (rawDefinitions && rawDefinitions[refName] && !visited.has(refName)) {
            const nextVisited = new Set(visited).add(refName);
            return deepSanitizeRefs({ ...rawDefinitions[refName] }, rawDefinitions, nextVisited);
        }
    }
    ...
}
```

### 2. `sanitizeProp` — thread `rawDefinitions` through

```ts
// after fix
function sanitizeProp(prop: any, rawDefinitions?: any): any {
    prop = fixMalformedEnum(prop);
    prop = fixMalformedType(prop);
    prop = deepSanitizeRefs(prop, rawDefinitions);  // pass raw defs
    return prop;
}
```

### 3. `sanitizeDefinition` — thread `rawDefinitions` through

```ts
// after fix
function sanitizeDefinition(def: any, rawDefinitions?: any): any {
    ...
    if (cleaned.properties) {
        const newProps: any = {};
        for (const key in cleaned.properties) {
            newProps[key] = sanitizeProp(cleaned.properties[key], rawDefinitions);  // pass raw defs
        }
        cleaned.properties = newProps;
    }
    return cleaned;
}
```

### 4. `cleanDefinitions` — pass raw definitions into sanitization

```ts
// after fix
function cleanDefinitions(definitions: any) {
    const cleaned: any = {};
    for (const [name, def] of Object.entries(definitions)) {
        if (isDomOrBrowserType(name)) continue;
        cleaned[name] = sanitizeDefinition(def, definitions);  // pass raw defs
    }
    return cleaned;
}
```

### 5. `transformSchema` — pass raw definitions when building results

```ts
// after fix
const result: any = {
    component: componentName,
    interface: name,
    ...
    ...sanitizeDefinition(def, schema.definitions)  // was: sanitizeDefinition(def)
};
```

---

## Result

After the fix, `severity` is fully resolved inline:

```json
"severity": {
  "type": "string",
  "enum": ["info", "success", "warning", "error"],
  "description": "Severity levels for the Alert component."
}
```

No `$ref` remains. Any type alias or union used as a prop type (not just `AlertSeverity`) will now be inlined correctly rather than left as a broken reference.

---

## Files Changed

| File | Change |
|------|--------|
| `parser/Enhanced_ts-json-schema-generator.ts` | `deepSanitizeRefs`, `sanitizeProp`, `sanitizeDefinition`, `cleanDefinitions`, `transformSchema` updated to thread and use raw definitions for inline ref resolution |
