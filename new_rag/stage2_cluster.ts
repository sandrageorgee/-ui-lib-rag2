import fs from "fs";
import path from "path";

const EMBEDDING_DIR = "embedding_results";
const CLUSTERING_DIR = "clustering_results";

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
        // prop chunks: extract from "Prop: xxx" lines in text
        const propMatches = item.text?.match(/Prop:\s*(\w+)/g);
        if (propMatches) {
            propMatches.forEach((m: string) => words.add(m.replace("Prop:", "").trim()));
        }
        // story chunks: use the prop field (label)
        if (item.type === "story" && item.prop && !item.prop.startsWith("__")) {
            words.add(item.prop);
        }
        // demo chunks: use the title field and add "Demo" marker
        if (item.type === "demo") {
            words.add("Demo");
            if (item.title) words.add(item.title);
        }
        // interface_summary chunks: type is e.g. "Alert interface_summary"
        if (typeof item.type === "string" && item.type.endsWith("interface_summary")) {
            words.add(item.type);
            words.add("interface_summary");
        }
        // description and css_classes chunks
        if (item.type === "description") {
            words.add("description");
            words.add(item.component);
        }
        if (item.type === "css_classes") {
            words.add("css_classes");
            words.add(item.component);
        }
    });
    return Array.from(words);
}

// ================= CLUSTER =================
function clusterEmbeddings(data: any[], threshold = 0.98) {
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

// ================= PROCESS ONE COMPONENT =================
function processComponent(file: string) {
    const filePath = path.join(EMBEDDING_DIR, file);
    const componentName = file.replace("embeddings.", "").replace(".json", "");

    console.log(`\n📦 Processing: ${componentName}`);

    let raw: any;
    try {
        raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
        console.log(`⚠️ Failed to read ${file}`);
        return;
    }

    const data = Array.isArray(raw) ? raw : [raw];

    const valid = data.filter(
        (d: any) =>
            d.embedding &&
            Array.isArray(d.embedding) &&
            d.embedding.length > 0
    );

    if (valid.length === 0) {
        console.log(`⚠️ No valid embeddings for ${componentName}`);
        return;
    }

    console.log(`✅ Valid chunks: ${valid.length}`);

    // header and interface_summary are component-level overviews — never merge
    // them with prop/story/demo clusters
    const isStandalone = (d: any) =>
        d.type === "header" ||
        d.type === "description" ||
        d.type === "css_classes" ||
        (typeof d.type === "string" && d.type.endsWith("interface_summary"));
    const standalone = valid.filter(isStandalone);
    const clusterable = valid.filter((d: any) => !isStandalone(d));

    const sorted = [...clusterable].sort(
        (a: any, b: any) => (a.text?.length || 0) - (b.text?.length || 0)
    );

    // Threshold 0.84 — merges functionally related chunks (e.g. closeable+onClose,
    // severity+icon, message+title) while keeping unrelated props separate
    const rawClusters = clusterEmbeddings(sorted, 0.84);
    console.log(`🧠 ${rawClusters.length} clusters created`);

    const clusters = rawClusters.map((cluster, i) => {
        const items = cluster.map(({ embedding, ...rest }: any) => rest);
        return {
            cluster_id: i,
            size: cluster.length,
            keywords: extractKeywords(cluster),
            items
        };
    });

    // Append standalone chunks as their own single-item clusters
    standalone.forEach(({ embedding, ...item }: any) => {
        clusters.push({
            cluster_id: clusters.length,
            size: 1,
            keywords: extractKeywords([{ ...item, embedding }]),
            items: [item]
        });
    });

    clusters.forEach(c => {
        const label = `Cluster ${c.cluster_id}`;
        console.log(`  ${label} (${c.size} items) — props: ${c.keywords.join(", ")}`);
    });

    fs.mkdirSync(CLUSTERING_DIR, { recursive: true });
    const savePath = path.join(CLUSTERING_DIR, `clustering.${componentName}.json`);
    fs.writeFileSync(savePath, JSON.stringify(clusters, null, 2));
    console.log(`✅ Saved: ${savePath}`);
}

// ================= MAIN =================
function run() {
    if (!fs.existsSync(EMBEDDING_DIR)) {
        console.log(`❌ Directory not found: ${EMBEDDING_DIR}`);
        return;
    }

    const files = fs.readdirSync(EMBEDDING_DIR).filter(
        (f: string) => f.startsWith("embeddings.") && f.endsWith(".json")
    );

    if (files.length === 0) {
        console.log("❌ No embedding files found in new_rag/");
        return;
    }

    console.log(`🚀 Found ${files.length} component(s) to process`);

    for (const file of files) {
        processComponent(file);
    }

    console.log("\n🎉 DONE");
}

run();