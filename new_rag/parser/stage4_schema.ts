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
//
// PURPOSE:
//   Takes a single .tsx component file and produces a raw JSON Schema
//   describing all TypeScript interfaces and types declared in that file.
//   This schema is later consumed by the RAG pipeline to answer questions
//   about component props.
//
// THE CORE PROBLEM THIS FILE SOLVES:
//   ts-json-schema-generator walks the full TypeScript type graph. If a
//   component prop references a type from an external package (React, ECharts,
//   THREE.js etc.), the generator follows that reference deep into node_modules,
//   which causes:
//     - Heap out-of-memory crashes
//     - "Invalid value used as weak map key" crashes
//     - "Cannot read properties of undefined (reading '0')" crashes
//
// THE FIX:
//   We register a custom parser (NodeModulesStubParser) that intercepts
//   specific AST node kinds before the generator's built-in parsers get them.
//   Instead of walking into the type, it wraps it in an ExternalType placeholder
//   that just stores the type name as a string. No recursion, no crash.
//
// TWO COLLABORATING CLASSES:
//   - ExternalType         : a dead-end placeholder that stores the raw type text
//   - ExternalTypeFormatter: emits { "tsType": "React.ReactNode" } in the schema
//                            instead of trying to expand the type
// =============================


// ─────────────────────────────────────────────────────────────
// CLASS: ExternalType
// ─────────────────────────────────────────────────────────────
// A dead-end node in the generator's internal type model.
//
// Normally when the generator encounters e.g. "React.ReactNode" it creates
// a rich type object with children pointing into React's internal declarations.
// We replace that with ExternalType which has no children and just stores
// the original type text as a string — stopping all recursion at this point.

class ExternalType extends BaseType {

    // Stores the raw type text exactly as it appeared in source code,
    // e.g. "XAXisComponentOption[\"axisLabel\"]" or "React.ReactNode".
    constructor(private readonly text: string) {
        super();
    }

    // getId() must return a unique string across all types in the schema.
    // Prefixing with "external:" ensures it never collides with a real
    // type definition the generator might produce independently.
    getId(): string {
        return `external:${this.text}`;
    }

    // getName() is what the formatter reads to produce the schema output.
    getName(): string {
        return this.text;
    }
}


// ─────────────────────────────────────────────────────────────
// CLASS: ExternalTypeFormatter
// ─────────────────────────────────────────────────────────────
// Tells the schema generator how to turn an ExternalType into
// a JSON Schema fragment.
//
// Instead of a full schema definition (which would require knowing
// the type's internal structure), we emit:
//   { "tsType": "React.ReactNode" }
//
// This keeps the original type name visible in the RAG schema output
// while producing valid JSON that doesn't crash the formatter.

class ExternalTypeFormatter implements SubTypeFormatter {

    // supportsType() is called for every type the formatter encounters.
    // Returning true means "I will handle this type".
    supportsType(type: BaseType): boolean {
        return type instanceof ExternalType;
    }

    // getDefinition() produces the actual JSON Schema fragment for this type.
    getDefinition(type: BaseType): Record<string, unknown> {
        return { tsType: (type as ExternalType).getName() };
    }

    // getChildren() returns an empty array — ExternalType is a true dead end.
    getChildren(_type: BaseType): BaseType[] {
        return [];
    }
}


// ─────────────────────────────────────────────────────────────
// CLASS: NodeModulesStubParser
// ─────────────────────────────────────────────────────────────
// A custom SubNodeParser that intercepts dangerous AST node kinds
// before the generator's built-in parsers get a chance to walk them.
//
// WHAT THIS LEAVES UNTOUCHED (still processed by the generator normally):
//   - Interface declarations         interface IMyProps { ... }
//   - Type alias declarations        type MyType = { ... }
//   - Primitive types                string, number, boolean, null
//   - Union and intersection types   A | B,  A & B
//   - Optional property markers      prop?: string
//   - Literal types                  "left" | "right"
//   - Your own cross-folder types    ../icharts.ts (expanded via type checker)
//   - Your own extends clauses       IBarChartProps extends IChartProps
//
// WHAT GETS STUBBED as { "tsType": "..." }:
//   - node_modules types             React.X, ECharts.X, THREE.X
//   - node_modules extends clauses   interface ITooltip extends TooltipComponentOption
//   - Indexed access types           Foo["bar"]
//   - Mapped types                   { [K in keyof T]: ... }
//   - Untyped parameters             (props) with no annotation

class NodeModulesStubParser implements SubNodeParser {

    constructor(private readonly program: ts.Program) { }

