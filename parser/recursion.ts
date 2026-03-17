// // 1. Import the TypeScript library to access compiler functions 
// import path from "path/win32";
// import * as ts from "typescript";

// /**
//  * Main function to find an interface in a file and resolve its structure
//  */
// function extractComponentMetadata(filePath: string, interfaceName: string) {
//   // 2. Initialize a "Program" to represent the project state and type context
//   const program = ts.createProgram([filePath], { allowJs: true });
//   console.log("Program created with file:", filePath);
//   // 3. Get the "TypeChecker" engine, which calculates types from code symbols [2, 1]
//   const checker = program.getTypeChecker();
//   console.log("TypeChecker initialized");
//   // 4. Load the Abstract Syntax Tree (AST) for the target file 
//   const sourceFile = program.getSourceFile(filePath);
//   console.log("Source file loaded:", sourceFile ? "Yes" : "No");
//   // 5. Exit if the file cannot be found or parsed
//   if (!sourceFile) return;

//   // 6. Variable to hold the resolved type object of our target interface
//   let targetType: ts.Type | undefined;

//   // 7. Traverse every top-level node (imports, classes, interfaces) in the file
//   ts.forEachChild(sourceFile, (node) => {
//     // 8. Check if node is an interface and its name matches the search
//     console.log("Visiting node:", ts.SyntaxKind[node.kind], "Text:", node.getText().slice(0, 50));
//     if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
//       // 9. Resolve the semantic "Type" object for this interface declaration [2, 1]
//       targetType = checker.getTypeAtLocation(node);
//         console.log(`Found interface: ${interfaceName}, Type resolved:`, !!targetType);
//     }
//   });

//   // 10. Exit if the target interface was not found in the AST
//   if (!targetType) return;

//   /**
//    * Recursive helper function to expand types into objects
//    */
//   function resolveTypeRecursive(
//     type: ts.Type,                 // Current type to resolve
//     visited: Set<ts.Type> = new Set(), // Path tracking for cycle detection
//     depth: number = 0,             // Current recursion level
//     maxDepth: number = 3           // Hard limit for safety
//   ): any {
//     // 11. Termination: Check if type is a simple primitive (string, number, boolean)
//     if (type.getFlags() & (ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean)) {
//       // 12. Convert the primitive type back to a string name [2, 1, 3]
//       console.log(`Primitive type found: ${checker.typeToString(type)}`);
//       return checker.typeToString(type);
//     }

//     // 13. Cycle Detection: Check if we've seen this type in the current branch
//     if (visited.has(type)) {
//       return ""; // Stop expanding to prevent infinite loops
//     }

//     // 14. Depth Management: Check if we've reached the user-defined limit
//     if (depth > maxDepth) {
//       return checker.typeToString(type) + " (depth limit)"; // Bail out with a label
//     }

//     // 15. Cycle Detection: Track this type before processing its children
//     visited.add(type);
//     console.log(`Resolving type: ${checker.typeToString(type)}, Visited types: ${JSON.stringify(Array.from(visited).map(t => checker.typeToString(t)))}`);
//     // 16. Result container for the expanded property metadata
//     const result: Record<string, any> = {};

//     // 17. Enumerate all fields (Symbols) inside the interface/object [3]
//     const properties = type.getProperties();
//     console.log(`Resolving type: ${checker.typeToString(type)}, Properties found: ${properties.length}`);
//     for (const prop of properties) {
//       // 18. Get the string name of the specific property (e.g., "variant") [3]
//       const propName = prop.getName();
//       console.log(`Resolving property: ${propName}`);
//       // 19. Resolve the Symbol back into a Type object to see its shape [3]
//       const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!);

//       // 20. Recursion: Call function again for the child property
//       result[propName] = resolveTypeRecursive(
//         propType, 
//         new Set(visited), // Pass current path to children for cycle detection
//         depth + 1,       // Move one level deeper
//         maxDepth         // Pass original limit
//       );
//     }

//     // 21. Return the fully resolved object structure
//     return result;
//   }

//   // 22. Kick off the recursive process starting with the top-level interface
//   return resolveTypeRecursive(targetType);
// }

// // Example usage to output metadata as a JSON string
// const metadata = extractComponentMetadata(path.resolve("data/mini-ui-lib/components/Button/Button.types.ts"), "ButtonProps");
// console.log(JSON.stringify(metadata, null, 2));

import * as ts from "typescript";
import * as path from "path";

function extractComponentMetadata(filePath: string, interfaceName: string) {
    // 1. Load your actual tsconfig.json to resolve 'React' and external imports
    const configPath = ts.findConfigFile("./", ts.sys.fileExists, "tsconfig.json");
    if (!configPath) throw new Error("Could not find tsconfig.json");

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, "./");

    // 2. Create the Program using your project's settings
    const program = ts.createProgram({
        rootNames: [path.resolve(filePath)],
        options: parsedConfig.options
    });
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(path.resolve(filePath));

    if (!sourceFile) return;

    let targetType: ts.Type | undefined;
    ts.forEachChild(sourceFile, (node) => {
        if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
            targetType = checker.getTypeAtLocation(node);
        }
    });

    if (!targetType) return;

    function resolveTypeRecursive(
        type: ts.Type,
        visited: Set<ts.Type> = new Set(),
        depth: number = 0
    ): any {
        const typeString = checker.typeToString(type);

        // Termination: Basic Primitives
        if (type.getFlags() & (ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean | ts.TypeFlags.Void)) {
            return typeString;
        }

        // Termination: Function Types (Avoid empty objects for onClick)
        if (type.getCallSignatures().length > 0) {
            return typeString;
        }

        // Cycle Detection & Depth Limit
        if (visited.has(type) || depth > 3) {
            return typeString;
        }
        visited.add(type);

        // Handle Unions (e.g., string | undefined)
        if (type.isUnion()) {
            return type.types.map(t => resolveTypeRecursive(t, new Set(visited), depth)).join(" | ");
        }

        const result: Record<string, any> = {};
        const props = type.getProperties();

        for (const prop of props) {
            const name = prop.getName();

            // CRITICAL: Filter out built-in JS methods (toString, valueOf, etc.)
            // We only want properties defined in your source code
            const declarations = prop.getDeclarations();
            if (declarations && declarations.some(d => d.getSourceFile().fileName.includes("node_modules/typescript/lib"))) {
                continue;
            }

            const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration || declarations![0]);
            result[name] = resolveTypeRecursive(propType, new Set(visited), depth + 1);
        }

        // If it's an empty object (like an empty interface), just return the name
        return Object.keys(result).length === 0 ? typeString : result;
    }

    return resolveTypeRecursive(targetType);
}

const metadata = extractComponentMetadata("data/mini-ui-lib/components/Button/Button.types.ts", "ButtonProps");
console.log(JSON.stringify(metadata, null, 2));