import { cleanDefinitions, sanitizeDefinition } from "./stage5_sanitize.js";
import type { ExtractedInfo } from "./stage3_extract.js";
import type { ComponentDocs } from "./stage0_docs.js";

// =============================
// STAGE 6 — TRANSFORM
// Merges the sanitized schema (stage 5) with the extracted
// source info (stage 3) and docs examples (stage 0) to produce
// the final schema objects.
// Only definitions whose names include "Props" or start with "I"
// are kept — everything else is a framework / utility type.
// =============================

export interface SchemaResult {
    component:         string;
    interface:         string;
    originalInterface: string;
    dependencies:      string[];
    type?:             string;
    properties?:       Record<string, any>;
    required?:         string[];
    additionalProperties?: boolean;
    description?:      string;
    defaultValues?:    Record<string, any>;
    cssClasses?:       string[];
    docs?: {
        imports:  string;
        demos:    ComponentDocs["demos"];
        stories:  ComponentDocs["stories"];
    };
    [key: string]:     any;
}

export function transformSchema(
    rawSchema:     any,
    componentName: string,
    extracted:     ExtractedInfo,
    dependencies:  string[],
    docs?:         ComponentDocs | null
): SchemaResult[] {

    if (!rawSchema.definitions) return [];

    const results: SchemaResult[] = [];
    const { defaultValues, cssClasses } = extracted;

    const cleanedDefinitions = cleanDefinitions(rawSchema.definitions);

    for (const [name, def] of Object.entries(cleanedDefinitions)) {

        // keep only component interfaces / prop types
        if (!name.includes("Props") && !name.startsWith("I")) continue;

        const result: SchemaResult = {
            component:         componentName,
            interface:         name,
            originalInterface: name.replace(/\d+$/, ""),
            dependencies,
            ...sanitizeDefinition(def as any, rawSchema.definitions),
        };

        // attach relevant defaults
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
