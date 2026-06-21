import fs from "fs";
import path from "path";

// ===== CONFIG =====
const BASE_DIR = "./data/mini-ui-lib/components";
const QUERIES_PATH = "./rag/evaluation/queries.json";

const MODELS = [
    "jina-code-embeddings-1.5b",
    "jina-code-embeddings-0.5b",
    "jina-embeddings-v2-base-code",
    "jina-embeddings-v2-base-en"
];

// ===== COSINE =====
function cosine(a: number[], b: number[]) {
    let dot = 0, na = 0, nb = 0;

    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }

    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ===== EMBED QUERY =====
async function embedQuery(text: string, model: string) {
    const res = await fetch("https://api.jina.ai/v1/embeddings", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.JINA_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            input: [text]
        })
    });

    const data = await res.json();
    return data.data[0].embedding;
}

// ===== MAIN =====
async function run() {
    const queries = JSON.parse(fs.readFileSync(QUERIES_PATH, "utf-8"));

    const finalResults: any[] = [];

    for (const q of queries) {
        console.log(`\n🔍 Query: ${q.query}`);

        const queryResult: any = {
            query: q.query,
            target: q.target,
            results: {}
        };

        for (const model of MODELS) {
            console.log(`   → ${model}`);

            const queryEmbedding = await embedQuery(q.query, model);

            let allChunks: any[] = [];

            const components = fs.readdirSync(BASE_DIR);

            for (const comp of components) {
                const file = path.join(
                    BASE_DIR,
                    comp,
                    `embedded.${model}.${comp}.json`
                );

                if (!fs.existsSync(file)) continue;

                const data = JSON.parse(fs.readFileSync(file, "utf-8"));
                allChunks.push(...data);
            }

            const scored = allChunks.map(chunk => ({
                name: chunk.name,
                description: chunk.description,
                score: cosine(queryEmbedding, chunk.embedding)
            }));

            scored.sort((a, b) => b.score - a.score);

            const top5 = scored.slice(0, 5);

            queryResult.results[model] = top5;

            // 🔥 PRINT nicely
            console.log("      Top results:");
            top5.forEach((r, i) => {
                console.log(
                    `      ${i + 1}. ${r.name} (${r.score.toFixed(3)})`
                );
            });
        }

        finalResults.push(queryResult);
    }

    // ===== SAVE FILE =====
    fs.writeFileSync(
        "./rag/evaluation/inspection.json",
        JSON.stringify(finalResults, null, 2)
    );

    console.log("\n📁 Saved: rag/evaluation/inspection.json");
}

run();