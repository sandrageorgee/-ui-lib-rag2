// =============================
// STAGE 3 — EXTRACT
// Regex-scans the raw .tsx source text and pulls out:
//   • default prop values  (from destructured props)
//   • usage examples       (from return() JSX blocks)
//   • CSS class names      (from className attributes and clsx calls)
// =============================

export interface ExtractedInfo {
    defaultValues: Record<string, any>;
    usageExamples: string[];
    cssClasses:    string[];
}

export function extractSourceInfo(content: string): ExtractedInfo {
    return {
        defaultValues: extractDefaultValues(content),
        usageExamples: extractUsageExamples(content),
        cssClasses:    extractCSSClasses(content),
    };
}

// ----- default values -----

function extractDefaultValues(content: string): Record<string, any> {

    const defaults: Record<string, any> = {};

    const destructureRegex = /\{\s*([\s\S]*?)\s*\}\s*=\s*props/g;

    let match;

    while ((match = destructureRegex.exec(content)) !== null) {

        const block = match[1];

        const defaultRegex =
            /(\w+)\s*=\s*"([^"]+)"|(\w+)\s*=\s*'([^']+)'|(\w+)\s*=\s*(true|false|\d+(\.\d+)?)/g;

        let d;

        while ((d = defaultRegex.exec(block)) !== null) {
            const key   = d[1] || d[3] || d[5];
            const value = d[2] ?? d[4] ?? d[6];
            if (key && value !== undefined) defaults[key] = value;
        }
    }

    return defaults;
}

// ----- usage examples -----

function extractUsageExamples(content: string): string[] {

    const examples: string[] = [];

    const returnRegex = /return\s*\(\s*([\s\S]*?)\s*\)\s*;/g;

    let match;

    while ((match = returnRegex.exec(content)) !== null) {
        const jsx = match[1].trim();
        if (!jsx.includes("<")) continue;
        if (jsx.length > 800) continue;
        examples.push(jsx);
    }

    return [...new Set(examples)].slice(0, 2);
}

// ----- CSS classes -----

// Extracts top-level `const X = 'value'` string assignments so that
// template literals like `${baseClass}__icon` can be resolved to their
// full class name (e.g. "Cui-Alert__icon") instead of just "__icon".
function extractStringConstants(content: string): Record<string, string> {
    const constants: Record<string, string> = {};
    const constRegex = /const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = constRegex.exec(content)) !== null) {
        constants[m[1]] = m[2];
    }
    return constants;
}

function resolveTemplate(template: string, constants: Record<string, string>): string {
    // substitute known constants; drop unknown variables (dynamic values like severity)
    return template.replace(/\$\{(\w+)\}/g, (_, varName) => constants[varName] ?? "");
}

function extractCSSClasses(content: string): string[] {

    const classes  = new Set<string>();
    const constants = extractStringConstants(content);

    let match;

    // className="..."
    const plainRegex = /className\s*=\s*"([^"]+)"/g;
    while ((match = plainRegex.exec(content)) !== null) {
        match[1].split(/\s+/).forEach(c => { if (c.trim()) classes.add(c.trim()); });
    }

    // className={`...`}
    const templateRegex = /className\s*=\s*\{`([^`]+)`\}/g;
    while ((match = templateRegex.exec(content)) !== null) {
        resolveTemplate(match[1], constants)
            .split(/\s+/)
            .forEach(c => { if (c.trim()) classes.add(c.trim()); });
    }

    // clsx / cn / classNames(...)
    const clsxRegex = /(?:clsx|cn|classNames)\(([\s\S]*?)\)/g;
    while ((match = clsxRegex.exec(content)) !== null) {
        const stringRegex = /["']([^"']+)["']/g;
        let s;
        while ((s = stringRegex.exec(match[1])) !== null) {
            s[1].split(/\s+/).forEach(c => { if (c.trim()) classes.add(c.trim()); });
        }
    }

    return [...classes].sort();
}
