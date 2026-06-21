
# new_rag/stage6_query.py

import os
import re
import glob
import json
import requests
import chromadb
from dotenv import load_dotenv

load_dotenv()

CHROMA_DB_DIR = "new_rag/chroma_db"
EMBEDDING_RESULTS_DIR = "new_rag/embedding2_results"
INDEX_TS_PATH = "mini-commonui/packages/common-ui/src/index.ts"
EMBED_MODEL = "jina-code-embeddings-1.5b"
JINA_API_KEY = os.getenv("JINA_API_KEY")

OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "deepseek-r1:14b"

TOP_K = 20
SIMILARITY_THRESHOLD = 0.5

# ================= CHAT MEMORY =================

chat_history = []
MAX_HISTORY = 20

if not JINA_API_KEY:
    raise ValueError("❌ Missing JINA_API_KEY in .env")


# ================= SYSTEM PROMPTS =================

SYSTEM_PROMPT_TYPE_DETECTOR = """You are a React assistant classifier.
 
Your job is to understand what the user truly wants and classify it.
 
Rules:
- Think about the user's INTENT not the words they use
- If the user wants an end result they can use → return "code"
- If the user wants to understand or learn something → return "props"
- Use the retrieved chunks as context to help decide
- Use previous chat history as context
- Return ONLY the word: code OR props
- No explanation, no markdown, no thinking"""


SYSTEM_PROMPT_PLANNER = """You are a senior React engineer and UI architect.

Your job is to ANALYZE a user request and create a detailed implementation plan.

You will be given:
1. A user request
2. Available component documentation
3. Previous conversation history

## Your Output MUST follow this exact format:

PLAN:
[Write your reasoning and implementation strategy here]

COMPONENTS_NEEDED:
- ComponentName: reason for using it
- ComponentName: reason for using it

PROPS_TO_USE:
- ComponentName.propName: value or description
- ComponentName.propName: value or description

MISSING_INFO:
- [List anything unclear or not documented]
- [List any component behavior not covered by available props]
- [Write "None" if everything is clear]

QUESTIONS_FOR_USER:
- [List specific questions you need answered before coding]
- [Write "None" if you have everything you need]

READY_TO_CODE: YES / NO

Rules:
- Think step by step
- Be specific about which props you will use
- NEVER invent props not in the documentation
- Use previous chat history as context
- If a behavior is needed but no prop covers it → list it in MISSING_INFO
- If READY_TO_CODE is NO → wait for user answers before generating code"""


SYSTEM_PROMPT_FINAL_CODE = """You are a senior React engineer working with a proprietary UI component library.

You are part of a Retrieval-Augmented Generation (RAG) system.

You will be given:
1. A user request
2. Previous conversation history
3. Retrieved component documentation
4. Pre-answered questions about available UI components and props
5. An implementation plan

Your goal is to generate a complete, working React implementation.

## Core Principles

1. PRIORITIZE using components from the provided documentation
2. If a requirement cannot be fulfilled using available components:
   - You MAY implement custom React code as fallback
3. Minimize custom code when a library component exists
4. NEVER ignore relevant library components
5. CONTINUE from previous chat context if relevant

## Rules

- DO NOT invent library components or props
- Import ALL library components from './library'
- NEVER reimplement existing components
- Use previous chat history when modifying existing pages/components

## Output Format

- Return ONLY React code
- Include necessary imports
- One main exported component named Page
- You may define sub-components inside the file

Now generate the best possible React implementation."""


SYSTEM_PROMPT_SUBANSWER = """You are a UI component documentation assistant.

Rules:
- Answer ONLY based on the provided context
- NEVER invent props, types, or values
- Use previous chat history if relevant
- If not found say "Not found"

Answer in this exact format:

Component: [name]
Props:
- propName: type — accepted values (if enum)
"""


SYSTEM_PROMPT_PROPS = """You are a UI component documentation assistant.

Rules:
- Answer ONLY from context
- NEVER hallucinate props
- Use previous chat history if relevant
- Be concise
- No reasoning

List props clearly with types and accepted values.
"""


SYSTEM_PROMPT_CLARIFIER = """You are a React UI consultant.

You have been given:
1. A user request
2. Previous conversation history
3. Answers about available components

Your job is to identify ANY ambiguity that affects implementation.

Rules:
- ONLY ask important implementation questions
- Use previous chat history as context
- Return ONLY valid JSON
- No markdown
- No explanation

Format:
[
  {
    "question": "question",
    "options": ["a", "b"],
    "reason": "why"
  }
]

If nothing is ambiguous return:
[]
"""


