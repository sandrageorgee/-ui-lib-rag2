// import { createGenerator } from "ts-json-schema-generator";
// import * as fs from "fs";
// import * as os from "os";
// import * as path from "path";

// // =============================
// // STAGE 4 — SCHEMA GENERATION
// // Feeds the .tsx file into ts-json-schema-generator and
// // returns the raw JSON schema (unmodified).
// //
// // Preprocessor: strips `extends` clauses that reference external-library
// // types (namespaced like `React.SVGProps<...>` or generic-heavy like
// // `THREE.Object3D<...>`). These crash or OOM the generator. Same-file
// // extends are preserved. Stage 2 (AST) already captured the original
// // extends list, so Stage 6 can reattach it on the final schema.
// // =============================

// function stripExternalExtends(src: string): { code: string; changed: boolean } {
//     let changed = false;
//     const code = src.replace(
//         /(\binterface\s+\w+\s*(?:<[^>]*>)?\s*)extends\s+([^{]+?)(\s*\{)/g,
//         (_m, head: string, list: string, brace: string) => {
//             const kept = list
//                 .split(",")
//                 .map(s => s.trim())
//                 .filter(s => s.length > 0 && !s.includes(".") && !s.includes("<"));
//             changed = true;
//             if (kept.length === 0) return head + brace;
//             return head + "extends " + kept.join(", ") + " " + brace;
//         }
//     );
//     return { code, changed };
// }

// export function generateRawSchema(tsxPath: string, tsconfigPath: string): any {

//     const src = fs.readFileSync(tsxPath, "utf8");
//     const { code: cleaned, changed } = stripExternalExtends(src);

//     let pathToUse = tsxPath;
//     let tmpPath: string | null = null;
//     if (changed) {
//         tmpPath = path.join(
//             path.dirname(tsxPath),
//             `.__stripped_${path.basename(tsxPath)}`
//         );
//         fs.writeFileSync(tmpPath, cleaned);
//         pathToUse = tmpPath;
//     }

//     try {
//         const generator = createGenerator({
//             path:          pathToUse,
//             tsconfig:      tsconfigPath,
//             type:          "*",
//             expose:        "all",
//             skipTypeCheck: true,
//             topRef:        true,
//         });

//         return generator.createSchema("*");
//     } finally {
//         if (tmpPath && fs.existsSync(tmpPath)) {
//             try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
//         }
//     }
// }


// import { 
//     createProgram, 
//     createParser, 
//     createFormatter, 
//     SchemaGenerator,
//     DEFAULT_CONFIG,
//     SubNodeParser,
//     Context,
//     BaseType,
//     ReferenceType,
// } from "ts-json-schema-generator";
// import type { SubTypeFormatter } from "ts-json-schema-generator/dist/src/SubTypeFormatter.js";
// import ts from "typescript";

// // =============================
// // STAGE 4 — SCHEMA GENERATION
// // Feeds the .tsx file into ts-json-schema-generator and
// // returns the raw JSON schema (unmodified).
// //
// // Two collaborating custom classes stop the generator from walking into
// // node_modules for external types (React.*, THREE.*, third-party libs):
// //
// //  - ExternalType: a lightweight BaseType that just stores the source
// //    text of the reference (e.g. "React.ReactNode", "React.CSSProperties")
// //
// //  - ExternalTypeFormatter: emits {"tsType":"React.ReactNode"} in the schema
// //    instead of expanding the type. This keeps the type name readable in the
// //    RAG output while preventing heap OOMs from deep type-graph traversal.
// // =============================

// // ---------- Custom type that carries the raw type-text ----------

// class ExternalType extends BaseType {
//     constructor(private readonly text: string) { super(); }
//     getId():   string { return `external:${this.text}`; }
//     getName(): string { return this.text; }
// }

// // ---------- Formatter: ExternalType → {"tsType": "..."} ----------

// class ExternalTypeFormatter implements SubTypeFormatter {
//     supportsType(type: BaseType): boolean {
//         return type instanceof ExternalType;
//     }
//     getDefinition(type: BaseType): Record<string, unknown> {
//         return { tsType: (type as ExternalType).getName() };
//     }
//     getChildren(_type: BaseType): BaseType[] {
//         return [];
//     }
// }

// // ---------- Parser: detects node_modules references, returns ExternalType ----------

// class NodeModulesStubParser implements SubNodeParser {
//     constructor(private readonly checker: ts.TypeChecker) {}

