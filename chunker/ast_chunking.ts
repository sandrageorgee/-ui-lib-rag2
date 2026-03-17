import fs from "fs";
import path from "path";
import ts from "typescript";
import { fileURLToPath } from "url";

/*
Fix for ES modules (Node v22)
*/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
Locate components directory
*/
const root = path.resolve(__dirname, "../data/mini-ui-lib/components");

/*
Recursively walk components folder
*/
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

/*
AST parsing
*/
function parseFile(file: string) {

    const code = fs.readFileSync(file, "utf8");

    const source = ts.createSourceFile(
        file,
        code,
        ts.ScriptTarget.Latest,
        true
    );

    const chunks: any[] = [];

    function visit(node: ts.Node) {

        /*
        Capture functions and React components
        */
        if (
            ts.isFunctionDeclaration(node) ||
            ts.isVariableStatement(node) ||
            ts.isArrowFunction(node)
        ) {

            const text = node.getText(source);

            chunks.push({
                id: `${path.basename(file)}_${node.pos}`,
                file: file,
                type: "ast_node",
                text
            });

        }

        ts.forEachChild(node, visit);
    }

    visit(source);

    return chunks;
}

/*
Main
*/
function main() {

    const files = walk(root);

    const chunks: any[] = [];

    files.forEach(file => {

        console.log("Parsing:", file);

        chunks.push(...parseFile(file));

    });

    const output = path.resolve(__dirname, "ast_chunks.json");

    fs.writeFileSync(
        output,
        JSON.stringify(chunks, null, 2)
    );

    console.log("AST chunks created at:", output);
}

main();