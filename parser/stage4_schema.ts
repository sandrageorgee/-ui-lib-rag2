import { createGenerator } from "ts-json-schema-generator";

// =============================
// STAGE 4 — SCHEMA GENERATION
// Feeds the .tsx file into ts-json-schema-generator and
// returns the raw JSON schema (unmodified).
// =============================

export function generateRawSchema(tsxPath: string, tsconfigPath: string): any {

    const generator = createGenerator({
        path:          tsxPath,
        tsconfig:      tsconfigPath,
        type:          "*",
        expose:        "all",
        skipTypeCheck: true,
        topRef:        true,
    });

    return generator.createSchema("*");
}
