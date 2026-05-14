import fs from "fs";
import path from "path";

import { discoverComponentFiles, PATHS }  from "./stage1_discover.js";
import { extractAST }                      from "./stage2_ast.js";
import { extractSourceInfo }               from "./stage3_extract.js";
import { generateRawSchema }               from "./stage4_schema.js";
import { transformSchema }                 from "./stage6_transform.js";
import { ensureOutputDir, writeSchema }    from "./stage7_write.js";

// =============================
// PIPELINE
// Orchestrates all 7 stages for every .tsx file found
// in the components directory:
//
//   stage1 → discover files
//   stage2 → extract AST dependencies
//   stage3 → extract defaults / examples / css classes
//   stage4 → generate raw JSON schema
//   stage5 → (called inside stage6) sanitize schema
//   stage6 → transform + merge into final schema objects
//   stage7 → write JSON output files
// =============================

ensureOutputDir(PATHS.resultsDir);

const files = discoverComponentFiles();

for (const { componentName, tsxFile, tsxPath } of files) {

    console.log(`\n🔍 Processing: ${componentName}`);
    console.log(`📄 Parsing: ${tsxFile}`);

    try {

        const content   = fs.readFileSync(tsxPath, "utf8");

        const astResult = extractAST(tsxPath);                              // stage 2
        const extracted = extractSourceInfo(content);                       // stage 3
        const rawSchema = generateRawSchema(tsxPath, PATHS.tsconfigPath);  // stage 4

        const results   = transformSchema(                                  // stage 6 (→ 5 inside)
            rawSchema,
            path.basename(tsxFile, ".tsx"),
            extracted,
            astResult.dependencies
        );

        const outputPath = path.join(
            PATHS.resultsDir,
            `final.${componentName}.${path.basename(tsxFile, ".tsx")}.schema.json`
        );

        writeSchema(results, outputPath);                                   // stage 7

    } catch (err: any) {
        console.log(`❌ Failed: ${tsxFile}`);
        console.error(err);
    }
}
