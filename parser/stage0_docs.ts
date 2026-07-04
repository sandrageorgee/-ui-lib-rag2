import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// =============================
// STAGE 0 — DOCS
// Runs once per component (before the per-file stages).
// Reads two sources from mini-commonui/docs/:
//   1. demos/   → exported string constants = real JSX usage code
//   2. storybook/ → Story exports  = prop combinations per variant
// Returns structured docs that stage6_transform merges into the schema.
// =============================

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DEMOS_ROOT   = path.resolve(__dirname, "../common-ui/docs/demos/src/components");
const STORIES_ROOT = path.resolve(__dirname, "../common-ui/docs/storybook/src/stories");

// Real common-ui has many category subfolders (building, charts, datadisplay,
// inputs, layout, navigation, tables, icons, layouts, templates, ...).
// Collect every category dir plus the root itself so findFile can scan all of them.
function collectCategoryDirs(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    const dirs = [root];
    for (const entry of fs.readdirSync(root)) {
        const p = path.join(root, entry);
        if (fs.statSync(p).isDirectory()) dirs.push(p);
    }
    return dirs;
}

const DEMOS_DIRS   = collectCategoryDirs(DEMOS_ROOT);
const STORIES_DIRS = collectCategoryDirs(STORIES_ROOT);

// ---- public interfaces ----

export interface DemoExample {
    exportName: string;   // e.g. "alertsDefaultDemo"
    label:      string;   // e.g. "Default"
    code:       string[]; // one entry per line — preserves original formatting
}

export interface StoryExample {
    exportName: string;              // e.g. "Info"
    label:      string;              // e.g. "Info" or custom name field
    args:       Record<string, any>; // merged meta args + story args
    code:       string[];            // generated JSX — one entry per line
}

export interface ComponentDocs {
    componentName: string;
    imports:       string;         // e.g. `import { Alert } from '@common-ui';`
    demos:         DemoExample[];
    stories:       StoryExample[];
}

// ---- file finder ----
// Tries: exact name, then name + 's', then any file starting with name.
// Scans every directory in `dirs` and returns the first hit.

function findFile(dirs: string[], name: string, suffix: string): string | null {
    const candidates = [name + suffix, name + "s" + suffix];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir);
        for (const c of candidates) {
            if (files.includes(c)) return path.join(dir, c);
        }
        const fallback = files.find((f: string) => f.startsWith(name) && f.endsWith(suffix));
        if (fallback) return path.join(dir, fallback);
    }
    return null;
}

// ---- balanced-brace extractor ----
// Returns the content INSIDE the braces starting at openIdx (the '{').

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

// ---- simple args parser ----
// Extracts primitive key-value pairs (string, number, boolean) AND
// function-call values like fn() — stored as their raw text so they
// are not silently dropped.

function parseSimpleArgs(block: string): Record<string, any> {
    const args: Record<string, any> = {};

    // Pass 1 — primitives: strings, booleans, numbers
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

    // Pass 2 — function calls: key: fn(), key: someFunc(args)
    // Stored as raw text string so callers know the original value.
    const fnRegex = /(\w+)\s*:\s*(\w+\([^)]*\))/g;
    let f;
    while ((f = fnRegex.exec(block)) !== null) {
        const key = f[1];
        if (!(key in args)) {          // don't overwrite primitives
            args[key] = f[2].trim();   // e.g. "fn()"
        }
    }

    return args;
}

// ---- label deriver ----
// "alertsDefaultDemo" → "Default"
// "badgeDotVariantDemo" → "Dot Variant"

function deriveLabel(exportName: string, componentName: string): string {
    let label = exportName
        .replace(new RegExp(`^${componentName}s?`), "")
        .replace(/Demo$/i, "");
    label = label.replace(/([A-Z])/g, " $1").trim();
    return label || "Default";
}

// ---- demo file extractor ----

function extractDemos(
    filePath: string,
    componentName: string
): { imports: string; demos: DemoExample[] } {

    const content = fs.readFileSync(filePath, "utf8");
    const demos: DemoExample[] = [];

    // The imports string is declared as a plain const (no `export const`)
    // and re-exported as default.  Capture it by finding `export default X`
    // then looking up `const X: string = \`...\``.
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

    // All `export const X: string = \`...\`` — these are the demo code strings.
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

// ---- JSX code generator ----
// Builds JSX lines from a component name + args object.
// Rules:
//   string that looks like a function call → prop={fn()}
//   regular string                         → prop="value"
//   boolean true                           → prop  (shorthand)
//   boolean false / number                 → prop={value}

const FN_CALL_RE = /^\w+\([^)]*\)$/;

function generateStoryJSX(componentName: string, args: Record<string, any>): string[] {
    const entries = Object.entries(args);

    if (entries.length === 0) {
        return [`<${componentName} />`];
    }

    const lines: string[] = [`<${componentName}`];

    for (const [key, value] of entries) {
        if (typeof value === "string" && FN_CALL_RE.test(value)) {
            lines.push(`  ${key}={${value}}`);          // e.g. onClose={fn()}
        } else if (typeof value === "string") {
            lines.push(`  ${key}="${value}"`);
        } else if (value === true) {
            lines.push(`  ${key}`);
        } else {
            lines.push(`  ${key}={${JSON.stringify(value)}}`);
        }
    }

    lines.push("/>");
    return lines;
}

// ---- module-level template literal extractor ----
// Finds all `const varName = `...`` template literals at module scope.
// Used to resolve LiveEditor code={varName} references.

