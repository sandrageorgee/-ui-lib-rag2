import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";

const componentsRoot = path.resolve("data/mini-ui-lib/components");
const tsconfigPath = path.resolve("data/mini-ui-lib/tsconfig.json");

/*
Walk all component folders and find .types.ts files
*/
function walk(dir: string): string[] {

    let results: string[] = [];

    const list = fs.readdirSync(dir);

    list.forEach((file) => {

        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(walk(filePath));
        }
        else if (file.endsWith(".types.ts")) {
            results.push(filePath);
        }

    });

    return results;
}

/*
Recursive type resolver
*/
function resolveTypeRecursive(
    checker: ts.TypeChecker,
    type: ts.Type,
    visited: Set<ts.Type> = new Set(),
    depth: number = 0
): any {

    const typeString = checker.typeToString(type);

    if (
        type.getFlags() &
        (ts.TypeFlags.String |
            ts.TypeFlags.Number |
            ts.TypeFlags.Boolean |
            ts.TypeFlags.Void)
    ) {
        return typeString;
    }

    if (type.getCallSignatures().length > 0) {
        return typeString;
    }

    if (visited.has(type) || depth > 4) {
        return typeString;
    }

    visited.add(type);

    if (type.isUnion()) {
        return type.types
            .map(t => {
                const resolved = resolveTypeRecursive(checker, t, new Set(visited), depth);

                if (typeof resolved === "object") {
                    return JSON.stringify(resolved);
                }

                return resolved;
            })
            .join(" | ");
    }

    const result: Record<string, any> = {};

    const props = type.getProperties();

    for (const prop of props) {

        const name = prop.getName();

        const declarations = prop.getDeclarations();
        if (!declarations || declarations.length === 0) continue;

        const propType = checker.getTypeOfSymbolAtLocation(
            prop,
            prop.valueDeclaration || declarations[0]
        );

        result[name] = resolveTypeRecursive(
            checker,
            propType,
            new Set(visited),
            depth + 1
        );
    }

    return Object.keys(result).length === 0 ? typeString : result;
}

/*
Extract metadata for a single interface
*/
function extractComponentMetadata(
    filePath: string,
    interfaceName: string
) {

    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

    const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath)
    );

    const program = ts.createProgram({
        rootNames: [path.resolve(filePath)],
        options: parsedConfig.options
    });

    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(path.resolve(filePath));

    if (!sourceFile) return;

    let targetType: ts.Type | undefined;

    ts.forEachChild(sourceFile, (node) => {

        if (ts.isInterfaceDeclaration(node) &&
            node.name.text === interfaceName) {

            targetType = checker.getTypeAtLocation(node);

        }

    });

    if (!targetType) return;

    return resolveTypeRecursive(checker, targetType);
}

/*
Extract interface names from a file
*/
function getInterfaces(filePath: string): string[] {

    const code = fs.readFileSync(filePath, "utf-8");
    const source = ts.createSourceFile(
        filePath,
        code,
        ts.ScriptTarget.Latest,
        true
    );

    const interfaces: string[] = [];

    ts.forEachChild(source, (node) => {

        if (ts.isInterfaceDeclaration(node)) {
            interfaces.push(node.name.text);
        }

    });

    return interfaces;
}

/*
Process each component
*/
function processFile(file: string) {

    const interfaces = getInterfaces(file);

    interfaces.forEach((interfaceName) => {

        const metadata = extractComponentMetadata(
            file,
            interfaceName
        );

        if (!metadata) return;

        const outputFile = file.replace(
            ".types.ts",
            ".recursion.schema.json"
        );

        fs.writeFileSync(
            outputFile,
            JSON.stringify(metadata, null, 2)
        );

        console.log("Recursive schema saved to:", outputFile);

    });
}

/*
Main
*/

const typeFiles = walk(componentsRoot);

console.log("Found type files:");
console.log(typeFiles);

typeFiles.forEach((file) => {

    console.log("Processing:", file);

    processFile(file);

});

console.log("Recursive schema generation completed.");