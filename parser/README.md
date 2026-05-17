# Parser Pipeline — Stage-by-Stage Reference

The parser is split into **8 files**: one stage per responsibility, plus `pipeline.ts` as the single entry point that runs them all in order.

---

## How to run

```bash
npx tsx pipeline.ts
```

Output files are written to `parser/parsing-results/`.

---

## Data flow

```
stage0_docs.ts        →  ComponentDocs  (demos + storybook stories)
stage1_discover.ts    →  ComponentFile[]  (all .tsx files to process)
stage2_ast.ts         →  ASTResult  { dependencies }
stage3_extract.ts     →  ExtractedInfo  { defaultValues, cssClasses }
stage4_schema.ts      →  raw JSON schema  (ts-json-schema-generator output)
stage5_sanitize.ts    →  (called internally by stage 6)
stage6_transform.ts   →  SchemaResult[]  (final merged objects)
stage7_write.ts       →  JSON files written to parsing-results/
```

---

## Stage 0 — `stage0_docs.ts`

**What it does:**
Runs before all other stages, once per component file. Reads two documentation sources from `mini-commonui/docs/` and extracts real usage examples:

- **Demo files** (`docs/demos/src/components/building/*.ts`) — exported TypeScript string constants that contain JSX function code showing how to use the component.
- **Storybook files** (`docs/storybook/src/stories/building/*.stories.tsx`) — Storybook `Story` exports with their `args` (prop combinations per visual variant).

**Output added to schema:** a `docs` block containing:
- `imports` — the import statement consumers need (e.g. `import { Alert } from '@common-ui'`)
- `demos[]` — each demo with its `label`, `exportName`, and `code` (stored as an array of lines to preserve formatting)
- `stories[]` — each story with its `label`, `exportName`, and `args` (meta-level base args merged with story-level overrides)

**Key design decisions:**
- File matching tries exact name, then name + `s`, then prefix match — handles `alert` folder → `alerts.ts` file.
- `extractBlock()` uses balanced-brace counting to safely extract object bodies even when they contain nested `{}` (e.g. JSX style objects).
- `parseSimpleArgs()` only extracts primitive values (string, number, boolean) — JSX and function-call values are intentionally skipped.
- `code` is split into `string[]` line-by-line so JSON output is human-readable instead of one long escaped string.

```typescript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DEMOS_DIR   = path.resolve(__dirname, "../mini-commonui/docs/demos/src/components/building");
const STORIES_DIR = path.resolve(__dirname, "../mini-commonui/docs/storybook/src/stories/building");

export interface DemoExample {
    exportName: string;
    label:      string;
    code:       string[]; // one entry per line — preserves original formatting
}

export interface StoryExample {
    exportName: string;
    label:      string;
    args:       Record<string, any>;
}

export interface ComponentDocs {
    componentName: string;
    imports:       string;
    demos:         DemoExample[];
    stories:       StoryExample[];
}

function findFile(dir: string, name: string, suffix: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    const candidates = [name + suffix, name + "s" + suffix];
    for (const c of candidates) {
        if (files.includes(c)) return path.join(dir, c);
    }
    const fallback = files.find(f => f.startsWith(name) && f.endsWith(suffix));
    return fallback ? path.join(dir, fallback) : null;
}

function extractBlock(content: string, openIdx: number): string {
    let depth = 0;
    for (let i = openIdx; i < content.length; i++) {
        if (content[i] === "{") depth++;
        else if (content[i] === "}") {
            depth--;
            if (depth === 0) return content.slice(openIdx + 1, i);
        }
    }
    return "";
}

function parseSimpleArgs(block: string): Record<string, any> {
    const args: Record<string, any> = {};
    const kvRegex =
        /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(true|false)|(-?\d+(?:\.\d+)?))/g;
    let m;
    while ((m = kvRegex.exec(block)) !== null) {
        const key   = m[1];
        const value =
            m[2] !== undefined ? m[2] :
            m[3] !== undefined ? m[3] :
            m[4] !== undefined ? m[4] === "true" :
            m[5] !== undefined ? Number(m[5]) :
            undefined;
        if (value !== undefined) args[key] = value;
    }
    return args;
}

function deriveLabel(exportName: string, componentName: string): string {
    let label = exportName
        .replace(new RegExp(`^${componentName}s?`, "i"), "")
        .replace(/Demo$/i, "");
    label = label.replace(/([A-Z])/g, " $1").trim();
    return label || "Default";
}

function extractDemos(
    filePath: string,
    componentName: string
): { imports: string; demos: DemoExample[] } {
    const content = fs.readFileSync(filePath, "utf8");
    const demos: DemoExample[] = [];

    let imports = "";
    const defaultMatch = content.match(/export\s+default\s+(\w+)\s*;/);
    if (defaultMatch) {
        const varName = defaultMatch[1];
        const importVarRegex = new RegExp(
            `const\\s+${varName}\\s*:\\s*string\\s*=\\s*\`([\\s\\S]*?)\`;`
        );
        const importMatch = content.match(importVarRegex);
        if (importMatch) imports = importMatch[1].trim();
    }

    const demoRegex = /export\s+const\s+(\w+)\s*:\s*string\s*=\s*`([\s\S]*?)`;/g;
    let m;
    while ((m = demoRegex.exec(content)) !== null) {
        demos.push({
            exportName: m[1],
            label:      deriveLabel(m[1], componentName),
            code:       m[2].replace(/\r\n/g, "\n").trim().split("\n"),
        });
    }

    return { imports, demos };
}