# ================= ALLOWED COMPONENTS FROM INDEX.TS =================

def load_allowed_components() -> tuple:
    """
    Parse index.ts to find which component directories are exported,
    then cross-reference with embedding files to get the exact ChromaDB
    component metadata values (e.g. 'card.card', 'alert.alerts').

    Returns (base_names_set, full_chroma_names_list).
    Falls back to (set(), []) on error, meaning no filter is applied.
    """
    allowed_bases = set()
    try:
        with open(INDEX_TS_PATH, "r") as f:
            content = f.read()
        # Extract directory names from paths like './components/card/card'
        dirs = re.findall(r"from\s+'./components/(\w+)/", content)
        allowed_bases = set(dirs)
        print(f"📋 Components exported in index.ts: {sorted(allowed_bases)}")
    except Exception as e:
        print(f"⚠️  Could not parse index.ts: {e} — no component filter applied")
        return set(), []

    # Match against actual embedding files stored in ChromaDB
    embedding_files = sorted(glob.glob(os.path.join(EMBEDDING_RESULTS_DIR, "embeddings2.*.json")))
    full_names = []
    for file_path in embedding_files:
        comp_name = (
            os.path.basename(file_path)
            .replace("embeddings2.", "")
            .replace(".json", "")
        )
        base = comp_name.split(".")[0]
        if base in allowed_bases:
            full_names.append(comp_name)

    print(f"✅ ChromaDB component names accessible to user: {full_names}")
    return allowed_bases, full_names


ALLOWED_COMPONENT_BASES, ALLOWED_COMPONENT_NAMES = load_allowed_components()

# Human-readable list for LLM prompts, e.g. "Alert, Badge, Card, DataPanel, ..."
ALLOWED_COMPONENTS_DISPLAY = ", ".join(
    b.capitalize() for b in sorted(ALLOWED_COMPONENT_BASES)
) if ALLOWED_COMPONENT_BASES else "all available components"


# ================= CHROMADB =================

print("🚀 Connecting to ChromaDB...")

chroma_client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
collection = chroma_client.get_collection(name="ui_components")

print(f"📦 Collection loaded: {collection.count()} chunks")
print("✅ Ready\n")


# ================= SEARCH =================

def search(query_embedding: list, top_k: int) -> list:
    # Restrict to components exported from index.ts
    where = None
    if ALLOWED_COMPONENT_NAMES:
        if len(ALLOWED_COMPONENT_NAMES) == 1:
            where = {"component": ALLOWED_COMPONENT_NAMES[0]}
        else:
            where = {"component": {"$in": ALLOWED_COMPONENT_NAMES}}

    query_kwargs = dict(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )
    if where:
        query_kwargs["where"] = where

    results = collection.query(**query_kwargs)

    scores = []
    for i, doc in enumerate(results["documents"][0]):
        meta = results["metadatas"][0][i]
        distance = results["distances"][0][i]
        similarity = 1 - distance  # ChromaDB cosine distance → similarity

        scores.append({
            "chunk": {
                "text":      doc,
                "component": meta.get("component", ""),
                "type":      meta.get("type", ""),
                "title":     meta.get("title", ""),
                "prop":      meta.get("prop", ""),
                "interface": meta.get("interface", ""),
            },
            "similarity": similarity,
        })

    return scores


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
        timeout=60
    )
    data = response.json()
    if "data" not in data:
        raise ValueError(f"❌ Jina error: {data}")
    return data["data"][0]["embedding"]


# ================= OLLAMA =================

def ollama(
    system: str,
    user: str,
    max_tokens: int = 512,
    temperature: float = 0.1
) -> str:

    messages = [{"role": "system", "content": system}]

    # Add previous chat history
    messages.extend(chat_history[-MAX_HISTORY:])

    # Add current message
    messages.append({"role": "user", "content": user})

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        },
        timeout=180
    )

    data = response.json()

    if "message" not in data:
        return ""

    content = data["message"]["content"].strip()

    # Remove think blocks
    if "<think>" in content and "</think>" in content:
        content = content.split("</think>")[-1].strip()

    return content


# ================= LLM-BASED TYPE DETECTION =================

