import tsj from "ts-json-schema-generator";
import fs from "fs";
import path from "path";
import ts from "typescript";

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
    } else if (file.endsWith(".types.ts")) {
      results.push(filePath);
    }
  });

  return results;
}

/*
Detect function-like schema props
*/
function isFunctionLike(prop: any): boolean {
  return (
    prop.type === "object" &&
    !prop.properties &&
    !prop.$ref &&
    !prop.enum &&
    !prop.items
  );
}

/*
Parse properties safely (🔥 ENUM FIX INCLUDED)
*/
function parseProperties(schemaDef: any) {
  const properties: any[] = [];
  const props = schemaDef.properties || {};
  const required = schemaDef.required || [];

  Object.keys(props).forEach((key) => {
    const prop = props[key];

    if (isFunctionLike(prop)) return;

    let type = prop.type;

    // 🔥 enum support
    if (prop.enum) {
      type = "enum";
    }

    if (prop.$ref) {
      type = prop.$ref.split("/").pop();
    }

    if (prop.items && prop.items.$ref) {
      const ref = prop.items.$ref.split("/").pop();
      type = `${ref}[]`;
    }

    properties.push({
      name: key,
      type,
      enum: prop.enum || undefined,
      required: required.includes(key),
    });
  });

  return properties;
}

/*
🔥 Clean members BEFORE schema generation
*/
function cleanMembers(
  members: ts.NodeArray<ts.TypeElement>,
  interfaceName: string
) {
  return members.filter((member) => {
    if (!ts.isPropertySignature(member)) return true;

    const type = member.type;

    if (type && ts.isFunctionTypeNode(type)) return false;

    if (
      type &&
      ts.isTypeReferenceNode(type) &&
      type.typeName.getText().includes("React")
    ) return false;

    if (
      type &&
      ts.isTypeReferenceNode(type) &&
      (
        type.typeName.getText().includes("MouseEvent") ||
        type.typeName.getText().includes("ChangeEvent")
      )
    ) return false;

    if (type && ts.isTypeReferenceNode(type)) {
      const typeName = type.typeName.getText();
      if (
        typeName === "Partial" ||
        typeName === "Record" ||
        typeName === "Pick" ||
        typeName === "Omit"
      ) return false;
    }

    if (
      type &&
      ts.isTypeReferenceNode(type) &&
      type.typeName.getText() === interfaceName
    ) return false;

    if (
      type &&
      ts.isArrayTypeNode(type) &&
      ts.isTypeReferenceNode(type.elementType) &&
      type.elementType.typeName.getText() === interfaceName
    ) return false;

    return true;
  });
}

/*
🔥 Extract events
*/
function extractEvents(node: ts.InterfaceDeclaration) {
  const events: any[] = [];

  node.members.forEach((member) => {
    if (!ts.isPropertySignature(member) || !member.type) return;

    if (ts.isFunctionTypeNode(member.type)) {
      events.push({
        name: member.name.getText(),
        signature: member.type.getText(),
        required: !member.questionToken,
      });
    }
  });

  return events;
}

/*
🔥 Extract refs
*/
function extractRefs(node: ts.InterfaceDeclaration) {
  const refs: any[] = [];

  node.members.forEach((member) => {
    if (!ts.isPropertySignature(member) || !member.type) return;

    const type = member.type.getText();

    if (type.includes("React.Ref")) {
      refs.push({
        name: member.name.getText(),
        type,
      });
    }
  });

  return refs;
}

/*
🔥 FIXED: Extract ONLY REAL composition
*/
function extractComposition(node: ts.InterfaceDeclaration) {
  const composition: any[] = [];

  node.members.forEach((member) => {
    if (!ts.isPropertySignature(member) || !member.type) return;

    const type = member.type.getText();

    if (type.includes("Partial<")) {
      composition.push({
        name: member.name.getText(),
        type,
      });
    }
  });

  return composition;
}

