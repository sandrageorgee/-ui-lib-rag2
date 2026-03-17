import fs from "fs";
import path from "path";

const componentsRoot = path.resolve("data/mini-ui-lib/components");

function walk(dir: string): string[] {

    let results: string[] = [];
    const list = fs.readdirSync(dir);

    list.forEach(file => {

        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            results = results.concat(walk(filePath));
        }

        if (file.endsWith(".schema.json")) {
            results.push(filePath);
        }

    });

    return results;
}

function createChunk(file: string) {

    const schema = JSON.parse(fs.readFileSync(file, "utf8"));

    if (!Array.isArray(schema)) return;

    const component = path.basename(file).split(".")[0];

    const props: string[] = [];

    schema.forEach((entry: any) => {

        if (!entry.properties) return;

        entry.properties.forEach((p: any) => {
            props.push(`${p.name} ${p.type}`);
        });

    });

    const chunk = {
        id: `${component}_component`,
        component,
        type: "component-props",
        text: `${component} component props ${props.join(" ")}`,
        metadata: { parser: "schema" }
    };

    const output = file.replace(".schema.json", ".component.chunk.json");

    fs.writeFileSync(output, JSON.stringify(chunk, null, 2));

    console.log("Created:", output);
}

const files = walk(componentsRoot);

files.forEach(createChunk);