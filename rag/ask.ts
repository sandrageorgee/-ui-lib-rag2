import { search } from "./search.ts";

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
    return (
        query.toLowerCase().includes("create") ||
        query.toLowerCase().includes("build") ||
        query.toLowerCase().includes("page") ||
        query.toLowerCase().includes("dashboard") ||
        query.toLowerCase().includes("component")
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
🔥 MAIN
*/
async function ask(question: string) {
    console.log("\n🔍 Question:", question);

    let topChunks = await search(question);

    /*
    🔥 FILTER (reduce noise for QA)
    */
    if (!isCodeRequest(question)) {
        const keyword = question.toLowerCase();

        topChunks = topChunks.filter(c =>
            keyword.includes(c.component?.toLowerCase())
        );
    }

    /*
    🔥 BUILD CLEAN CONTEXT
    */
    const context = topChunks
        .map((c) => {
            if (c.type === "property") {
                return `${c.component}.${c.name}: ${c.dataType}`;
            }

            return c.text;
        })
        .join("\n");

    console.log("\n📚 CONTEXT SENT:\n");
    console.log(context);

    /*
    🔥 SELECT PROMPT TYPE
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
}

/*
🔥 TEST
*/
ask("what is the mandatory props for the tree component");

// try also:
// ask("Create a dashboard page with a tree and refresh button");