//     supportsNode(node: ts.Node): boolean {
//         // Find the identifier whose symbol we can resolve
//         let nameNode: ts.Node | undefined;

//         if (ts.isTypeReferenceNode(node)) {
//             nameNode = node.typeName;
//         } else if (ts.isExpressionWithTypeArguments(node)) {
//             nameNode = node.expression;
//         } else if (ts.isIndexedAccessTypeNode(node)) {
//             // Foo["bar"] — resolve Foo
//             const obj = node.objectType;
//             if (ts.isTypeReferenceNode(obj)) nameNode = obj.typeName;
//             else return false;
//         } else {
//             return false;
//         }

//         // For QualifiedName / PropertyAccess (Foo.Bar), resolve the rightmost
//         while (nameNode && ts.isQualifiedName(nameNode))            nameNode = nameNode.right;
//         while (nameNode && ts.isPropertyAccessExpression(nameNode)) nameNode = nameNode.name;
//         if (!nameNode) return false;

//         let symbol = this.checker.getSymbolAtLocation(nameNode);
//         if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) {
//             symbol = this.checker.getAliasedSymbol(symbol);
//         }

//         const decls = symbol?.declarations;
//         if (!decls || decls.length === 0) return false;

//         // Treat as external if every declaration lives in node_modules
//         return decls.every(d =>
//             d.getSourceFile().fileName.replace(/\\/g, "/").includes("/node_modules/")
//         );
//     }

//     createType(node: ts.Node, _context: Context, _reference?: ReferenceType): BaseType {
//         return new ExternalType(node.getText().replace(/\s+/g, " ").trim());
//     }
// }

// export function generateRawSchema(tsxPath: string, tsconfigPath: string): any {
//     const config = {
//         ...DEFAULT_CONFIG,
//         path:          tsxPath,
//         tsconfig:      tsconfigPath,
//         type:          "*",
//         expose:        "all" as const,
//         skipTypeCheck: true,
//         topRef:        true,
//     };

//     const program = createProgram(config);
//     const checker = program.getTypeChecker();

//     const parser = createParser(program, config, (prs) => {
//         prs.addNodeParser(new NodeModulesStubParser(checker));
//     });

//     const formatter = createFormatter(config, (fmt) => {
//         fmt.addTypeFormatter(new ExternalTypeFormatter());
//     });

//     const generator = new SchemaGenerator(program, parser, formatter, config);
//     return generator.createSchema(config.type);
// }



// ==================================================



// import {
//     createProgram,
//     createParser,
//     createFormatter,
//     SchemaGenerator,
//     DEFAULT_CONFIG,
//     SubNodeParser,
//     Context,
//     BaseType,
//     ReferenceType,
// } from "ts-json-schema-generator";
// import type { SubTypeFormatter } from "ts-json-schema-generator/dist/src/SubTypeFormatter.js";
// import ts from "typescript";
 
// // =============================
// // STAGE 4 — SCHEMA GENERATION
// // Feeds the .tsx file into ts-json-schema-generator and
// // returns the raw JSON schema (unmodified).
// //
// // Two collaborating custom classes stop the generator from walking into
// // node_modules for external types (React.*, THREE.*, third-party libs):
// //
// //  - ExternalType: a lightweight BaseType that just stores the source
// //    text of the reference (e.g. "React.ReactNode", "React.CSSProperties")
// //
// //  - ExternalTypeFormatter: emits {"tsType":"React.ReactNode"} in the schema
// //    instead of expanding the type. This keeps the type name readable in the
// //    RAG output while preventing heap OOMs from deep type-graph traversal.
// // =============================
 
// // ---------- Custom type that carries the raw type-text ----------
 
// class ExternalType extends BaseType {
//     constructor(private readonly text: string) { super(); }
//     getId(): string { return `external:${this.text}`; }
//     getName(): string { return this.text; }
// }
 
// // ---------- Formatter: ExternalType → {"tsType": "..."} ----------
 
// class ExternalTypeFormatter implements SubTypeFormatter {
//     supportsType(type: BaseType): boolean {
//         return type instanceof ExternalType;
//     }
//     getDefinition(type: BaseType): Record<string, unknown> {
//         return { tsType: (type as ExternalType).getName() };
//     }
//     getChildren(_type: BaseType): BaseType[] {
//         return [];
//     }
// }
 
// // ---------- Parser: detects unresolvable references, returns ExternalType ----------
 