def detect_question_type(question: str) -> str:
    """
    Keyword check first — obvious code requests bypass the LLM.
    LLM decides ambiguous cases using the question only (no chunk context).
    """
    q = question.strip().lower()

    CODE_KEYWORDS = [
        "create", "build", "generate", "make", "implement", "write",
        "show me", "give me", "i want", "i need", "can you make",
        "add a", "add an", "page with", "component with", "example of",
    ]
    if any(kw in q for kw in CODE_KEYWORDS):
        return "code"

    # Ambiguous — ask LLM using the question only (no chunk preview to avoid bias)
    raw = ollama(
        system=SYSTEM_PROMPT_TYPE_DETECTOR,
        user=f"Question: {question}",
        max_tokens=512,
        temperature=0.0
    )

    detected = raw.strip().lower()

    if "code" in detected:
        return "code"

    return "props"


# ================= RETRIEVE =================

def retrieve(
    query: str,
    top_k: int = 20,
    threshold: float = 0.15,
    initial_embedding: list = None
) -> tuple:
    """
    Returns (context_string, results_list, embedding).
    Reuses initial_embedding if provided to avoid duplicate Jina calls.
    """

    print(f"\n🔍 Retrieving for: {query[:80]}...")

    try:
        embedding = initial_embedding if initial_embedding else embed_text(query)
    except Exception as e:
        return f"Retrieval failed: {e}", [], None

    results = search(embedding, top_k * 2)

    filtered = [r for r in results if r["similarity"] >= threshold][:top_k]

    if not filtered:
        filtered = results[:top_k]

    print(f"   📚 {len(filtered)} chunks retrieved")

    context_parts = []

    for i, r in enumerate(filtered):
        chunk = r["chunk"]
        text = chunk.get("text", "")
        prop      = chunk.get("prop", "")
        interface = chunk.get("interface", "")
        chunk_type = chunk.get("type", "")
        print(
            f"   [{i+1}] {chunk.get('component', 'unknown')} "
            f"| {interface} | prop: {prop} | type: {chunk_type} "
            f"| similarity: {r['similarity']:.4f}"
        )
        context_parts.append(text)

    return "\n\n".join(context_parts), filtered, embedding


# ================= GENERATE SUBQUESTIONS =================

def generate_subquestions(question: str, initial_context: str) -> list:
    """Generate sub-questions — pass initial context to avoid cold start."""

    raw = ollama(
        system=f"""You are a React component analyst.

Generate documentation lookup questions needed to answer the user request.

The ONLY components available in the library are:
{ALLOWED_COMPONENTS_DISPLAY}

Rules:
- Only consider components from the list above
- Think about props needed for those components
- Think about interactions needed
- Use previous conversation context
- Use the provided initial context to avoid redundant questions
- Return ONLY valid JSON array
- No markdown
- No explanation

Example:
["What props does Badge accept?", "What variants does Alert support?"]
""",
        user=(
            f"Available components: {ALLOWED_COMPONENTS_DISPLAY}\n\n"
            f"Initial context already retrieved:\n{initial_context[:500]}\n\n"
            f"User request: {question}"
        ),
        max_tokens=200,
        temperature=0.0
    )

    try:
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start != -1 and end != 0:
            questions = json.loads(raw[start:end])
            if questions and isinstance(questions, list):
                return questions
    except Exception:
        pass

    return [f"What components and props are needed for: {question}"]


# ================= PARSE PLAN =================

def parse_plan(plan_text: str) -> dict:

    result = {
        "plan": "",
        "components_needed": [],
        "props_to_use": [],
        "missing_info": [],
        "questions_for_user": [],
        "ready_to_code": False
    }

    lines = plan_text.split("\n")
    current_section = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line.startswith("PLAN:"):
            current_section = "plan"
        elif line.startswith("COMPONENTS_NEEDED:"):
            current_section = "components"
        elif line.startswith("PROPS_TO_USE:"):
            current_section = "props"
        elif line.startswith("MISSING_INFO:"):
            current_section = "missing"
        elif line.startswith("QUESTIONS_FOR_USER:"):
            current_section = "questions"
        elif line.startswith("READY_TO_CODE:"):
            result["ready_to_code"] = "YES" in line.upper()
        elif line.startswith("-"):
            item = line.lstrip("- ").strip()
            if item.lower() == "none":
                continue
            if current_section == "components":
                result["components_needed"].append(item)
            elif current_section == "props":
                result["props_to_use"].append(item)
            elif current_section == "missing":
                result["missing_info"].append(item)
            elif current_section == "questions":
                result["questions_for_user"].append(item)
        elif current_section == "plan":
            result["plan"] += line + " "

    return result


# ================= CLARIFY WITH USER =================

