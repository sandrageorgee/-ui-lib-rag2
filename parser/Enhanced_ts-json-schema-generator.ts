import tsj from "ts-json-schema-generator";
import fs from "fs";
import ts from "typescript";
import path from "path";

const componentsDir = path.resolve(
    import.meta.dirname,
    "../data/mini-ui-lib/components"
);

const tsconfigPath = path.resolve(
    import.meta.dirname,
    "../data/mini-ui-lib/tsconfig.json"
);

const tempDir = path.resolve(import.meta.dirname, "./.temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// =============================
// AST PARSER
// =============================

function parseComponentAST(filePath: string, componentName: string) {
    if (!fs.existsSync(filePath)) return null;

    const code = fs.readFileSync(filePath, "utf8");
    const source = ts.createSourceFile(
        filePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX
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
                    if (name === "React" || name === "useState") return;
                    dependencies.add(name);
                });
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(source);
    return { dependencies: [...dependencies] };
}

// =============================
// HELPERS
// =============================

function hasDuplicateInterfaces(content: string) {
    const matches = content.match(/export interface (\w+)/g) || [];
    const names = matches.map(m => m.replace("export interface ", ""));
    return new Set(names).size !== names.length;
}

function fixDuplicateInterfaces(content: string) {
    const regex = /export interface (\w+)(?: extends ([^{]+))?/g;
    const seen: any = {};
    const matches = [...content.matchAll(regex)];

    matches.forEach(match => {
        const name = match[1];
        if (!seen[name]) seen[name] = [];
        seen[name].push(`${name}${seen[name].length + 1}`);
    });

    const counter: any = {};
    content = content.replace(regex, (full, name, extend) => {
        counter[name] = (counter[name] || 0) + 1;
        const newName = seen[name][counter[name] - 1];
        let newExtend = "";
        if (extend) newExtend = ` extends ${extend.split(",")[0]}1`;
        return `export interface ${newName}${newExtend}`;
    });

    return { content, seen };
}

function fixTypeReferences(content: string, seenMap: any) {
    Object.keys(seenMap).forEach(original => {
        const first = `${original}1`;
        content = content.replace(
            new RegExp(`Partial<${original}>`, "g"),
            `Partial<${first}>`
        );
        content = content.replace(
            new RegExp(`:\\s*${original}(\\W)`, "g"),
            `: ${first}$1`
        );
    });
    return content;
}

function stripReactTypes(content: string) {
    return content
        .replace(/import React.*;/g, "")
        .replace(/MouseEvent<.*?>/g, "any")
        .replace(/ChangeEvent<.*?>/g, "any");
}

// =============================
// DOM / BROWSER BUILT-IN TYPES
// =============================

const DOM_BUILTINS = new Set([
    "HTMLInputElement", "HTMLButtonElement", "HTMLDivElement",
    "HTMLElement", "HTMLTextAreaElement", "HTMLSelectElement",
    "HTMLAnchorElement", "HTMLFormElement", "HTMLImageElement",
    "HTMLSpanElement", "HTMLLabelElement", "HTMLUListElement",
    "HTMLLIElement", "HTMLTableElement", "HTMLTableRowElement",
    "HTMLTableCellElement", "HTMLHeadElement", "HTMLAllCollection",
    "HTMLOrSVGScriptElement",
    "Element", "EventTarget", "Node", "GlobalEventHandlers",
    "DocumentAndElementEventHandlers", "ElementCSSInlineStyle",
    "ElementContentEditable", "DOMStringMap", "DOMTokenList",
    "CSSStyleDeclaration", "CSSStyleSheet", "CSSRuleList", "CSSRule",
    "StyleSheetList", "NamedNodeMap", "Attr",
    "UIEvent", "Event", "FocusEvent", "MouseEvent", "KeyboardEvent",
    "InputEvent", "AnimationEvent", "PointerEvent", "TouchEvent",
    "WheelEvent", "DragEvent", "ToggleEvent", "TransitionEvent",
    "ClipboardEvent", "CompositionEvent", "SubmitEvent",
    "FileList", "File", "Blob", "MediaStream", "ValidityState",
    "NodeList", "RadioNodeList", "HTMLCollection", "StylePropertyMap",
    "DOMRect", "DOMRectReadOnly", "ShadowRoot", "Animation",
    "CSSAnimation", "CSSTransition",
    "Document", "DocumentType", "DocumentTimeline", "DocumentReadyState",
    "DocumentVisibilityState", "DOMImplementation", "FragmentDirective",
    "ParentNode", "ChildNode", "ProcessingInstruction",
    "DOMMatrix", "DOMPointReadOnly", "DOMHighResTimeStamp",
    "DataTransfer", "DataTransferItemList", "DataTransferItem",
    "TouchList", "Touch",
    "FontFaceSet", "FontFaceSetLoadEvent", "FontFace",
    "FontDisplay", "FontFaceLoadStatus", "FontFaceSetLoadStatus",
    "WindowEventHandlers", "BeforeUnloadEvent", "GamepadEvent",
    "Gamepad", "GamepadButton", "GamepadMappingType", "GamepadHapticActuator",
    "HashChangeEvent", "MessageEvent", "MessagePort", "MessageEventSource",
    "ServiceWorker", "AbstractWorker", "ErrorEvent", "ServiceWorkerState",
    "PageTransitionEvent", "PageRevealEvent", "PageSwapEvent",
    "ViewTransition", "ViewTransitionTypeSet",
    "NavigationActivation", "NavigationHistoryEntry", "NavigationType",
    "PopStateEvent", "PromiseRejectionEvent", "StorageEvent", "Storage",
    "CSSNumberish", "CSSNumericValue",
    "SecurityPolicyViolationEvent", "SecurityPolicyViolationEventDisposition",
    "ProgressEvent", "FormDataEvent",
    "OnErrorEventHandler", "OnErrorEventHandlerNonNull",
    "ShadowRootMode", "SlotAssignmentMode",
    "FileSystemEntry", "FileSystem", "FileSystemDirectoryEntry",
    "AutoFill", "AutoFillBase",
]);

function isDomOrBrowserType(key: string): boolean {
    return (
        key.startsWith("React.") ||
        key.startsWith("Property.") ||
        key.startsWith("DataType.") ||
        key.startsWith("HTML") ||
        key.startsWith("SVG") ||
        key.startsWith("EventHandler") ||
        key.startsWith("Iterable<") ||
        key.startsWith("NodeListOf<") ||
        key.startsWith("HTMLCollectionOf<") ||
        key === "Globals" ||
        key === "Booleanish" ||
        key === "TrustedHTML" ||
        key === "FormData" ||
        key === "AwaitedReactNode" ||
        DOM_BUILTINS.has(key)
    );
}

// =============================
// FIX MALFORMED TYPE
// Converts "type": {"0": "string", "1": "number"} → anyOf: [{type: "string"}, ...]
// =============================

function fixMalformedType(prop: any): any {
    if (
        prop.type &&
        typeof prop.type === "object" &&
        !Array.isArray(prop.type)
    ) {
        const { type, ...rest } = prop;
        return {
            ...rest,
            anyOf: Object.values(type).map((t: any) => ({ type: t }))
        };
    }
    return prop;
}

// =============================
// FIX MALFORMED ENUM
// Converts "enum": {"0": "text", "1": "password"} → enum: ["text", "password"]
// =============================

function fixMalformedEnum(prop: any): any {
    if (
        prop.enum &&
        typeof prop.enum === "object" &&
        !Array.isArray(prop.enum)
    ) {
        return { ...prop, enum: Object.values(prop.enum) };
    }
    return prop;
}

// =============================
// DEEP SANITIZE REFS
// Replaces any $ref to a DOM/browser type at any nesting depth
// =============================

function deepSanitizeRefs(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
        return obj.map(deepSanitizeRefs);
    }

    // Direct $ref to a DOM type → replace entirely
    if (obj.$ref && typeof obj.$ref === "string") {
        const refName = decodeURIComponent(obj.$ref.replace("#/definitions/", ""));
        if (isDomOrBrowserType(refName)) {
            return { type: "object", description: `DOM type: ${refName}` };
        }
        return obj;
    }

    // namedArgs function pattern → collapse
    if (obj.type === "object" && obj.properties?.namedArgs && obj.$comment) {
        return { type: "function", description: obj.description || obj.$comment };
    }

    // anyOf: drop DOM-ref branches, collapse if only one remains
    if (obj.anyOf && Array.isArray(obj.anyOf)) {
        const cleaned = obj.anyOf
            .map((branch: any) => {
                if (branch.$ref) {
                    const refName = decodeURIComponent(
                        branch.$ref.replace("#/definitions/", "")
                    );
                    if (isDomOrBrowserType(refName)) return null;
                }
                return deepSanitizeRefs(branch);
            })
            .filter(Boolean);

        if (cleaned.length === 0) return { type: "object" };
        if (cleaned.length === 1) return cleaned[0];

        const nonNull = cleaned.filter((b: any) => b.type !== "null");
        if (nonNull.length === 0) return { type: "null" };

        return { ...obj, anyOf: cleaned };
    }

    // Recurse into all keys
    const result: any = {};
    for (const key in obj) {
        result[key] = deepSanitizeRefs(obj[key]);
    }
    return result;
}

