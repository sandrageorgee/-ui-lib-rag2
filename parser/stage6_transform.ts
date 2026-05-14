import { cleanDefinitions, sanitizeDefinition } from "./stage5_sanitize.js";
import type { ExtractedInfo } from "./stage3_extract.js";

// =============================
// STAGE 6 — TRANSFORM
// Merges the sanitized schema (stage 5) with the extracted
// source info (stage 3) to produce the final schema objects.
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
    usageExamples?:    string[];
    cssClasses?:       string[];
    [key: string]:     any;
}

export function transformSchema(
    rawSchema:     any,
    componentName: string,
    extracted:     ExtractedInfo,
    dependencies:  string[]
): SchemaResult[] {

    if (!rawSchema.definitions) return [];

    const results: SchemaResult[] = [];
    const { defaultValues, usageExamples, cssClasses } = extracted;

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

        if (usageExamples.length > 0) result.usageExamples = usageExamples;
        if (cssClasses.length > 0)    result.cssClasses    = cssClasses;

        results.push(result);
    }

    return results;
}
