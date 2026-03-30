import fs from "fs";
import path from "path";
import ts from "typescript";
import { fileURLToPath } from "url";

/*
ESM fix
*/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
Components root
*/
const root = path.resolve(__dirname, "../data/mini-ui-lib/components");

/*
Walk directory
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
Parse component file
*/
function parseFile(file: string) {
    const code = fs.readFileSync(file, "utf8");

    const source = ts.createSourceFile(
        file,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    const componentName = path.basename(file, ".tsx");

    const dependencies = new Set<string>();
    const jsxComponents = new Set<string>();
    const internalComponents = new Set<string>();

    const functions: any[] = [];
    const state: any[] = [];

    function visit(node: ts.Node) {

        /*
        🔹 IMPORTS → dependencies
        */
        if (ts.isImportDeclaration(node)) {
            const module = node.moduleSpecifier
                .getText(source)
                .replace(/['"]/g, "");

            if (
                node.importClause?.namedBindings &&
                ts.isNamedImports(node.importClause.namedBindings)
            ) {
                node.importClause.namedBindings.elements.forEach(el => {
                    const name = el.name.text;

                    // ❌ skip React + hooks + types
                    if (
                        name === "React" ||
                        name === "useState" ||
                        name.startsWith("I")
                    ) return;

                    dependencies.add(name);
                });
            }
        }

        /*
        🔹 STATE (useState only)
        */
        if (ts.isVariableDeclaration(node)) {
            const text = node.getText(source);

            if (text.includes("useState")) {
                state.push({
                    code: text
                });
            }
        }

        /*
        🔹 FUNCTIONS (exclude main component)
        */
        if (ts.isVariableStatement(node)) {
            const text = node.getText(source);

            if (text.includes("=>")) {
                const name =
                    node.declarationList.declarations[0]?.name.getText(source);

                if (name && name !== componentName) {
                    functions.push({
                        name,
                        code: text
                    });

                    // mark as internal component if capitalized
                    if (name[0] === name[0].toUpperCase()) {
                        internalComponents.add(name);
                    }
                }
            }
        }

        /*
        🔹 JSX usage
        */
        if (
            ts.isJsxSelfClosingElement(node) ||
            ts.isJsxOpeningElement(node)
        ) {
            const tagName = node.tagName.getText(source);

            // Only React components (capitalized)
            if (tagName[0] === tagName[0].toUpperCase()) {
                jsxComponents.add(tagName);
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(source);

    return {
        component: componentName,
        file,
        dependencies: [...dependencies],
        jsxUsage: [...jsxComponents],
        internalComponents: [...internalComponents],
        state,
        functions
    };
}

/*
Main
*/
function main() {
    const files = walk(root);

    const results: any[] = [];

    files.forEach(file => {
        console.log("Parsing:", file);
        results.push(parseFile(file));
    });

    const output = path.resolve(__dirname, "component_chunks.json");

    fs.writeFileSync(output, JSON.stringify(results, null, 2));

    console.log("✅ FINAL structured chunks created at:", output);
}

main();