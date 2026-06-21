import fs from "fs";
import path from "path";

import { extractComponentDocs }            from "./stage0_docs.js";
import { discoverComponentFiles, PATHS }   from "./stage1_discover.js";
import { extractAST }                      from "./stage2_ast.js";
import { extractSourceInfo }               from "./stage3_extract.js";
import { generateRawSchema }               from "./stage4_schema.js";
import { transformSchema }                 from "./stage6_transform.js";
import { ensureOutputDir, writeSchema }    from "./stage7_write.js";

// =============================
// PIPELINE
// Orchestrates all stages for every .tsx file found
// in the components directory:
//
//   stage0 → extract docs (demos + storybook) per component file
//   stage1 → discover files
//   stage2 → extract AST dependencies
//   stage3 → extract defaults / css classes from source
//   stage4 → generate raw JSON schema
//   stage5 → (called inside stage6) sanitize schema
//   stage6 → transform + merge all into final schema objects
//   stage7 → write JSON output files
// =============================

ensureOutputDir(PATHS.resultsDir);

const files = discoverComponentFiles();

for (const { componentName, tsxFile, tsxPath } of files) {

    console.log(`\n🔍 Processing: ${componentName}`);
    console.log(`📄 Parsing: ${tsxFile}`);

    try {

        const fileBaseName = path.basename(tsxFile, ".tsx");
        const content      = fs.readFileSync(tsxPath, "utf8");

        const docs      = extractComponentDocs(fileBaseName);               // stage 0
        const astResult = extractAST(tsxPath);                              // stage 2
        const extracted = extractSourceInfo(content);                       // stage 3
        const rawSchema = generateRawSchema(tsxPath, PATHS.tsconfigPath);  // stage 4

        const results   = transformSchema(                                  // stage 6 (→ 5 inside)
            rawSchema,
            fileBaseName,
            extracted,
            astResult.dependencies,
            docs,
            astResult.interfaceInfo                                         // own props + extends
        );

        const outputPath = path.join(
            PATHS.resultsDir,
            `final.${componentName}.${fileBaseName}.schema.json`
        );

        writeSchema(results, outputPath);                                   // stage 7

    } catch (err: any) {
        console.log(`❌ Failed: ${tsxFile}`);
        console.error(err);
    }
}
