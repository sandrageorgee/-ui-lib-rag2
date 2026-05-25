# # new_rag/stage6_query.py

# import os
# import json
# import math
# import requests
# from dotenv import load_dotenv

# load_dotenv()

# INPUT_DIR = "new_rag"
# EMBED_MODEL = "jina-code-embeddings-1.5b"
# JINA_API_KEY = os.getenv("JINA_API_KEY")

# OLLAMA_URL = "http://localhost:11434/api/chat"
# OLLAMA_MODEL = "deepseek-r1:14b"

# TOP_K = 10
# SIMILARITY_THRESHOLD = 0.5

# if not JINA_API_KEY:
#     raise ValueError("❌ Missing JINA_API_KEY in .env")


# # ================= SYSTEM PROMPTS =================

# SYSTEM_PROMPT_CODE = """You are a senior React engineer working with a proprietary UI component library.
# You are part of a Retrieval-Augmented Generation (RAG) system. You will be given:
# 1. A user request (UI/page/features)
# 2. Retrieved metadata about available UI components

# Your goal is to generate a complete, working React implementation.

# ---
# ## Core Principles

# 1. PRIORITIZE using components from the provided metadata.

# 2. If a requirement cannot be fulfilled using the available components:
#    - You MAY implement custom React code as a fallback.

# 3. Minimize custom code when a library component exists.

# 4. NEVER ignore a relevant library component in favor of custom code.

# ---
# ## Decision Strategy (VERY IMPORTANT)

# For every UI element:

# 1. Check if a matching component exists in metadata
#    → Use it

# 2. If partially supported
#    → Combine library components + light custom logic

# 3. If not supported at all
#    → Build a custom component using standard React/HTML

# ---
# ## Rules

# - DO NOT invent library components or props

# - You MAY create:
#   - Custom components
#   - Helper functions
#   - Basic HTML elements ONLY when needed

# - Clearly separate:
#   - Library-based UI
#   - Custom-built parts

# ---
# ## Styling & Structure

# - Use functional components
# - Keep code modular
# - Use clean JSX
# - Avoid unnecessary inline styles

# ---
# ## Output Format

# - Return ONLY React code
# - Include necessary imports
# - One main exported component

# ---
# ## Anti-Patterns

# - Rebuilding components already available
# - Ignoring metadata
# - Hallucinating props

# ---
# ## Missing Information

# If the request is incomplete return:

# {Questions: [<questions>]}

# Now generate the best possible React implementation using the available metadata and fallback when necessary.
# """

# SYSTEM_PROMPT_PROPS = """You are a UI component documentation assistant.

# Rules:
# - Answer ONLY from context
# - NEVER hallucinate props
# - Be concise
# - No reasoning
# """

# SYSTEM_PROMPT_SUBANSWER = """You are a UI library documentation expert.

# You are given retrieved component documentation context.

# Your job:
# - Extract ONLY factual information
# - NEVER hallucinate
# - NEVER explain reasoning
# - NEVER say "let me analyze"
# - Be concise and structured

# Preferred format:

# Component: Button

# Props:
# - label: string
# - variant: "primary" | "secondary"

# Examples:
# <Button label="Save" />

# Only use information found in context.
# """


# # ================= LOAD EMBEDDINGS =================

# print("🚀 Loading embeddings from all components...")

# all_chunks = []

# for file in sorted(os.listdir(INPUT_DIR)):

#     if not file.startswith("embeddings2.") or not file.endswith(".json"):
#         continue

#     component_name = file.replace("embeddings2.", "").replace(".json", "")
#     file_path = os.path.join(INPUT_DIR, file)

#     with open(file_path, "r") as f:
#         chunks = json.load(f)

#     valid = [
#         c for c in chunks
#         if c.get("embedding")
#         and len(c["embedding"]) > 0
#         and c.get("text", "").strip()
#     ]

#     all_chunks.extend(valid)

#     print(f"  ✅ {component_name}: {len(valid)} chunks")

