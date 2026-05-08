# new_rag/stage6_query.py
import os
import json
import math
import requests
from dotenv import load_dotenv

load_dotenv()

INPUT_DIR = "new_rag"
EMBED_MODEL = "jina-code-embeddings-1.5b"
JINA_API_KEY = os.getenv("JINA_API_KEY")
OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "radenadri/Qwen3.5-0.8B-Claude-4.6-Opus-Reasoning-Distilled-GGUF"
TOP_K = 10
SIMILARITY_THRESHOLD = 0.5

if not JINA_API_KEY:
    raise ValueError("❌ Missing JINA_API_KEY in .env")


# ================= SYSTEM PROMPTS =================

SYSTEM_PROMPT_CODE = """You are a senior React engineer working with a proprietary UI component library.

You will be given:
1. A user request describing a UI page or feature
2. Retrieved documentation about available UI components and their props

Your goal is to generate a complete, working React implementation.

Rules:
- ALWAYS use library components from the provided context first
- NEVER invent props or components not mentioned in the context
- ONLY use custom HTML/React as fallback when no library component fits
- Use functional components only
- Keep code modular and clean
- Include all necessary imports
- Export one main component
- Use only props that are explicitly documented in the context

Output: Return ONLY valid React JSX code. No explanation unless asked."""

SYSTEM_PROMPT_PROPS = """You are a UI component documentation assistant.

You will be given documentation context about UI components and their props.

Rules:
- Answer ONLY based on the provided context
- NEVER invent props, types, or values not in the context
- If something is not in the context say "Not specified"
- Be concise and factual
- List props clearly with their types and accepted values

NOTE: If You Need any extra information OR you have questions to make a better answer, return it as follow: 
Questions: [<anything you want to know>]
Output: Short, factual answer. No code unless asked."""


# ================= LOAD ALL embeddings2.*.json =================
print("🚀 Loading embeddings from all components...")

all_chunks = []

for file in sorted(os.listdir(INPUT_DIR)):
    if not file.startswith("embeddings2.") or not file.endswith(".json"):
        continue

    component_name = file.replace("embeddings2.", "").replace(".json", "")
    file_path = os.path.join(INPUT_DIR, file)

    with open(file_path, "r") as f:
        chunks = json.load(f)

    valid = [c for c in chunks if c.get("embedding") and len(c["embedding"]) > 0]
    all_chunks.extend(valid)
    print(f"  ✅ {component_name}: {len(valid)} chunks")

print(f"\n📦 Total chunks loaded: {len(all_chunks)}")
print(f"✅ Ready\n")


# ================= COSINE SIMILARITY (pure Python — no numpy) =================
def cosine_similarity(a: list, b: list) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


# ================= SEARCH =================
def search(query_embedding: list, top_k: int) -> list:
    scores = [
        {
            "chunk": chunk,
            "similarity": cosine_similarity(query_embedding, chunk["embedding"])
        }
        for chunk in all_chunks
    ]
    scores.sort(key=lambda x: x["similarity"], reverse=True)
    return scores[:top_k]


# ================= EMBED TEXT =================
def embed_text(text: str) -> list:
    response = requests.post(
        "https://api.jina.ai/v1/embeddings",
        headers={
            "Authorization": f"Bearer {JINA_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": EMBED_MODEL,
            "input": [text],
        },
    )
    data = response.json()
    if "data" not in data:
        raise ValueError(f"❌ Jina error: {data}")
    return data["data"][0]["embedding"]


# ================= DETECT QUESTION TYPE =================
def detect_question_type(question: str) -> str:
    code_keywords = [
        "create", "build", "make", "generate", "implement",
        "page", "form", "component", "write", "show me",
        "code", "example", "how to use", "put together",
        "combine", "integrate", "render", "display"
    ]
    question_lower = question.lower()
    if any(kw in question_lower for kw in code_keywords):
        return "code"
    return "props"


# ================= EXTRACT COMPONENT =================
def extract_component(question: str) -> str | None:
    question_lower = question.lower()
    known = ["button", "input", "tree", "dashboard"]
    for comp in known:
        if comp in question_lower:
            return comp
    return None


