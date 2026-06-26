import { createGenerator } from "ts-json-schema-generator";
import fs from "fs";
import ts from "typescript";
import path from "path";
import { fileURLToPath } from "url";

// =============================
// ESM __dirname FIX
// =============================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================
// PATHS
// =============================

const componentsDir = path.resolve(
    __dirname,
    "../common-ui/packages/common-ui/src/components"
);

const tsconfigPath = path.resolve(
    __dirname,
    "../common-ui/packages/common-ui/tsconfig.json"
);

const resultsDir = path.resolve(
    __dirname,
    "./parsing-results"
);

if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
}

// =============================
// AST PARSER — dependencies
// =============================

function parseComponentAST(filePath: string) {
    if (!fs.existsSync(filePath)) return null;

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

                    if (
                        name === "React" ||
                        name === "useState" ||
                        name === "useEffect"
                    ) return;

                    dependencies.add(name);
                });
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(source);

    return {
        dependencies: [...dependencies]
    };
}

// =============================
// EXTRACT DEFAULT VALUES
// =============================

function extractDefaultValues(content: string): Record<string, any> {

    const defaults: Record<string, any> = {};

    // destructured defaults
    const destructureRegex =
        /\{\s*([\s\S]*?)\s*\}\s*=\s*props/g;

    let match;

    while ((match = destructureRegex.exec(content)) !== null) {

        const block = match[1];

        const defaultRegex =
            /(\w+)\s*=\s*"([^"]+)"|(\w+)\s*=\s*'([^']+)'|(\w+)\s*=\s*(true|false|\d+(\.\d+)?)/g;

        let d;

        while ((d = defaultRegex.exec(block)) !== null) {

            const key = d[1] || d[3] || d[5];

            const value =
                d[2] ??
                d[4] ??
                d[6];

            if (key && value !== undefined) {
                defaults[key] = value;
            }
        }
    }

    return defaults;
}

// =============================
// EXTRACT USAGE EXAMPLES
// =============================

function extractUsageExamples(content: string): string[] {

    const examples: string[] = [];

    const returnRegex =
        /return\s*\(\s*([\s\S]*?)\s*\)\s*;/g;

    let match;

    while ((match = returnRegex.exec(content)) !== null) {

        const jsx = match[1].trim();

        if (!jsx.includes("<")) continue;

        if (jsx.length > 800) continue;

        examples.push(jsx);
    }

    return [...new Set(examples)].slice(0, 2);
}

// =============================
// EXTRACT CSS CLASSES
// =============================