# print(f"\n📦 Total chunks loaded: {len(all_chunks)}")
# print("✅ Ready\n")


# # ================= COSINE SIMILARITY =================

# def cosine_similarity(a: list, b: list) -> float:
#     dot = sum(x * y for x, y in zip(a, b))

#     mag_a = math.sqrt(sum(x * x for x in a))
#     mag_b = math.sqrt(sum(x * x for x in b))

#     if mag_a == 0 or mag_b == 0:
#         return 0.0

#     return dot / (mag_a * mag_b)


# # ================= SEARCH =================

# def search(query_embedding: list, top_k: int) -> list:

#     scores = [
#         {
#             "chunk": chunk,
#             "similarity": cosine_similarity(
#                 query_embedding,
#                 chunk["embedding"]
#             )
#         }
#         for chunk in all_chunks
#     ]

#     scores.sort(
#         key=lambda x: x["similarity"],
#         reverse=True
#     )

#     return scores[:top_k]


# # ================= EMBED TEXT =================

# def embed_text(text: str) -> list:

#     response = requests.post(
#         "https://api.jina.ai/v1/embeddings",
#         headers={
#             "Authorization": f"Bearer {JINA_API_KEY}",
#             "Content-Type": "application/json",
#         },
#         json={
#             "model": EMBED_MODEL,
#             "input": [text],
#         },
#     )

#     data = response.json()

#     if "data" not in data:
#         raise ValueError(f"❌ Jina error: {data}")

#     return data["data"][0]["embedding"]


# # ================= OLLAMA =================

# def ollama(
#     system: str,
#     user: str,
#     max_tokens: int = 512,
#     temperature: float = 0.1
# ) -> str:

#     response = requests.post(
#         OLLAMA_URL,
#         json={
#             "model": OLLAMA_MODEL,
#             "messages": [
#                 {
#                     "role": "system",
#                     "content": system
#                 },
#                 {
#                     "role": "user",
#                     "content": user
#                 }
#             ],
#             "stream": False,
#             "options": {
#                 "temperature": temperature,
#                 "num_predict": max_tokens,
#             }
#         },
#         timeout=180
#     )

#     data = response.json()

#     if "message" not in data:
#         return ""

#     content = data["message"]["content"].strip()

#     if "<think>" in content and "</think>" in content:
#         content = content.split("</think>")[-1].strip()

#     return content


# # ================= QUESTION TYPE =================

# def detect_question_type(question: str) -> str:

#     code_keywords = [
#         "create",
#         "build",
#         "make",
#         "generate",
#         "implement",
#         "page",
#         "form",
#         "component",
#         "write",
#         "show me",
#         "code",
#         "example",
#         "render",
#         "display",
#     ]

#     q = question.lower()

#     if any(k in q for k in code_keywords):
#         return "code"

#     return "props"


# # ================= EXTRACT COMPONENT =================

# def extract_component(question: str) -> str | None:

#     known = ["button", "input", "tree", "dashboard"]

#     q = question.lower()

#     for comp in known:
#         if comp in q:
#             return comp

#     return None


# # ================= RETRIEVE =================

# def retrieve(
#     query: str,
#     top_k: int = 5,
#     threshold: float = 0.2
# ) -> str:

#     try:
#         embedding = embed_text(query)

#     except Exception as e:
#         return f"Retrieval failed: {e}"

#     results = search(embedding, top_k * 2)

#     results = [
#         r for r in results
#         if r["similarity"] >= threshold
#     ][:top_k]

#     if not results:
#         results = search(embedding, top_k)[:top_k]

#     return "\n\n".join(
#         r["chunk"]["text"]
#         for r in results
#     )


# # ================= GENERATE SUBQUESTIONS =================

# def generate_subquestions(question: str) -> list:

#     known = ["button", "input", "tree", "dashboard"]

#     mentioned = [
#         c for c in known
#         if c in question.lower()
#     ]

