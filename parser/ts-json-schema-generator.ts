import tsj from "ts-json-schema-generator";
import fs from "fs";
import path from "path";

const componentsRoot = path.resolve("data/mini-ui-lib/components");
const tsconfigPath = path.resolve("data/mini-ui-lib/tsconfig.json");

/*
 * Recursively walk through directories and find all .types.ts files
 */
function walk(dir: string): string[] {

    let results: string[] = [];

    const list = fs.readdirSync(dir);

    list.forEach((file) => {

        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(walk(filePath));
        }
        else if (file.endsWith(".types.ts")) {
            results.push(filePath);
        }

    });

    return results;
}

// Find all types files
const typeFiles = walk(componentsRoot);

console.log("Found type files:");
console.log(typeFiles);

/**
 * Generate schema for each types file
 */
typeFiles.forEach((file) => {

    console.log("Generating schema for:", file);

    const config = {
        path: file,
        tsconfig: tsconfigPath,
        type: "*"
    };

    const generator = tsj.createGenerator(config);
    const schema = generator.createSchema("*");

    const schemaString = JSON.stringify(schema, null, 2);

    const outputPath = file.replace(".types.ts", ".2.schema.json");

    fs.writeFileSync(outputPath, schemaString);

    console.log("Saved schema to:", outputPath);

});

console.log("Schema generation completed.");