# ================= REWRITE QUERY =================
def rewrite_query(question: str) -> str:
    response = requests.post(
        OLLAMA_URL,
        json={
            "model": OLLAMA_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Convert the user question into a short prop documentation search query. "
                        "Focus on component names and prop names only. "
                        "Examples:\n"
                        "- 'How do I disable a button?' → 'Button disabled prop'\n"
                        "- 'Create a danger warning button' → 'Button variant onClick prop'\n"
                        "- 'Build a login form' → 'Input Button label onClick prop'\n"
                        "- 'Create a page with tree and button' → 'Tree data Button label onClick'\n"
                        "Return only the search query. No explanation. No thinking."
                    )
                },
                {
                    "role": "user",
                    "content": question
                }
            ],
            "stream": False,
            "options": {
                "temperature": 0.0,
                "num_predict": 30,
            }
        },
        timeout=30
    )
    data = response.json()
    if "message" not in data:
        return question

    content = data["message"]["content"].strip()

    if "<think>" in content and "</think>" in content:
        content = content.split("</think>")[-1].strip()

    if not content or len(content) < 3:
        print("  ⚠️ Rewrite empty — using original question")
        return question

    return content


# ================= ASK DEEPSEEK =================
def ask_deepseek(context: str, question: str, q_type: str) -> str:
    system_prompt = SYSTEM_PROMPT_CODE if q_type == "code" else SYSTEM_PROMPT_PROPS

    print(f"  🎯 Mode: {'🧑‍💻 Code Generation' if q_type == 'code' else '📋 Prop Lookup'}")

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": OLLAMA_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": f"""Context:
{context}

Question:
{question}"""
                }
            ],
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 1024,
            }
        },
        timeout=180
    )

    data = response.json()
    print(data)
    if "message" not in data:
        return f"❌ Ollama error: {data}"

    content = data["message"]["content"].strip()

    if "<think>" in content and "</think>" in content:
        content = content.split("</think>")[-1].strip()

    return content


# ================= CHECK OLLAMA =================
print("🔍 Checking Ollama...")
try:
    r = requests.get("http://localhost:11434", timeout=5)
    print(f"✅ Ollama is running — model: {OLLAMA_MODEL}\n")
except Exception as e:
    print(f"❌ Ollama not running: {e}")
    print("   Run: ollama serve")
    exit(1)


# ================= QUERY LOOP =================
print("✅ RAG system ready!")
print("Type your question or 'exit' to quit\n")

while True:
    question = input("❓ Question: ").strip()

    if not question:
        continue

    if question.lower() in ("exit", "quit"):
        print("👋 Bye!")
        break

    # Detect question type first — affects retrieval strategy
    q_type = detect_question_type(question)

    # Step 1 — Rewrite only for long/complex questions
    words = question.split()
    rewritten = question
    print(f"🔍 Query: {rewritten}")

    # Step 2 — Embed
    print("🔍 Embedding...")
    try:
        query_embedding = embed_text(rewritten)
    except Exception as e:
        print(f"❌ Embedding failed: {e}")
        continue

    # Step 3 — Search wider pool
    results = search(query_embedding, TOP_K * 3)

    # Step 4 — Component filter ONLY for props questions
    # Code questions need chunks from ALL components
    if q_type == "props":
        mentioned = extract_component(question)
        if mentioned:
            filtered = [
                r for r in results
                if r["chunk"].get("component", "").lower() == mentioned
            ]
            results = filtered if filtered else results

    # Step 5 — Threshold — lower for code mode
    threshold = 0.2 if q_type == "code" else SIMILARITY_THRESHOLD
    filtered_results = [r for r in results if r["similarity"] >= threshold]

    # Last resort — take top results regardless of threshold
    if not filtered_results:
        print("⚠️ Low similarity — using best available results")
        filtered_results = results[:TOP_K]
    else:
        filtered_results = filtered_results[:TOP_K]


    print(f"\n📚 Retrieved context ({len(filtered_results)} chunks):")
    print(f"filtered results.  {filtered_results}")
    context_parts = []
    for i, r in enumerate(filtered_results):
        chunk = r["chunk"]
        props = chunk.get("props", [])
        props_str = ", ".join(props) if isinstance(props, list) else str(props)
        print(
            f"  [{i + 1}] component: {chunk.get('component', '')} | "
            f"props: {props_str} | "
            f"similarity: {r['similarity']:.4f}"
        )
        context_parts.append(chunk["text"])

    context = "\n\n".join(context_parts)

    # Step 6 — Ask DeepSeek
    print("\n🤖 DeepSeek is thinking...")
    try:
        answer = ask_deepseek(context, question, q_type)
        print(f"\n💬 Answer:\n{answer}")
    except requests.exceptions.Timeout:
        print("❌ Timed out — try restarting ollama serve")
    except Exception as e:
        print(f"❌ Error: {e}")

    print("\n" + "=" * 60 + "\n")