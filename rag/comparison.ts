import { search } from "./search.ts";
import fs from "fs";
import "dotenv/config";

// ================= CONFIG =================
const EMBEDDING_MODELS = [
    "jina-code-embeddings-1.5b",
    "jina-code-embeddings-0.5b",
    "jina-embeddings-v2-base-code",
    "jina-embeddings-v2-base-en"
];

const LLM_PROVIDERS = ["ollama", "deepseek"];

// ================= OUTPUT FILE =================
const OUTPUT_FILE = "rag/comparison_results.txt";

// Clear file at start
fs.writeFileSync(OUTPUT_FILE, "");

// ================= LLM CALL =================
async function askLLM(prompt: string, provider: string) {

    // ===== OLLAMA =====
    if (provider === "ollama") {
        console.log("➡️ Calling Ollama...");

        const res = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "phi3",
                prompt,
                stream: false,
            }),
        });

        const data = await res.json();
        return data.response;
    }

    // ===== DEEPSEEK =====
    if (provider === "deepseek") {
        console.log("➡️ Calling DeepSeek...");

        const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }],
            }),
        });

        const data = await res.json();
        return data.choices?.[0]?.message?.content || "ERROR";
    }

    throw new Error("Unknown provider");
}

// ================= PROMPT =================
function getCodePrompt(context: string, question: string) {
    return `
You are a senior React engineer working with a proprietary UI component library.

Rules:
- ONLY use components mentioned in context
- DO NOT invent components or props
- Return ONLY React code

Context:
${context}

User request:
${question}
`;
}

// ================= MAIN =================
async function runComparison(question: string) {

    fs.appendFileSync(OUTPUT_FILE, `\n\n==============================\n`);
    fs.appendFileSync(OUTPUT_FILE, `QUESTION: ${question}\n`);
    fs.appendFileSync(OUTPUT_FILE, `==============================\n`);

    const finalResults: any = {};

    for (const embeddingModel of EMBEDDING_MODELS) {

        console.log("\n=======================================");
        console.log("🧠 EMBEDDING:", embeddingModel);
        console.log("=======================================\n");

        fs.appendFileSync(
            OUTPUT_FILE,
            `\n\n=======================================\nEMBEDDING: ${embeddingModel}\n=======================================\n`
        );

        // 🔥 DEBUG START
        console.log("➡️ Starting retrieval...");

        // 🔥 RETRIEVE
        const topChunks = await search(question, embeddingModel);

        console.log("✅ Retrieval done");

        const context = topChunks.map(c => c.text).join("\n\n");

        // Save context
        fs.appendFileSync(OUTPUT_FILE, `\n📚 CONTEXT:\n${context}\n`);

        finalResults[embeddingModel] = {
            context,
            llm_results: {}
        };

        const prompt = getCodePrompt(context, question);

        // 🔥 LOOP LLMs
        for (const provider of LLM_PROVIDERS) {

            console.log("\n-----------------------------");
            console.log("🤖 LLM:", provider);
            console.log("-----------------------------");

            fs.appendFileSync(
                OUTPUT_FILE,
                `\n\n----- LLM: ${provider} -----\n`
            );

            try {
                console.log("➡️ Calling LLM:", provider);

                const answer = await askLLM(prompt, provider);

                console.log("✅ LLM response received");

                console.log(answer);

                fs.appendFileSync(OUTPUT_FILE, `${answer}\n`);

                finalResults[embeddingModel].llm_results[provider] = answer;

            } catch (err) {
                console.log("❌ Failed:", provider);

                fs.appendFileSync(
                    OUTPUT_FILE,
                    `ERROR: ${provider}\n`
                );

                finalResults[embeddingModel].llm_results[provider] = "ERROR";
            }
        }
    }

    // Save JSON
    fs.writeFileSync(
        "rag/comparison_results.json",
        JSON.stringify(finalResults, null, 2)
    );

    console.log("\n📁 Saved:");
    console.log("→ rag/comparison_results.txt");
    console.log("→ rag/comparison_results.json");
}

// ================= RUN =================
//runComparison(`Create a dashboard page`);
runComparison('Create sidebar has a tree showing files names and button to expand it')