// =============================
// FULL PROP SANITIZE
// Applies all fixes: malformed type, malformed enum, deep DOM ref sanitization
// =============================

function sanitizeProp(prop: any): any {
    prop = fixMalformedType(prop);
    prop = fixMalformedEnum(prop);
    prop = deepSanitizeRefs(prop);
    return prop;
}

// =============================
// SIMPLIFY REACT / DOM REFS ON A PROPERTIES MAP
// =============================

function simplifyReactRefs(properties: any): any {
    const result: any = {};
    for (const key in properties) {
        result[key] = sanitizeProp(properties[key]);
    }
    return result;
}

// =============================
// SANITIZE DEFINITION BODY
// Cleans a definition's properties before including it in cleanedDefinitions
// =============================

function sanitizeDefinition(def: any): any {
    if (!def || typeof def !== "object") return def;
    if (!def.properties) return def;

    const cleanedProps: any = {};
    for (const key in def.properties) {
        cleanedProps[key] = sanitizeProp(def.properties[key]);
    }

    return { ...def, properties: cleanedProps };
}

// =============================
// expandRefs
// =============================

function expandRefs(obj: any, definitions: any, depth = 0, maxDepth = 2) {
    if (!obj || typeof obj !== "object") return obj;
    if (depth > maxDepth) return obj;
    if (obj.$ref) return obj;

    const result: any = {};
    for (const key in obj) {
        result[key] = expandRefs(obj[key], definitions, depth + 1, maxDepth);
    }
    return result;
}

