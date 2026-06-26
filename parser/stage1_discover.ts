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
    packageName:   string; // e.g. "common-ui"
    componentName: string; // folder name  e.g. "alert"   (or file basename for flat-file packages)
    tsxFile:       string; // filename      e.g. "alerts.tsx"
    tsxPath:       string; // absolute path
}

export interface PackageConfig {
    name:          string;
    componentsDir: string;
    tsconfigPath:  string;
}

const COMMON_UI_ROOT = path.resolve(__dirname, "../common-ui");

export const PACKAGES: PackageConfig[] = [
    {
        name:          "common-ui",
        componentsDir: path.join(COMMON_UI_ROOT, "packages/common-ui/src/components"),
        tsconfigPath:  path.join(COMMON_UI_ROOT, "packages/common-ui/tsconfig.json"),
    },
    {
        name:          "common-ui-templates",
        componentsDir: path.join(COMMON_UI_ROOT, "packages/common-ui-templates/src/components"),
        tsconfigPath:  path.join(COMMON_UI_ROOT, "packages/common-ui-templates/tsconfig.json"),
    },
    {
        name:          "common-ui-icons",
        componentsDir: path.join(COMMON_UI_ROOT, "packages/common-ui-icons/src/icons"),
        tsconfigPath:  path.join(COMMON_UI_ROOT, "packages/common-ui-icons/tsconfig.json"),
    },
];

export const PATHS = {
    resultsDir: path.resolve(__dirname, "./parsing-results"),
};

// Walks one package's componentsDir and emits one ComponentFile per .tsx found.
// Handles three real-world layouts:
//   A) flat-folder per component:   alert/alerts.tsx
//   B) nested groups of folders:    building/alarms/alarms.tsx
//   C) flat .tsx files at the root: configureicon.tsx        (icons package)
export function discoverComponentFiles(pkg: PackageConfig): ComponentFile[] {

    const files: ComponentFile[] = [];

    if (!fs.existsSync(pkg.componentsDir)) return files;

    // Case C — .tsx files directly under componentsDir (icons-style)
    for (const entry of fs.readdirSync(pkg.componentsDir)) {
        const entryPath = path.join(pkg.componentsDir, entry);
        if (fs.statSync(entryPath).isFile() && entry.endsWith(".tsx")) {
            files.push({
                packageName:   pkg.name,
                componentName: path.basename(entry, ".tsx"),
                tsxFile:       entry,
                tsxPath:       entryPath,
            });
        }
    }

    // Cases A + B — recurse into folders looking for .tsx inside
    function walkFolder(folderPath: string, folderName: string) {
        const tsxFiles = fs
            .readdirSync(folderPath)
            .filter((f: string) => f.endsWith(".tsx") && fs.statSync(path.join(folderPath, f)).isFile());

        if (tsxFiles.length > 0) {
            for (const tsxFile of tsxFiles) {
                files.push({
                    packageName:   pkg.name,
                    componentName: folderName,
                    tsxFile,
                    tsxPath:       path.join(folderPath, tsxFile),
                });
            }
            return; // leaf component folder — do not recurse deeper
        }

        // no .tsx here → treat as a group folder; recurse one level
        for (const child of fs.readdirSync(folderPath)) {
            const childPath = path.join(folderPath, child);
            if (fs.statSync(childPath).isDirectory()) {
                walkFolder(childPath, child);
            }
        }
    }

    for (const entry of fs.readdirSync(pkg.componentsDir)) {
        const entryPath = path.join(pkg.componentsDir, entry);
        if (fs.statSync(entryPath).isDirectory()) {
            walkFolder(entryPath, entry);
        }
    }

    return files;
}
