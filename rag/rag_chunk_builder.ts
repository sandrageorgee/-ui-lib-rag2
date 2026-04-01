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
Format dependencies safely
*/
function formatDependencies(deps: any[]) {
    return deps
        .map((d) => {
            if (typeof d === "string") return d;
            if (d?.component) return d.component;
            if (d?.name) return d.name;
            return "";
        })
        .filter(Boolean)
        .join(", ");
}

/*
Shorten long code
*/
function shorten(code: string, max = 250) {
    if (!code) return "";
    return code.length > max ? code.slice(0, max) + "..." : code;
}

/*
🔥 Extract props (YOUR schema shape)
*/
function extractProps(data: any) {
    const schema = data.schema;

    if (!schema || typeof schema !== "object") return [];

    const first = Object.values(schema)[0] as any;

    if (!first?.properties) return [];

    return Object.entries(first.properties).map(([name, val]: any) => {
        if (val.type) return `${name} (${val.type})`;
        if (val.$ref) return `${name} (ref)`;
        return name;
    });
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
🔥 Detect if React component
*/
function isComponent(name: string) {
    return name[0] === name[0].toUpperCase();
}

/*
🔥 Describe subcomponent
*/
function describeComponent(name: string) {
    const lower = name.toLowerCase();

    if (lower.includes("header")) return `${name} renders the header section`;
    if (lower.includes("card")) return `${name} renders a card UI`;
    if (lower.includes("section")) return `${name} renders a section of the UI`;
    if (lower.includes("item")) return `${name} renders an item element`;
    if (lower.includes("form")) return `${name} renders a form section`;

    return `${name} is a reusable UI subcomponent`;
}

/*
🔥 Describe function (logic only)
*/
function describeFunction(name: string) {
    const lower = name.toLowerCase();

    if (lower.includes("submit")) return `${name} handles form submission`;
    if (lower.includes("change")) return `${name} handles input changes`;
    if (lower.includes("click")) return `${name} handles click events`;

    return `${name} is a helper logic function`;
}

/*
🔥 Extract render flow
*/
function buildRenderFlow(component: string, data: any) {
    if (!data.jsxUsage?.length) return null;

    const main = data.jsxUsage
        .filter((el: string) => isComponent(el))
        .slice(0, 5);

    if (!main.length) return null;

    return {
        type: "render_flow",
        text: `${component} renders ${main.join(", ")} in order`,
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
    🔹 1. Overview
    */
    chunks.push({
        type: "overview",
        text: generateOverview(component, data),
        component,
    });

    /*
    🔹 2. Props
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
    🔹 3. Dependencies
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
    🔹 4. Composition
    */
    if (data.internalComponents?.length) {
        chunks.push({
            type: "composition",
            text: `${component} is composed of: ${data.internalComponents.join(", ")}`,
            component,
        });
    }

    /*
    🔹 5. Render Flow (🔥 NEW)
    */
    const flow = buildRenderFlow(component, data);
    if (flow) chunks.push(flow);

    /*
    🔹 6. State
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
    🔹 7. Functions & Subcomponents (🔥 SMART SPLIT)
    */
    if (data.functions?.length) {
        data.functions.forEach((f: any) => {
            if (isComponent(f.name)) {
                // ✅ React subcomponent
                chunks.push({
                    type: "subcomponent",
                    text: describeComponent(f.name),
                    component,
                });

                chunks.push({
                    type: "subcomponent_code",
                    text: `${f.name}: ${shorten(f.code)}`,
                    component,
                });
            } else {
                // ✅ Logic function
                chunks.push({
                    type: "function_summary",
                    text: describeFunction(f.name),
                    component,
                });

                chunks.push({
                    type: "function_code",
                    text: `${f.name}: ${shorten(f.code)}`,
                    component,
                });
            }
        });
    }

    /*
    🔹 8. JSX usage (CLEANED)
    */
    if (data.jsxUsage?.length) {
        const htmlOnly = data.jsxUsage.filter(
            (el: string) => el === el.toLowerCase()
        );

        if (htmlOnly.length) {
            chunks.push({
                type: "usage",
                text: `${component} uses HTML elements: ${htmlOnly.join(", ")}`,
                component,
            });
        }
    }

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

    console.log("\n🔥 PRODUCTION-LEVEL chunks generated!");
}

main();