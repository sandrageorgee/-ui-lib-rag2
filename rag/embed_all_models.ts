
import fs from "fs";
import path from "path";
import "dotenv/config";

// ================= CONFIG =================
const BASE_DIR = path.resolve("./data/mini-ui-lib/components");

const MODELS = [
  "jina-code-embeddings-1.5b",
  "jina-code-embeddings-0.5b",
  "jina-embeddings-v2-base-code",
  "jina-embeddings-v2-base-en"
];

// ================= API KEY CHECK =================
if (!process.env.JINA_API_KEY) {
  throw new Error("❌ Missing JINA_API_KEY");
}

// ================= JINA =================
async function embedWithJina(texts: string[], model: string, retry = 2) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: texts,
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await res.json();

    if (!data.data) {
      console.error("❌ Jina error:", data);

      if (retry > 0) {
        console.log("🔁 Retrying...");
        return embedWithJina(texts, model, retry - 1);
      }

      throw new Error("Embedding failed");
    }

    return data.data.map((d: any) => d.embedding);

  } catch (err) {
    if (retry > 0) {
      console.log("⚠️ Retry...");
      return embedWithJina(texts, model, retry - 1);
    }
    throw err;
  }
}

// ================= BATCHING =================
async function embedInBatches(texts: string[], model: string) {
  const batchSize = 50;
  let all: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    console.log(`→ Batch ${i} to ${i + batch.length}`);

    const emb = await embedWithJina(batch, model);
    all.push(...emb);
  }

  return all;
}

// ================= MAIN =================
async function run() {
  console.log("🚀 Script started");

  const components = fs.readdirSync(BASE_DIR);

  for (const comp of components) {
    const filePath = path.join(
      BASE_DIR,
      comp,
      `${comp}.clustered.chunks.json`
    );

    if (!fs.existsSync(filePath)) continue;

    console.log(`\n📦 Processing component: ${comp}`);

    // ✅ READ CLUSTERED CHUNKS
    const chunks = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    if (!Array.isArray(chunks) || chunks.length === 0) {
      console.log("⚠️ No valid chunks, skipping...");
      continue;
    }

    // 🔥 Extract text (same role as "lines")
    const lines = chunks
      .map((c: any) => c.text)
      .filter((t: string) => t && t.length > 5);

    if (lines.length === 0) {
      console.log("⚠️ No valid lines after filtering, skipping...");
      continue;
    }

    console.log("Sample:", lines[0]);
    console.log("Total lines:", lines.length);

    for (const model of MODELS) {
      console.log(`\n🚀 Embedding with ${model}`);

      const embeddings = await embedInBatches(lines, model);

      // ✅ SAVE WITH METADATA
      const output = chunks.map((chunk: any, i: number) => ({
        component: chunk.component,
        cluster_id: chunk.cluster_id,
        chunk_id: chunk.chunk_id,
        text: chunk.text,
        embedding: embeddings[i] || null,
      }));

      const safeModel = model.replace(/\//g, "-");

      const savePath = path.join(
        BASE_DIR,
        comp,
        `embedded.${safeModel}.${comp}.json`
      );

      fs.writeFileSync(savePath, JSON.stringify(output, null, 2));

      console.log(`✅ Saved: ${savePath}`);
    }
  }

  console.log("\n🎉 DONE");
}

run();