    supportsNode(node: ts.Node): boolean {

        // ── GUARD 1: IndexedAccessType ──────────────────────────────
        // Covers: XAXisComponentOption["axisLabel"], Foo["bar"]
        // These index into another type's property and always point into
        // external type definitions. They can never be serialized to JSON
        // Schema — intercept unconditionally.
        // CRASH PREVENTED: "Cannot read properties of undefined (reading '0')"
        if (node.kind === ts.SyntaxKind.IndexedAccessType) return true;

        // ── GUARD 2: MappedType ─────────────────────────────────────
        // Covers: { [K in keyof T]: string }
        // These iterate over the keys of another type. When T is an external
        // type they recurse infinitely until the process runs out of memory.
        // CRASH PREVENTED: heap out-of-memory
        if (node.kind === ts.SyntaxKind.MappedType) return true;

        // ── GUARD 3: Untyped parameter ──────────────────────────────
        // Covers: (props) => ... with no explicit type annotation on props
        // FunctionNodeParser calls createType() on every parameter node.
        // When a parameter has no type (node.type === undefined), no built-in
        // parser can handle it and it throws UnhandledError.
        // We stub ONLY untyped parameters — typed parameters like
        // (props: IWrapperWithTitle) pass through to the built-in parser.
        // CRASH PREVENTED: "Invalid value used as weak map key"
        if (node.kind === ts.SyntaxKind.Parameter) {
            return !(node as ts.ParameterDeclaration).type;
        }

        // ── GUARD 4: ExpressionWithTypeArguments (extends clauses) ──
        // Covers: interface ITooltip extends TooltipComponentOption { ... }
        // The built-in ExpressionWithTypeArgumentsNodeParser reads
        // .typeArguments[0] without null-checking, crashing on types
        // with no generic arguments that come from node_modules.
        // We stub ONLY node_modules origins — your own cross-folder
        // extends (e.g. IBarChartProps extends IChartProps) expand normally.
        // CRASH PREVENTED: "Cannot read properties of undefined (reading '0')"
        if (node.kind === ts.SyntaxKind.ExpressionWithTypeArguments) {
            const checker = this.program.getTypeChecker();
            const symbol = checker.getSymbolAtLocation(node.getFirstToken() ?? node);
            if (symbol) {
                const decl = symbol.declarations?.[0];
                if (decl?.getSourceFile().fileName.includes("node_modules")) return true;
            }
            return false; // your own extends clauses → expand normally
        }

        // Everything below only applies to TypeReference nodes.
        // All other node kinds are passed to the built-in parsers.
        if (node.kind !== ts.SyntaxKind.TypeReference) return false;

        const text = node.getText();

        // ── GUARD 5: Namespaced dot check ───────────────────────────
        // Covers: React.ReactNode, React.FC, THREE.Object3D, JSX.Element
        // Any type containing a dot is from an external namespaced package.
        // Your own local interfaces never contain dots in their name.
        // CRASH PREVENTED: node_modules traversal causing heap OOM
        if (text.includes(".")) return true;

        // ── GUARD 6: node_modules symbol resolution ─────────────────
        // Covers: any TypeReference whose declaration lives in node_modules,
        // even if it doesn't have a dot (e.g. a re-exported ECharts type
        // like TooltipComponentOption imported directly by name).
        //
        // We use the TypeScript type checker to follow the symbol of this
        // type reference to its actual declaration file. If that file is
        // inside node_modules we stub it. If it's your own code (even in
        // a cross-folder ../path) we let it expand normally.
        const checker = this.program.getTypeChecker();
        const symbol = checker.getSymbolAtLocation(node.getFirstToken() ?? node);
        if (symbol) {
            const decl = symbol.declarations?.[0];
            if (decl?.getSourceFile().fileName.includes("node_modules")) return true;
        }

        return false;
    }

    // createType() is called when supportsNode() returned true.
    // We read the raw source text of the node (e.g. "React.ReactNode"),
    // collapse any internal whitespace to a single space for cleanliness,
    // and wrap it in an ExternalType that the formatter renders as
    // { "tsType": "React.ReactNode" }.
    createType(node: ts.Node, _context: Context, _reference?: ReferenceType): BaseType {
        return new ExternalType(node.getText().replace(/\s+/g, " ").trim());
    }
}


// ─────────────────────────────────────────────────────────────
// FUNCTION: generateRawSchema
// ─────────────────────────────────────────────────────────────
// The public entry point called by the Stage 4 orchestrator.
//
// Parameters:
//   tsxPath      — absolute path to the component .tsx file to process
//   tsconfigPath — absolute path to the tsconfig.json for the project
//
// Returns:
//   A raw JSON Schema object (not yet sanitized or merged).
//   All interfaces and type aliases in the file appear as definitions.
//   External/complex types are represented as { tsType: "..." }.

export function generateRawSchema(tsxPath: string, tsconfigPath: string): any {

    const config = {
        ...DEFAULT_CONFIG,

        // The .tsx file to generate schema for.
        path: tsxPath,

        // The tsconfig.json that governs how TypeScript resolves imports.
        tsconfig: tsconfigPath,

        // "*" means generate schema for ALL exported types in the file.
        type: "*",

        // "all" exposes every interface/type including non-exported ones.
        expose: "all" as const,

        // Skip TypeScript type-checking during generation.
        // We only need the AST structure, not type correctness validation.
        skipTypeCheck: true,

        // Wrap all definitions under a top-level $ref.
        topRef: true,
    };

    // Create the TypeScript compiler program.
    // Reads the tsconfig, resolves all imports, and builds the full AST.
    const program = createProgram(config);

    // Create the AST node parser, injecting our custom NodeModulesStubParser.
    // We prepend our parser so it runs BEFORE the built-in parsers.
    const parser = createParser(program, config, (prs) => {
        prs.addNodeParser(new NodeModulesStubParser(program));
    });

    // Create the JSON Schema formatter, injecting our ExternalTypeFormatter.
    // We prepend our formatter so it handles ExternalType before built-ins.
    const formatter = createFormatter(config, (fmt) => {
        fmt.addTypeFormatter(new ExternalTypeFormatter());
    });

    // Assemble the SchemaGenerator and run it.
    const generator = new SchemaGenerator(program, parser, formatter, config);
    return generator.createSchema(config.type);
}