// class NodeModulesStubParser implements SubNodeParser {
//     supportsNode(node: ts.Node): boolean {
//         // IndexedAccessType: T["key"] patterns like XAXisComponentOption["axisLabel"]
//         // Can never be serialized to JSON Schema — intercept unconditionally.
//         if (node.kind === ts.SyntaxKind.IndexedAccessType) return true;
 
//         // MappedType: { [K in keyof T]: ... } — can recurse infinitely into
//         // external type graphs, intercept unconditionally.
//         if (node.kind === ts.SyntaxKind.MappedType) return true;
 
//         if (
//             node.kind !== ts.SyntaxKind.TypeReference &&
//             node.kind !== ts.SyntaxKind.ExpressionWithTypeArguments
//         ) return false;
 
//         // Any namespaced type (contains ".") or generic (contains "<") that
//         // comes from an import is almost certainly in node_modules.
//         // Local interfaces never use dots in their name.
//         const text = node.getText();
//         if (text.includes(".") || text.includes("<")) return true;
 
//         // Cross-folder base types: IBarChartProps extends IChartProps where
//         // IChartProps lives in ../icharts.ts — the generator can't resolve
//         // across folder boundaries and crashes. Walk the import declarations
//         // on the current source file to detect this case.
//         const sourceFile = node.getSourceFile();
//         if (!sourceFile) return false;
 
//         const typeName = text.split("<")[0].trim(); // strip any generic params
 
//         for (const statement of sourceFile.statements) {
//             if (!ts.isImportDeclaration(statement)) continue;
 
//             const moduleSpecifier = (statement.moduleSpecifier as ts.StringLiteral).text;
//             const namedBindings = statement.importClause?.namedBindings;
//             if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
 
//             const importedNames = namedBindings.elements.map(e => e.name.text);
//             if (!importedNames.includes(typeName)) continue;
 
//             // This type is imported from a relative cross-folder path — stub it.
//             if (moduleSpecifier.startsWith("..")) return true;
//         }
 
//         return false;
//     }
 
//     createType(node: ts.Node, _context: Context, _reference?: ReferenceType): BaseType {
//         return new ExternalType(node.getText().replace(/\s+/g, " ").trim());
//     }
// }
 
// export function generateRawSchema(tsxPath: string, tsconfigPath: string): any {
//     const config = {
//         ...DEFAULT_CONFIG,
//         path: tsxPath,
//         tsconfig: tsconfigPath,
//         type: "*",
//         expose: "all" as const,
//         skipTypeCheck: true,
//         topRef: true,
//     };
 
//     const program = createProgram(config);
 
//     const parser = createParser(program, config, (prs) => {
//         prs.addNodeParser(new NodeModulesStubParser());
//     });
 
//     const formatter = createFormatter(config, (fmt) => {
//         fmt.addTypeFormatter(new ExternalTypeFormatter());
//     });
 
//     const generator = new SchemaGenerator(program, parser, formatter, config);
//     return generator.createSchema(config.type);
// }


// =========================================

// import {
//     createProgram,
//     createParser,
//     createFormatter,
//     SchemaGenerator,
//     DEFAULT_CONFIG,
//     SubNodeParser,
//     Context,
//     BaseType,
//     ReferenceType,
// } from "ts-json-schema-generator";
// import type { SubTypeFormatter } from "ts-json-schema-generator/dist/src/SubTypeFormatter.js";
// import ts from "typescript";
 
// // =============================
// // STAGE 4 — SCHEMA GENERATION
// // Feeds the .tsx file into ts-json-schema-generator and
// // returns the raw JSON schema (unmodified).
// //
// // ExternalType + ExternalTypeFormatter stub out any type the generator
// // would normally try to expand, emitting {"tsType":"..."} instead.
// // This prevents node_modules traversal, heap OOMs, and WeakMap crashes.
// // =============================
 
// // ---------- Custom type that carries the raw type-text ----------
 
// class ExternalType extends BaseType {
//     constructor(private readonly text: string) { super(); }
//     getId():   string { return `external:${this.text}`; }
//     getName(): string { return this.text; }
// }
 
// // ---------- Formatter: ExternalType → {"tsType": "..."} ----------
 
// class ExternalTypeFormatter implements SubTypeFormatter {
//     supportsType(type: BaseType): boolean {
//         return type instanceof ExternalType;
//     }
//     getDefinition(type: BaseType): Record<string, unknown> {
//         return { tsType: (type as ExternalType).getName() };
//     }
//     getChildren(_type: BaseType): BaseType[] {
//         return [];
//     }
// }
 
