import fs from "fs";
import path from "path";
import * as reactDocgen from "react-docgen-typescript";

const ROOT = "./data/mini-ui-lib/components";

type Result = {
    parser: string;
    component: string;
    props: string[];
    file: string;
};

const results: Result[] = [];

const parser = reactDocgen.withDefaultConfig();

function getFiles(dir: string, files: string[] = []): string[] {
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
        const full = path.join(dir, entry);

        if (fs.statSync(full).isDirectory()) {
            getFiles(full, files);
        } else if (full.endsWith(".tsx")) {
            files.push(full);
        }
    }

    return files;
}

const files = getFiles(ROOT);

for (const file of files) {

    const componentDocs = parser.parse(file);

    componentDocs.forEach((doc) => {

        const props = Object.keys(doc.props || {});

        results.push({
            parser: "react-docgen",
            component: doc.displayName,
            props,
            file
        });

    });
}

console.log(JSON.stringify(results, null, 2));