/*
🔥 Extract enums
*/
function extractEnums(node: ts.InterfaceDeclaration) {
  const enums: any = {};

  node.members.forEach((member) => {
    if (!ts.isPropertySignature(member) || !member.type) return;

    if (ts.isUnionTypeNode(member.type)) {
      const values = member.type.types
        .filter(t => ts.isLiteralTypeNode(t))
        .map(t => t.getText().replace(/"/g, ""));

      if (values.length > 0) {
        enums[member.name.getText()] = values;
      }
    }
  });

  return enums;
}

/*
🔥 Extract descriptions
*/
function extractDescriptions(node: ts.InterfaceDeclaration) {
  const descriptions: any = {};

  node.members.forEach((member: any) => {
    if (!member.name) return;

    const name = member.name.getText();
    const jsDoc = member.jsDoc?.[0]?.comment;

    if (jsDoc) descriptions[name] = jsDoc;
  });

  return descriptions;
}

/*
🔥 NEW: Extract defaults + component element from TSX
*/
function extractComponentMeta(file: string) {
  const tsxFile = file.replace(".types.ts", ".tsx");

  if (!fs.existsSync(tsxFile)) return { defaults: {}, element: null };

  const code = fs.readFileSync(tsxFile, "utf8");

  const defaults: any = {};
  let element: string | null = null;

  // default props
  const defaultMatch = code.match(/type\s*=\s*["'](\w+)["']/);
  if (defaultMatch) {
    defaults["type"] = defaultMatch[1];
  }

  // detect HTML element
  const elementMatch = code.match(/<(\w+)/);
  if (elementMatch) {
    element = elementMatch[1];
  }

  return { defaults, element };
}

/*
🔥 Process file
*/
function generateChunks(file: string) {
  console.log("Processing:", file);

  const code = fs.readFileSync(file, "utf8");

  const source = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const { defaults, element } = extractComponentMeta(file);

  const componentChunks: any[] = [];
  let indexMap: Record<string, number> = {};

  source.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node)) return;

    const name = node.name.text;

    const events = extractEvents(node);
    const refs = extractRefs(node);
    const composition = extractComposition(node);
    const enums = extractEnums(node);
    const descriptions = extractDescriptions(node);

    indexMap[name] = (indexMap[name] || 0) + 1;
    const variant = indexMap[name];

    const uniqueName = `${name}__${variant}`;

    try {
      const cleanedMembers = cleanMembers(node.members, name);
      if (cleanedMembers.length === 0) return;

      const updatedNode = ts.factory.updateInterfaceDeclaration(
        node,
        node.modifiers,
        ts.factory.createIdentifier(uniqueName),
        node.typeParameters,
        undefined,
        cleanedMembers
      );

      const printer = ts.createPrinter();

      const tempSource = printer.printNode(
        ts.EmitHint.Unspecified,
        updatedNode,
        source
      );

      const tempFile = file.replace(
        ".types.ts",
        `.${uniqueName}.temp.ts`
      );

      fs.writeFileSync(tempFile, tempSource);

      const config = {
        path: tempFile,
        tsconfig: tsconfigPath,
        type: uniqueName,
        skipTypeCheck: true,
      };

      const generator = tsj.createGenerator(config);
      const schema = generator.createSchema(uniqueName);

      const definitions = schema.definitions;
      if (!definitions) return;

      Object.keys(definitions).forEach((defName) => {
        const def = definitions[defName];

        if (!def.properties) return;

        const properties = parseProperties(def);
        if (properties.length === 0) return;

        const componentName = path.basename(file, ".types.ts");

        componentChunks.push({
          id: `${componentName}_${name}_${variant}`,
          name,
          variant: variant.toString(),
          internalName: uniqueName,
          component: componentName,
          file,
          properties,
          events,
          refs,
          composition,
          enums,
          descriptions,
          defaults,   // 🔥 NEW
          element,    // 🔥 NEW
        });
      });

      fs.unlinkSync(tempFile);

    } catch (err: any) {
      console.log(`⚠️ Skipped ${uniqueName}:`, err.message);
    }
  });

  const outputFile = file.replace(".types.ts", ".schema.json");

  fs.writeFileSync(outputFile, JSON.stringify(componentChunks, null, 2));

  console.log("Created:", outputFile);
}

/*
🔥 Main
*/
const typeFiles = walk(componentsRoot);

typeFiles.forEach((file) => {
  generateChunks(file);
});

console.log("✅ Schema generation completed.");