// // ---------- Parser: intercepts ALL non-primitive nodes, no expansion ----------
 
// // Every node kind that ts-json-schema-generator would try to walk into.
// // Returning true from supportsNode hands control to our createType,
// // which wraps the raw text in ExternalType and stops all recursion.
// const EXPANSION_KINDS = new Set([
//     ts.SyntaxKind.TypeReference,
//     ts.SyntaxKind.ExpressionWithTypeArguments,
//     ts.SyntaxKind.IndexedAccessType,       // Foo["bar"]
//     ts.SyntaxKind.MappedType,              // { [K in keyof T]: ... }
//     ts.SyntaxKind.ConditionalType,         // T extends U ? X : Y
//     ts.SyntaxKind.InferType,               // infer R
//     ts.SyntaxKind.TypeQuery,               // typeof X
//     ts.SyntaxKind.FunctionType,            // (a: A) => B
//     ts.SyntaxKind.ConstructorType,         // new () => T
//     ts.SyntaxKind.FunctionExpression,      // inline function in JSX/objects
//     ts.SyntaxKind.ArrowFunction,           // inline arrow in JSX/objects
//     ts.SyntaxKind.MethodDeclaration,       // method shorthand in objects
//     ts.SyntaxKind.ImportType,              // import("module").Type
// ]);
 
// class NoExpansionParser implements SubNodeParser {
//     supportsNode(node: ts.Node): boolean {
//         return EXPANSION_KINDS.has(node.kind);
//     }
 
//     createType(node: ts.Node, _context: Context, _reference?: ReferenceType): BaseType {
//         return new ExternalType(node.getText().replace(/\s+/g, " ").trim());
//     }
// }
 
// export function generateRawSchema(tsxPath: string, tsconfigPath: string): any {
//     const config = {
//         ...DEFAULT_CONFIG,
//         path:          tsxPath,
//         tsconfig:      tsconfigPath,
//         type:          "*",
//         expose:        "all" as const,
//         skipTypeCheck: true,
//         topRef:        true,
//     };
 
//     const program = createProgram(config);
 
//     const parser = createParser(program, config, (prs) => {
//         prs.addNodeParser(new NoExpansionParser());
//     });
 
//     const formatter = createFormatter(config, (fmt) => {
//         fmt.addTypeFormatter(new ExternalTypeFormatter());
//     });
 
//     const generator = new SchemaGenerator(program, parser, formatter, config);
//     return generator.createSchema(config.type);
// }

// ====================================

// import {
//     createProgram,
//     createParser,
//     createFormatter,
//     SchemaGenerator,
//     DEFAULT_CONFIG,
//     SubNodeParser,
//     Context,
//     BaseType,
//     ReferenceType,
// } from "ts-json-schema-generator";
// import type { SubTypeFormatter } from "ts-json-schema-generator/dist/src/SubTypeFormatter.js";
// import ts from "typescript";
 
// // =============================
// // STAGE 4 — SCHEMA GENERATION
// // Feeds the .tsx file into ts-json-schema-generator and
// // returns the raw JSON schema (unmodified).
// //
// // Two collaborating custom classes stop the generator from walking into
// // node_modules for external types (React.*, THREE.*, third-party libs):
// //
// //  - ExternalType: a lightweight BaseType that just stores the source
// //    text of the reference (e.g. "React.ReactNode", "React.CSSProperties")
// //
// //  - ExternalTypeFormatter: emits {"tsType":"React.ReactNode"} in the schema
// //    instead of expanding the type. This keeps the type name readable in the
// //    RAG output while preventing heap OOMs from deep type-graph traversal.
// // =============================
 
// // ---------- Custom type that carries the raw type-text ----------
 
// class ExternalType extends BaseType {
//     constructor(private readonly text: string) { super(); }
//     getId():   string { return `external:${this.text}`; }
//     getName(): string { return this.text; }
// }
 
// // ---------- Formatter: ExternalType → {"tsType": "..."} ----------
 
// class ExternalTypeFormatter implements SubTypeFormatter {
//     supportsType(type: BaseType): boolean {
//         return type instanceof ExternalType;
//     }
//     getDefinition(type: BaseType): Record<string, unknown> {
//         return { tsType: (type as ExternalType).getName() };
//     }
//     getChildren(_type: BaseType): BaseType[] {
//         return [];
//     }
// }
 