function extractStories(filePath: string): StoryExample[] {
    const content  = fs.readFileSync(filePath, "utf8");
    const stories: StoryExample[] = [];

    let metaArgs: Record<string, any> = {};
    const metaIdx = content.indexOf("const meta =");
    if (metaIdx !== -1) {
        const metaBraceIdx = content.indexOf("{", metaIdx);
        if (metaBraceIdx !== -1) {
            const metaBlock  = extractBlock(content, metaBraceIdx);
            const argsIdx    = metaBlock.indexOf("args:");
            if (argsIdx !== -1) {
                const argsBraceIdx = metaBlock.indexOf("{", argsIdx);
                if (argsBraceIdx !== -1) {
                    const argsBlock = extractBlock(metaBlock, argsBraceIdx);
                    metaArgs = parseSimpleArgs(argsBlock);
                }
            }
        }
    }

    const storyHeaderRegex = /export\s+const\s+(\w+)\s*:\s*Story\s*=\s*\{/g;
    let h;
    while ((h = storyHeaderRegex.exec(content)) !== null) {
        const exportName = h[1];
        if (exportName === "meta" || exportName === "default") continue;

        const openIdx = h.index + h[0].length - 1;
        const body    = extractBlock(content, openIdx);

        const nameMatch = body.match(/name\s*:\s*['"]([^'"]+)['"]/);
        const label     = nameMatch ? nameMatch[1] : exportName;

        let storyArgs: Record<string, any> = {};
        const argsIdx = body.indexOf("args:");
        if (argsIdx !== -1) {
            const argsBraceIdx = body.indexOf("{", argsIdx);
            if (argsBraceIdx !== -1) {
                const argsBlock = extractBlock(body, argsBraceIdx);
                storyArgs = parseSimpleArgs(argsBlock);
            }
        }

        stories.push({
            exportName,
            label,
            args: { ...metaArgs, ...storyArgs },
        });
    }

    return stories;
}

export function extractComponentDocs(componentFileName: string): ComponentDocs | null {
    const demoFile  = findFile(DEMOS_DIR,   componentFileName, ".ts");
    const storyFile = findFile(STORIES_DIR, componentFileName, ".stories.tsx");

    if (!demoFile && !storyFile) return null;

    const { imports, demos } = demoFile
        ? extractDemos(demoFile, componentFileName)
        : { imports: "", demos: [] };

    const stories = storyFile ? extractStories(storyFile) : [];

    return { componentName: componentFileName, imports, demos, stories };
}
```

---

## Stage 1 — `stage1_discover.ts`

**What it does:**
Resolves all project paths and scans the components directory to produce the list of every `.tsx` file that needs to be parsed. This is the single source of truth for paths used by all other stages.

**Output:** `ComponentFile[]` — each item has `componentName` (folder), `tsxFile` (filename), `tsxPath` (absolute path).

```typescript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export interface ComponentFile {
    componentName: string;
    tsxFile:       string;
    tsxPath:       string;
}

export const PATHS = {
    componentsDir: path.resolve(__dirname, "../mini-commonui/packages/common-ui/src/components"),
    tsconfigPath:  path.resolve(__dirname, "../mini-commonui/tsconfig.json"),
    resultsDir:    path.resolve(__dirname, "./parsing-results"),
};

export function discoverComponentFiles(): ComponentFile[] {
    const { componentsDir } = PATHS;
    const files: ComponentFile[] = [];
    const folders = fs.readdirSync(componentsDir);

    for (const componentName of folders) {
        const componentPath = path.join(componentsDir, componentName);
        if (!fs.statSync(componentPath).isDirectory()) continue;

        const tsxFiles = fs
            .readdirSync(componentPath)
            .filter(f => f.endsWith(".tsx"));

        for (const tsxFile of tsxFiles) {
            files.push({
                componentName,
                tsxFile,
                tsxPath: path.join(componentPath, tsxFile),
            });
        }
    }

    return files;
}
```

---

## Stage 2 — `stage2_ast.ts`

**What it does:**
Uses the TypeScript compiler API to walk the AST (Abstract Syntax Tree) of each `.tsx` file and collect all named imports. These become the component's `dependencies` field in the schema. React built-ins (`React`, `useState`, `useEffect`) are excluded because they are not component-level dependencies.

**Output:** `ASTResult` — `{ dependencies: string[] }`

```typescript
import fs from "fs";
import ts from "typescript";

export interface ASTResult {
    dependencies: string[];
}

const IGNORED_IMPORTS = new Set(["React", "useState", "useEffect"]);

export function extractAST(filePath: string): ASTResult {
    if (!fs.existsSync(filePath)) return { dependencies: [] };

    const code = fs.readFileSync(filePath, "utf8");

    const source = ts.createSourceFile(
        filePath,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    const dependencies = new Set<string>();

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

    visit(source);
    return { dependencies: [...dependencies] };
}
```

---

## Stage 3 — `stage3_extract.ts`

**What it does:**
Regex-scans the raw `.tsx` source text (no AST, no type-checker) to pull out three things:

- **Default prop values** — from destructured `{ prop = value } = props` patterns.
- **CSS class names** — from `className="..."`, `` className={`...`} ``, and `clsx(...)` calls. Template literals are resolved using a pre-scan of `const X = 'value'` declarations so that `${baseClass}__icon` becomes `Cui-Alert__icon` instead of just `__icon`.
- **Usage examples** (internal render JSX) — kept for reference but superseded by the real demos from stage 0.

**Output:** `ExtractedInfo` — `{ defaultValues, usageExamples, cssClasses }`

```typescript
export interface ExtractedInfo {
    defaultValues: Record<string, any>;
    usageExamples: string[];
    cssClasses:    string[];
}

export function extractSourceInfo(content: string): ExtractedInfo {
    return {
        defaultValues: extractDefaultValues(content),
        usageExamples: extractUsageExamples(content),
        cssClasses:    extractCSSClasses(content),
    };
}

function extractDefaultValues(content: string): Record<string, any> {
    const defaults: Record<string, any> = {};
    const destructureRegex = /\{\s*([\s\S]*?)\s*\}\s*=\s*props/g;
    let match;

    while ((match = destructureRegex.exec(content)) !== null) {
        const block = match[1];
        const defaultRegex =
            /(\w+)\s*=\s*"([^"]+)"|(\w+)\s*=\s*'([^']+)'|(\w+)\s*=\s*(true|false|\d+(\.\d+)?)/g;
        let d;
        while ((d = defaultRegex.exec(block)) !== null) {
            const key   = d[1] || d[3] || d[5];
            const value = d[2] ?? d[4] ?? d[6];
            if (key && value !== undefined) defaults[key] = value;
        }
    }

    return defaults;
}

