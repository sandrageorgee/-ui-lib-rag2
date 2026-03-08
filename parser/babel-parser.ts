import fs from "fs";
import path from "path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default;

const ROOT = "./data/mini-ui-lib/components";

type Result = {
    parser: string;
    component: string;
    propsInterface: string;
    file: string;
};

const results: Result[] = [];

function getFiles(dir: string, files: string[] = []): string[] {
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
        const full = path.join(dir, entry);

        if (fs.statSync(full).isDirectory()) {
            getFiles(full, files);
        } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
            files.push(full);
        }
    }

    return files;
}

const files = getFiles(ROOT);

for (const file of files) {
    const code = fs.readFileSync(file, "utf8");

    const ast = parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx"]
    });

    let component = "";
    let propsInterface = "";

    traverse(ast, {

        TSInterfaceDeclaration(path) {
            propsInterface = path.node.id.name;
        },

        FunctionDeclaration(path) {
            if (path.node.id) {
                component = path.node.id.name;
            }
        },

        VariableDeclarator(path) {
            if (
                path.node.id.type === "Identifier" &&
                path.node.init &&
                (path.node.init.type === "ArrowFunctionExpression" ||
                    path.node.init.type === "FunctionExpression")
            ) {
                component = path.node.id.name;
            }
        }

    });

    if (component) {
        results.push({
            parser: "babel",
            component,
            propsInterface,
            file
        });
    }
}

console.log(JSON.stringify(results, null, 2));