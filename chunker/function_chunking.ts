import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "../data/mini-ui-lib/components");
function walk(dir: string): string[] {
    let results: string[] = [];

    fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(walk(filePath));
        }

        if (file.endsWith(".tsx")) {
            results.push(filePath);
        }
    });

    return results;
}

function extractFunctions(code: string) {
    const regex = /const\s+(\w+)\s*:\s*React\.FC[^{]*{([\s\S]*?)}/g;

    const chunks: any[] = [];
    let match;

    while ((match = regex.exec(code)) !== null) {
        chunks.push({
            id: match[1],
            type: "function",
            text: match[0]
        });
    }

    return chunks;
}

function main() {
    const files = walk(root);
    const chunks: any[] = [];

    files.forEach(file => {
        const code = fs.readFileSync(file, "utf8");
        chunks.push(...extractFunctions(code));
    });

    const output = path.resolve(__dirname, "function_chunks.json");

    fs.writeFileSync(output, JSON.stringify(chunks, null, 2));

    console.log("Function chunks saved to:", output);
}

main();