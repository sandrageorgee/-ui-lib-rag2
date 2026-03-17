import tsj from "ts-json-schema-generator";
import fs from "fs";
import path from "path";

const componentsRoot = path.resolve("data/mini-ui-lib/components");
const tsconfigPath = path.resolve("data/mini-ui-lib/tsconfig.json");

/*
Walk directories
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

/*
Extract properties
*/
function parseProperties(schemaDef: any) {

  const properties: any[] = [];
  const props = schemaDef.properties || {};
  const required = schemaDef.required || [];

  Object.keys(props).forEach((key) => {

    let type = props[key].type;

    if (props[key].items && props[key].items.$ref) {

      const ref = props[key].items.$ref.split("/").pop();
      type = `${ref}[]`;

    }

    properties.push({
      name: key,
      type: type,
      required: required.includes(key)
    });

  });

  return properties;
}

/*
Process file
*/
function generateChunks(file: string) {

  const config = {
    path: file,
    tsconfig: tsconfigPath,
    type: "*"
  };

  const generator = tsj.createGenerator(config);
  const schema = generator.createSchema("*");

  const definitions = schema.definitions;

  if (!definitions) return;

  const componentChunks: any[] = [];

  Object.keys(definitions).forEach((defName) => {

    const def = definitions[defName];
    const properties = parseProperties(def);

    const chunk = {
      name: defName,
      file: file,
      properties: properties
    };

    componentChunks.push(chunk);

  });

  /*
  Create schema file per component
  */

  const outputFile = file.replace(".types.ts", ".schema.json");

  fs.writeFileSync(outputFile, JSON.stringify(componentChunks, null, 2));

  console.log("Created:", outputFile);

}

/*
Main
*/

const typeFiles = walk(componentsRoot);

typeFiles.forEach((file) => {

  console.log("Processing:", file);

  generateChunks(file);

});

console.log("Schema generation completed.");