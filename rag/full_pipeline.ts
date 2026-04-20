import fs from "fs";
import path from "path";
import ts from "typescript";
import tsj from "ts-json-schema-generator";
import { fileURLToPath } from "url";

/*
ESM fix
*/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
Paths
*/
const root = path.resolve(__dirname, "../data/mini-ui-lib/components");
const tsconfigPath = path.resolve(__dirname, "../data/mini-ui-lib/tsconfig.json");

/*
Schema cache (🔥 performance boost)
*/
const schemaCache = new Map<string, any>();

/*
Walk all TSX files
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
🔥 UPDATED SCHEMA EXTRACTOR (FIXED)
*/
function getSchema(componentName: string) {
    if (schemaCache.has(componentName)) {
        return schemaCache.get(componentName);
    }

    const typesPath = path.join(
        root,
        componentName,
        `${componentName}.tsx`
    );

    if (!fs.existsSync(typesPath)) return null;

    try {
        const config = {
            path: typesPath,
            tsconfig: tsconfigPath,
            type: "*",
            skipTypeCheck: true
        };

        const generator = tsj.createGenerator(config);
        const schema = generator.createSchema("*");

        const defs = schema.definitions || {};

        /*
        🔥 SMART SELECTION LOGIC
        */

        const expectedProps = `${componentName}Props`;
        let selected: any = null;

        // ✅ 1. Exact match (BEST CASE)
        if (defs[expectedProps]) {
            selected = {
                [expectedProps]: defs[expectedProps]
            };
        }

        // ✅ 2. Fallback → anything with "Props"
        if (!selected) {
            const propsKey = Object.keys(defs).find(k =>
                k.toLowerCase().includes("props")
            );

            if (propsKey) {
                selected = {
                    [propsKey]: defs[propsKey]
                };
            }
        }

        // ✅ 3. Fallback → data types (TreeNodeData, etc.)
        if (!selected) {
            const dataKey = Object.keys(defs).find(k =>
                k.toLowerCase().includes("data")
            );

            if (dataKey) {
                selected = {
                    [dataKey]: defs[dataKey]
                };
            }
        }

        // ✅ 4. Last fallback (avoid crash)
        if (!selected) {
            const firstKey = Object.keys(defs)[0];
            selected = firstKey ? { [firstKey]: defs[firstKey] } : null;
        }

        schemaCache.set(componentName, selected);

        return selected;

    } catch {
        return null;
    }
}

/*
🔥 PARSE COMPONENT (AST + SCHEMA)
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
    const jsxUsage = new Set<string>();
    const internalComponents = new Set<string>();

    const functions: any[] = [];
    const state: any[] = [];

    function visit(node: ts.Node) {

        /*
        🔹 IMPORTS → dependencies
        */
        if (ts.isImportDeclaration(node)) {
            if (
                node.importClause?.namedBindings &&
                ts.isNamedImports(node.importClause.namedBindings)
            ) {
                node.importClause.namedBindings.elements.forEach(el => {
                    const name = el.name.text;

                    if (
                        name === "React" ||
                        name === "useState"
                    ) return;

                    dependencies.add(name);
                });
            }
        }

        /*
        🔹 STATE (accurate detection)
        */
        if (
            ts.isVariableDeclaration(node) &&
            node.initializer &&
            ts.isCallExpression(node.initializer) &&
            node.initializer.expression.getText(source) === "useState"
        ) {
            state.push({
                code: node.getText(source)
            });
        }

        /*
        🔹 FUNCTIONS (arrow functions)
        */
        if (
            ts.isVariableDeclaration(node) &&
            node.initializer &&
            ts.isArrowFunction(node.initializer)
        ) {
            const name = node.name.getText(source);

            if (name !== componentName) {
                const code = node.parent.parent.getText(source);

                functions.push({ name, code });

                if (name[0] === name[0].toUpperCase()) {
                    internalComponents.add(name);
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
            const tag = node.tagName.getText(source);

            if (tag[0] === tag[0].toUpperCase()) {
                jsxUsage.add(tag);
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(source);

    /*
    🔥 Attach FIXED schema
    */
    const ownSchema = getSchema(componentName);

    const enrichedDependencies = [...dependencies].map(dep => ({
        name: dep,
        schema: getSchema(dep)
    }));

    /*
    🔥 FINAL OBJECT
    */
    return {
        component: componentName,
        file,

        schema: ownSchema,

        dependencies: enrichedDependencies,
        jsxUsage: [...jsxUsage],
        internalComponents: [...internalComponents],

        state,
        functions
    };
}

/*
🔥 MAIN (PER COMPONENT OUTPUT)
*/
function main() {
    const files = walk(root);

    files.forEach(file => {
        console.log("Parsing:", file);

        const result = parseFile(file);

        const componentDir = path.dirname(file);

        const outputPath = path.join(
            componentDir,
            `${result.component}.full.json`
        );

        fs.writeFileSync(
            outputPath,
            JSON.stringify(result, null, 2)
        );

        console.log("✅ Created:", outputPath);
    });

    console.log("🔥 ALL COMPONENTS PROCESSED SUCCESSFULLY");
}

main();