import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// =============================
// STAGE 1 — DISCOVER
// Resolves all paths and returns every .tsx file to process.
// =============================

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export interface ComponentFile {
    componentName: string; // folder name  e.g. "alert"
    tsxFile:       string; // filename      e.g. "alerts.tsx"
    tsxPath:       string; // absolute path
}

export const PATHS = {
    componentsDir: path.resolve(__dirname, "../mini-commonui/packages/common-ui/src/components"),
    tsconfigPath:  path.resolve(__dirname, "../mini-commonui/tsconfig.json"),
    resultsDir:    path.resolve(__dirname, "./parsing-results"),
};

export function discoverComponentFiles(): ComponentFile[] {

    const { componentsDir } = PATHS;
    const files: ComponentFile[] = [];

    const folders = fs.readdirSync(componentsDir);

    for (const componentName of folders) {

        const componentPath = path.join(componentsDir, componentName);

        if (!fs.statSync(componentPath).isDirectory()) continue;

        const tsxFiles = fs
            .readdirSync(componentPath)
            .filter(f => f.endsWith(".tsx"));

        for (const tsxFile of tsxFiles) {
            files.push({
                componentName,
                tsxFile,
                tsxPath: path.join(componentPath, tsxFile),
            });
        }
    }

    return files;
}
