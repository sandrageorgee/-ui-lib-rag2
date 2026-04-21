/**
 * IMPORTS
 */

import tsj from "ts-json-schema-generator"; //Converts TypeScript types → JSON schema
import fs from "fs"; //Read/write files
import ts from "typescript";
import path from "path"; //Safely handle file paths across OS

const componentsDir = path.resolve(
  import.meta.dirname,
  "../data/mini-ui-lib/components"
);  // You go up one level → into data/mini-ui-lib/components

const tsconfigPath = path.resolve(
  import.meta.dirname,
  "../data/mini-ui-lib/tsconfig.json"
); // Needed by the schema generator to understand TypeScript config

const tempDir = path.resolve(import.meta.dirname, "./.temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
// Creates a temporary folder to store cleaned TS files ,because you modify types before generating schema

function parseComponentAST(filePath: string, componentName: string) {
  if (!fs.existsSync(filePath)) return null;

  const code = fs.readFileSync(filePath, "utf8");

  const source = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const dependencies = new Set<string>();
  const jsxUsage = new Set<string>();
  const internalComponents = new Set<string>();
  const functions: any[] = [];
  const state: any[] = [];

  function visit(node: ts.Node) {

    // 🔹 IMPORTS
    if (ts.isImportDeclaration(node)) {
      if (
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
        node.importClause.namedBindings.elements.forEach(el => {
          const name = el.name.text;
          if (name === "React" || name === "useState") return;
          dependencies.add(name);
        });
      }
    }

    // 🔹 STATE
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(source) === "useState"
    ) {
      state.push({
        code: node.getText(source)
      });
    }

    // 🔹 FUNCTIONS
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isArrowFunction(node.initializer)
    ) {
      const name = node.name.getText(source);

      if (name !== componentName) {
        const code = node.parent.parent.getText(source);

        functions.push({ name, code });

        if (name[0] === name[0].toUpperCase()) {
          internalComponents.add(name);
        }
      }
    }

    // 🔹 JSX
    if (
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxOpeningElement(node)
    ) {
      const tag = node.tagName.getText(source);

      if (tag[0] === tag[0].toUpperCase()) {
        jsxUsage.add(tag);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);

  return {
    dependencies: [...dependencies],
    jsxUsage: [...jsxUsage],
    internalComponents: [...internalComponents],
    functions,
    state
  };
}

// =============================
// HELPERS
// =============================

/**
 * Checks if a file contains duplicate interface declarations.
 */
function hasDuplicateInterfaces(content) { //Checks if same interface name appears multiple times
  const matches = content.match(/export interface (\w+)/g) || []; //Finds all
  const names = matches.map(m => m.replace("export interface ", "")); // Extracts just the names
  return new Set(names).size !== names.length; // If duplicates exist → Set will shrink → return true
}

/**
 * Renames duplicate interfaces to unique names (Props1, Props2).
 * Also fixes "extends" to avoid recursion.
 */
function fixDuplicateInterfaces(content) { //FIX DUPLICATE INTERFACES --> Renames duplicates
  const regex = /export interface (\w+)(?: extends (\w+))?/g; //Captures: -interface name -optional extends

  const seen = {};      //Tracks all occurrences
  let matches = [...content.matchAll(regex)];

  matches.forEach(match => {
    const name = match[1];
    if (!seen[name]) seen[name] = [];
    seen[name].push(`${name}${seen[name].length + 1}`); // Builds: Props → [Props1, Props2]
  });

  let counter = {};

  content = content.replace(regex, (full, name, extend) => {
    counter[name] = (counter[name] || 0) + 1; //Keeps track of which version we are on
    const newName = seen[name][counter[name] - 1]; //Assigns correct renamed version

    let newExtend = "";
    if (extend) newExtend = ` extends ${extend}1`;

    return `export interface ${newName}${newExtend}`; //Fixes inheritance: extends Props → extends Props1
  });

  return { content, seen };
}

/**
 * Fixes type references after renaming interfaces.
 */
function fixTypeReferences(content, seenMap) { //After renaming interfaces → update references
  Object.keys(seenMap).forEach(original => {
    const first = `${original}1`;

    content = content.replace(
      new RegExp(`Partial<${original}>`, "g"),
      `Partial<${first}>`
    );

    content = content.replace(
      new RegExp(`:\\s*${original}(\\W)`, "g"),
      `: ${first}$1`
    );
  });

  return content;
}

/**
 * Removes React-specific types that break schema generation.
 */
function stripReactTypes(content) {
  return content
    .replace(/import React.*;/g, "")
    .replace(/MouseEvent<.*?>/g, "any")
    .replace(/ChangeEvent<.*?>/g, "any");
}

/**
 * Removes "extends" (fallback only when generator fails).
 */
function stripExtends(content) {
  return content.replace(/extends\s+[^{]+/g, "");
}

// =============================
// 🆕 CHUNKING HELPERS
// =============================

/**
 * Breaks schema into small searchable units (chunks).
 * Each chunk represents:
 *  - property
 *  - event
 *  - ref
 */


function generateDescription(prop, val, componentName) {
  // Event
  if (prop.startsWith("on")) {
    return `Callback function triggered when ${prop.replace("on", "").toLowerCase()} occurs in ${componentName}.`;
  }

  // Enum
  if (val.enum) {
    return `${prop} can be one of: ${val.enum.join(", ")}.`;
  }

  // Boolean
  if (val.type === "boolean") {
    return `Boolean flag to control ${prop} behavior in ${componentName}.`;
  }

  // Default
  return `${prop} property of ${componentName} component.`;
}

function resolveType(val) {
  let ref = null;

  // ARRAY
  if (val.type === "array") {
    if (val.items) {
      if (val.items.$ref) {
        ref = val.items.$ref.split("/").pop();
        return { type: ref + "[]", ref };
      }

      if (val.items.type) {
        return { type: val.items.type + "[]", ref: null };
      }
    }

    return { type: "array", ref: null };
  }

  // NORMAL TYPE
  if (val.type) {
    return { type: val.type, ref: null };
  }

  // REF TYPE
  if (val.$ref) {
    ref = val.$ref.split("/").pop();
    return { type: ref, ref };
  }

  return { type: "any", ref: null };
}

function extractProperties(def) {
  let props = {};

  // ✅ direct properties
  if (def.properties) {
    props = { ...props, ...def.properties };
  }

  // ✅ inherited properties (extends → allOf)
  if (def.allOf) {
    def.allOf.forEach(item => {
      if (item.properties) {
        props = { ...props, ...item.properties };
      }
    });
  }

  return props;
}
function chunkSchema(schema, componentName) { //Converts schema → small pieces (chunks)
  const chunks = [];

  if (!schema.definitions) return chunks; //If no definitions → nothing to process

  Object.entries(schema.definitions).forEach(([defName, def]) => { //Loop over each type (e.g. TreeProps, TreeNodeData)
    // if (!def.properties) return; //Skip if no props

    const properties = extractProperties(def);  //Takes one schema definition (def) , Extracts ALL props from it

    Object.entries(properties).forEach(([prop, val]) => { //Each def = one type like:
      const base = {
        component: componentName,
        definition: defName,                 //Common metadata for each chunk
        isSubType: defName !== componentName + "Props",
        name: prop,
        description:
          val.description ||
          generateDescription(prop, val, componentName),
      };

      // 🔹 Event chunk
      if (prop.startsWith("on")) {
        chunks.push({
          ...base,                      //Detects event handlers. Meaning: This prop is a function/event
          type: "event",                //Try to capture its function signature
          signature: val.$comment || "unknown",
        });
      }

      // 🔹 Ref chunk
      else if (prop.toLowerCase().includes("ref")) {
        chunks.push({
          ...base,               //Detects refs. Meaning: This prop is used to access DOM/component directly.
          type: "ref",
          dataType: "ref",
        });
      }

      // 🔹 Property chunk
      else {
        const resolved = resolveType(val);

        chunks.push({
          ...base,
          type: "property",
          dataType: resolved.type,
          enum: val.enum || null,
          linksTo: resolved.ref || null,
        });
      }
    });
  });

  return chunks;
}

// =============================
// MAIN LOOP
// =============================

/**
 * PIPELINE:
 * 1. Read TS types
 * 2. Clean + fix duplicates
 * 3. Generate schema
 * 4. Fallback if needed
 * 5. 🆕 Chunk schema into small units
 * 6. Save outputs
 */
const componentFolders = fs.readdirSync(componentsDir);

componentFolders.forEach(componentName => {
  const componentPath = path.join(componentsDir, componentName);

  if (!fs.statSync(componentPath).isDirectory()) return;

  console.log(`\n🔍 Processing: ${componentName}`);

  let typesPath = path.join(componentPath, `${componentName}.types.ts`);

  if (!fs.existsSync(typesPath)) {
    const fallbackTs = path.join(componentPath, `${componentName}.ts`);

    if (fs.existsSync(fallbackTs)) {
      typesPath = fallbackTs;
    } else {
      console.log(`⛔ Skipped`);
      return;
    }
  }
  const tsxPath = path.join(componentPath, `${componentName}.tsx`);
  const astData = parseComponentAST(tsxPath, componentName);
  try {
    // =============================
    // STEP 1: Read + clean
    // =============================
    let content = fs.readFileSync(typesPath, "utf-8");
    content = stripReactTypes(content);

    let seen = {};

    // =============================
    // STEP 2: Fix duplicates
    // =============================
    if (hasDuplicateInterfaces(content)) {
      console.log(`⚠️ Fixing duplicates`);

      const result = fixDuplicateInterfaces(content);
      content = result.content;
      seen = result.seen;

      content = fixTypeReferences(content, seen);
    }

    // =============================
    // STEP 3: Temp file
    // =============================
    let tempFile = path.join(tempDir, `${componentName}.ts`);
    fs.writeFileSync(tempFile, content);

    let generator;
    let schema;

    try {
      // =============================
      // STEP 4: Generate schema
      // =============================

      generator = tsj.createGenerator({
        path: tempFile,
        tsconfig: tsconfigPath,
        type: "*",
        skipTypeCheck: true,
        expose: "all",   // 🔥 important
        topRef: true     // 🔥 important
      });

      schema = generator.createSchema("*");


      // =============================
      // STEP 5: Fallback (remove extends)
      // =============================
    } catch (err) {
      console.log(`⚠️ Schema failed → retrying without extends (${componentName})`);

      let safeContent = stripExtends(content);

      const safeFile = path.join(tempDir, `${componentName}_safe.ts`);
      fs.writeFileSync(safeFile, safeContent);

      try {
        generator = tsj.createGenerator({
          path: safeFile,
          tsconfig: tsconfigPath,
          type: "*",
          skipTypeCheck: true,
        });

        schema = generator.createSchema("*");

        console.log(`⚠️ Fallback used (extends removed) → ${componentName}`);

      } catch {
        console.log(`❌ Failed completely: ${componentName}`);
        return;
      }

      if (!schema) return;

    }
    // 🔥 Save FULL enriched data (AST + schema)
    const fullData = {
      component: componentName,
      schema,
      ast: astData
    };

    const fullPath = path.join(
      componentPath,
      `${componentName}.full.json`
    );

    fs.writeFileSync(fullPath, JSON.stringify(fullData, null, 2));


    // =============================
    // 🆕 STEP 6: Chunk schema
    // =============================


    let chunks = chunkSchema(schema, componentName);
    // 🔥 ENRICH chunks with AST knowledge
    if (astData) {

      // 🔹 Component behavior
      if (astData.state.length > 0) {
        chunks.push({
          component: componentName,
          type: "behavior",
          text: `${componentName} uses React useState hook for internal state management.`
        });
      }

      // 🔹 Dependencies
      astData.dependencies.forEach(dep => {
        chunks.push({
          component: componentName,
          type: "dependency",
          text: `${componentName} imports and uses ${dep} component.`
        });
      });

      // 🔹 JSX usage
      astData.jsxUsage.forEach(tag => {
        chunks.push({
          component: componentName,
          type: "render",
          text: `${componentName} renders ${tag} component in JSX.`
        });
      });

      // 🔹 Functions
      astData.functions.forEach(fn => {
        chunks.push({
          component: componentName,
          type: "function",
          name: fn.name,
          text: `${componentName} contains function ${fn.name}: ${fn.code.slice(0, 100)}`
        });
      });
    }

    const chunkPath = path.join(
      componentPath,
      `chunks.${componentName}.json`
    );

    fs.writeFileSync(chunkPath, JSON.stringify(chunks, null, 2));

    // =============================
    // STEP 7: Save schema
    // =============================
    const outputPath = path.join(
      componentPath,
      `final.${componentName}.schema.json`
    );

    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));

    console.log(`✅ Generated schema + chunks`);

  } catch (err) {
    console.log(`❌ Failed`);
    console.error(err.message);
  }
});