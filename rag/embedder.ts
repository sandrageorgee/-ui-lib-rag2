import fs from "fs";
import path from "path";

const root = path.resolve("data/mini-ui-lib/components");

// =============================
// WALK ALL CHUNK FILES
// =============================
function walk(dir: string): string[] {
    let results: string[] = [];

    fs.readdirSync(dir).forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(walk(filePath));
        }

        if (file.startsWith("chunks")) {
            results.push(filePath);
        }
    });

    return results;
}

// =============================
// BUILD CHUNK TEXT (IMPROVED)
// =============================
function buildChunkText(chunk: any): string {
    return `
The ${chunk.component} component has a property called "${chunk.name}".

Type: ${chunk.dataType || "unknown"}

Description:
${chunk.description || "No description provided."}

Code:
${chunk.signature || ""}
`.trim();
}

// =============================
// READ COMPONENT FILE (.tsx)
// =============================
function getComponentCode(filePath: string, component: string): string {
    const dir = path.dirname(filePath);

    // try common names
    const possibleFiles = [
        `${component}.tsx`,
        `${component}.ts`,
        "index.tsx",
        "index.ts",
    ];

    for (const f of possibleFiles) {
        const fullPath = path.join(dir, f);
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, "utf8");
        }
    }

    console.log("⚠️ No component file found for", component);
    return "";
}

// =============================
// BUILD COMPONENT TEXT
// =============================
function buildComponentText(component: string, code: string): string {
    return `
This is the full implementation of the ${component} component.

Code:
${code}
`.trim();
}

// =============================
// EMBED (FIXED)
// =============================
async function embed(text: string, retries = 3): Promise<number[]> {
    try {
        const res = await fetch("https://api.jina.ai/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer jina_889fe3bdf8f14a739db02e8b683235c0l8x6_0WukfNvCzNxmQU_6FWQAi_a`, // ✅ FIXED
            },
            body: JSON.stringify({
                model: "jina-embeddings-v2-base-code",
                input: [text], 
            }),
        });

        const data = await res.json();

        if (!data?.data?.[0]?.embedding) {
            console.log("❌ Jina response:", JSON.stringify(data, null, 2));
            throw new Error("Invalid embedding response");
        }

        return data.data[0].embedding;
    } catch (err) {
        if (retries > 0) {
            console.log("⚠️ Retry embedding...");
            await new Promise((r) => setTimeout(r, 1500));
            return embed(text, retries - 1);
        }

        throw err;
    }
}

// =============================
// MAIN PIPELINE
// =============================
async function main() {
    const files = walk(root);

    for (const file of files) {
        console.log("\n🔍 Processing:", file);

        const chunks = JSON.parse(fs.readFileSync(file, "utf8"));
        const component = chunks[0]?.component || "Unknown";

        // =============================
        // 1. EMBED CHUNKS
        // =============================
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            const text = buildChunkText(chunk);

            console.log(`→ Chunk: ${chunk.name} (${i + 1}/${chunks.length})`);

            chunk.text = text;

            await new Promise((r) => setTimeout(r, 100));

            chunk.embedding = await embed(text);
            chunk.type = "chunk";
        }

        const embeddedPath = file.replace("chunks.", "embedded.");
        fs.writeFileSync(embeddedPath, JSON.stringify(chunks, null, 2));
        console.log("✅ Saved chunks:", embeddedPath);

        // =============================
        // 2. EMBED FULL COMPONENT (.tsx)
        // =============================
        const code = getComponentCode(file, component);

        if (code) {
            const componentText = buildComponentText(component, code);

            console.log("→ Embedding full component:", component);

            const componentEmbedding = await embed(componentText);

            const componentOutput = {
                component,
                text: componentText,
                embedding: componentEmbedding,
                type: "component",
            };

            const componentPath = file.replace("chunks.", "component.");
            fs.writeFileSync(componentPath, JSON.stringify(componentOutput, null, 2));

            console.log("✅ Saved component:", componentPath);
        }
    }

    console.log("\n🔥 ALL EMBEDDINGS DONE!");
}

main();