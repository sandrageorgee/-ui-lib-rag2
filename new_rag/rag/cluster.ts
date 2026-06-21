import fs from "fs";
import path from "path";

const NEW_RAG_DIR = "new_rag";

// ================= COSINE =================
function cosineSimilarity(a: number[], b: number[]) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
}

// ================= CENTROID =================
function getCentroid(cluster: any[]) {
    if (cluster.length === 0) return [];
    const len = cluster[0].embedding.length;
    const avg = new Array(len).fill(0);
    for (const item of cluster) {
        for (let i = 0; i < len; i++) {
            avg[i] += item.embedding[i];
        }
    }
    return avg.map(v => v / cluster.length);
}

// ================= KEYWORDS =================
function extractKeywords(cluster: any[]) {
    const words = new Set<string>();
    cluster.forEach(item => {
        const matches = item.text?.match(/Prop:\s*(\w+)/g);
        if (matches) {
            matches.forEach((m: string) => {
                words.add(m.replace("Prop:", "").trim());
            });
        }
    });
    return Array.from(words);
}

// ================= CLUSTER =================
function clusterEmbeddings(data: any[], threshold = 0.75) {
    const clusters: any[][] = [];

    for (const item of data) {
        let added = false;

        for (const cluster of clusters) {
            const centroid = getCentroid(cluster);
            if (!centroid.length) continue;
            const sim = cosineSimilarity(item.embedding, centroid);
            if (sim > threshold) {
                cluster.push(item);
                added = true;
                break;
            }
        }

        if (!added) {
            clusters.push([item]);
        }
    }

    return clusters;
}

// ================= MAIN =================
function run() {
    if (!fs.existsSync(NEW_RAG_DIR)) {
        console.log(`❌ Directory not found: ${NEW_RAG_DIR}`);
        return;
    }

    const files = fs.readdirSync(NEW_RAG_DIR).filter(
        f => f.startsWith("embeddings.") && f.endsWith(".json")
    );

    if (files.length === 0) {
        console.log("❌ No embedding files found in new_rag/");
        return;
    }

    let allData: any[] = [];

    for (const file of files) {
        const filePath = path.join(NEW_RAG_DIR, file);
        const componentName = file.replace("embeddings.", "").replace(".json", "");

        try {
            const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            const data = Array.isArray(raw) ? raw : [raw];

            // Filter valid embeddings only
            const valid = data.filter(
                (d: any) =>
                    d.embedding &&
                    Array.isArray(d.embedding) &&
                    d.embedding.length > 0
            );

            console.log(`📦 ${componentName}: ${valid.length} valid chunks`);
            allData.push(...valid);
        } catch (e) {
            console.log(`⚠️ Failed to read ${file}`);
        }
    }

    console.log(`\n📊 Total chunks collected: ${allData.length}`);

    if (allData.length === 0) {
        console.log("⚠️ No valid embeddings found");
        return;
    }

    // Sort by text length so shorter/simpler props create cluster seeds first
    allData = allData.sort(
        (a: any, b: any) => (a.text?.length || 0) - (b.text?.length || 0)
    );

    // ================= CLUSTER =================
    console.log("\n🧠 Clustering...");
    const rawClusters = clusterEmbeddings(allData, 0.75);
    console.log(`✅ ${rawClusters.length} clusters created`);

    // ================= FORMAT =================
    const clusters = rawClusters.map((cluster, i) => {
        // Strip embeddings from output to keep file small
        const items = cluster.map(({ embedding, ...rest }: any) => rest);

        return {
            cluster_id: i,
            size: cluster.length,
            keywords: extractKeywords(cluster),
            components: [...new Set(cluster.map((c: any) => c.component))],
            items
        };
    });

    // Print summary
    console.log("\n📋 Cluster summary:");
    clusters.forEach(c => {
        console.log(
            `  Cluster ${c.cluster_id} (${c.size} items) — ${c.components.join(", ")} — props: ${c.keywords.join(", ")}`
        );
    });

    // ================= SAVE =================
    const savePath = path.join(NEW_RAG_DIR, "ALL.clustered.json");
    fs.writeFileSync(savePath, JSON.stringify(clusters, null, 2));

    console.log(`\n✅ Saved: ${savePath}`);
    console.log("🎉 DONE");
}

run();