import fs from "fs";
import path from "path";
import * as reactDocgen from "react-docgen-typescript";

const ROOT = "./data/mini-ui-lib/components";

type Result = {
    parser: string;
    componentName: string;
    doc: object;
    file: string;
};

const results: Result[] = [];

const parser = reactDocgen.withCustomConfig(path.resolve("tsconfig.json"), {});

function getFiles(dir: string, files: string[] = []): string[] {
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
        const full = path.join(dir, entry);

        if (fs.statSync(full).isDirectory()) {
            console.log("Entering directory:", full, files);
            getFiles(full, files);
        } else if (full.endsWith(".tsx")) {
            console.log("Found file:", full);
            files.push(full);
        }
    }

    return files;
}

const files = getFiles(ROOT);
console.log("All files found:", files);
for (const file of files) {
    console.log("Parsing file:", file);
    const componentDocs = parser.parse(file);
    console.log("Parsed components:", componentDocs);
    componentDocs.forEach((doc) => {

        const props = Object.keys(doc.props || {});
        console.log("DOCS", doc)
        results.push({
            parser: "react-docgen",
            componentName: doc.displayName,
            doc,
            file
        });

    });
}

fs.writeFileSync("results.json", JSON.stringify(results, null, 2));
console.log("HELLOO", results);