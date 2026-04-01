import fs from "fs";
import path from "path";

const root = path.resolve("data/mini-ui-lib/components");

function walk(dir: string): string[] {
    let results: string[] = [];

    fs.readdirSync(dir).forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(walk(filePath));
        }

        if (file.endsWith(".chunks.json")) {
            results.push(filePath);
        }
    });

    return results;
}

async function embed(text: string) {
    const res = await fetch("https://api.jina.ai/v1/embeddings", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        },
        body: JSON.stringify({
            model: "jina-embeddings-v2-base-en",
            input: text,
        }),
    });

    const data = await res.json();

    if (!data?.data?.[0]?.embedding) {
        throw new Error("Embedding failed");
    }

    return data.data[0].embedding;
}

async function main() {
    const files = walk(root);

    for (const file of files) {
        console.log("Embedding:", file);

        const chunks = JSON.parse(fs.readFileSync(file, "utf8"));

        for (const chunk of chunks) {
            chunk.embedding = await embed(chunk.text);
        }

        const output = file.replace(".chunks.json", ".embedded.json");

        fs.writeFileSync(output, JSON.stringify(chunks, null, 2));
    }

    console.log("🔥 Embeddings done!");
}

main();