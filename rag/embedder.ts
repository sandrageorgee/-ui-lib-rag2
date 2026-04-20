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
// BUILD TEXT (SAFE)
// =============================
function buildText(chunk: any): string {
    return `
Component: ${chunk.component}
Definition: ${chunk.definition}
Name: ${chunk.name}
Type: ${chunk.type}
DataType: ${chunk.dataType || ""}
Signature: ${chunk.signature || ""}
Description: ${chunk.description || ""}
Enum: ${chunk.enum || ""}
`.trim();
}

// =============================
// EMBED (WITH RETRY)
// =============================
async function embed(text: string, retries = 3): Promise<number[]> {
    try {
        const res = await fetch("https://api.jina.ai/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: 'Bearer jina_889fe3bdf8f14a739db02e8b683235c0l8x6_0WukfNvCzNxmQU_6FWQAi_a',
            },
            body: JSON.stringify({
                model: "jina-embeddings-v2-base-en",
                input: text,
            }),
        });

        const data = await res.json();

        // 🔥 DEBUG LOG (IMPORTANT)
        if (!data?.data?.[0]?.embedding) {
            console.log("❌ Jina response:", JSON.stringify(data, null, 2));
            throw new Error("Invalid embedding response");
        }

        return data.data[0].embedding;

    } catch (err) {
        if (retries > 0) {
            console.log("⚠️ Retry embedding...");
            await new Promise(r => setTimeout(r, 1500));
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
        console.log("\n🔍 Embedding:", file);

        const chunks = JSON.parse(fs.readFileSync(file, "utf8"));

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            // 🔥 SAFE TEXT BUILD
            const text = chunk.text || buildText(chunk);

            console.log(`→ ${chunk.name || "unknown"} (${i + 1}/${chunks.length})`);

            chunk.text = text;

            // 🔥 SMALL DELAY (RATE LIMIT SAFE)
            await new Promise(r => setTimeout(r, 100));

            chunk.embedding = await embed(text);
        }

        const output = file.replace("chunks.", "embedded.");
        fs.writeFileSync(output, JSON.stringify(chunks, null, 2));

        console.log("✅ Saved:", output);
    }

    console.log("\n🔥 ALL EMBEDDINGS DONE!");
}

main();