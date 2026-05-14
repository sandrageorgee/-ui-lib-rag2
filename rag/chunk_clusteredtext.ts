
import fs from "fs";
import path from "path";

const BASE_DIR = "data/mini-ui-lib/components";

// 🔥 control chunk size (tune this)
const MAX_CHARS = 600;

// ================= TEXT CHUNKER =================
function chunkText(text: string) {
    const chunks: string[] = [];

    let current = "";

    const parts = text.split("\n\n----------------------------------------\n\n");

    for (const part of parts) {
        if ((current + part).length > MAX_CHARS) {
            if (current) {
                chunks.push(current.trim());
                current = "";
            }
        }

        current += part + "\n\n";
    }

    if (current.trim()) {
        chunks.push(current.trim());
    }

    return chunks;
}

// ================= MAIN =================
function run() {
    const components = fs.readdirSync(BASE_DIR);

    for (const comp of components) {
        const compPath = path.join(BASE_DIR, comp);

        if (!fs.statSync(compPath).isDirectory()) continue;

        const filePath = path.join(
            compPath,
            `${comp}.clusters.text.json`
        );

        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ No cluster text for ${comp}`);
            continue;
        }

        console.log(`\n📦 Chunking clustered TEXT: ${comp}`);

        const clusters = JSON.parse(
            fs.readFileSync(filePath, "utf-8")
        );

        const result: any[] = [];

        clusters.forEach((cluster: any) => {
            const textChunks = chunkText(cluster.text);

            textChunks.forEach((chunk: string, i: number) => {
                result.push({
                    component: comp,
                    cluster_id: cluster.cluster_id,
                    chunk_id: i,
                    size: cluster.size,
                    text: chunk
                });
            });
        });

        // ================= SAVE =================
        const savePath = path.join(
            compPath,
            `${comp}.clustered.chunks.json`
        );

        fs.writeFileSync(savePath, JSON.stringify(result, null, 2));

        console.log(`✅ Saved: ${savePath}`);
    }

    console.log("\n🎉 DONE");
}

run();