function extractCSSClasses(content: string): string[] {

    const classes = new Set<string>();

    // className="..."
    const plainRegex =
        /className\s*=\s*"([^"]+)"/g;

    let match;

    while ((match = plainRegex.exec(content)) !== null) {

        match[1]
            .split(/\s+/)
            .forEach(c => {
                if (c.trim()) classes.add(c.trim());
            });
    }

    // className={`...`}
    const templateRegex =
        /className\s*=\s*\{`([^`]+)`\}/g;

    while ((match = templateRegex.exec(content)) !== null) {

        const cleaned =
            match[1]
                .replace(/\$\{[^}]+\}/g, " ");

        cleaned
            .split(/\s+/)
            .forEach(c => {
                if (c.trim()) classes.add(c.trim());
            });
    }

    // clsx / cn / classNames
    const clsxRegex =
        /(?:clsx|cn|classNames)\(([\s\S]*?)\)/g;

    while ((match = clsxRegex.exec(content)) !== null) {

        const args = match[1];

        const stringRegex =
            /["']([^"']+)["']/g;

        let s;

        while ((s = stringRegex.exec(args)) !== null) {

            s[1]
                .split(/\s+/)
                .forEach(c => {
                    if (c.trim()) classes.add(c.trim());
                });
        }
    }

    return [...classes].sort();
}

// =============================
// DOM BUILTINS
// =============================

const DOM_BUILTINS = new Set([
    "HTMLElement",
    "HTMLDivElement",
    "HTMLButtonElement",
    "HTMLInputElement",
    "HTMLSpanElement",
    "MouseEvent",
    "KeyboardEvent",
    "Event",
    "Node",
    "Element",
    "CSSStyleDeclaration"
]);

// =============================
// DOM TYPE CHECK
// =============================

function isDomOrBrowserType(name: string): boolean {

    return (
        DOM_BUILTINS.has(name) ||
        name.startsWith("React.") ||
        name.startsWith("HTML") ||
        name.startsWith("SVG") ||
        name.startsWith("Aria")
    );
}

// =============================
// FIX MALFORMED ENUMS
// =============================

function fixMalformedEnum(prop: any): any {

    if (
        prop?.enum &&
        typeof prop.enum === "object" &&
        !Array.isArray(prop.enum)
    ) {
        prop.enum = Object.values(prop.enum);
    }

    return prop;
}

// =============================
// FIX MALFORMED TYPES
// =============================

function fixMalformedType(prop: any): any {

    if (
        prop?.type &&
        typeof prop.type === "object" &&
        !Array.isArray(prop.type)
    ) {
        const types = Object.values(prop.type);

        return {
            ...prop,
            anyOf: types.map((t: any) => ({
                type: t
            }))
        };
    }

    return prop;
}

// =============================
// SANITIZE REFS
// =============================

function deepSanitizeRefs(obj: any, rawDefinitions?: any, visited = new Set<string>()): any {

    if (!obj || typeof obj !== "object") {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => deepSanitizeRefs(item, rawDefinitions, visited));
    }

    // DOM refs
    if (obj.$ref) {

        const refName =
            decodeURIComponent(
                obj.$ref.replace("#/definitions/", "")
            );

        if (isDomOrBrowserType(refName)) {

            return {
                type: "object",
                description: `DOM type: ${refName}`
            };
        }

        // Inline non-DOM refs from raw definitions instead of leaving dangling $refs
        if (rawDefinitions && rawDefinitions[refName] && !visited.has(refName)) {
            const nextVisited = new Set(visited).add(refName);
            return deepSanitizeRefs({ ...rawDefinitions[refName] }, rawDefinitions, nextVisited);
        }
    }

    const result: any = {};

    for (const key in obj) {
        result[key] = deepSanitizeRefs(obj[key], rawDefinitions, visited);
    }

    return result;
}

// =============================
// SANITIZE PROPERTY
// =============================

function sanitizeProp(prop: any, rawDefinitions?: any): any {

    prop = fixMalformedEnum(prop);
    prop = fixMalformedType(prop);
    prop = deepSanitizeRefs(prop, rawDefinitions);

    return prop;
}

// =============================
// SANITIZE DEFINITION
// =============================

function sanitizeDefinition(def: any, rawDefinitions?: any): any {

    if (!def || typeof def !== "object") {
        return def;
    }

    const cleaned: any = {
        ...def
    };

    if (cleaned.properties) {

        const newProps: any = {};

        for (const key in cleaned.properties) {

            newProps[key] =
                sanitizeProp(
                    cleaned.properties[key],
                    rawDefinitions
                );
        }

        cleaned.properties = newProps;
    }

    return cleaned;
}

// =============================
// CLEAN DEFINITIONS
// =============================

function cleanDefinitions(definitions: any) {

    const cleaned: any = {};

    for (const [name, def] of Object.entries(definitions)) {

        // skip DOM/react internals
        if (isDomOrBrowserType(name)) continue;

        cleaned[name] =
            sanitizeDefinition(def, definitions);
    }

    return cleaned;
}

// =============================
// TRANSFORM SCHEMA
// =============================

function transformSchema(
    schema: any,
    componentName: string,
    originalContent: string,
    dependencies: string[]
) {

    if (!schema.definitions) {
        return [];
    }

    const results: any[] = [];

    const defaultValues =
        extractDefaultValues(originalContent);

    const usageExamples =
        extractUsageExamples(
            originalContent
        );

    const cssClasses =
        extractCSSClasses(
            originalContent
        );

    const cleanedDefinitions =
        cleanDefinitions(schema.definitions);

    for (const [name, def] of Object.entries(cleanedDefinitions)) {

        // only meaningful interfaces/types
        if (
            !name.includes("Props") &&
            !name.startsWith("I")
        ) {
            continue;
        }

        const result: any = {

            component: componentName,

            interface: name,

            originalInterface:
                name.replace(/\d+$/, ""),

            dependencies,

            ...sanitizeDefinition(def, schema.definitions)
        };

        // defaults
        if (
            result.properties &&
            Object.keys(defaultValues).length > 0
        ) {

            const relevantDefaults: any = {};

            Object.keys(defaultValues).forEach(key => {

                if (result.properties[key]) {
                    relevantDefaults[key] =
                        defaultValues[key];
                }
            });

            if (
                Object.keys(relevantDefaults).length > 0
            ) {
                result.defaultValues =
                    relevantDefaults;
            }
        }

        // examples
        if (usageExamples.length > 0) {
            result.usageExamples =
                usageExamples;
        }

        // css classes
        if (cssClasses.length > 0) {
            result.cssClasses =
                cssClasses;
        }

        results.push(result);
    }

    return results;
}

// =============================
// MAIN LOOP
// =============================

const componentFolders =
    fs.readdirSync(componentsDir);

componentFolders.forEach(componentName => {

    const componentPath =
        path.join(
            componentsDir,
            componentName
        );

    if (
        !fs.statSync(componentPath).isDirectory()
    ) {
        return;
    }

    console.log(
        `\n🔍 Processing: ${componentName}`
    );

    // all tsx files
    const tsxFiles =
        fs.readdirSync(componentPath)
            .filter(file =>
                file.endsWith(".tsx")
            );

    if (tsxFiles.length === 0) {
        return;
    }

    tsxFiles.forEach(tsxFile => {

        try {

            const tsxPath =
                path.join(
                    componentPath,
                    tsxFile
                );

            console.log(
                `📄 Parsing: ${tsxFile}`
            );

            const originalContent =
                fs.readFileSync(
                    tsxPath,
                    "utf8"
                );

            const astInfo =
                parseComponentAST(tsxPath);

            // =============================
            // GENERATE RAW SCHEMA
            // =============================

            const generator =
                createGenerator({

                    path: tsxPath,

                    tsconfig: tsconfigPath,

                    type: "*",

                    expose: "all",

                    skipTypeCheck: true,

                    topRef: true
                });

            const schema =
                generator.createSchema("*");

            // =============================
            // TRANSFORM
            // =============================

            const transformed =
                transformSchema(
                    schema,
                    path.basename(tsxFile, ".tsx"),
                    originalContent,
                    astInfo?.dependencies || []
                );

            // =============================
            // SAVE
            // =============================

            const outputFile =
                path.join(
                    resultsDir,
                    `final.${componentName}.${path.basename(tsxFile, ".tsx")}.schema.json`
                );

            fs.writeFileSync(
                outputFile,
                JSON.stringify(
                    transformed,
                    null,
                    2
                )
            );

            console.log(
                `✅ Generated schema`
            );

            // debug
            transformed.forEach((item: any) => {

                console.log(
                    `   → ${item.interface}`
                );

                console.log(
                    `   props: ${
                        Object.keys(
                            item.properties || {}
                        ).length
                    }`
                );
            });

        } catch (err: any) {

            console.log(
                `❌ Failed: ${tsxFile}`
            );

            console.error(err);
        }
    });
});