#     if not mentioned:
#         return [question]

#     subquestions = []

#     for comp in mentioned:

#         subquestions.append(
#             f"What props does the {comp.capitalize()} component accept? "
#             f"List all prop names, types and accepted values."
#         )

#     if "show" in question.lower() or "hide" in question.lower():

#         subquestions.append(
#             "How can component visibility be controlled in React?"
#         )

#     return subquestions


# # ================= ASK DEEPSEEK =================

# def ask_deepseek(
#     context: str,
#     question: str,
#     q_type: str
# ) -> str:

#     system_prompt = (
#         SYSTEM_PROMPT_CODE
#         if q_type == "code"
#         else SYSTEM_PROMPT_PROPS
#     )

#     print(
#         f"  🎯 Mode: "
#         f"{'🧑‍💻 Code Generation' if q_type == 'code' else '📋 Prop Lookup'}"
#     )

#     return ollama(
#         system=system_prompt,
#         user=f"""Context:
# {context}

# Question:
# {question}""",
#         max_tokens=1024,
#         temperature=0.1
#     )


# # ================= SELF ASK PIPELINE =================

# def self_ask_pipeline(question: str) -> tuple:

#     print("\n🧠 Self-Ask Pipeline started...")

#     # STEP 1
#     print("  📋 Step 1: Generating sub-questions...")

#     subquestions = generate_subquestions(question)

#     print(f"  ✅ Generated {len(subquestions)} sub-questions:")

#     for i, q in enumerate(subquestions):
#         print(f"     [{i + 1}] {q}")

#     # STEP 2
#     print("\n  🔍 Step 2: Answering sub-questions...")

#     qa_pairs = []

#     for i, subq in enumerate(subquestions):

#         print(f"     Answering [{i + 1}]: {subq}")

#         context = retrieve(
#             subq,
#             top_k=3,
#             threshold=0.2
#         )

#         answer = ollama(
#             system=SYSTEM_PROMPT_SUBANSWER,
#             user=f"""Context:
# {context}

# Question:
# {subq}""",
#             max_tokens=200,
#             temperature=0.0
#         )

#         qa_pairs.append({
#             "question": subq,
#             "answer": answer
#         })

#         print(f"     ✅ Answer: {answer[:100]}...")

#     # STEP 3
#     print("\n  🔧 Step 3: Building enriched context...")

#     enriched_context = "Component documentation answers:\n\n"

#     for pair in qa_pairs:

#         enriched_context += (
#             f"Q: {pair['question']}\n"
#             f"A: {pair['answer'][:500]}\n\n"
#         )

#     # STEP 4
#     print("  🤖 Step 4: Generating final React code...")

#     final_answer = ask_deepseek(
#         context=enriched_context,
#         question=question,
#         q_type="code"
#     )

#     return final_answer, qa_pairs


# # ================= CHECK OLLAMA =================

# print("🔍 Checking Ollama...")

# try:

#     requests.get(
#         "http://localhost:11434",
#         timeout=5
#     )

#     print(
#         f"✅ Ollama is running — model: {OLLAMA_MODEL}\n"
#     )

# except Exception as e:

#     print(f"❌ Ollama not running: {e}")
#     print("Run: ollama serve")

#     exit(1)


# # ================= QUERY LOOP =================

# print("✅ RAG system ready!")
# print("Type your question or 'exit' to quit\n")

# while True:

#     question = input("❓ Question: ").strip()

#     if not question:
#         continue

#     if question.lower() in ("exit", "quit"):
#         print("👋 Bye!")
#         break

#     q_type = detect_question_type(question)

#     rewritten = question

#     print(f"🔍 Query: {rewritten}")

#     # EMBEDDING
#     print("🔍 Embedding...")

#     try:
#         query_embedding = embed_text(rewritten)

#     except Exception as e:
#         print(f"❌ Embedding failed: {e}")
#         continue

#     # SEARCH
#     results = search(query_embedding, TOP_K * 3)

