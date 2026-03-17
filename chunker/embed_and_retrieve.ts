import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/*
Fix ES module paths
*/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
Chunk files
*/
const FUNCTION_CHUNKS = path.resolve(__dirname, "function_chunks.json");
const AST_CHUNKS = path.resolve(__dirname, "ast_chunks.json");

/*
Evaluation queries
*/
const queries = [

    "What props does the Button component support?",
    "What variants does the Button component have?",
    "How does the Button handle click events?",
    "What does the Tree component render?",
    "How does the Tree component receive its data?",
    "How does TreeNode render child nodes?",
    "How does recursion work in the TreeNode component?",
    "What interface defines the Tree node structure?",
    "How are children nodes represented in TreeNodeData?",
    "How does the Tree component iterate through nodes?"

];

/*
Simple keyword scoring
*/
function scoreChunk(query: string, text: string) {

    const words = query.toLowerCase().split(" ");

    let score = 0;

    for (const w of words) {

        if (text.toLowerCase().includes(w))
            score++;

    }

    return score;

}

/*
Run retrieval benchmark
*/
function runBenchmark(file: string) {

    console.log("\n=================================");
    console.log("Testing:", file);
    console.log("=================================");

    const chunks = JSON.parse(fs.readFileSync(file, "utf8"));

    let correct = 0;

    for (const q of queries) {

        const ranked = chunks
            .map((c: any) => ({
                chunk: c,
                score: scoreChunk(q, c.text)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        console.log("\nQuery:", q);

        ranked.forEach((r, i) => {

            console.log(`Result ${i + 1} | score: ${r.score}`);
            console.log(r.chunk.text.slice(0, 120));

        });

        if (ranked[0].score > 0)
            correct++;

    }

    console.log("\nScore:", correct, "/", queries.length);
    console.log("Accuracy:", (correct / queries.length * 100).toFixed(2), "%");

    return correct;

}

/*
Compare strategies
*/
function main() {

    const funcScore = runBenchmark(FUNCTION_CHUNKS);
    const astScore = runBenchmark(AST_CHUNKS);

    console.log("\n===============================");
    console.log("FINAL RESULT");
    console.log("===============================");

    console.log("Function Chunking:", funcScore);
    console.log("AST Chunking:", astScore);

    if (funcScore > astScore)
        console.log("Function chunking performed better");

    else if (astScore > funcScore)
        console.log("AST chunking performed better");

    else
        console.log("Both strategies performed equally");

}

main();