// =============================
// STAGE 5 — SANITIZE
// Cleans the raw schema produced by stage 4:
//   • Drops DOM / browser-internal types
//   • Normalizes any object with numeric-only keys into a proper array
//     (ts-json-schema-generator sometimes serialises arrays this way)
//   • Inlines non-DOM $refs so no dangling references remain
// =============================

// ----- DOM allowlist -----

// Set of DOM built-in types
const DOM_BUILTINS = new Set([
    'HTMLElement',
    'HTMLDivElement',
    'HTMLButtonElement',
    'HTMLInputElement',
    'HTMLSpanElement',
    'MouseEvent',
    'KeyboardEvent',
    'Event',
    'Node',
    'Element',
    'CSSStyleDeclaration',
]);

// Function to check if a type name is a DOM or browser-internal type
export function isDomOrBrowserType(name: string): boolean {
    return (
        DOM_BUILTINS.has(name) ||
        name.startsWith('React.') ||
        name.startsWith('HTML') ||
        name.startsWith('SVG') ||
        name.startsWith('Aria')
    );
}

// General rule: if a value is a plain object whose every key is a non-negative
// integer string (e.g. { "0": "info", "1": "success" }), it is a malformed
// array — convert it.  This applies uniformly to any field in the schema
// without naming specific keywords like "enum" or "type".
function normalizeValue(value: any): any {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
        return Object.values(value);
    }
    return value;
}

// Recursive function to sanitize the schema.
// `visited` prevents infinite loops when types reference themselves.
export function sanitizeSchema(schema: any, definitions?: any, visited: Set<string> = new Set()): any {
    if (Array.isArray(schema)) {
        return schema.map((item) => sanitizeSchema(item, definitions, visited));
    }

    if (typeof schema === 'object' && schema !== null) {
        // Capture the property-level description up front.
        // When a $ref is resolved or replaced with a DOM placeholder, the function
        // returns early and would otherwise discard any sibling `description` that
        // was written at the property level (e.g. the JSDoc on `severity?` or `style?`).
        const propertyDescription: string | undefined = schema.description;

        const sanitizedSchema: any = {};

        for (const key in schema) {
            if (schema.hasOwnProperty(key)) {
                let value = schema[key];

                if (key === '$ref') {
                    // Guard: $ref must be a string URI
                    if (typeof value !== 'string') {
                        sanitizedSchema[key] = value;
                        continue;
                    }

                    const refName = decodeURIComponent(value.replace('#/definitions/', ''));

                    if (isDomOrBrowserType(refName)) {
                        // Use the real TypeScript type name as the `type` value so
                        // consumers see "React.ReactElement" instead of just "object".
                        return {
                            type: refName,
                            typeName: refName,
                            description: propertyDescription ?? `DOM type: ${refName}`,
                        };
                    } else if (definitions && definitions[refName] && !visited.has(refName)) {
                        const nextVisited = new Set(visited).add(refName);
                        const resolved = sanitizeSchema(definitions[refName], definitions, nextVisited);
                        // Preserve the original TypeScript type name (e.g. "ReactNode", "AlertSeverity")
                        // so consumers can display it instead of the raw JSON Schema structure.
                        const withMeta = typeof resolved === 'object' && resolved !== null
                            ? { ...resolved, typeName: refName }
                            : resolved;
                        // Property-level description takes precedence over the type's own description.
                        if (propertyDescription && typeof withMeta === 'object' && withMeta !== null) {
                            return { ...withMeta, description: propertyDescription };
                        }
                        return withMeta;
                    } else {
                        sanitizedSchema[key] = value;
                    }
                } else {
                    value = normalizeValue(value);
                    sanitizedSchema[key] = sanitizeSchema(value, definitions, visited);
                }
            }
        }

        // Flatten nested anyOf, remove `{ "not": {} }` (JSON Schema encoding of
        // never/undefined — accurate but meaningless noise for RAG consumers),
        // then deduplicate by canonical JSON serialisation.
        if (Array.isArray(sanitizedSchema.anyOf)) {
            const flat: any[] = [];
            for (const item of sanitizedSchema.anyOf) {
                if (item && Array.isArray(item.anyOf)) {
                    flat.push(...item.anyOf);
                } else {
                    flat.push(item);
                }
            }
            const seen = new Set<string>();
            sanitizedSchema.anyOf = flat
                .filter(item => {
                    // drop { "not": {} } — represents never/undefined, not useful
                    if (
                        item !== null &&
                        typeof item === 'object' &&
                        'not' in item &&
                        Object.keys(item).length === 1 &&
                        Object.keys(item.not ?? {}).length === 0
                    ) return false;
                    return true;
                })
                .filter(item => {
                    const k = JSON.stringify(item);
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
        }

        // For every anyOf item: if it has a typeName and type is still "object",
        // replace type with the typeName so consumers see the real TypeScript name.
        if (Array.isArray(sanitizedSchema.anyOf)) {
            sanitizedSchema.anyOf = sanitizedSchema.anyOf.map((item: any) => {
                if (item && typeof item === 'object' && item.typeName && item.type === 'object') {
                    return { ...item, type: item.typeName };
                }
                return item;
            });
        }

        // If the anyOf contains React.ReactElement as one of its items, this is
        // the ts-json-schema-generator expansion of ReactNode — label it so consumers
        // can display "ReactNode" instead of showing the raw union items as the type.
        if (
            Array.isArray(sanitizedSchema.anyOf) &&
            !sanitizedSchema.typeName &&
            sanitizedSchema.anyOf.some((item: any) => item?.typeName === 'React.ReactElement')
        ) {
            sanitizedSchema.typeName = 'ReactNode';
        }

        // For array types whose items reference a named component interface,
        // annotate the array with "typeName": "IDataPanelActionProps[]" so
        // consumers see the element type without expanding every field inline.
        if (sanitizedSchema.type === 'array' && sanitizedSchema.items?.typeName) {
            sanitizedSchema.typeName = sanitizedSchema.items.typeName + '[]';
        }

        // If the node has a $comment that looks like a function signature
        // (e.g. "() => void") and no type, mark it as type "function"
        // so consumers know it expects a callable value.
        if (
            !sanitizedSchema.type &&
            typeof sanitizedSchema.$comment === 'string' &&
            sanitizedSchema.$comment.includes('=>')
        ) {
            sanitizedSchema.type = 'function';
        }

        return sanitizedSchema;
    }

    return schema;
}

// Function to sanitize a definition
export function sanitizeDefinition(def: any, rawDefinitions?: any): any {
    // If the definition is not an object, return it as is
    if (!def || typeof def !== 'object') return def;

    // Sanitize the entire definition object
    const cleaned: any = sanitizeSchema(def, rawDefinitions);

    // Sanitize the properties of the definition
    if (cleaned.properties) {
        cleaned.properties = sanitizeSchema(cleaned.properties, rawDefinitions);
    }

    return cleaned;
}

// Function to clean the definitions
export function cleanDefinitions(definitions: any): any {
    const cleaned: any = {};

    // Iterate over each definition
    for (const [name, def] of Object.entries(definitions)) {
        // Skip DOM or browser-internal types
        if (isDomOrBrowserType(name)) continue;
        // Sanitize the definition and add it to the cleaned definitions
        cleaned[name] = sanitizeDefinition(def, definitions);
    }

    return cleaned;
}