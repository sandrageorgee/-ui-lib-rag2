import fs from "fs";
import path from "path";

const BASE_DIR = "data/mini-ui-lib/components";

// ================= MERGE CLUSTER =================
function mergeCluster(cluster: any) {
    if (!Array.isArray(cluster.items)) return "";

    return cluster.items
        .map((item: any) => item.text?.trim() || "")
        .join("\n\n----------------------------------------\n\n");
}

// ================= MAIN =================
function run() {
    const components = fs.readdirSync(BASE_DIR);

    for (const comp of components) {
        const compPath = path.join(BASE_DIR, comp);

        if (!fs.statSync(compPath).isDirectory()) continue;

        const filePath = path.join(
            compPath,
            `${comp}.clustered.json`
        );

        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ No clusters for ${comp}`);
            continue;
        }

        console.log(`\n📦 Processing clusters: ${comp}`);

        const clusters = JSON.parse(
            fs.readFileSync(filePath, "utf-8")
        );

        const result = clusters.map((cluster: any, i: number) => {
            const mergedText = mergeCluster(cluster);

            return {
                component: comp,
                cluster_id: cluster.cluster_id ?? i,
                size: cluster.items?.length || 0,
                keywords: cluster.keywords || [],
                text: mergedText
            };
        });

        // ================= SAVE =================
        const savePath = path.join(
            compPath,
            `${comp}.clusters.text.json`
        );

        fs.writeFileSync(savePath, JSON.stringify(result, null, 2));

        console.log(`✅ Saved: ${savePath}`);
    }

    console.log("\n🎉 DONE");
}

run();