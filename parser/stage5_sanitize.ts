// =============================
// STAGE 5 — SANITIZE
// Cleans the raw schema produced by stage 4:
//   • Drops DOM / browser-internal types
//   • Fixes malformed enum objects and multi-type objects
//   • Inlines non-DOM $refs so no dangling references remain
// =============================

// ----- DOM allowlist -----

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
    "CSSStyleDeclaration",
]);

export function isDomOrBrowserType(name: string): boolean {
    return (
        DOM_BUILTINS.has(name)      ||
        name.startsWith("React.")   ||
        name.startsWith("HTML")     ||
        name.startsWith("SVG")      ||
        name.startsWith("Aria")
    );
}

// ----- malformed enum fix -----

function fixMalformedEnum(prop: any): any {
    if (prop?.enum && typeof prop.enum === "object" && !Array.isArray(prop.enum)) {
        prop.enum = Object.values(prop.enum);
    }
    return prop;
}

// ----- malformed type fix -----

function fixMalformedType(prop: any): any {
    if (prop?.type && typeof prop.type === "object" && !Array.isArray(prop.type)) {
        const types = Object.values(prop.type);
        return { ...prop, anyOf: types.map((t: any) => ({ type: t })) };
    }
    return prop;
}

// ----- $ref inliner -----
// DOM refs → replaced with { type: "object", description: "DOM type: X" }
// All other refs → looked up in rawDefinitions and inlined recursively.
// visited guards against circular references.

export function deepSanitizeRefs(
    obj: any,
    rawDefinitions?: any,
    visited = new Set<string>()
): any {

    if (!obj || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => deepSanitizeRefs(item, rawDefinitions, visited));
    }

    if (obj.$ref) {
        const refName = decodeURIComponent(obj.$ref.replace("#/definitions/", ""));

        if (isDomOrBrowserType(refName)) {
            return { type: "object", description: `DOM type: ${refName}` };
        }

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

// ----- single property sanitizer -----

export function sanitizeProp(prop: any, rawDefinitions?: any): any {
    prop = fixMalformedEnum(prop);
    prop = fixMalformedType(prop);
    prop = deepSanitizeRefs(prop, rawDefinitions);
    return prop;
}

// ----- full definition sanitizer -----

export function sanitizeDefinition(def: any, rawDefinitions?: any): any {
    if (!def || typeof def !== "object") return def;

    const cleaned: any = { ...def };

    if (cleaned.properties) {
        const newProps: any = {};
        for (const key in cleaned.properties) {
            newProps[key] = sanitizeProp(cleaned.properties[key], rawDefinitions);
        }
        cleaned.properties = newProps;
    }

    return cleaned;
}

// ----- definitions map sanitizer -----

export function cleanDefinitions(definitions: any): any {
    const cleaned: any = {};

    for (const [name, def] of Object.entries(definitions)) {
        if (isDomOrBrowserType(name)) continue;
        cleaned[name] = sanitizeDefinition(def, definitions);
    }

    return cleaned;
}
