import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

const ROOT = "./data/mini-ui-lib/components";

type Result = {
    parser: string;
    component: string;
    propsInterface: string;
    file: string;
};

const results: Result[] = [];

/*
Store all interfaces globally
so components can link to props
*/
const interfaces: Record<string, string> = {};

/*
Recursively collect all .ts and .tsx files
*/
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

/*
FIRST PASS
Collect all interfaces in the project
*/
for (const file of files) {
    const code = fs.readFileSync(file, "utf8");

    const sourceFile = ts.createSourceFile(
        file,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    function visit(node: ts.Node) {
        if (ts.isInterfaceDeclaration(node)) {
            const name = node.name.text;
            interfaces[name] = file;
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
}

/*
SECOND PASS
Extract components and match them with props
*/
for (const file of files) {
    const code = fs.readFileSync(file, "utf8");

    const sourceFile = ts.createSourceFile(
        file,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    analyze(sourceFile, file);
}

function analyze(sourceFile: ts.SourceFile, file: string) {
    let component = "";
    let propsInterface = "";

    function visit(node: ts.Node) {

        /*
        Detect function components
        */
        if (ts.isFunctionDeclaration(node) && node.name) {
            component = node.name.text;
        }

        /*
        Detect arrow function components
        */
        if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach((d) => {
                if (
                    ts.isIdentifier(d.name) &&
                    d.initializer &&
                    (ts.isArrowFunction(d.initializer) ||
                        ts.isFunctionExpression(d.initializer))
                ) {
                    component = d.name.text;
                }
            });
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    /*
    Try to match props interface automatically
    Example:
    Button -> ButtonProps
    */
    if (component) {
        const possibleProps = component + "Props";

        if (interfaces[possibleProps]) {
            propsInterface = possibleProps;
        }

        results.push({
            parser: "typescript",
            component,
            propsInterface,
            file,
        });
    }
}

console.log(JSON.stringify(results, null, 2));