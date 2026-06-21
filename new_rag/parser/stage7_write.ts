import fs from "fs";
import path from "path";
import type { SchemaResult } from "./stage6_transform.js";

// =============================
// STAGE 7 — WRITE
// Ensures the output directory exists, serialises the final
// schema results to JSON, and logs a summary per interface.
// =============================

export function ensureOutputDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function writeSchema(results: SchemaResult[], outputPath: string): void {

    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log(`✅ Generated schema → ${path.basename(outputPath)}`);

    results.forEach(item => {
        console.log(`   → ${item.interface}`);
        console.log(`   props: ${Object.keys(item.properties || {}).length}`);
    });
}