function extractTemplateLiterals(content: string): Map<string, string> {
    const map = new Map<string, string>();
    // Match: const varName = `...`; (non-export, module-level)
    const re = /(?:^|\n)(?:export\s+)?const\s+(\w+)\s*(?::\s*string)?\s*=\s*`([\s\S]*?)`;/g;
    let m;
    while ((m = re.exec(content)) !== null) {
        map.set(m[1], m[2].replace(/\r\n/g, "\n").trim());
    }
    return map;
}

// ---- decorator JSX extractor ----
// Pulls the JSX return value from a `decorators: () => { ... return (...) }` block.

function extractDecoratorJSX(body: string): string[] | null {
    const decIdx = body.indexOf("decorators:");
    if (decIdx === -1) return null;

    // Find the return (...) inside the decorator arrow fn
    const returnMatch = body.slice(decIdx).match(/return\s*\(([\s\S]*?)\)\s*;?\s*\}/);
    if (!returnMatch) return null;

    const jsx = returnMatch[1].trim();
    if (!jsx || jsx === "null" || jsx === "undefined") return null;
    return jsx.split("\n").map(l => l.trimEnd());
}

// ---- storybook file extractor ----

function extractStories(filePath: string): StoryExample[] {
    const content  = fs.readFileSync(filePath, "utf8");
    const stories: StoryExample[] = [];

    // Pre-extract all module-level template literals (for LiveEditor code={varName})
    const templateLiterals = extractTemplateLiterals(content);

    // Extract meta-level base args and component name using balanced brace finder.
    let metaArgs: Record<string, any> = {};
    let metaComponentName = "";

    const metaIdx = content.indexOf("const meta =");
    if (metaIdx !== -1) {
        const metaBraceIdx = content.indexOf("{", metaIdx);
        if (metaBraceIdx !== -1) {
            const metaBlock = extractBlock(content, metaBraceIdx);

            // component name — `component: Alert`
            const compMatch = metaBlock.match(/component\s*:\s*(\w+)/);
            if (compMatch) metaComponentName = compMatch[1];

            // base args
            const argsIdx = metaBlock.indexOf("args:");
            if (argsIdx !== -1) {
                const argsBraceIdx = metaBlock.indexOf("{", argsIdx);
                if (argsBraceIdx !== -1) {
                    metaArgs = parseSimpleArgs(extractBlock(metaBlock, argsBraceIdx));
                }
            }
        }
    }

    // Extract each `export const NAME: Story = { ... };`
    const storyHeaderRegex = /export\s+const\s+(\w+)\s*:\s*Story\s*=\s*\{/g;
    let h;
    while ((h = storyHeaderRegex.exec(content)) !== null) {
        const exportName = h[1];
        if (exportName === "meta" || exportName === "default") continue;

        const openIdx = h.index + h[0].length - 1;
        const body    = extractBlock(content, openIdx);

        // Optional display name
        const nameMatch = body.match(/name\s*:\s*['"]([^'"]+)['"]/);
        const label     = nameMatch ? nameMatch[1] : exportName;

        // Story-level args merged over meta args
        let storyArgs: Record<string, any> = {};
        const argsIdx = body.indexOf("args:");
        if (argsIdx !== -1) {
            const argsBraceIdx = body.indexOf("{", argsIdx);
            if (argsBraceIdx !== -1) {
                storyArgs = parseSimpleArgs(extractBlock(body, argsBraceIdx));
            }
        }

        // Story args first (preserves source order), then meta-only args appended.
        const mergedArgs: Record<string, any> = { ...storyArgs };
        for (const [k, v] of Object.entries(metaArgs)) {
            if (!(k in mergedArgs)) mergedArgs[k] = v;
        }

        // ── Code resolution (priority order) ───────────────────────────────
        // 1. LiveEditor code={varName} — use the template literal directly
        // 2. decorators: () => { return (...) } — extract the JSX return
        // 3. args-based JSX generation (existing behaviour)

        let code: string[] | null = null;

        const liveEditorMatch = body.match(/LiveEditor\s+code=\{(\w+)\}/);
        if (liveEditorMatch) {
            const varName = liveEditorMatch[1];
            const raw     = templateLiterals.get(varName);
            // Cross-file demo vars (imported, not in this file) resolve to null.
            // Those stories carry no real JSX here — the demo code is already
            // indexed separately via extractDemos, so skip instead of emitting junk.
            code = raw ? raw.split("\n") : null;
        } else {
            const decoratorJSX = extractDecoratorJSX(body);
            if (decoratorJSX) {
                code = decoratorJSX;
            } else if (Object.keys(mergedArgs).length > 0) {
                // Only generate JSX when there are real args to show.
                code = generateStoryJSX(metaComponentName, mergedArgs);
            }
        }

        // Skip stories with no usable code — an empty `<Component />` teaches
        // the LLM nothing and pollutes retrieval (causes prop hallucination).
        if (!code || code.length === 0) continue;

        stories.push({ exportName, label, args: mergedArgs, code });
    }

    return stories;
}

// ---- public entry point ----

export function extractComponentDocs(componentFileName: string): ComponentDocs | null {
    const demoFile  = findFile(DEMOS_DIRS,   componentFileName, ".ts");
    const storyFile = findFile(STORIES_DIRS, componentFileName, ".stories.tsx");

    if (!demoFile && !storyFile) return null;

    const { imports, demos } = demoFile
        ? extractDemos(demoFile, componentFileName)
        : { imports: "", demos: [] };

    const stories = storyFile ? extractStories(storyFile) : [];

    return { componentName: componentFileName, imports, demos, stories };
}