function extractUsageExamples(content: string): string[] {
    const examples: string[] = [];
    const returnRegex = /return\s*\(\s*([\s\S]*?)\s*\)\s*;/g;
    let match;

    while ((match = returnRegex.exec(content)) !== null) {
        const jsx = match[1].trim();
        if (!jsx.includes("<")) continue;
        if (jsx.length > 800) continue;
        examples.push(jsx);
    }

    return [...new Set(examples)].slice(0, 2);
}

function extractStringConstants(content: string): Record<string, string> {
    const constants: Record<string, string> = {};
    const constRegex = /const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = constRegex.exec(content)) !== null) {
        constants[m[1]] = m[2];
    }
    return constants;
}

function resolveTemplate(template: string, constants: Record<string, string>): string {
    return template.replace(/\$\{(\w+)\}/g, (_, varName) => constants[varName] ?? "");
}

function extractCSSClasses(content: string): string[] {
    const classes   = new Set<string>();
    const constants = extractStringConstants(content);
    let match;

    const plainRegex = /className\s*=\s*"([^"]+)"/g;
    while ((match = plainRegex.exec(content)) !== null) {
        match[1].split(/\s+/).forEach(c => { if (c.trim()) classes.add(c.trim()); });
    }

    const templateRegex = /className\s*=\s*\{`([^`]+)`\}/g;
    while ((match = templateRegex.exec(content)) !== null) {
        resolveTemplate(match[1], constants)
            .split(/\s+/)
            .forEach(c => { if (c.trim()) classes.add(c.trim()); });
    }

    const clsxRegex = /(?:clsx|cn|classNames)\(([\s\S]*?)\)/g;
    while ((match = clsxRegex.exec(content)) !== null) {
        const stringRegex = /["']([^"']+)["']/g;
        let s;
        while ((s = stringRegex.exec(match[1])) !== null) {
            s[1].split(/\s+/).forEach(c => { if (c.trim()) classes.add(c.trim()); });
        }
    }

    return [...classes].sort();
}
```

