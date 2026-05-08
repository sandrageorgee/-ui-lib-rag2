"use strict";
/**
 * IMPORTS
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var ts_json_schema_generator_1 = require("ts-json-schema-generator");
var fs_1 = require("fs");
var typescript_1 = require("typescript");
var path_1 = require("path");
var componentsDir = path_1.default.resolve(import.meta.dirname, "../data/mini-ui-lib/components");
var tsconfigPath = path_1.default.resolve(import.meta.dirname, "../data/mini-ui-lib/tsconfig.json");
var tempDir = path_1.default.resolve(import.meta.dirname, "./.temp");
if (!fs_1.default.existsSync(tempDir))
    fs_1.default.mkdirSync(tempDir);
// =============================
// AST PARSER (UNCHANGED)
// =============================
function parseComponentAST(filePath, componentName) {
    if (!fs_1.default.existsSync(filePath))
        return null;
    var code = fs_1.default.readFileSync(filePath, "utf8");
    var source = typescript_1.default.createSourceFile(filePath, code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TSX);
    var dependencies = new Set();
    function visit(node) {
        var _a;
        if (typescript_1.default.isImportDeclaration(node)) {
            if (((_a = node.importClause) === null || _a === void 0 ? void 0 : _a.namedBindings) &&
                typescript_1.default.isNamedImports(node.importClause.namedBindings)) {
                node.importClause.namedBindings.elements.forEach(function (el) {
                    var name = el.name.text;
                    if (name === "React" || name === "useState")
                        return;
                    dependencies.add(name);
                });
            }
        }
        typescript_1.default.forEachChild(node, visit);
    }
    visit(source);
    return {
        dependencies: __spreadArray([], dependencies, true)
    };
}
// =============================
// HELPERS
// =============================
function hasDuplicateInterfaces(content) {
    var matches = content.match(/export interface (\w+)/g) || [];
    var names = matches.map(function (m) { return m.replace("export interface ", ""); });
    return new Set(names).size !== names.length;
}
function fixDuplicateInterfaces(content) {
    var regex = /export interface (\w+)(?: extends ([^{]+))?/g;
    var seen = {};
    var matches = __spreadArray([], content.matchAll(regex), true);
    matches.forEach(function (match) {
        var name = match[1];
        if (!seen[name])
            seen[name] = [];
        seen[name].push("".concat(name).concat(seen[name].length + 1));
    });
    var counter = {};
    content = content.replace(regex, function (full, name, extend) {
        counter[name] = (counter[name] || 0) + 1;
        var newName = seen[name][counter[name] - 1];
        var newExtend = "";
        if (extend)
            newExtend = " extends ".concat(extend.split(",")[0], "1");
        return "export interface ".concat(newName).concat(newExtend);
    });
    return { content: content, seen: seen };
}
function fixTypeReferences(content, seenMap) {
    Object.keys(seenMap).forEach(function (original) {
        var first = "".concat(original, "1");
        content = content.replace(new RegExp("Partial<".concat(original, ">"), "g"), "Partial<".concat(first, ">"));
        content = content.replace(new RegExp(":\\s*".concat(original, "(\\W)"), "g"), ": ".concat(first, "$1"));
    });
    return content;
}
function stripReactTypes(content) {
    return content
        .replace(/import React.*;/g, "")
        .replace(/MouseEvent<.*?>/g, "any")
        .replace(/ChangeEvent<.*?>/g, "any");
}
// =============================
// DOM / BROWSER BUILT-IN TYPES
// =============================
var DOM_BUILTINS = new Set([
    "HTMLInputElement",
    "HTMLButtonElement",
    "HTMLDivElement",
    "HTMLElement",
    "HTMLTextAreaElement",
    "HTMLSelectElement",
    "HTMLAnchorElement",
    "HTMLFormElement",
    "HTMLImageElement",
    "HTMLSpanElement",
    "HTMLLabelElement",
    "HTMLUListElement",
    "HTMLLIElement",
    "HTMLTableElement",
    "HTMLTableRowElement",
    "HTMLTableCellElement",
    "Element",
    "EventTarget",
    "Node",
    "GlobalEventHandlers",
    "DocumentAndElementEventHandlers",
    "ElementCSSInlineStyle",
    "ElementContentEditable",
    "DOMStringMap",
    "DOMTokenList",
    "CSSStyleDeclaration",
    "UIEvent",
    "Event",
    "FocusEvent",
    "MouseEvent",
    "KeyboardEvent",
    "InputEvent",
    "AnimationEvent",
    "PointerEvent",
    "TouchEvent",
    "WheelEvent",
    "DragEvent",
    "ToggleEvent",
    "TransitionEvent",
    "ClipboardEvent",
    "CompositionEvent",
    "SubmitEvent",
    "FileList",
    "File",
    "Blob",
    "MediaStream",
    "ValidityState",
    "NodeList",
    "RadioNodeList",
    "HTMLCollection",
    "StylePropertyMap",
    "DOMRect",
    "DOMRectReadOnly",
    "ShadowRoot",
    "Animation",
    "CSSAnimation",
    "CSSTransition",
]);
function isDomOrBrowserType(key) {
    return (key.startsWith("React.") ||
        key.startsWith("Property.") ||
        key.startsWith("DataType.") ||
        key.startsWith("HTML") ||
        key.startsWith("SVG") ||
        key.startsWith("EventHandler") ||
        key.startsWith("Iterable<") ||
        key === "Globals" ||
        key === "Booleanish" ||
        key === "TrustedHTML" ||
        key === "FormData" ||
        key === "AwaitedReactNode" ||
        DOM_BUILTINS.has(key));
}
// =============================
// EXTRACT OWN PROPS
// =============================
function extractOwnPropsFromTS(content, interfaceName) {
    var regex = new RegExp("interface\\s+".concat(interfaceName, "\\s*(?:extends[^\\{]+)?\\{([\\s\\S]*?)\\}"), "m");
    var match = content.match(regex);
    if (!match)
        return [];
    var body = match[1];
    var propRegex = /(\w+)\??:/g;
    var props = [];
    var m;
    while ((m = propRegex.exec(body)) !== null) {
        props.push(m[1]);
    }
    return props;
}
// =============================
// FIX MALFORMED TYPES
// =============================
// Fixes cases like "type": { "0": "string", "1": "number" }
// which is invalid JSON Schema — converts to anyOf
function fixMalformedType(prop) {
    if (prop.type &&
        typeof prop.type === "object" &&
        !Array.isArray(prop.type)) {
        var type = prop.type, rest = __rest(prop, ["type"]);
        return __assign(__assign({}, rest), { anyOf: Object.values(type).map(function (t) { return ({ type: t }); }) });
    }
    return prop;
}
// =============================
// SIMPLIFY REACT / DOM REFS
// =============================
// Replaces $ref pointers to React/DOM types with a simple typed placeholder
function simplifyReactRefs(properties) {
    var _a;
    var result = {};
    for (var key in properties) {
        var prop = properties[key];
        // Fix malformed type first
        prop = fixMalformedType(prop);
        // If the prop itself is a $ref to a React/DOM type, simplify it
        if (prop.$ref && typeof prop.$ref === "string") {
            var refName = prop.$ref.replace("#/definitions/", "");
            if (isDomOrBrowserType(refName)) {
                result[key] = {
                    type: "object",
                    description: prop.description || "React/DOM type: ".concat(refName)
                };
                continue;
            }
        }
        // If it's a function-shaped object (namedArgs pattern from ts-json-schema-generator)
        // keep it but clean it up
        if (prop.type === "object" &&
            ((_a = prop.properties) === null || _a === void 0 ? void 0 : _a.namedArgs) &&
            prop.$comment) {
            result[key] = {
                type: "function",
                description: prop.description || prop.$comment
            };
            continue;
        }
        result[key] = prop;
    }
    return result;
}
// =============================
// expandRefs
// =============================
function expandRefs(obj, definitions, depth, maxDepth) {
    if (depth === void 0) { depth = 0; }
    if (maxDepth === void 0) { maxDepth = 2; }
    if (!obj || typeof obj !== "object")
        return obj;
    if (depth > maxDepth)
        return obj;
    if (obj.$ref) {
        return obj;
    }
    var result = {};
    for (var key in obj) {
        result[key] = expandRefs(obj[key], definitions, depth + 1, maxDepth);
    }
    return result;
}
// =============================
// TRANSFORM SCHEMA
// =============================
// =============================
// TRANSFORM SCHEMA
// =============================
function transformSchema(schema, componentName, content) {
    var _a;
    if (!schema.definitions)
        return schema;
    // Find the main Props interface for this component
    // e.g. ButtonProps, InputProps, etc.
    var mainKey = (_a = Object.keys(schema.definitions).find(function (k) {
        return k.toLowerCase().includes(componentName.toLowerCase()) &&
            k.toLowerCase().includes("props");
    })) !== null && _a !== void 0 ? _a : Object.keys(schema.definitions)[0];
    var main = schema.definitions[mainKey];
    if (!main)
        return schema;
    // Parse what this interface extends
    var extendsMatches = __spreadArray([], content.matchAll(/export interface \w+\s+extends\s+([^<{]+)/g), true);
    var allExtends = [];
    extendsMatches.forEach(function (m) {
        var parts = m[1].split(",").map(function (p) { return p.trim(); });
        allExtends.push.apply(allExtends, parts);
    });
    // Split into React/HTML extends vs your own library extends
    var reactExtends = allExtends.filter(function (e) {
        return e.startsWith("React.") || isDomOrBrowserType(e.replace("React.", ""));
    });
    var customExtends = allExtends.filter(function (e) {
        return !e.startsWith("React.") && !isDomOrBrowserType(e);
    });
    // Get the prop names explicitly declared on this component's own interface
    var ownProps = extractOwnPropsFromTS(content, mainKey);
    // Collect all prop keys that belong to React/DOM types — we will EXCLUDE these
    var reactOwnedProps = new Set();
    // From React extends
    reactExtends.forEach(function (ext) {
        var key = ext.replace("React.", "");
        var def = schema.definitions[key];
        if (def === null || def === void 0 ? void 0 : def.properties) {
            Object.keys(def.properties).forEach(function (p) { return reactOwnedProps.add(p); });
        }
    });
    // Also scan ALL definitions and blacklist anything from a React/DOM type
    Object.entries(schema.definitions).forEach(function (_a) {
        var key = _a[0], def = _a[1];
        if (isDomOrBrowserType(key) && (def === null || def === void 0 ? void 0 : def.properties)) {
            Object.keys(def.properties).forEach(function (p) { return reactOwnedProps.add(p); });
        }
    });
    var properties = {};
    // 1. Add only the explicitly declared own props (excluding any React-owned ones)
    ownProps.forEach(function (prop) {
        var _a;
        if (reactOwnedProps.has(prop))
            return;
        if ((_a = main.properties) === null || _a === void 0 ? void 0 : _a[prop]) {
            properties[prop] = main.properties[prop];
        }
    });
    // 2. Merge props from YOUR custom extended interfaces (not React/DOM)
    //    Own props take priority — don't overwrite them
    customExtends.forEach(function (extName) {
        var def = schema.definitions[extName];
        if (def === null || def === void 0 ? void 0 : def.properties) {
            Object.entries(def.properties).forEach(function (_a) {
                var k = _a[0], v = _a[1];
                if (!reactOwnedProps.has(k) && !(k in properties)) {
                    properties[k] = v;
                }
            });
        }
    });
    // 3. Simplify any remaining React $refs and fix malformed types
    properties = simplifyReactRefs(properties);
    properties = expandRefs(properties, schema.definitions);
    // Build cleaned definitions — only keep YOUR custom types, drop React/DOM/main
    var cleanedDefinitions = {};
    var _loop_1 = function (key) {
        if (key === mainKey)
            return "continue";
        if (isDomOrBrowserType(key))
            return "continue";
        // Also skip anything that came from a React extend
        if (reactExtends.some(function (e) { return e.replace("React.", "") === key; }))
            return "continue";
        cleanedDefinitions[key] = schema.definitions[key];
    };
    for (var key in schema.definitions) {
        _loop_1(key);
    }
    var result = {
        component: componentName,
        interface: mainKey,
        type: "object",
        properties: properties,
        additionalProperties: reactExtends.length > 0
    };
    if (Object.keys(cleanedDefinitions).length > 0) {
        result.definitions = cleanedDefinitions;
    }
    var allExtendsFinal = __spreadArray(__spreadArray([], customExtends, true), reactExtends, true);
    if (allExtendsFinal.length === 1) {
        result.extends = allExtendsFinal[0];
    }
    else if (allExtendsFinal.length > 1) {
        result.extends = allExtendsFinal;
    }
    return result;
}
// =============================
// MAIN LOOP
// =============================
var componentFolders = fs_1.default.readdirSync(componentsDir);
componentFolders.forEach(function (componentName) {
    var componentPath = path_1.default.join(componentsDir, componentName);
    if (!fs_1.default.statSync(componentPath).isDirectory())
        return;
    console.log("\n\uD83D\uDD0D Processing: ".concat(componentName));
    var typesPath = path_1.default.join(componentPath, "".concat(componentName, ".types.ts"));
    if (!fs_1.default.existsSync(typesPath)) {
        var fallbackTs = path_1.default.join(componentPath, "".concat(componentName, ".ts"));
        if (!fs_1.default.existsSync(fallbackTs))
            return;
        typesPath = fallbackTs;
    }
    var tsxPath = path_1.default.join(componentPath, "".concat(componentName, ".tsx"));
    parseComponentAST(tsxPath, componentName);
    try {
        var content = fs_1.default.readFileSync(typesPath, "utf-8");
        content = stripReactTypes(content);
        var seen = {};
        if (hasDuplicateInterfaces(content)) {
            var result = fixDuplicateInterfaces(content);
            content = result.content;
            seen = result.seen;
            content = fixTypeReferences(content, seen);
        }
        var tempFile = path_1.default.join(tempDir, "".concat(componentName, ".ts"));
        fs_1.default.writeFileSync(tempFile, content);
        var generator = ts_json_schema_generator_1.default.createGenerator({
            path: tempFile,
            tsconfig: tsconfigPath,
            type: "*",
            skipTypeCheck: true,
            expose: "all",
            topRef: true
        });
        var schema = generator.createSchema("*");
        var transformed = transformSchema(schema, componentName, content);
        fs_1.default.writeFileSync(path_1.default.join(componentPath, "final.".concat(componentName, ".schema.json")), JSON.stringify(transformed, null, 2));
        console.log("\u2705 Generated CLEAN schema");
    }
    catch (err) {
        console.log("\u274C Failed");
        console.error(err.message);
    }
});
