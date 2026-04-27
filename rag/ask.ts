import { search } from "./search.ts";
import fs from "fs";

/*
🔥 Call Ollama (phi3)
*/
async function askLLM(prompt: string) {
    const res = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "phi3",
            prompt,
            stream: false,
        }),
    });

    const data = await res.json();
    return data.response;
}

/*
🔥 Detect request type
*/
function isCodeRequest(query: string) {
    const q = query.toLowerCase();

    return (
        q.includes("create") ||
        q.includes("build") ||
        q.includes("page") ||
        q.includes("dashboard") ||
        q.includes("component")
    );
}

/*
🔥 CODE GENERATION PROMPT
*/
function getCodePrompt(context: string, question: string) {
    return `
You are a senior React engineer working with a proprietary UI component library.

You are given:
1. A user request
2. Metadata about available UI components

Your goal:
Generate a complete React implementation using available components.

Rules:
- Prioritize using provided components
- Do NOT invent components or props
- Only use custom code if necessary
- Return ONLY React code (no explanation)

Context:
${context}

User request:
${question}
`;
}

/*
🔥 QA PROMPT
*/
function getQAPrompt(context: string, question: string) {
    return `
You are a UI component documentation assistant.

Answer ONLY using the provided context.

Question:
${question}

Context:
${context}

Instructions:
- If the question is about props → list them clearly
- Do NOT generate React code
- Do NOT invent information
- Keep answer short and factual
- If something is not specified → say "Not specified"

Answer:
`;
}

/*
🔥 SINGLE MODEL ASK
*/
async function ask(question: string, model: string) {
    console.log("\n🔍 Question:", question);
    console.log("🧠 Model:", model);

    let topChunks = await search(question, model);

    /*
    🔥 OPTIONAL FILTER
    */
    if (!isCodeRequest(question)) {
        const keyword = question.toLowerCase();

        const filtered = topChunks.filter(c =>
            c.component?.toLowerCase().includes(keyword) ||
            keyword.includes(c.component?.toLowerCase())
        );

        if (filtered.length > 0) {
            topChunks = filtered;
        }
    }

    /*
    🔥 BUILD CONTEXT
    */
    const context = topChunks.map((c) => c.text).join("\n\n");

    console.log("\n📚 CONTEXT SENT:\n");
    console.log(context);

    /*
    🔥 SELECT PROMPT
    */
    let prompt;

    if (isCodeRequest(question)) {
        prompt = getCodePrompt(context, question);
    } else {
        prompt = getQAPrompt(context, question);
    }

    /*
    🔥 ASK LLM
    */
    const answer = await askLLM(prompt);

    console.log("\n🔎 TOP CHUNKS:\n", topChunks);
    console.log("\n🧠 ANSWER:\n");
    console.log(answer);

    return { model, answer, chunks: topChunks };
}

/*
🔥 MULTI-MODEL RUNNER
*/
const MODELS = [
    "jina-code-embeddings-1.5b",
    "jina-code-embeddings-0.5b",
    "jina-embeddings-v2-base-code",
    "jina-embeddings-v2-base-en"
];

async function runAllModels(question: string) {
    const results: any[] = [];

    for (const model of MODELS) {
        console.log("\n===============================");
        console.log("🚀 TESTING MODEL:", model);
        console.log("===============================\n");

        const res = await ask(question, model);
        results.push(res);

        /*
        🔥 SAVE EACH RESULT (optional)
        */
        fs.appendFileSync(
            "rag/results.txt",
            `\n\n===== ${model} =====\n${res.answer}\n`
        );
    }

    /*
    🔥 SAVE JSON (better for analysis)
    */
    fs.writeFileSync(
        "rag/results.json",
        JSON.stringify(results, null, 2)
    );

    console.log("\n📁 Results saved to:");
    console.log("→ rag/results.txt");
    console.log("→ rag/results.json");
}

/*
🔥 RUN TEST
*/
runAllModels("Create a dashboard page with a tree and refresh button");

// Try also:
// runAllModels("What props does Button support?");
// runAllModels("How do I handle click events in input?");