// =============================
// REACHABILITY
// Walks all $refs reachable from a properties object
// =============================

function collectReachableRefs(
    obj: any,
    definitions: any,
    visited: Set<string> = new Set()
): Set<string> {
    if (!obj || typeof obj !== "object") return visited;

    if (Array.isArray(obj)) {
        obj.forEach(item => collectReachableRefs(item, definitions, visited));
        return visited;
    }

    if (obj.$ref && typeof obj.$ref === "string") {
        const refName = decodeURIComponent(obj.$ref.replace("#/definitions/", ""));
        if (!visited.has(refName)) {
            visited.add(refName);
            if (definitions[refName]) {
                collectReachableRefs(definitions[refName], definitions, visited);
            }
        }
        return visited;
    }

    for (const key in obj) {
        collectReachableRefs(obj[key], definitions, visited);
    }

    return visited;
}

// =============================
// EXTRACT OWN PROPS FROM TS SOURCE
// =============================

function extractOwnPropsFromTS(content: string, interfaceName: string) {
    const regex = new RegExp(
        `interface\\s+${interfaceName}\\s*(?:extends[^\\{]+)?\\{([\\s\\S]*?)\\}`,
        "m"
    );
    const match = content.match(regex);
    if (!match) return [];

    const body = match[1];
    const propRegex = /(\w+)\??:/g;
    const props: string[] = [];
    let m;
    while ((m = propRegex.exec(body)) !== null) {
        props.push(m[1]);
    }
    return props;
}

// =============================
// TRANSFORM SCHEMA
// =============================