// // ---------- Parser: detects unresolvable references, returns ExternalType ----------
 
// class NodeModulesStubParser implements SubNodeParser {
//     supportsNode(node: ts.Node): boolean {
//         // IndexedAccessType: T["key"] patterns like XAXisComponentOption["axisLabel"]
//         // Can never be serialized to JSON Schema — intercept unconditionally.
//         if (node.kind === ts.SyntaxKind.IndexedAccessType) return true;
 
//         // MappedType: { [K in keyof T]: ... } — can recurse infinitely into
//         // external type graphs, intercept unconditionally.
//         if (node.kind === ts.SyntaxKind.MappedType) return true;
 
//         // ParameterDeclaration with no type annotation:
//         // FunctionNodeParser calls createType on each parameter. When a
//         // component is written as `(props) => ...` without an explicit type,
//         // no built-in parser can handle the bare ParameterDeclaration and
//         // it throws UnhandledError. Stub only the untyped case; typed
//         // parameters (e.g. `props: IWrapperWithTitle`) are left for the
//         // built-in ParameterNodeParser so their types are tracked normally.
//         if (node.kind === ts.SyntaxKind.Parameter) {
//             return !(node as ts.ParameterDeclaration).type;
//         }
 
//         if (
//             node.kind !== ts.SyntaxKind.TypeReference &&
//             node.kind !== ts.SyntaxKind.ExpressionWithTypeArguments
//         ) return false;
 
//         const text = node.getText();
 
//         // Namespaced types are external (React.X, THREE.X, echarts.X etc.)
//         // Local interfaces never contain dots in their name.
//         if (text.includes(".")) return true;
 
//         // Cross-folder base types: IBarChartProps extends IChartProps where
//         // IChartProps lives in ../icharts.ts — the generator can't resolve
//         // across folder boundaries and crashes. Walk the import declarations
//         // on the current source file to detect this case.
//         const sourceFile = node.getSourceFile();
//         if (!sourceFile) return false;
 
//         const typeName = text.split("<")[0].trim(); // strip any generic params
 
//         for (const statement of sourceFile.statements) {
//             if (!ts.isImportDeclaration(statement)) continue;
 
//             const moduleSpecifier = (statement.moduleSpecifier as ts.StringLiteral).text;
//             const namedBindings = statement.importClause?.namedBindings;
//             if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
 
//             const importedNames = namedBindings.elements.map(e => e.name.text);
//             if (!importedNames.includes(typeName)) continue;
 
//             // This type is imported from a relative cross-folder path — stub it.
//             if (moduleSpecifier.startsWith("..")) return true;
//         }
 
//         return false;
//     }
 
//     createType(node: ts.Node, _context: Context, _reference?: ReferenceType): BaseType {
//         return new ExternalType(node.getText().replace(/\s+/g, " ").trim());
//     }
// }
 
// export function generateRawSchema(tsxPath: string, tsconfigPath: string): any {
//     const config = {
//         ...DEFAULT_CONFIG,
//         path:          tsxPath,
//         tsconfig:      tsconfigPath,
//         type:          "*",
//         expose:        "all" as const,
//         skipTypeCheck: true,
//         topRef:        true,
//     };
 
//     const program = createProgram(config);
 
//     const parser = createParser(program, config, (prs) => {
//         prs.addNodeParser(new NodeModulesStubParser());
//     });
 
//     const formatter = createFormatter(config, (fmt) => {
//         fmt.addTypeFormatter(new ExternalTypeFormatter());
//     });
 
//     const generator = new SchemaGenerator(program, parser, formatter, config);
//     return generator.createSchema(config.type);
// }
//  =============================================================


import {
    createProgram,
    createParser,
    createFormatter,
    SchemaGenerator,
    DEFAULT_CONFIG,
    SubNodeParser,
    Context,
    BaseType,
    ReferenceType,
} from "ts-json-schema-generator";
import type { SubTypeFormatter } from "ts-json-schema-generator/dist/src/SubTypeFormatter.js";
import ts from "typescript";
 
