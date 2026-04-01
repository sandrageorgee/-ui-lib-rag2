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
🔥 MAIN
*/
async function ask(question: string) {
    console.log("\n🔍 Question:", question);

    const topChunks = await search(question);

    const context = topChunks
        .map((c) => `- ${c.text}`)
        .join("\n");

    console.log("\n📚 CONTEXT SENT:\n");
    console.log(context);

    /*
    🔥 UPDATED PROMPT (VERY IMPORTANT)
    */
    const prompt = `
You are a React UI assistant.

STRICT RULES (MUST FOLLOW):
- Use ONLY the provided context
- DO NOT invent props, components, or attributes
- If a prop is not explicitly listed in the context → DO NOT use it


If the request cannot be fulfilled using the context:
- Respond with "Not possible with current components"

Output:
- Return ONLY JSX
- No explanations

Context:
${context}

User request:
${question}
`;

    const answer = await askLLM(prompt);

    console.log("\n🧠 ANSWER:\n");
    console.log(answer);
}

/*
🔥 TEST (UPDATED)
*/
ask("Create a green clickable button with text Press");