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
// SIMPLE BM25-LIKE SCORING
// =============================

/*
function keywordScore(query: string, text: string) {
    const q = query.toLowerCase().split(/\s+/);
    const t = text.toLowerCase();

    let score = 0;
    for (const word of q) {
        if (t.includes(word)) score += 1;
    }

    return score / q.length;
}
*/

// =============================
// LOAD EMBEDDINGS
// =============================
function loadAll(model: string) {
    let all: any[] = [];

    function walk(dir: string) {
        fs.readdirSync(dir).forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                walk(filePath);
                return;
            }

            if (file.includes(`embedded.${model}`)) {
                try {
                    const raw = fs.readFileSync(filePath, "utf8").trim();
                    if (!raw) return;

                    const data = JSON.parse(raw);
                    if (Array.isArray(data)) all = all.concat(data);
                    else all.push(data);
                } catch { }
            }
        });
    }

    walk(root);
    return all;
}

// =============================
// INTENT + COMPONENT DETECTION
// =============================
function analyzeQuery(query: string) {
    const q = query.toLowerCase();

    const components = ["button", "tree", "dashboard", "input", "form", "header"]
        .filter(c => q.includes(c));

    const intent = {
        wantsProps: q.includes("props") || q.includes("required") || q.includes("mandatory"),
        wantsUsage: q.includes("usage") || q.includes("example"),
        wantsStructure: q.includes("interface") || q.includes("type"),
    };

    return { components, intent };
}

// =============================
// EMBED QUERY
// =============================
async function embedQuery(text: string, model: string) {
    const res = await fetch("https://api.jina.ai/v1/embeddings", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        },
        body: JSON.stringify({ model, input: [text] }),
    });

    const data = await res.json();

    if (!data?.data?.[0]?.embedding) {
        throw new Error("Embedding failed");
    }

    return data.data[0].embedding;
}

// =============================
// SEARCH (PRODUCTION-GRADE)
// =============================
export async function search(query: string, model: string) {
    const all = loadAll(model);
    if (all.length === 0) return [];

    const { components, intent } = analyzeQuery(query);
    const queryVec = await embedQuery(query, model);

    // =============================
    // STEP 1: PRE-FILTER (IMPORTANT)
    // =============================
    let candidates = all;

    if (intent.wantsProps || intent.wantsStructure) {
        candidates = candidates.filter(item =>
            item.type === "property" || item.type === "definition"
        );
    }

    if (components.length > 0) {
        candidates = candidates.filter(item =>
            components.some(c => item.component?.toLowerCase().includes(c))
        );
    }

    // fallback if too strict
    if (candidates.length < 10) candidates = all;

    // =============================
    // STEP 2: HYBRID SCORING
    // =============================
    const scored = candidates.map(item => {
        const text =
            item.text ||
            item.description ||
            item.name ||
            "";

        const dense = cosine(queryVec, item.embedding);
        const sparse = keywordScore(query, text);

        let score = 0.7 * dense + 0.3 * sparse;

        // =============================
        // INTENT BOOSTING
        // =============================
        if (intent.wantsProps && item.definition?.toLowerCase().includes("props")) {
            score += 0.3;
        }

        if (intent.wantsStructure && item.type === "definition") {
            score += 0.25;
        }

        if (intent.wantsUsage && item.type === "render") {
            score += 0.2;
        }

        // =============================
        // PENALTIES (noise reduction)
        // =============================
        if (item.type === "function" || item.type === "dependency") {
            score -= 0.2;
        }

        return { ...item, score };
    });

    // =============================
    // STEP 3: RETRIEVE MORE
    // =============================
    const topCandidates = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 40);

    // =============================
    // STEP 4: SIMPLE RERANK (LOCAL)
    // =============================
    const reranked = topCandidates.map(item => {
        let score = item.score;

        const text = (item.text || "").toLowerCase();

        // reward richer chunks (longer = more context)
        if (text.length > 200) score += 0.1;

        // reward structured definitions
        if (item.type === "definition") score += 0.15;

        return { ...item, score };
    });

    // =============================
    // STEP 5: FINAL SELECT
    // =============================
    return reranked
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
}