// =============================
// STAGE 4 — SCHEMA GENERATION
// Feeds the .tsx file into ts-json-schema-generator and
// returns the raw JSON schema (unmodified).
//
// Two collaborating custom classes stop the generator from walking into
// node_modules for external types (React.*, THREE.*, third-party libs):
//
//  - ExternalType: a lightweight BaseType that just stores the source
//    text of the reference (e.g. "React.ReactNode", "React.CSSProperties")
//
//  - ExternalTypeFormatter: emits {"tsType":"React.ReactNode"} in the schema
//    instead of expanding the type. This keeps the type name readable in the
//    RAG output while preventing heap OOMs from deep type-graph traversal.
// =============================
 
// ---------- Custom type that carries the raw type-text ----------
 
class ExternalType extends BaseType {
    constructor(private readonly text: string) { super(); }
    getId():   string { return `external:${this.text}`; }
    getName(): string { return this.text; }
}
 
// ---------- Formatter: ExternalType → {"tsType": "..."} ----------
 
class ExternalTypeFormatter implements SubTypeFormatter {
    supportsType(type: BaseType): boolean {
        return type instanceof ExternalType;
    }
    getDefinition(type: BaseType): Record<string, unknown> {
        return { tsType: (type as ExternalType).getName() };
    }
    getChildren(_type: BaseType): BaseType[] {
        return [];
    }
}
 
// ---------- Parser: detects unresolvable references, returns ExternalType ----------
 
class NodeModulesStubParser implements SubNodeParser {
    constructor(private readonly program: ts.Program) {}
 
    supportsNode(node: ts.Node): boolean {
        // IndexedAccessType: T["key"] patterns like XAXisComponentOption["axisLabel"]
        // Can never be serialized to JSON Schema — intercept unconditionally.
        if (node.kind === ts.SyntaxKind.IndexedAccessType) return true;
 
        // MappedType: { [K in keyof T]: ... } — can recurse infinitely into
        // external type graphs, intercept unconditionally.
        if (node.kind === ts.SyntaxKind.MappedType) return true;
 
        // ParameterDeclaration with no type annotation:
        // FunctionNodeParser calls createType on each parameter. When a
        // component is written as `(props) => ...` without an explicit type,
        // no built-in parser can handle the bare ParameterDeclaration and
        // it throws UnhandledError. Stub only the untyped case; typed
        // parameters (e.g. `props: IWrapperWithTitle`) are left for the
        // built-in ParameterNodeParser so their types are tracked normally.
        if (node.kind === ts.SyntaxKind.Parameter) {
            return !(node as ts.ParameterDeclaration).type;
        }
 
        if (
            node.kind !== ts.SyntaxKind.TypeReference &&
            node.kind !== ts.SyntaxKind.ExpressionWithTypeArguments
        ) return false;
 
        const text = node.getText();
 
        // Namespaced types are external (React.X, THREE.X, echarts.X etc.)
        // Local interfaces never contain dots in their name.
        if (text.includes(".")) return true;
 
        // Use the type checker to resolve where this type is actually declared.
        // This is the reliable way to distinguish node_modules types from your
        // own cross-folder types (../icharts.ts etc.) — we only stub node_modules,
        // your own types in ../ are allowed to expand normally.
        const sourceFile = node.getSourceFile();
        if (!sourceFile) return false;
 
        const checker = this.program.getTypeChecker();
        const symbol = checker.getSymbolAtLocation(node.getFirstToken() ?? node);
        if (symbol) {
            const decl = symbol.declarations?.[0];
            if (decl) {
                const declFile = decl.getSourceFile().fileName;
                // Only stub types declared inside node_modules.
                // Cross-folder types from your own codebase (../) expand normally.
                if (declFile.includes("node_modules")) return true;
            }
        }
 
        return false;
    }
 
    createType(node: ts.Node, _context: Context, _reference?: ReferenceType): BaseType {
        return new ExternalType(node.getText().replace(/\s+/g, " ").trim());
    }
}
 
export function generateRawSchema(tsxPath: string, tsconfigPath: string): any {
    const config = {
        ...DEFAULT_CONFIG,
        path:          tsxPath,
        tsconfig:      tsconfigPath,
        type:          "*",
        expose:        "all" as const,
        skipTypeCheck: true,
        topRef:        true,
    };
 
    const program = createProgram(config);
 
    const parser = createParser(program, config, (prs) => {
        prs.addNodeParser(new NodeModulesStubParser(program));
    });
 
    const formatter = createFormatter(config, (fmt) => {
        fmt.addTypeFormatter(new ExternalTypeFormatter());
    });
 
    const generator = new SchemaGenerator(program, parser, formatter, config);
    return generator.createSchema(config.type);
}