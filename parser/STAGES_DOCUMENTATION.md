# Parser Stages Documentation — Stage 2 to Stage 7

This document explains step by step what happens inside each stage of the parsing pipeline, using the Alert component as a running example throughout.

---

## Stage 2 — `stage2_ast.ts` — AST Dependency Extraction

**Input:** absolute path to a `.tsx` file  
**Output:** `{ dependencies: string[] }`

### What it does

This stage uses the **TypeScript compiler API** — not regex, not manual text parsing — to parse the file into a proper **Abstract Syntax Tree (AST)**. An AST is a structured tree that represents the code the same way the TypeScript compiler itself reads it.

### Step by step

**Step 1 — Read the file**
```ts
const code = fs.readFileSync(filePath, "utf8");
```
Reads the raw `.tsx` source text into memory.

**Step 2 — Parse into an AST**
```ts
const source = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
);
```
The TypeScript compiler parses the source text and produces a tree of nodes. `ScriptKind.TSX` tells it to treat JSX syntax as valid. Every `import`, `const`, `function`, `return` statement becomes a typed node in this tree.

**Step 3 — Walk the tree looking for import declarations**
```ts
function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
        if (
            node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings)
        ) {
            node.importClause.namedBindings.elements.forEach(el => {
                const name = el.name.text;
                if (!IGNORED_IMPORTS.has(name)) dependencies.add(name);
            });
        }
    }
    ts.forEachChild(node, visit);
}
```
`ts.forEachChild` recursively visits every node. When it finds an import statement (`isImportDeclaration`), it checks whether it has named imports — i.e. `import { Something } from '...'`. It then reads each imported name.

**Step 4 — Filter out React built-ins**
```ts
const IGNORED_IMPORTS = new Set(["React", "useState", "useEffect"]);
```
`React`, `useState`, and `useEffect` are excluded because they are framework internals and not component-level dependencies that matter for the schema.

### Example

For `alerts.tsx` which has:
```ts
import { IAlertProps } from './ialerts';
```
The output is:
```json
{ "dependencies": ["IAlertProps"] }
```

---

## Stage 3 — `stage3_extract.ts` — Source Text Extraction

**Input:** raw `.tsx` file content as a string  
**Output:** `{ defaultValues, usageExamples, cssClasses }`

This stage does **not** use the TypeScript compiler. It works purely with **regex** scanning the raw source text to pull out three categories of information.

---

### Part A — Default Prop Values (`extractDefaultValues`)

**What it targets:**
The destructuring pattern at the top of the component function where props are unpacked with their defaults:
```ts
const { severity = 'info', closeable = false, show = true } = props;
```

**Step 1 — Find the destructure block**
```ts
const destructureRegex = /\{\s*([\s\S]*?)\s*\}\s*=\s*props/g;
```
This captures everything inside `{ ... } = props`.

**Step 2 — Find key-default pairs inside the block**
```ts
const defaultRegex =
    /(\w+)\s*=\s*"([^"]+)"|(\w+)\s*=\s*'([^']+)'|(\w+)\s*=\s*(true|false|\d+(\.\d+)?)/g;
```
Three patterns handled:
- `prop = "value"` — double-quoted string
- `prop = 'value'` — single-quoted string
- `prop = true/false/123` — boolean or number

**Example output for Alert:**
```json
{
  "severity": "info",
  "closeable": "false",
  "show": "true"
}
```

---

### Part B — Usage Examples (`extractUsageExamples`)

**What it targets:** Every `return ( ... );` block in the file that contains JSX.

```ts
const returnRegex = /return\s*\(\s*([\s\S]*?)\s*\)\s*;/g;
```

**Filters applied:**
- Must contain at least one `<` character — confirms it's JSX not a plain value
- Must be under 800 characters — avoids capturing the entire component render tree
- Deduplicates and keeps max 2 examples

**Note:** These are the component's *own* internal render JSX — not consumer usage code. The real consumer examples come from stage 0 (demo files). This field is kept for internal reference.

