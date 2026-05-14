import fs from "fs";
import ts from "typescript";

// =============================
// STAGE 2 — AST
// Walks the TypeScript AST of a .tsx file and collects
// every named import that is not a React built-in hook.
// =============================

export interface ASTResult {
    dependencies: string[];
}

const IGNORED_IMPORTS = new Set(["React", "useState", "useEffect"]);

export function extractAST(filePath: string): ASTResult {

    if (!fs.existsSync(filePath)) return { dependencies: [] };

    const code = fs.readFileSync(filePath, "utf8");

    const source = ts.createSourceFile(
        filePath,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    const dependencies = new Set<string>();

    function visit(node: ts.Node) {

        if (ts.isImportDeclaration(node)) {
            if (
                node.importClause?.namedBindings &&
                ts.isNamedImports(node.importClause.namedBindings)
            ) {
                node.importClause.namedBindings.elements.forEach(el => {
                    const name = el.name.text;
                    if (!IGNORED_IMPORTS.has(name)) dependencies.add(name);
                });
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(source);

    return { dependencies: [...dependencies] };
}
