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