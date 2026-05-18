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

const DEMOS_DIR   = path.resolve(__dirname, "../mini-commonui/docs/demos/src/components/building");
const STORIES_DIR = path.resolve(__dirname, "../mini-commonui/docs/storybook/src/stories/building");

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

function findFile(dir: string, name: string, suffix: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    const candidates = [name + suffix, name + "s" + suffix];
    for (const c of candidates) {
        if (files.includes(c)) return path.join(dir, c);
    }
    const fallback = files.find((f: string) => f.startsWith(name) && f.endsWith(suffix));
    return fallback ? path.join(dir, fallback) : null;
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

// ---- storybook file extractor ----

function extractStories(filePath: string): StoryExample[] {
    const content  = fs.readFileSync(filePath, "utf8");
    const stories: StoryExample[] = [];

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

        stories.push({
            exportName,
            label,
            args:  mergedArgs,
            code:  generateStoryJSX(metaComponentName, mergedArgs),
        });
    }

    return stories;
}

// ---- public entry point ----

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
