import fs from "fs";
import path from "path";
import "dotenv/config";

// ================= CONFIG =================
const BASE_DIR = path.resolve("./data/mini-ui-lib/components");
const MODEL = "jina-code-embeddings-1.5b";

// ================= API KEY =================
if (!process.env.JINA_API_KEY) {
  throw new Error("❌ Missing JINA_API_KEY");
}

// ================= SANITIZE =================
function sanitizeText(text: string): string {
  return text
    .replace(/={3,}/g, "") // remove =====
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // control chars
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n") // normalize spacing
    .trim();
}

// ================= SAFE TRIM =================
function safeTrim(text: string, max = 1500) {
  return text.length > max ? text.slice(0, max) : text;
}

// ================= EXTRACT BLOCKS =================
function extractBlocks(text: string) {
  const chunks: any[] = [];

  // ❌ remove duplicated sections
  text = text.split("================================================================================")[0];

  const componentMatch = text.match(/Component:\s*(.+)/);
  const component = componentMatch?.[1]?.trim() || "Unknown";

  let currentInterface = "";

  // 🔥 split by separator lines
  const parts = text.split(/-{10,}/);

  for (const part of parts) {
    let clean = part.trim();

    if (clean.length < 50) continue;

    // ❌ skip nested recursion blocks
    if (clean.includes("Array item structure")) continue;
    if (clean.includes("Nested structure truncated")) continue;

    // detect interface
    const ifaceMatch = clean.match(/Interface:\s*(.+)/);
    if (ifaceMatch) {
      currentInterface = ifaceMatch[1].trim();
    }

    // only keep prop blocks
    if (!clean.includes("Prop:")) continue;

    // 🔥 remove any leftover separators
    clean = clean.replace(/-{5,}/g, "");

    // 🔥 FIX spacing & structure
    clean = clean
      .replace(
        /(Component:|Interface:|Prop:|Type:|Required:|Description:|Accepted values:|Usage:)/g,
        "\n$1"
      )
      .replace(/\n{2,}/g, "\n")
      .trim();

    // 🔥 limit size
    clean = safeTrim(clean);

    const enriched = `
Component: ${component}
Interface: ${currentInterface}

${clean}
    `.trim();

    chunks.push({
      component,
      interface: currentInterface,
      text: enriched,
    });
  }

  return chunks;
}

// ================= JINA =================
async function embedWithJina(texts: string[], retry = 2): Promise<number[][]> {
  try {
    const res = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: texts,
      }),
    });

    const data = await res.json();

    if (!data.data) {
      console.error("❌ Jina error:", data);

      if (retry > 0) {
        return embedWithJina(texts, retry - 1);
      }

      return texts.map(() => null as any);
    }

    return data.data.map((d: any) => d.embedding);

  } catch {
    if (retry > 0) {
      return embedWithJina(texts, retry - 1);
    }
    return texts.map(() => null as any);
  }
}

// ================= SAFE BATCH =================
async function embedInBatches(texts: string[]) {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    try {
      const emb = await embedWithJina([texts[i]]);
      results.push(emb[0] || null);
    } catch {
      console.error(`❌ Failed chunk ${i}`);
      results.push(null);
    }
  }

  return results;
}

// ================= MAIN =================
async function run() {
  console.log("🚀 Script started");

  const components = fs.readdirSync(BASE_DIR);

  for (const comp of components) {
    const textPath = path.join(BASE_DIR, comp, `text.${comp}.txt`);

    if (!fs.existsSync(textPath)) {
      console.log(`⚠️ Missing txt for ${comp}`);
      continue;
    }

    console.log(`\n📦 Processing: ${comp}`);

    const raw = fs.readFileSync(textPath, "utf-8");

    // ✅ CLEAN
    const cleaned = sanitizeText(raw);

    // ✅ EXTRACT
    const chunks = extractBlocks(cleaned);

    if (chunks.length === 0) {
      console.log("⚠️ No valid chunks extracted");
      continue;
    }

    console.log("🧩 Chunks:", chunks.length);
    console.log("Sample:\n", chunks[0].text);

    // ================= EMBEDDING =================
    const texts = chunks.map(c => c.text);
    const embeddings = await embedInBatches(texts);

    // ================= SAVE =================
    const output = chunks.map((c, i) => ({
      ...c,
      embedding: embeddings[i] || null,
    }));

    const savePath = path.join(BASE_DIR, comp, `${comp}.embedded.json`);

    fs.writeFileSync(savePath, JSON.stringify(output, null, 2));

    console.log(`✅ Saved: ${savePath}`);
  }

  console.log("\n🎉 DONE");
}

import fs from "fs";
import path from "path";
import "dotenv/config";

