
import { search } from "./search.ts";
import fs from "fs";

/*
🔥 LLM CONFIG
*/
const LLM_MODEL = "deepseek-v3.2:cloud";

/*
🔥 EMBEDDING MODELS (what you want)
*/
const EMBEDDING_MODELS = [
    "jina-code-embeddings-1.5b",
    "jina-code-embeddings-0.5b",
    "jina-embeddings-v2-base-code",
    "jina-embeddings-v2-base-en"
];

/*
🔥 CALL LLM (STREAMING)
*/
async function askLLM(prompt: string) {
    const res = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: LLM_MODEL,
            prompt,
            stream: true,
        }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    let full = "";

    console.log("\n🧠 ANSWER:\n");

    while (true) {
        const { value, done } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
            try {
                const json = JSON.parse(line);

                if (json.response) {
                    process.stdout.write(json.response);
                    full += json.response;
                }
            } catch { }
        }
    }

    console.log("\n");
    return full;
}

/*
🔥 TYPE DETECTION
*/
function isCodeRequest(q: string) {
    q = q.toLowerCase();
    return (
        q.includes("create") ||
        q.includes("build") ||
        q.includes("page") ||
        q.includes("component") ||
        q.includes("dashboard")
    );
}

/*
🔥 PROMPTS
*/
function getPrompt(context: string, question: string) {
    if (isCodeRequest(question)) {
        return `
You are a senior React engineer.

Use ONLY provided components.

Return ONLY React code.

    Context:
${context}

Request:
${question}
`;
    }

    return `
You are a UI documentation assistant.

Answer ONLY using context.

    Question:
        ${question}

Context:
${context}

Rules:
- No hallucination
    - No code
        - If missing → "Not specified"
`;
}

/*
🔥 RUN PER MODEL
*/
async function runPerModel(question: string, model: string) {
    console.log("\n===============================");
    console.log("🚀 EMBEDDING MODEL:", model);
    console.log("===============================\n");

    let chunks;

    try {
        chunks = await search(question, model);
    } catch (err) {
        console.log("⚠️ Embedding failed → fallback");

        // fallback to any saved clusters
        const fallback =
            "data/mini-ui-lib/components/Button/Button.clusters.text.json";

        chunks = JSON.parse(fs.readFileSync(fallback, "utf-8")).slice(0, 5);
    }

    const context = chunks.map((c: any) => c.text).join("\n\n");

    console.log("\n📚 CONTEXT:\n", context);

    const prompt = getPrompt(context, question);

    const answer = await askLLM(prompt);

    return { model, answer };
}

/*
🔥 MAIN
*/
async function runAll(question: string) {
    const results = [];

    for (const model of EMBEDDING_MODELS) {
        const res = await runPerModel(question, model);
        results.push(res);

        fs.appendFileSync(
            "rag/results.txt",
            `\n\n ===== ${model} =====\n${res.answer} \n`
        );
    }

    fs.writeFileSync(
        "rag/results.json",
        JSON.stringify(results, null, 2)
    );

    console.log("\n📁 Saved results.");
}

/*
🔥 RUN
*/
runAll("Create a dashboard page with a tree and refresh button");
