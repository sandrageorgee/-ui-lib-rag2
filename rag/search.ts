import fs from "fs";
import path from "path";

const root = path.resolve("data/mini-ui-lib/components");

// =============================
// COSINE SIMILARITY
// =============================
function cosine(a: number[], b: number[]) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));

    return dot / (magA * magB);
}

// =============================
// LOAD ALL EMBEDDINGS
// =============================
function loadAll() {
    let all: any[] = [];

    function walk(dir: string) {
        fs.readdirSync(dir).forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) walk(filePath);

            // ✅ load chunks
            if (file.endsWith(".embedded.json")) {
                const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
                all = all.concat(data);
            }

            // ✅ load components
            if (file.endsWith(".component.json")) {
                const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
                all.push(data);
            }
        });
    }

    walk(root);
    return all;
}

// =============================
// EMBED QUERY (FIXED)
// =============================
async function embedQuery(text: string) {
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
        console.log("❌ Jina response:", data);
        throw new Error("Embedding failed");
    }

    return data.data[0].embedding;
}

// =============================
// SEARCH (SMART RANKING)
// =============================
export async function search(query: string) {
    const all = loadAll();
    const queryVec = await embedQuery(query);

    const scored = all.map((item) => {
        let score = cosine(queryVec, item.embedding);

        // 🔥 BOOSTING STRATEGY
        if (item.type === "component") score *= 1.1; // boost overview
        if (item.type === "chunk") score *= 1.0;

        // 🔥 keyword boost (VERY POWERFUL)
        if (item.name && query.toLowerCase().includes(item.name.toLowerCase())) {
            score += 0.2;
        }

        return { ...item, score };
    });

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
}