// ================= CONFIG =================
const BASE_DIR = path.resolve("./data/mini-ui-lib/components");
const MODEL = "jina-code-embeddings-1.5b";

// ================= API KEY =================
if (!process.env.JINA_API_KEY) {
  throw new Error("❌ Missing JINA_API_KEY");
}

// ================= SANITIZE =================
function sanitizeText(text: string): string {
  return text
    // fix glued keywords
    .replace(/(Component:)(\S)/g, "$1\n$2")
    .replace(/(Interface:)(\S)/g, "$1\n$2")
    .replace(/(Prop:)(\S)/g, "$1\n$2")
    .replace(/(Type:)(\S)/g, "$1\n$2")
    .replace(/(Required:)(\S)/g, "$1\n$2")
    .replace(/(Description:)(\S)/g, "$1\n$2")
    .replace(/(Accepted values:)(\S)/g, "$1\n$2")
    .replace(/(Usage:)(\S)/g, "$1\n$2")

    // normalize spacing
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")

    .trim();
}

// ================= SAFE TRIM =================
function safeTrim(text: string, max = 1500) {
  return text.length > max ? text.slice(0, max) : text;
}

// ================= EXTRACT BLOCKS =================
function extractBlocks(text: string) {
  const chunks: any[] = [];

  // remove duplicated sections
  text = text.split("================================================================================")[0];

  const componentMatch = text.match(/Component:\s*(.+)/);
  const component = componentMatch?.[1]?.trim() || "Unknown";

  let currentInterface = "";

  // ✅ correct splitting
  const parts = text.split(/-{10,}/);

  for (const part of parts) {
    let clean = part.trim();

    if (clean.length < 30) continue;

    // skip recursive junk
    if (clean.includes("Array item structure")) continue;
    if (clean.includes("Nested structure truncated")) continue;

    // detect interface FIRST
    const ifaceMatch = clean.match(/Interface:\s*(.+)/);
    if (ifaceMatch) {
      currentInterface = ifaceMatch[1].trim();
    }

    // must contain a prop
    if (!clean.includes("Prop:")) continue;

    // remove leftover separators
    clean = clean.replace(/-{5,}/g, "");

    // fix spacing INSIDE block
    clean = clean
      .replace(
        /(Component:|Interface:|Prop:|Type:|Required:|Description:|Accepted values:|Usage:)/g,
        "\n$1"
      )
      .replace(/\n{2,}/g, "\n")
      .trim();

    clean = safeTrim(clean);

    const enriched = `
Component: ${component}
Interface: ${currentInterface}

${clean}
    `.trim();

    chunks.push({
      component,
      interface: currentInterface,
      text: enriched,
    });
  }

  return chunks;
}

// ================= JINA =================
async function embedWithJina(texts: string[], retry = 2): Promise<number[][]> {
  try {
    const res = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: texts,
      }),
    });

    const data = await res.json();

    if (!data.data) {
      console.error("❌ Jina error:", data);

      if (retry > 0) return embedWithJina(texts, retry - 1);

      return texts.map(() => null as any);
    }

    return data.data.map((d: any) => d.embedding);
  } catch {
    if (retry > 0) return embedWithJina(texts, retry - 1);
    return texts.map(() => null as any);
  }
}

// ================= SAFE BATCH =================
async function embedInBatches(texts: string[]) {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    try {
      const emb = await embedWithJina([texts[i]]);
      results.push(emb[0] || null);
    } catch {
      console.error(`❌ Failed chunk ${i}`);
      results.push(null);
    }
  }

  return results;
}

// ================= MAIN =================
async function run() {
  console.log("🚀 Script started");

  const components = fs.readdirSync(BASE_DIR);

  for (const comp of components) {
    const textPath = path.join(BASE_DIR, comp, `text.${comp}.txt`);

    if (!fs.existsSync(textPath)) {
      console.log(`⚠️ Missing txt for ${comp}`);
      continue;
    }

    console.log(`\n📦 Processing: ${comp}`);

    const raw = fs.readFileSync(textPath, "utf-8");

    const cleaned = sanitizeText(raw);

    const chunks = extractBlocks(cleaned);

    if (chunks.length === 0) {
      console.log("⚠️ No valid chunks extracted");
      continue;
    }

    console.log("🧩 Chunks:", chunks.length);
    console.log("Sample:\n", chunks[0].text);

    const texts = chunks.map(c => c.text);
    const embeddings = await embedInBatches(texts);

    const output = chunks.map((c, i) => ({
      ...c,
      embedding: embeddings[i] || null,
    }));

    const savePath = path.join(BASE_DIR, comp, `${comp}.embedded.json`);

    fs.writeFileSync(savePath, JSON.stringify(output, null, 2));

    console.log(`✅ Saved: ${savePath}`);
  }

  console.log("\n🎉 DONE");
}

run();