---

## Stage 4 — `stage4_schema.ts`

**What it does:**
The only stage that calls an external library. Feeds the `.tsx` file into `ts-json-schema-generator` with the project `tsconfig.json` and returns the raw JSON schema exactly as the library produces it — no modifications. All cleaning happens in stage 5.

**Output:** raw schema object with a `definitions` map containing every type the generator resolved.

```typescript
import { createGenerator } from "ts-json-schema-generator";

export function generateRawSchema(tsxPath: string, tsconfigPath: string): any {
    const generator = createGenerator({
        path:          tsxPath,
        tsconfig:      tsconfigPath,
        type:          "*",
        expose:        "all",
        skipTypeCheck: true,
        topRef:        true,
    });

    return generator.createSchema("*");
}
```

---

## Stage 5 — `stage5_sanitize.ts`

**What it does:**
Cleans the raw schema from stage 4. Called internally by stage 6 — not called directly from `pipeline.ts`. Three problems it fixes:

1. **DOM / browser type removal** — drops definitions like `HTMLDivElement`, `React.*`, `SVG*`, `Aria*` which are not useful in the schema output.
2. **Malformed enum fix** — `ts-json-schema-generator` sometimes emits `enum` as a plain object instead of an array. This converts it.
3. **`$ref` inlining** — the generator puts type aliases (e.g. `AlertSeverity`) in `definitions` and references them with `$ref`. Since those definitions get filtered out, any `$ref` left in a property would be dangling. This stage walks every property recursively and replaces each `$ref` with the actual inlined definition content. A `visited` set prevents infinite loops on circular types.