#     # FILTER
#     if q_type == "props":

#         mentioned = extract_component(question)

#         if mentioned:

#             filtered = [
#                 r for r in results
#                 if r["chunk"].get(
#                     "component",
#                     ""
#                 ).lower() == mentioned
#             ]

#             results = filtered if filtered else results

#     threshold = (
#         0.2 if q_type == "code"
#         else SIMILARITY_THRESHOLD
#     )

#     filtered_results = [
#         r for r in results
#         if r["similarity"] >= threshold
#     ]

#     if not filtered_results:

#         print("⚠️ Low similarity — using best available results")

#         filtered_results = results[:TOP_K]

#     else:
#         filtered_results = filtered_results[:TOP_K]

#     # PRINT RETRIEVED CHUNKS
#     print(
#         f"\n📚 Retrieved context ({len(filtered_results)} chunks):"
#     )

#     print("\n📚 Retrieved Chunks:\n")

#     context_parts = []

#     for i, r in enumerate(filtered_results):

#         chunk = r["chunk"]

#         print(f"----- Chunk {i + 1} -----")
#         print(f"Component: {chunk.get('component', '')}")
#         print(f"Similarity: {r['similarity']:.4f}")

#         print(chunk["text"][:500])

#         print()

#         context_parts.append(chunk["text"])

#     context = "\n\n".join(context_parts)

#     # RUN PIPELINE
#     try:

#         if q_type == "code":

#             answer, qa_pairs = self_ask_pipeline(question)

#             print("\n📋 Sub-question summary:")

#             for pair in qa_pairs:

#                 print(f"  Q: {pair['question']}")
#                 print(f"  A: {pair['answer'][:120]}...")
#                 print()

#             print(f"\n💬 Final Answer:\n{answer}")

#         else:

#             print("\n🤖 DeepSeek is thinking...")

#             answer = ask_deepseek(
#                 context=context,
#                 question=question,
#                 q_type=q_type
#             )

#             print(f"\n💬 Answer:\n{answer}")

#     except requests.exceptions.Timeout:

#         print("❌ Timed out — try restarting ollama serve")

#     except Exception as e:

#         print(f"❌ Error: {e}")

#     print("\n" + "=" * 60 + "\n")


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

INPUT_DIR = "new_rag/embedding2_results"

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


# ================= LOAD EMBEDDINGS =================

print("🚀 Loading embeddings from all components...")

all_chunks = []

for file in sorted(os.listdir(INPUT_DIR)):

    if not file.startswith("embeddings2.") or not file.endswith(".json"):
        continue

    component_name = file.replace("embeddings2.", "").replace(".json", "")
    file_path = os.path.join(INPUT_DIR, file)

    try:
        with open(file_path, "r") as f:
            chunks = json.load(f)

        valid = [
            c for c in chunks
            if c.get("embedding")
            and len(c["embedding"]) > 0
            and c.get("text", "").strip()
        ]

        all_chunks.extend(valid)
        print(f"  ✅ {component_name}: {len(valid)} chunks")

    except Exception as e:
        print(f"  ⚠️ Skipping {file}: {e}")

print(f"\n📦 Total chunks loaded: {len(all_chunks)}")
print("✅ Ready\n")


# ================= COSINE SIMILARITY =================

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
            "similarity": cosine_similarity(
                query_embedding,
                chunk["embedding"]
            )
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
        system="""You are a React component analyst.

Generate documentation lookup questions needed to answer the user request.

Rules:
- Think about components needed
- Think about props needed
- Think about interactions needed
- Use previous conversation context
- Use the provided initial context to avoid redundant questions
- Return ONLY valid JSON array
- No markdown
- No explanation

Example:
["What component handles tree display?", "What props handle click events?"]
""",
        user=(
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
    docs_summary = "Available component documentation:\n\n"
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

        print(f"\n💬 Answer:\n")
        print(answer)

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

    print("\n" + "=" * 60 + "\n")