def clarify_with_user(question: str, docs_summary: str) -> str:

    print("\n  🤔 Checking for ambiguities...")

    raw = ollama(
        system=SYSTEM_PROMPT_CLARIFIER,
        user=(
            f"User request: {question}\n\n"
            f"Available component documentation:\n{docs_summary}"
        ),
        max_tokens=400,
        temperature=0.0
    )

    clarifications = []
    try:
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start != -1 and end != 0:
            parsed = json.loads(raw[start:end])
            if isinstance(parsed, list):
                clarifications = parsed
    except Exception:
        pass

    if not clarifications:
        print("  ✅ No ambiguities detected\n")
        return ""

    print(f"\n  ❓ {len(clarifications)} ambiguity(ies) found:\n")
    user_answers = []

    for i, item in enumerate(clarifications):
        q = item.get("question", "")
        options = item.get("options", [])
        reason = item.get("reason", "")

        print(f"  [{i + 1}] {q}")
        if reason:
            print(f"       Why: {reason}")
        print()

        if options:
            for j, opt in enumerate(options):
                print(f"       {j + 1}. {opt}")
            print(f"       {len(options) + 1}. Other")
            print()

            while True:
                choice = input(
                    f"  Your choice [1-{len(options) + 1}]: "
                ).strip()
                if choice.isdigit():
                    idx = int(choice) - 1
                    if 0 <= idx < len(options):
                        answer = options[idx]
                        break
                    elif idx == len(options):
                        answer = input("  Your answer: ").strip()
                        break
                print("  ⚠️ Invalid — try again")
        else:
            answer = input(f"  Your answer: ").strip()

        user_answers.append(f"Q: {q}\nA: {answer}")
        print()

    result = "\nUser clarification answers:\n" + "\n".join(user_answers)
    print("  ✅ Clarifications recorded\n")
    return result


# ================= UNIFIED PIPELINE =================

def run_pipeline(
    question: str,
    initial_embedding: list,
    initial_chunks: list,
    q_type: str
) -> str:

    # ── PROPS PATH ──────────────────────────────────────────
    if q_type == "props":

        print("\n📋 Props Lookup Pipeline\n")

        # Build context from already retrieved chunks
        context_parts = [
            r["chunk"].get("text", "")
            for r in initial_chunks
            if r["similarity"] >= SIMILARITY_THRESHOLD
        ]

        if not context_parts:
            context_parts = [
                r["chunk"].get("text", "")
                for r in initial_chunks[:TOP_K]
            ]

        context = "\n\n".join(context_parts)

        answer = ollama(
            system=SYSTEM_PROMPT_PROPS,
            user=(
                f"Chat history:\n{json.dumps(chat_history, indent=2)}\n\n"
                f"Context:\n{context}\n\n"
                f"Question: {question}"
            ),
            max_tokens=512,
            temperature=0.1
        )

        return answer

    # ── CODE PATH ────────────────────────────────────────────
    print("\n🧑‍💻 Code Generation Pipeline (Self-Ask + Planning)\n")

    # Build initial context from already retrieved chunks
    initial_context = "\n\n".join(
        r["chunk"].get("text", "")
        for r in initial_chunks[:20]
    )

    # Step 1 — Generate sub-questions (seeded with initial context)
    print("  📋 Step 1: Generating sub-questions...")
    subquestions = generate_subquestions(question, initial_context)

    print(f"  ✅ {len(subquestions)} sub-questions:\n")
    for i, q in enumerate(subquestions):
        print(f"     [{i + 1}] {q}")

    # Step 2 — Retrieve + answer each sub-question
    print("\n  🔍 Step 2: Answering sub-questions...\n")
    qa_pairs = []

    for i, subq in enumerate(subquestions):
        print(f"\n  Answering [{i + 1}]: {subq}")

        # Each sub-question gets its own embed + search
        context, _, _ = retrieve(subq, top_k=20, threshold=0.15)

        answer = ollama(
            system=SYSTEM_PROMPT_SUBANSWER,
            user=f"Context:\n{context}\n\nQuestion: {subq}",
            max_tokens=200,
            temperature=0.0
        )

        qa_pairs.append({"question": subq, "answer": answer})
        print(f"  ✅ Answer: {answer[:100]}...")

    # Step 3 — Build docs summary
    print("\n  🔧 Step 3: Building documentation summary...")
    docs_summary = (
        f"Available UI components (exported from index.ts): {ALLOWED_COMPONENTS_DISPLAY}\n\n"
        "Component documentation:\n\n"
    )
    for pair in qa_pairs:
        docs_summary += f"Q: {pair['question']}\nA: {pair['answer']}\n\n"

    # Step 4 — Clarify ambiguities
    clarification_answers = clarify_with_user(question, docs_summary)
    if clarification_answers:
        docs_summary += clarification_answers

    # Step 5 — Planning
    print("  🗺️  Step 5: Creating implementation plan...")
    plan_text = ollama(
        system=SYSTEM_PROMPT_PLANNER,
        user=f"{docs_summary}\nUser request: {question}",
        max_tokens=800,
        temperature=0.3
    )

    print(f"\n📋 Plan:\n{plan_text}\n")

    parsed = parse_plan(plan_text)

    # Step 6 — Collect extra answers from planner questions
    if parsed["questions_for_user"]:
        print("\n❓ AI has additional questions:\n")
        for i, q in enumerate(parsed["questions_for_user"]):
            print(f"  [{i + 1}] {q}")

        print("\n(Press Enter to skip — AI will use best defaults)\n")

        user_answers = []
        for i, q in enumerate(parsed["questions_for_user"]):
            ans = input(f"  Answer [{i + 1}]: ").strip()
            if ans:
                user_answers.append(f"Q: {q}\nA: {ans}")

        if user_answers:
            docs_summary += "\nUser answers:\n" + "\n".join(user_answers)
            print("\n✅ Answers recorded\n")
        else:
            print("\n⚠️ Using best defaults\n")

    elif not parsed["ready_to_code"]:
        print("\n⚠️ Missing info:")
        for item in parsed["missing_info"]:
            print(f"   - {item}")
        print("\n   Proceeding with defaults...\n")

    else:
        print("\n✅ All info available — generating code...\n")

    # Step 7 — Generate final code
    print("  🤖 Step 7: Generating final React code...")

    final_answer = ollama(
        system=SYSTEM_PROMPT_FINAL_CODE,
        user=(
            f"Chat history:\n{json.dumps(chat_history, indent=2)}\n\n"
            f"Component documentation:\n{docs_summary}\n\n"
            f"Implementation plan:\n{plan_text}\n\n"
            f"User request: {question}\n\n"
            f"Write the React code now:"
        ),
        max_tokens=1536,
        temperature=0.1
    )

    return final_answer