function transformSchema(schema: any, componentName: string, content: string) {
    if (!schema.definitions) return schema;

    // Find ALL interface names declared in the processed content
    const interfaceNames = [
        ...content.matchAll(/export interface (\w+)/g)
    ].map(m => m[1]);

    const results: any[] = [];

    for (const interfaceName of interfaceNames) {
        const main = schema.definitions[interfaceName];
        if (!main) continue;

        // Get extends clause for THIS specific interface only
        const interfaceBlockMatch = content.match(
            new RegExp(
                `export interface ${interfaceName}\\s*(?:extends\\s+([^{]+))?\\s*\\{`,
                "m"
            )
        );

        let reactExtends: string[] = [];
        let customExtends: string[] = [];

        if (interfaceBlockMatch && interfaceBlockMatch[1]) {
            const parts = interfaceBlockMatch[1].split(",").map(p => p.trim());
            reactExtends = parts.filter(e => e.startsWith("React."));
            customExtends = parts.filter(
                e => !e.startsWith("React.") && e.length > 0
            );
        }

        const ownProps = extractOwnPropsFromTS(content, interfaceName);

        // Collect props inherited from React types so we can exclude them
        const reactOwnedProps = new Set<string>();
        reactExtends.forEach(ext => {
            const key = ext.replace("React.", "");
            const def = schema.definitions[key];
            if (def && def.properties) {
                Object.keys(def.properties).forEach(p => reactOwnedProps.add(p));
            }
        });

        let properties: any = {};

        // Only include props explicitly declared on this interface
        ownProps.forEach(prop => {
            if (reactOwnedProps.has(prop)) return;
            if (main.properties && main.properties[prop]) {
                properties[prop] = main.properties[prop];
            }
        });

        // Merge custom (non-React) extended interface props
        customExtends.forEach(ext => {
            const def = schema.definitions[ext];
            if (def && def.properties) {
                Object.entries(def.properties).forEach(([k, v]) => {
                    if (!reactOwnedProps.has(k) && !(k in properties)) {
                        properties[k] = v;
                    }
                });
            }
        });

        // Sanitize all props: fix malformed types/enums, deep-sanitize DOM refs
        properties = simplifyReactRefs(properties);

        // Expand refs
        properties = expandRefs(properties, schema.definitions);

        // Reachability: only keep definitions actually referenced
        const reachableRefs = collectReachableRefs(properties, schema.definitions);

        // Base name to detect sibling interfaces (IInputProps1 → IInputProps)
        const mainKeyBase = interfaceName.replace(/\d+$/, "");

        const cleanedDefinitions: any = {};
        for (const key of reachableRefs) {
            if (key === interfaceName) continue;
            if (isDomOrBrowserType(key)) continue;
            // Don't add a sibling to its own definitions block,
            // but DO allow it when genuinely referenced by another sibling
            if (key.replace(/\d+$/, "") === mainKeyBase && key === interfaceName) continue;
            if (schema.definitions[key]) {
                // Sanitize the definition body before including it
                cleanedDefinitions[key] = sanitizeDefinition(schema.definitions[key]);
            }
        }

        // Recover original interface name (strip numeric suffix)
        const originalInterface = interfaceName.replace(/\d+$/, "");

        const result: any = {
            component: componentName,
            interface: interfaceName,
            originalInterface,
            type: "object",
            properties,
            additionalProperties: reactExtends.length > 0
        };

        if (Object.keys(cleanedDefinitions).length > 0) {
            result.definitions = cleanedDefinitions;
        }

        const allExtendsFinal = [...customExtends, ...reactExtends];
        if (allExtendsFinal.length === 1) result.extends = allExtendsFinal[0];
        else if (allExtendsFinal.length > 1) result.extends = allExtendsFinal;

        results.push(result);
    }

    return results.length === 1 ? results[0] : results;
}

// =============================
// MAIN LOOP
// =============================

const componentFolders = fs.readdirSync(componentsDir);

componentFolders.forEach(componentName => {
    const componentPath = path.join(componentsDir, componentName);
    if (!fs.statSync(componentPath).isDirectory()) return;

    console.log(`\n🔍 Processing: ${componentName}`);

    let typesPath = path.join(componentPath, `${componentName}.types.ts`);
    if (!fs.existsSync(typesPath)) {
        const fallbackTs = path.join(componentPath, `${componentName}.ts`);
        if (!fs.existsSync(fallbackTs)) return;
        typesPath = fallbackTs;
    }

    const tsxPath = path.join(componentPath, `${componentName}.tsx`);
    parseComponentAST(tsxPath, componentName);

    try {
        let content = fs.readFileSync(typesPath, "utf-8");
        content = stripReactTypes(content);

        let seen: any = {};
        if (hasDuplicateInterfaces(content)) {
            const result = fixDuplicateInterfaces(content);
            content = result.content;
            seen = result.seen;
            content = fixTypeReferences(content, seen);
        }

        const tempFile = path.join(tempDir, `${componentName}.ts`);
        fs.writeFileSync(tempFile, content);

        const generator = tsj.createGenerator({
            path: tempFile,
            tsconfig: tsconfigPath,
            type: "*",
            skipTypeCheck: true,
            expose: "all",
            topRef: true
        });

        const schema = generator.createSchema("*");
        const transformed = transformSchema(schema, componentName, content);

        fs.writeFileSync(
            path.join(componentPath, `final.${componentName}.schema.json`),
            JSON.stringify(transformed, null, 2)
        );

        console.log(`✅ Generated CLEAN schema`);
    } catch (err: any) {
        console.log(`❌ Failed`);
        console.error(err.message);
    }
});