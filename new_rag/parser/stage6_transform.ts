import { cleanDefinitions, sanitizeDefinition } from "./stage5_sanitize.js";
import type { ExtractedInfo } from "./stage3_extract.js";
import type { ComponentDocs } from "./stage0_docs.js";
import type { InterfaceInfo } from "./stage2_ast.js";

// =============================
// STAGE 6 — TRANSFORM
// Merges the sanitized schema (stage 5) with the extracted
// source info (stage 3) and docs examples (stage 0) to produce
// the final schema objects.
// Only definitions whose names include "Props" or start with "I[A-Z]"
// are kept — everything else is a framework / utility type.
//
// When interfaceInfo is provided (from stage 2 AST), properties are
// filtered to only those declared directly on the interface (own props).
// Inherited props are listed separately under `extends` so the schema
// stays clean and attribution is accurate.
// =============================

export interface SchemaResult {
    component:          string;
    interface:          string;
    originalInterface:  string;
    dependencies:       string[];
    extends?:           string[];
    type?:              string;
    properties?:        Record<string, any>;
    required?:          string[];
    additionalProperties?: boolean;
    description?:       string;
    defaultValues?:     Record<string, any>;
    cssClasses?:        string[];
    docs?: {
        imports:  string;
        demos:    ComponentDocs["demos"];
        stories:  ComponentDocs["stories"];
    };
    [key: string]:      any;
}

export function transformSchema(
    rawSchema:     any,
    componentName: string,
    extracted:     ExtractedInfo,
    dependencies:  string[],
    docs?:         ComponentDocs | null,
    interfaceInfo: Record<string, InterfaceInfo> = {}
): SchemaResult[] {

    if (!rawSchema.definitions) return [];

    const results: SchemaResult[] = [];
    const { defaultValues, cssClasses } = extracted;

    const cleanedDefinitions = cleanDefinitions(rawSchema.definitions);

    for (const [name, def] of Object.entries(cleanedDefinitions)) {

        // keep only component interfaces / prop types
        // "I" must be followed by an uppercase letter to avoid matching
        // generic types like Iterable<ReactNode> that also start with "I"
        if (!name.includes("Props") && !/^I[A-Z]/.test(name)) continue;

        const sanitized = sanitizeDefinition(def as any, rawSchema.definitions);

        // If stage 2 gave us the interface declaration, restrict `properties`
        // to only the props declared directly on this interface (own props).
        // Props from parent types (e.g. React.ButtonHTMLAttributes) are noise
        // for RAG and are now surfaced via the `extends` field instead.
        const info = interfaceInfo[name];
        if (info && info.ownProps.length > 0 && sanitized.properties) {
            const ownSet = new Set(info.ownProps);
            sanitized.properties = Object.fromEntries(
                Object.entries(sanitized.properties).filter(([k]) => ownSet.has(k))
            );
            // Also drop required entries for props that were filtered out.
            if (sanitized.required) {
                sanitized.required = (sanitized.required as string[]).filter(
                    (k: string) => ownSet.has(k)
                );
            }
        }

        const result: SchemaResult = {
            component:         componentName,
            interface:         name,
            originalInterface: name.replace(/\d+$/, ""),
            dependencies,
            ...sanitized,
        };

        // Attach extends info so consumers know what the interface inherits.
        if (info && info.extends.length > 0) {
            result.extends = info.extends;
        }

        // attach relevant defaults (only for own props that survived the filter)
        if (result.properties && Object.keys(defaultValues).length > 0) {
            const relevantDefaults: any = {};
            Object.keys(defaultValues).forEach(key => {
                if (result.properties![key]) relevantDefaults[key] = defaultValues[key];
            });
            if (Object.keys(relevantDefaults).length > 0) {
                result.defaultValues = relevantDefaults;
            }
        }

        if (cssClasses.length > 0) result.cssClasses = cssClasses;

        // attach docs examples from stage 0
        if (docs && (docs.demos.length > 0 || docs.stories.length > 0)) {
            result.docs = {
                imports: docs.imports,
                demos:   docs.demos,
                stories: docs.stories,
            };
        }

        results.push(result);
    }

    return results;
}