# ================= CHECK OLLAMA =================

print("🔍 Checking Ollama...")

try:
    requests.get("http://localhost:11434", timeout=5)
    print(f"✅ Ollama is running — model: {OLLAMA_MODEL}\n")
except Exception as e:
    print(f"❌ Ollama not running: {e}")
    print("Run: ollama serve")
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
        chat_history.clear()
        break

    try:

        # ── STEP 1: EMBED FIRST — always ──────────────────────
        print("\n🔍 Step 1: Embedding question...")
        initial_embedding = embed_text(question)

        # ── STEP 2: INITIAL SEARCH ────────────────────────────
        print("🔍 Step 2: Initial search...")
        initial_results = search(initial_embedding, TOP_K * 2)

        print(f"\n📚 Top results:")
        for i, r in enumerate(initial_results[:20]):
            chunk = r["chunk"]
            print(
                f"  [{i+1}] {chunk.get('component', 'unknown')} "
                f"| {chunk.get('interface', '')} "
                f"| prop: {chunk.get('prop', '')} "
                f"| type: {chunk.get('type', '')} "
                f"| similarity: {r['similarity']:.4f}"
            )

        # ── STEP 3: LLM DETECTS TYPE from question + chunks ───
        print("\n🎯 Step 3: Detecting question type...")
        q_type = detect_question_type(question)
        print(
            f"  Detected: "
            f"{'🧑‍💻 Code Generation' if q_type == 'code' else '📋 Prop Lookup'}"
        )

        # ── STEP 4: RUN UNIFIED PIPELINE ──────────────────────
        answer = run_pipeline(
            question=question,
            initial_embedding=initial_embedding,
            initial_chunks=initial_results,
            q_type=q_type
        )

        # ── PRINT ANSWER ──────────────────────────────────────
        mode_label = "🧑‍💻 React Code" if q_type == "code" else "📋 Prop Documentation"
        print(f"\n{'═' * 60}")
        print(f"  {mode_label}")
        print(f"{'═' * 60}\n")
        print(answer)
        print(f"\n{'─' * 60}")
        print(f"  ✅ Done  |  history: {len(chat_history) // 2} turn(s)")
        print(f"{'─' * 60}\n")

        # ── SAVE TO CHAT HISTORY ──────────────────────────────
        chat_history.append({"role": "user", "content": question})
        chat_history.append({
            "role": "assistant",
            "content": answer[:4000]
        })

    except requests.exceptions.Timeout:
        print("❌ Timed out — try restarting ollama serve")

    except Exception as e:
        print(f"❌ Error: {e}")

    print("\n" + "═" * 60 + "\n")