```typescript
const DOM_BUILTINS = new Set([
    "HTMLElement", "HTMLDivElement", "HTMLButtonElement",
    "HTMLInputElement", "HTMLSpanElement", "MouseEvent",
    "KeyboardEvent", "Event", "Node", "Element", "CSSStyleDeclaration",
]);

export function isDomOrBrowserType(name: string): boolean {
    return (
        DOM_BUILTINS.has(name)    ||
        name.startsWith("React.") ||
        name.startsWith("HTML")   ||
        name.startsWith("SVG")    ||
        name.startsWith("Aria")
    );
}

function fixMalformedEnum(prop: any): any {
    if (prop?.enum && typeof prop.enum === "object" && !Array.isArray(prop.enum)) {
        prop.enum = Object.values(prop.enum);
    }
    return prop;
}

function fixMalformedType(prop: any): any {
    if (prop?.type && typeof prop.type === "object" && !Array.isArray(prop.type)) {
        const types = Object.values(prop.type);
        return { ...prop, anyOf: types.map((t: any) => ({ type: t })) };
    }
    return prop;
}

export function deepSanitizeRefs(
    obj: any,
    rawDefinitions?: any,
    visited = new Set<string>()
): any {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(item => deepSanitizeRefs(item, rawDefinitions, visited));

    if (obj.$ref) {
        const refName = decodeURIComponent(obj.$ref.replace("#/definitions/", ""));
        if (isDomOrBrowserType(refName)) {
            return { type: "object", description: `DOM type: ${refName}` };
        }
        if (rawDefinitions && rawDefinitions[refName] && !visited.has(refName)) {
            const nextVisited = new Set(visited).add(refName);
            return deepSanitizeRefs({ ...rawDefinitions[refName] }, rawDefinitions, nextVisited);
        }
    }

    const result: any = {};
    for (const key in obj) {
        result[key] = deepSanitizeRefs(obj[key], rawDefinitions, visited);
    }
    return result;
}

export function sanitizeProp(prop: any, rawDefinitions?: any): any {
    prop = fixMalformedEnum(prop);
    prop = fixMalformedType(prop);
    prop = deepSanitizeRefs(prop, rawDefinitions);
    return prop;
}

export function sanitizeDefinition(def: any, rawDefinitions?: any): any {
    if (!def || typeof def !== "object") return def;
    const cleaned: any = { ...def };

    if (cleaned.properties) {
        const newProps: any = {};
        for (const key in cleaned.properties) {
            newProps[key] = sanitizeProp(cleaned.properties[key], rawDefinitions);
        }
        cleaned.properties = newProps;
    }

    return cleaned;
}

export function cleanDefinitions(definitions: any): any {
    const cleaned: any = {};
    for (const [name, def] of Object.entries(definitions)) {
        if (isDomOrBrowserType(name)) continue;
        cleaned[name] = sanitizeDefinition(def, definitions);
    }
    return cleaned;
}
```

---

## Stage 6 — `stage6_transform.ts`

**What it does:**
The merge stage. Takes the cleaned schema from stage 5, the extracted source info from stage 3, the docs from stage 0, and the AST dependencies from stage 2, and combines them into the final `SchemaResult[]` array. Also filters the definitions map — only entries whose name includes `"Props"` or starts with `"I"` are kept (everything else is a utility/framework type).

**Output:** `SchemaResult[]` — the complete final schema objects ready to be written to disk.

```typescript
import { cleanDefinitions, sanitizeDefinition } from "./stage5_sanitize.js";
import type { ExtractedInfo } from "./stage3_extract.js";
import type { ComponentDocs } from "./stage0_docs.js";

export interface SchemaResult {
    component:         string;
    interface:         string;
    originalInterface: string;
    dependencies:      string[];
    type?:             string;
    properties?:       Record<string, any>;
    required?:         string[];
    additionalProperties?: boolean;
    description?:      string;
    defaultValues?:    Record<string, any>;
    cssClasses?:       string[];
    docs?: {
        imports:  string;
        demos:    ComponentDocs["demos"];
        stories:  ComponentDocs["stories"];
    };
    [key: string]: any;
}

export function transformSchema(
    rawSchema:     any,
    componentName: string,
    extracted:     ExtractedInfo,
    dependencies:  string[],
    docs?:         ComponentDocs | null
): SchemaResult[] {
    if (!rawSchema.definitions) return [];

    const results: SchemaResult[] = [];
    const { defaultValues, cssClasses } = extracted;
    const cleanedDefinitions = cleanDefinitions(rawSchema.definitions);

    for (const [name, def] of Object.entries(cleanedDefinitions)) {
        if (!name.includes("Props") && !name.startsWith("I")) continue;

        const result: SchemaResult = {
            component:         componentName,
            interface:         name,
            originalInterface: name.replace(/\d+$/, ""),
            dependencies,
            ...sanitizeDefinition(def as any, rawSchema.definitions),
        };

        if (result.properties && Object.keys(defaultValues).length > 0) {
            const relevantDefaults: any = {};
            Object.keys(defaultValues).forEach(key => {
                if (result.properties![key]) relevantDefaults[key] = defaultValues[key];
            });
            if (Object.keys(relevantDefaults).length > 0) {
                result.defaultValues = relevantDefaults;
            }
        }

        if (cssClasses.length > 0) result.cssClasses = cssClasses;

        if (docs && (docs.demos.length > 0 || docs.stories.length > 0)) {
            result.docs = {
                imports: docs.imports,
                demos:   docs.demos,
                stories: docs.stories,
            };
        }

        results.push(result);
    }

    return results;
}
```

