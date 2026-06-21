import fs from "fs";
import path from "path";
import ts from "typescript";

// =============================
// STAGE 2 — AST
// Walks the TypeScript AST of a .tsx file and:
//   1. Collects every named import that is not a React built-in hook.
//   2. Follows local imports to their source files and parses interface
//      declarations to extract:
//        • ownProps  — prop names declared directly on the interface
//        • extends   — parent types the interface inherits from
//      This lets downstream stages distinguish own props from inherited HTML
//      attributes (e.g. IButtonProps extends React.ButtonHTMLAttributes).
// =============================

export interface InterfaceInfo {
    ownProps: string[];
    extends:  string[];
}

export interface ASTResult {
    dependencies:  string[];
    interfaceInfo: Record<string, InterfaceInfo>;
}

const IGNORED_IMPORTS = new Set(["React", "useState", "useEffect"]);

// Attempt to resolve a relative import specifier to an actual file on disk.
// Tries .ts then .tsx extensions.
function resolveImportPath(fromFile: string, specifier: string): string | null {
    if (!specifier.startsWith(".")) return null;
    const dir = path.dirname(fromFile);
    for (const ext of [".ts", ".tsx"]) {
        const candidate = path.resolve(dir, specifier + ext);
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

// Parse a .ts/.tsx source file and extract interface declarations:
// own prop names and heritage (extends) type names.
function extractInterfaceInfo(filePath: string): Record<string, InterfaceInfo> {
    const result: Record<string, InterfaceInfo> = {};
    if (!fs.existsSync(filePath)) return result;

    const code   = fs.readFileSync(filePath, "utf8");
    const source = ts.createSourceFile(
        filePath,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    function visit(node: ts.Node) {
        if (ts.isInterfaceDeclaration(node)) {
            const name = node.name.text;

            // Own props: only members that are property signatures declared
            // directly on this interface (not inherited).
            const ownProps = node.members
                .filter(ts.isPropertySignature)
                .map(m => (m.name as ts.Identifier).text)
                .filter(Boolean);

            // Extends clause: collect the text of each parent type expression.
            const extendsTypes: string[] = [];
            node.heritageClauses?.forEach(clause => {
                if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                    clause.types.forEach(t => {
                        // getText requires the source file for accurate range text
                        extendsTypes.push(t.getText(source));
                    });
                }
            });

            result[name] = { ownProps, extends: extendsTypes };
        }
        ts.forEachChild(node, visit);
    }

    visit(source);
    return result;
}

export function extractAST(filePath: string): ASTResult {
    if (!fs.existsSync(filePath)) return { dependencies: [], interfaceInfo: {} };

    const code = fs.readFileSync(filePath, "utf8");

    const source = ts.createSourceFile(
        filePath,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    const dependencies  = new Set<string>();
    const interfaceInfo: Record<string, InterfaceInfo> = {};

    // Track which local files we imported so we can parse their interfaces.
    const localImportPaths: string[] = [];

    function visit(node: ts.Node) {
        if (ts.isImportDeclaration(node)) {
            const specifier = (node.moduleSpecifier as ts.StringLiteral).text;

            if (
                node.importClause?.namedBindings &&
                ts.isNamedImports(node.importClause.namedBindings)
            ) {
                node.importClause.namedBindings.elements.forEach(el => {
                    const name = el.name.text;
                    if (!IGNORED_IMPORTS.has(name)) dependencies.add(name);
                });
            }

            // Resolve local imports so we can inspect interface declarations.
            const resolved = resolveImportPath(filePath, specifier);
            if (resolved) localImportPaths.push(resolved);
        }

        ts.forEachChild(node, visit);
    }

    visit(source);

    // Parse each locally-imported file for interface declarations.
    for (const importedFile of localImportPaths) {
        const info = extractInterfaceInfo(importedFile);
        Object.assign(interfaceInfo, info);
    }

    return { dependencies: [...dependencies], interfaceInfo };
}
