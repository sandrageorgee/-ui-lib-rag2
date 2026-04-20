import fs from "fs";
import path from "path";

const root = path.resolve("data/mini-ui-lib/components");

/*
Walk folders
*/
function walk(dir: string): string[] {
    let results: string[] = [];

    fs.readdirSync(dir).forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(walk(filePath));
        }

        if (file.endsWith(".full.json")) {
            results.push(filePath);
        }
    });

    return results;
}

/*
🔥 FILTER BAD PROPS (CRITICAL FIX)
*/
const blacklist = [
    "aria-",
    "onMouse",
    "onPointer",
    "onTouch",
    "onAnimation",
    "onTransition",
    "onScroll",
    "onWheel",
    "onDrag",
    "onCopy",
    "onPaste",
    "onKey",
    "onFocus",
    "onBlur",
    "onChange",
    "onInput",
    "color", // 🚨 remove fake prop
];

function isValidProp(name: string) {
    return !blacklist.some((b) => name.startsWith(b));
}

/*
Format dependencies safely
*/
function formatDependencies(deps: any[]) {
    return deps
        .map((d) => d?.component || d?.name || "")
        .filter(Boolean)
        .join(", ");
}

/*
Shorten long code
*/
function shorten(code: string, max = 200) {
    if (!code) return "";
    return code.length > max ? code.slice(0, max) + "..." : code;
}

/*
🔥 Extract CLEAN props
*/
function extractProps(data: any) {
    const schema = data.schema;

    if (!schema || typeof schema !== "object") return [];

    const first = Object.values(schema)[0] as any;
    if (!first?.properties) return [];

    return Object.entries(first.properties)
        .filter(([name]) => isValidProp(name)) // ✅ FILTER HERE
        .map(([name, val]: any) => {
            if (val.type) return `${name} (${val.type})`;
            if (val.$ref) return `${name} (ref)`;
            return name;
        })
        .slice(0, 10); // ✅ avoid huge lists
}

/*
🔥 Generate semantic overview
*/
function generateOverview(component: string, data: any) {
    let text = `${component} is a UI component`;

    if (data.internalComponents?.length) {
        text += ` composed of ${data.internalComponents.join(", ")}`;
    }

    if (data.state?.length) {
        text += ` that manages state`;
    }

    return text + ".";
}

/*
Detect React component
*/
function isComponent(name: string) {
    return name[0] === name[0].toUpperCase();
}

/*
Describe subcomponent
*/
function describeComponent(name: string) {
    return `${name} is a reusable UI subcomponent`;
}

/*
Describe function
*/
function describeFunction(name: string) {
    return `${name} is a helper logic function`;
}

/*
🔥 Extract JSX EXAMPLES (NEW 🔥🔥🔥)
*/
function extractExamples(component: string, data: any) {
    const examples: any[] = [];

    if (data.functions?.length) {
        data.functions.forEach((f: any) => {
            if (isComponent(f.name)) {
                examples.push({
                    type: "example",
                    text: `<${f.name} />`,
                    component,
                });
            }
        });
    }

    // Add base usage example
    examples.push({
        type: "example",
        text: `<${component} />`,
        component,
    });

    return examples;
}

/*
🔥 Render flow
*/
function buildRenderFlow(component: string, data: any) {
    if (!data.jsxUsage?.length) return null;

    const main = data.jsxUsage
        .filter((el: string) => isComponent(el))
        .slice(0, 5);

    if (!main.length) return null;

    return {
        type: "render_flow",
        text: `${component} renders ${main.join(", ")}`,
        component,
    };
}

/*
🔥 MAIN CHUNK BUILDER
*/
function buildChunks(data: any) {
    const chunks: any[] = [];
    const component = data.component;

    /*
    1. Overview
    */
    chunks.push({
        type: "overview",
        text: generateOverview(component, data),
        component,
    });

    /*
    2. Props (CLEANED)
    */
    const props = extractProps(data);
    if (props.length) {
        chunks.push({
            type: "props",
            text: `${component} accepts props: ${props.join(", ")}`,
            component,
        });
    }

    /*
    3. Dependencies
    */
    if (data.dependencies?.length) {
        const deps = formatDependencies(data.dependencies);
        if (deps) {
            chunks.push({
                type: "dependencies",
                text: `${component} depends on: ${deps}`,
                component,
            });
        }
    }

    /*
    4. Composition
    */
    if (data.internalComponents?.length) {
        chunks.push({
            type: "composition",
            text: `${component} is composed of: ${data.internalComponents.join(", ")}`,
            component,
        });
    }

    /*
    5. Render Flow
    */
    const flow = buildRenderFlow(component, data);
    if (flow) chunks.push(flow);

    /*
    6. State
    */
    if (data.state?.length) {
        data.state.forEach((s: any) => {
            chunks.push({
                type: "state",
                text: `${component} manages state: ${shorten(s.code)}`,
                component,
            });
        });
    }

    /*
    7. Functions / Subcomponents
    */
    if (data.functions?.length) {
        data.functions.forEach((f: any) => {
            if (isComponent(f.name)) {
                chunks.push({
                    type: "subcomponent",
                    text: describeComponent(f.name),
                    component,
                });
            } else {
                chunks.push({
                    type: "function_summary",
                    text: describeFunction(f.name),
                    component,
                });
            }
        });
    }

    /*
    8. JSX Examples (🔥 MOST IMPORTANT)
    */
    chunks.push(...extractExamples(component, data));

    return chunks;
}

/*
MAIN
*/
function main() {
    const files = walk(root);

    files.forEach((file) => {
        console.log("Chunking:", file);

        const raw = fs.readFileSync(file, "utf8");
        const data = JSON.parse(raw);

        const chunks = buildChunks(data);

        const output = file.replace(".full.json", ".chunks.json");

        fs.writeFileSync(output, JSON.stringify(chunks, null, 2));

        console.log("✅ Created:", output);
    });

    console.log("\n🔥 CLEAN + SMART chunks generated!");
}

main();