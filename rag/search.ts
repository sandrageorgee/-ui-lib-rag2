import fs from "fs";
import path from "path";

const root = path.resolve("data/mini-ui-lib/components");

function cosine(a: number[], b: number[]) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));

    return dot / (magA * magB);
}

function loadAllChunks() {
    let all: any[] = [];

    function walk(dir: string) {
        fs.readdirSync(dir).forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) walk(filePath);

            if (file.endsWith(".embedded.json")) {
                const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
                all = all.concat(data);
            }
        });
    }

    walk(root);
    return all;
}

async function embedQuery(text: string) {
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

    return data.data[0].embedding;
}

export async function search(query: string) {
    const allChunks = loadAllChunks();
    const queryVec = await embedQuery(query);

    const scored = allChunks.map((chunk) => ({
        ...chunk,
        score: cosine(queryVec, chunk.embedding),
    }));

    return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}