---

## Stage 7 — `stage7_write.ts`

**What it does:**
The final stage. Ensures the `parsing-results/` output directory exists, serialises the `SchemaResult[]` array to formatted JSON, writes it to disk, and logs a summary line per interface found.

```typescript
import fs from "fs";
import path from "path";
import type { SchemaResult } from "./stage6_transform.js";

export function ensureOutputDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function writeSchema(results: SchemaResult[], outputPath: string): void {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log(`✅ Generated schema → ${path.basename(outputPath)}`);

    results.forEach(item => {
        console.log(`   → ${item.interface}`);
        console.log(`   props: ${Object.keys(item.properties || {}).length}`);
    });
}
```

---

## Orchestrator — `pipeline.ts`

**What it does:**
The only file you run directly. Imports from every stage and executes them in the correct order for each `.tsx` file discovered by stage 1. Stage 5 is not imported directly — it is called internally by stage 6.

```typescript
import fs from "fs";
import path from "path";

import { extractComponentDocs }            from "./stage0_docs.js";
import { discoverComponentFiles, PATHS }   from "./stage1_discover.js";
import { extractAST }                      from "./stage2_ast.js";
import { extractSourceInfo }               from "./stage3_extract.js";
import { generateRawSchema }               from "./stage4_schema.js";
import { transformSchema }                 from "./stage6_transform.js";
import { ensureOutputDir, writeSchema }    from "./stage7_write.js";

ensureOutputDir(PATHS.resultsDir);

const files = discoverComponentFiles();

for (const { componentName, tsxFile, tsxPath } of files) {

    console.log(`\n🔍 Processing: ${componentName}`);
    console.log(`📄 Parsing: ${tsxFile}`);

    try {

        const fileBaseName = path.basename(tsxFile, ".tsx");
        const content      = fs.readFileSync(tsxPath, "utf8");

        const docs      = extractComponentDocs(fileBaseName);               // stage 0
        const astResult = extractAST(tsxPath);                              // stage 2
        const extracted = extractSourceInfo(content);                       // stage 3
        const rawSchema = generateRawSchema(tsxPath, PATHS.tsconfigPath);  // stage 4

        const results   = transformSchema(                                  // stage 6 (→ 5 inside)
            rawSchema,
            fileBaseName,
            extracted,
            astResult.dependencies,
            docs
        );

        const outputPath = path.join(
            PATHS.resultsDir,
            `final.${componentName}.${fileBaseName}.schema.json`
        );

        writeSchema(results, outputPath);                                   // stage 7

    } catch (err: any) {
        console.log(`❌ Failed: ${tsxFile}`);
        console.error(err);
    }
}
```

---

## Output schema shape

Each generated JSON file is an array of objects. Each object looks like this:

```json
{
  "component": "alerts",
  "interface": "IAlertProps",
  "originalInterface": "IAlertProps",
  "dependencies": ["IAlertProps"],
  "type": "object",
  "properties": {
    "severity": {
      "type": "string",
      "enum": ["info", "success", "warning", "error"],
      "description": "Severity levels for the Alert component."
    }
  },
  "required": ["id", "message"],
  "defaultValues": {
    "severity": "info",
    "closeable": "false",
    "show": "true"
  },
  "cssClasses": [
    "Cui-Alert__closeBtn",
    "Cui-Alert__content",
    "Cui-Alert__icon",
    "Cui-Alert__message",
    "Cui-Alert__title"
  ],
  "docs": {
    "imports": "import { Alert } from '@common-ui';",
    "demos": [
      {
        "exportName": "alertsDefaultDemo",
        "label": "Default",
        "code": [
          "() => {",
          "  return (",
          "    <Alert id=\"info-alert\" severity=\"info\" message=\"...\" />",
          "  );",
          "}"
        ]
      }
    ],
    "stories": [
      {
        "exportName": "Info",
        "label": "Info",
        "args": { "severity": "info", "id": "demo-alert", "message": "..." }
      }
    ]
  }
}
```