---

### Part C — CSS Classes (`extractCSSClasses`)

This is the most complex part of stage 3. It extracts all CSS class names used in the component across three different patterns.

**Step 1 — Pre-scan for string constants**
```ts
const constRegex = /const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
```
Finds any `const X = 'value'` at the top of the file. For Alert this finds:
```
{ baseClass: "Cui-Alert" }
```
This lookup table is used in step 3.

**Step 2 — Plain string classNames**
```ts
const plainRegex = /className\s*=\s*"([^"]+)"/g;
```
Handles: `className="some-class another-class"` — splits on whitespace to get individual class names.

**Step 3 — Template literal classNames**
```ts
const templateRegex = /className\s*=\s*\{`([^`]+)`\}/g;
```
Handles: `` className={`${baseClass}__icon`} ``

Without resolution this would produce `__icon` (the `${baseClass}` part stripped away). With the constant lookup:
```ts
function resolveTemplate(template, constants) {
    return template.replace(/\$\{(\w+)\}/g, (_, varName) => constants[varName] ?? "");
}
```
`${baseClass}` → `Cui-Alert`, so `` `${baseClass}__icon` `` → `Cui-Alert__icon`.  
Unknown runtime variables like `${severity}` → empty string (they are dynamic, not static class names).

**Step 4 — clsx / cn / classNames utility calls**
```ts
const clsxRegex = /(?:clsx|cn|classNames)\(([\s\S]*?)\)/g;
```
Handles: `clsx("base-class", { "active": isActive })` — extracts only the string literals inside the call.

**Example output for Alert:**
```json
[
  "Cui-Alert__closeBtn",
  "Cui-Alert__content",
  "Cui-Alert__icon",
  "Cui-Alert__message",
  "Cui-Alert__title"
]
```

---

## Stage 4 — `stage4_schema.ts` — Raw Schema Generation

**Input:** absolute path to `.tsx` file + path to `tsconfig.json`  
**Output:** raw JSON schema object (unmodified, exactly as the library produces it)

### What it does

This is the only stage that calls an **external library** — `ts-json-schema-generator`. It feeds the `.tsx` file into the generator along with the project's `tsconfig.json` so the generator can resolve all imports and type aliases.

```ts
const generator = createGenerator({
    path:          tsxPath,   // the component file to parse
    tsconfig:      tsconfigPath,
    type:          "*",       // generate for all exported types
    expose:        "all",     // include all referenced types in definitions
    skipTypeCheck: true,      // don't fail on type errors, just generate
    topRef:        true,      // wrap top-level types in $ref
});

return generator.createSchema("*");
```

### What the raw output looks like

The library produces a `definitions` map — a dictionary where every type it encountered gets its own entry. For `alerts.tsx`:

```json
{
  "definitions": {
    "IAlertProps": {
      "type": "object",
      "properties": {
        "severity": { "$ref": "#/definitions/AlertSeverity" },
        "id":       { "type": "string" },
        ...
      }
    },
    "AlertSeverity": {
      "type": "string",
      "enum": ["info", "success", "warning", "error"]
    },
    "HTMLDivElement": { ... },
    "React.CSSProperties": { ... }
  }
}
```

**Important:** at this point the schema is raw and uncleaned:
- `severity` is still a `$ref` pointing to `AlertSeverity` — not inlined
- DOM types like `HTMLDivElement`, `React.CSSProperties` are present
- `AlertSeverity` exists in definitions but will later be inlined and removed

All of that is handled by stage 5.

---

## Stage 5 — `stage5_sanitize.ts` — Schema Sanitization

**Input:** raw schema from stage 4  
**Output:** cleaned definitions map

This stage is **not called from `pipeline.ts` directly** — it is called internally by stage 6. It has no side effects and does not write any files.

It fixes three categories of problems with the raw schema.

---

### Problem 1 — DOM and browser types polluting the schema

`ts-json-schema-generator` includes every type it resolves — including browser built-ins like `HTMLDivElement`, React types like `React.CSSProperties`, SVG types, and ARIA types. These are not useful in a component schema.

**The check:**
```ts
const DOM_BUILTINS = new Set([
    "HTMLElement", "HTMLDivElement", "HTMLButtonElement",
    "HTMLInputElement", "HTMLSpanElement", "MouseEvent",
    "KeyboardEvent", "Event", "Node", "Element", "CSSStyleDeclaration"
]);

function isDomOrBrowserType(name: string): boolean {
    return (
        DOM_BUILTINS.has(name)    ||
        name.startsWith("React.") ||
        name.startsWith("HTML")   ||
        name.startsWith("SVG")    ||
        name.startsWith("Aria")
    );
}
```

**In `cleanDefinitions`:**
```ts
for (const [name, def] of Object.entries(definitions)) {
    if (isDomOrBrowserType(name)) continue;  // ← skip it entirely
    cleaned[name] = sanitizeDefinition(def, definitions);
}
```

When a DOM type appears as a `$ref` inside a property (e.g. `style: { $ref: "React.CSSProperties" }`), `deepSanitizeRefs` replaces it with a placeholder:
```json
{ "type": "object", "description": "DOM type: React.CSSProperties" }
```

---

### Problem 2 — Malformed enum objects

`ts-json-schema-generator` sometimes emits `enum` as a plain JS object `{ 0: "info", 1: "success" }` instead of the correct array `["info", "success"]`.

**The fix:**
```ts
function fixMalformedEnum(prop: any): any {
    if (prop?.enum && typeof prop.enum === "object" && !Array.isArray(prop.enum)) {
        prop.enum = Object.values(prop.enum);
    }
    return prop;
}
```
Converts the object to an array by taking its values.

---

### Problem 3 — Dangling `$ref` pointers (the `AlertSeverity` bug)

This is the most important fix. The raw schema has `severity` as:
```json
"severity": { "$ref": "#/definitions/AlertSeverity" }
```

`AlertSeverity` is in definitions but gets dropped during filtering (it doesn't include "Props" and doesn't start with "I"). If left as-is, the `$ref` points to nothing.

**The fix — `deepSanitizeRefs`:**
```ts
if (rawDefinitions && rawDefinitions[refName] && !visited.has(refName)) {
    const nextVisited = new Set(visited).add(refName);
    return deepSanitizeRefs({ ...rawDefinitions[refName] }, rawDefinitions, nextVisited);
}
```

When it finds a `$ref` to `AlertSeverity`, it looks up `AlertSeverity` in the **original raw definitions** and returns its content directly — replacing the `$ref` with the actual inline definition:

```json
"severity": {
  "type": "string",
  "enum": ["info", "success", "warning", "error"],
  "description": "Severity levels for the Alert component."
}
```

The `visited` set prevents infinite loops if a type references itself.

---

### The sanitization call chain

```
cleanDefinitions(rawDefs)
  └── for each definition:
        sanitizeDefinition(def, rawDefs)
          └── for each property:
                sanitizeProp(prop, rawDefs)
                  ├── fixMalformedEnum(prop)
                  ├── fixMalformedType(prop)
                  └── deepSanitizeRefs(prop, rawDefs)
                        └── recursively resolves all $refs
```

---

## Stage 6 — `stage6_transform.ts` — Merge and Transform

**Input:** raw schema (stage 4) + extracted info (stage 3) + docs (stage 0) + dependencies (stage 2)  
**Output:** `SchemaResult[]` — the final array of objects ready to be written

This is the **assembly stage**. It takes everything produced by all previous stages and combines it into the final output shape.

### Step by step

**Step 1 — Guard against empty schema**
```ts
if (!rawSchema.definitions) return [];
```
If the generator found no types at all, return empty — nothing to write.

**Step 2 — Clean the definitions**
```ts
const cleanedDefinitions = cleanDefinitions(rawSchema.definitions);
```
Calls stage 5. At this point all DOM types are removed, malformed enums are fixed, and `$ref` pointers are inlined.

**Step 3 — Filter to component interfaces only**
```ts
if (!name.includes("Props") && !name.startsWith("I")) continue;
```
The cleaned definitions map still contains utility types like `Iterable<ReactNode>`. This line keeps only types whose name includes `"Props"` (e.g. `IAlertProps`, `DataPanelProps`) or starts with `"I"` (the naming convention for component interfaces). Everything else is discarded.

**Step 4 — Build the base result object**
```ts
const result: SchemaResult = {
    component:         componentName,     // "alerts"
    interface:         name,              // "IAlertProps"
    originalInterface: name.replace(/\d+$/, ""),
    dependencies,                         // from stage 2
    ...sanitizeDefinition(def as any, rawSchema.definitions),
};
```
Spreads the sanitized definition (type, properties, required, description, etc.) directly onto the result object, then adds the pipeline-specific fields on top.

**Step 5 — Attach default values**
```ts
Object.keys(defaultValues).forEach(key => {
    if (result.properties![key]) relevantDefaults[key] = defaultValues[key];
});
```
Only defaults whose prop name actually exists in this interface's `properties` are attached. This prevents defaults from one component leaking into another.

**Step 6 — Attach CSS classes**
```ts
if (cssClasses.length > 0) result.cssClasses = cssClasses;
```
Direct attachment — the full list from stage 3.

**Step 7 — Attach docs**
```ts
if (docs && (docs.demos.length > 0 || docs.stories.length > 0)) {
    result.docs = {
        imports: docs.imports,
        demos:   docs.demos,
        stories: docs.stories,
    };
}
```
The `docs` block from stage 0 — only attached if the component actually had a demo or storybook file. Sub-components like `datapanelaction` that have no matching docs file simply don't get a `docs` field.

---

## Stage 7 — `stage7_write.ts` — Write to Disk

**Input:** `SchemaResult[]` array + output file path  
**Output:** JSON file written to `parser/parsing-results/`

This is the simplest stage. Two functions.

### `ensureOutputDir`
```ts
export function ensureOutputDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
```
Called once at the start of `pipeline.ts`. Creates the `parsing-results/` directory if it doesn't already exist. The `recursive: true` flag means it creates any missing parent directories too.

### `writeSchema`
```ts
export function writeSchema(results: SchemaResult[], outputPath: string): void {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    ...
}
```

**`JSON.stringify(results, null, 2)`** — three arguments:
- `results` — the data to serialize
- `null` — no replacer function (include all fields as-is)
- `2` — indent with 2 spaces for human-readable output

After writing, it logs a summary:
```ts
results.forEach(item => {
    console.log(`   → ${item.interface}`);
    console.log(`   props: ${Object.keys(item.properties || {}).length}`);
});
```

**Output file naming:**
```
final.{componentFolder}.{tsxFileName}.schema.json
```
Examples:
- `final.alert.alerts.schema.json`
- `final.datapanel.datapanelaction.schema.json`

This naming convention embeds both the folder (`alert`) and the file (`alerts`) so there is no collision between sub-components of the same folder.

---

## Full flow summary — Alert component example

```
alerts.tsx
    │
    ├── stage2_ast      → dependencies: ["IAlertProps"]
    │
    ├── stage3_extract  → defaultValues: { severity:"info", closeable:"false", show:"true" }
    │                     cssClasses:    ["Cui-Alert__icon", "Cui-Alert__content", ...]
    │
    ├── stage4_schema   → raw schema with $refs, DOM types, AlertSeverity in definitions
    │
    ├── stage5_sanitize → (called inside stage 6)
    │                     drops DOM types, inlines AlertSeverity enum, fixes malformed enums
    │
    ├── stage6_transform → builds SchemaResult:
    │                      { component, interface, properties (with severity enum inlined),
    │                        defaultValues, cssClasses, docs (from stage 0), dependencies }
    │
    └── stage7_write    → writes final.alert.alerts.schema.json to parsing-results/
```
