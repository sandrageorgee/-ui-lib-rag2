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

// ================= HELPERS =================
function chunkToText(c: any) {
  const component = c.component || "";
  const type = c.type || "";
  const name = c.name || "";
  const description = c.description || "";

  return `${component} component ${type} "${name}". ${description}`.trim();
}

// ================= API KEY CHECK =================
if (!process.env.JINA_API_KEY) {
  throw new Error("❌ Missing JINA_API_KEY. Run: export JINA_API_KEY=jina_889fe3bdf8f14a739db02e8b683235c0l8x6_0WukfNvCzNxmQU_6FWQAi_a");
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
      console.log("⚠️ Retry due to error...");
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
  console.log("BASE_DIR:", BASE_DIR);

  const components = fs.readdirSync(BASE_DIR);
  console.log("Components:", components);

  for (const comp of components) {
    const chunkPath = path.join(BASE_DIR, comp, `chunks.${comp}.json`);

    if (!fs.existsSync(chunkPath)) continue;

    console.log(`\n📦 Processing component: ${comp}`);

    const chunks = JSON.parse(fs.readFileSync(chunkPath, "utf-8"));

    const texts = chunks
      .map(chunkToText)
      .filter(t => typeof t === "string" && t.length > 5);

    if (texts.length === 0) {
      console.log("⚠️ No valid texts, skipping...");
      continue;
    }

    console.log("Sample text:", texts[0]);
    console.log("Total texts:", texts.length);

    for (const model of MODELS) {
      console.log(`\n🚀 Embedding with ${model}`);

      const embeddings = await embedInBatches(texts, model);

      const output = chunks.map((chunk: any, i: number) => ({
        ...chunk,
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