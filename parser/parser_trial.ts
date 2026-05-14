import { createGenerator } from "ts-json-schema-generator";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target TSX component file
const typesPath = path.resolve(
    __dirname,
    "../mini-commonui/packages/common-ui/src/components/alert/alerts.tsx"
);

// tsconfig path
const tsconfigPath = path.resolve(
    __dirname,
    "../mini-commonui/tsconfig.json"
);

console.log("🔍 Parsing alert component...\n");
console.log("typesPath:", typesPath);
console.log("types exists:", fs.existsSync(typesPath));

console.log("tsconfigPath:", tsconfigPath);
console.log("tsconfig exists:", fs.existsSync(tsconfigPath));

const generator = createGenerator({
    path: typesPath,
    tsconfig: tsconfigPath,
    type: "*"
});

const schema = generator.createSchema("*");

fs.writeFileSync(
    "alert-schema.json",
    JSON.stringify(schema, null, 2)
);

console.log("✅ Schema generated successfully!");