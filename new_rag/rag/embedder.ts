import fs from "fs";
import path from "path";

const root = path.resolve("data/mini-ui-lib/components");

// ✅ MODEL FROM CLI
const MODEL = process.argv[2] || "jina-embeddings-v2-base-code";

console.log("🚀 Using model:", MODEL);

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
// BUILD CLEAN CHUNK TEXT
// =============================
function buildChunkText(chunk: any): string {
    // ❌ skip invalid chunks
    if (!chunk.name || chunk.name === "undefined") return "";

    return `
Component: ${chunk.component}

Prop: ${chunk.name}
Type: ${chunk.dataType || "unknown"}
Required: ${chunk.required ? "YES" : "NO"}

Description:
${chunk.description || "No description provided."}
`.trim();
}

// =============================
// EMBED FUNCTION
// =============================
async function embed(text: string, retries = 3): Promise<number[]> {
    try {
        const res = await fetch("https://api.jina.ai/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.JINA_API_KEY}`,
            },
            body: JSON.stringify({
                model: MODEL,
                input: [text], // ✅ must be array
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

        const raw = fs.readFileSync(file, "utf8").trim();

        if (!raw) {
            console.log("⚠️ Empty file skipped:", file);
            continue;
        }

        let chunks;
        try {
            chunks = JSON.parse(raw);
        } catch (err) {
            console.log("❌ Invalid JSON:", file);
            continue;
        }

        const cleanChunks: any[] = [];

        // =============================
        // EMBED CHUNKS
        // =============================
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            const text = buildChunkText(chunk);

            // ❌ skip bad chunks
            if (!text) continue;

            console.log(`→ Chunk: ${chunk.name} (${i + 1}/${chunks.length})`);

            chunk.text = text;

            await new Promise((r) => setTimeout(r, 100));

            chunk.embedding = await embed(text);
            chunk.type = "chunk";
            chunk.model = MODEL;

            cleanChunks.push(chunk);
        }

        // =============================
        // SAVE CLEAN EMBEDDINGS
        // =============================
        const embeddedPath = file.replace(
            "chunks.",
            `embedded.${MODEL}.`
        );

        fs.writeFileSync(embeddedPath, JSON.stringify(cleanChunks, null, 2));
        console.log("✅ Saved:", embeddedPath);
    }

    console.log("\n🔥 DONE for model:", MODEL);
}

// ✅ IMPORTANT: call OUTSIDE
main();