import os
import re
import glob
import json
import requests
import chromadb
from rank_bm25 import BM25Okapi
from dotenv import load_dotenv

load_dotenv()

CHROMA_DB_DIR = "chroma_db"
EMBEDDING_RESULTS_DIR = "new_rag/embedding2_results"
INDEX_TS_PATH = "../mini-commonui/packages/common-ui/src/index.ts"
EMBED_MODEL = "jina-code-embeddings-1.5b"
JINA_API_KEY = os.getenv("JINA_API_KEY")

OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "qwen2.5:7b"

# Possible locations of the library's package.json, tried in order
PACKAGE_JSON_CANDIDATES = [
    "../mini-commonui/packages/common-ui/package.json",
    "../common-ui/package.json",
    "./package.json",
]


def detect_library_import() -> str:
    """
    Auto-detect the library's npm package name by reading its package.json.
    Tries each candidate path in order and returns the first 'name' field found.
    Falls back to a safe placeholder if nothing is found.
    """
    for candidate in PACKAGE_JSON_CANDIDATES:
        try:
            with open(candidate, "r") as f:
                data = json.load(f)
            name = data.get("name", "").strip()
            if name:
                print(f"📦 Library import auto-detected: '{name}'  (from {candidate})")
                return name
        except FileNotFoundError:
            continue
        except Exception as e:
            print(f"⚠️  Could not read {candidate}: {e}")
            continue

    print("⚠️  Could not auto-detect library name from package.json.")
    print("    Add a path to PACKAGE_JSON_CANDIDATES in stage6_query.py,")
    print("    or set LIBRARY_IMPORT in your .env as a fallback.")
    fallback = os.getenv("LIBRARY_IMPORT", "@common-ui/components")
    print(f"    Using fallback: '{fallback}'")
    return fallback


LIBRARY_IMPORT = detect_library_import()

TOP_K = 20
SIMILARITY_THRESHOLD = 0.15

DEBUG = False

if not JINA_API_KEY:
    raise ValueError("❌ Missing JINA_API_KEY in .env")


def clean_llm_output(content: str) -> str:
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    content = re.sub(r"```(?:json|markdown|jsx|tsx)?\n?", "", content)
    return content.strip()


# ================= CHAT MEMORY =================

chat_history = []
MAX_HISTORY = 20


# ================= PROP WHITELIST EXTRACTION =================

def extract_valid_props(raw_chunks_context: str) -> dict:
    """
    Parse raw chunk text to build a map of { component_name -> set of valid prop names }.

    Chunks contain lines like:
        "Component: button"
        "- propName: type — ..."
        "prop: propName"

    This whitelist is passed into both the code generator and verifier so that
    hallucinated props are caught and blocked before code is returned to the user.
    """
    component_props: dict = {}
    current_component = None

    for line in raw_chunks_context.splitlines():
        line = line.strip()

        # Detect "Component: button" style headers
        comp_match = re.match(r"^[Cc]omponent:\s*(\S+)", line)
        if comp_match:
            current_component = comp_match.group(1).lower()
            if current_component not in component_props:
                component_props[current_component] = set()
            continue

        if current_component is None:
            continue

        # Match "- propName: ..." style (from SYSTEM_PROMPT_SUBANSWER output)
        prop_match = re.match(r"^-\s+(\w+)\s*:", line)
        if prop_match:
            component_props[current_component].add(prop_match.group(1))
            continue

        # Match "prop: propName" style (from raw chunk metadata lines)
        kv_match = re.match(r"^prop[:\s]+(\w+)", line, re.IGNORECASE)
        if kv_match and kv_match.group(1) not in ("", "-"):
            component_props[current_component].add(kv_match.group(1))

    return component_props


def build_prop_whitelist_block(component_props: dict) -> str:
    """Render the whitelist as a readable block to inject into prompts."""
    if not component_props:
        return "No prop whitelist available — only use props explicitly shown in documentation."
    lines = ["Allowed props per component (ONLY these props are valid — all others are forbidden):"]
    for comp, props in sorted(component_props.items()):
        lines.append(f"  {comp}: {', '.join(sorted(props)) if props else '(none parsed)'}")
    return "\n".join(lines)


# ================= DYNAMIC PROMPT BUILDERS =================

def build_code_gen_prompt(library_import: str, prop_whitelist_block: str) -> str:
    """
    Build the code generation system prompt dynamically so it always contains:
    - the real library import path (never a placeholder like './library')
    - the prop whitelist derived from this session's retrieved chunks
    """
    return f"""You are a senior React engineer working with a proprietary UI component library.

You are part of a Retrieval-Augmented Generation (RAG) system.

You will be given:
1. A user request
2. Previous conversation history
3. Retrieved component documentation
4. Pre-answered questions about available UI components and props
5. An implementation plan

Your goal is to generate a complete, working React implementation.

## Import Rule — CRITICAL

ALL library components MUST be imported from the real package:

    import {{ ComponentName }} from '{library_import}';

NEVER use './library', '../library', or any other placeholder path.
NEVER import from antd, @mui/material, shadcn/ui, @radix-ui, or any other external UI library.

## Prop Whitelist — CRITICAL

{prop_whitelist_block}

You MUST NOT use any prop that is not listed above for a library component.
If a prop is not in the whitelist → do not use it, even if it seems reasonable or likely to exist.

## Core Principles

1. PRIORITIZE using components from the provided documentation
2. If a requirement cannot be fulfilled using available components, you MAY write custom React code as fallback
3. Minimize custom code when a library component exists
4. NEVER ignore relevant library components
5. CONTINUE from previous chat context if relevant

## STRICTLY FORBIDDEN — Custom Reimplementations

- Do NOT write a custom <div> acting as a button if Button exists in the library
- Do NOT build a custom dropdown — use the library's Dropdown/Select component
- Do NOT style a <span> as a badge — use Badge
- Do NOT create your own modal/overlay — use the library's Modal component
- If a library component exists for the need → USE IT, never reinvent it

## Pre-Code Checklist (run mentally before writing any JSX element)

Before writing any JSX element, ask yourself:
"Does a library component already do this?"
If YES → import and use it from '{library_import}'.
If NO → only then write custom code.

## Examples

❌ WRONG — reimplementing what already exists:
const Badge = ({{ label }}) => <span className="badge">{{label}}</span>;

❌ WRONG — using a placeholder import path:
import {{ Button }} from './library';

✅ CORRECT — using the library with the real import path:
import {{ Badge }} from '{library_import}';
<Badge label="Active" />

## Rules

- DO NOT invent library components or props
- Import ALL library components from '{library_import}' — no exceptions
- NEVER reimplement existing components
- Use previous chat history when modifying existing pages/components
- ONLY use props that appear in the whitelist above

## Output Format

- Return ONLY React code
- Include necessary imports
- One main exported component named Page
- You may define sub-components inside the file

Now generate the best possible React implementation."""


def build_verify_prompt(library_import: str, prop_whitelist_block: str) -> str:
    """
    Build the verifier system prompt dynamically so it always contains:
    - the real library import path to validate against
    - the prop whitelist to check each used prop against
    """
    return f"""You are a strict React code reviewer for a proprietary UI component library.

## Known library import path

The ONLY correct import path for library components is:
    import {{ ... }} from '{library_import}';

## Prop Whitelist

{prop_whitelist_block}

## Your job: Check these four things

1. **Import path**: Are ALL library component imports using '{library_import}'?
   Flag './library', '../library', or any other placeholder path as an error.

2. **No external UI libraries**: Are there imports from antd, @mui/material,
   shadcn/ui, @radix-ui, or any other third-party UI library?
   These are forbidden — flag them.

3. **Props validation**: For each library component in the code, check every prop
   it receives against the whitelist above.
   Flag ANY prop that is NOT in the whitelist as a hallucinated prop.
   Include the component name and exact prop name in the issue.

4. **No custom reimplementations**: Does the code create any custom component
   that duplicates something already available in the library?
   (e.g. a hand-rolled <Badge>, <Button>, <Modal> instead of importing from the library)

Reply with EXACTLY one of:
PASS
or
ISSUES:
- [describe each problem found, including component name and prop name where relevant]"""


# ================= STATIC SYSTEM PROMPTS =================

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
- If READY_TO_CODE is NO → wait for user answers before generating code
- NEVER plan to build a custom component if one already exists in the library"""


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
    allowed_bases = set()
    try:
        with open(INDEX_TS_PATH, "r") as f:
            content = f.read()
        dirs = re.findall(r"from\s+'./components/(\w+)/", content)
        allowed_bases = set(dirs)
        print(f"📋 Components exported in index.ts: {sorted(allowed_bases)}")
    except Exception as e:
        print(f"⚠️  Could not parse index.ts: {e} — no component filter applied")
        return set(), []

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

ALLOWED_COMPONENTS_DISPLAY = ", ".join(
    b.capitalize() for b in sorted(ALLOWED_COMPONENT_BASES)
) if ALLOWED_COMPONENT_BASES else "all available components"


# ================= CHROMADB =================

print("🚀 Connecting to ChromaDB...")

chroma_client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
collection = chroma_client.get_collection(name="ui_components")

print(f"📦 Collection loaded: {collection.count()} chunks")


# ================= BUILD BM25 INDEX AT STARTUP =================

def build_bm25_index(col) -> tuple:
    result    = col.get(include=["documents", "metadatas"])
    all_ids   = result["ids"]
    all_docs  = result["documents"]
    all_meta  = result["metadatas"]
    tokenized = [doc.lower().split() for doc in all_docs]
    bm25      = BM25Okapi(tokenized)
    print(f"📚 BM25 index built over {len(all_ids)} chunks")
    return bm25, all_ids, all_docs, all_meta


bm25_index, bm25_all_ids, bm25_all_docs, bm25_all_meta = build_bm25_index(collection)

print("✅ Ready\n")


# ================= HELPERS =================

def print_chunks(results: list, limit: int = 10):
    for i, r in enumerate(results[:limit]):
        c = r["chunk"]
        print(
            f"   {i+1:>2}. {c.get('component','?'):<20} "
            f"{c.get('interface',''):<20} "
            f"prop={c.get('prop','-'):<15} "
            f"sim={r['similarity']:.3f}"
        )


# ================= HYBRID SEARCH =================

def hybrid_search(
    query_embedding: list,
    query_text: str,
    top_k: int = None,
    alpha: float = 0.7,
    where: dict = None,
) -> list:
    if top_k is None:
        top_k = TOP_K

    query_kwargs = dict(
        query_embeddings=[query_embedding],
        n_results=min(top_k * 2, collection.count()),
        include=["documents", "metadatas", "distances"],
    )
    if where:
        query_kwargs["where"] = where

    dense_results = collection.query(**query_kwargs)
    dense_ids     = dense_results["ids"][0]
    dense_dists   = dense_results["distances"][0]
    dense_scores  = {id_: 1 - dist for id_, dist in zip(dense_ids, dense_dists)}

    tokens    = query_text.lower().split()
    bm25_raw  = bm25_index.get_scores(tokens)
    bm25_max  = max(bm25_raw) if max(bm25_raw) > 0 else 1
    bm25_norm = bm25_raw / bm25_max
    bm25_scores = {id_: float(bm25_norm[i]) for i, id_ in enumerate(bm25_all_ids)}

    candidate_ids = set(dense_ids) | set(bm25_all_ids)
    merged = []

    for id_ in candidate_ids:
        d_score  = dense_scores.get(id_, 0.0)
        b_score  = bm25_scores.get(id_, 0.0)
        combined = alpha * d_score + (1 - alpha) * b_score

        if combined > 0:
            idx  = bm25_all_ids.index(id_)
            meta = bm25_all_meta[idx]

            if where:
                comp_filter = where.get("component", {})
                if isinstance(comp_filter, dict):
                    allowed = comp_filter.get("$in", [])
                    if allowed and meta.get("component") not in allowed:
                        continue
                elif isinstance(comp_filter, str):
                    if meta.get("component") != comp_filter:
                        continue

            merged.append({
                "chunk": {
                    "text":      bm25_all_docs[idx],
                    "component": meta.get("component", ""),
                    "type":      meta.get("type", ""),
                    "title":     meta.get("title", ""),
                    "prop":      meta.get("prop", ""),
                    "interface": meta.get("interface", ""),
                },
                "similarity": combined,
            })

    merged.sort(key=lambda x: x["similarity"], reverse=True)
    return merged[:top_k]


# ================= EMBED TEXT =================

def embed_text(text: str) -> list:
    response = requests.post(
        "https://api.jina.ai/v1/embeddings",
        headers={
            "Authorization": f"Bearer {JINA_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"model": EMBED_MODEL, "input": [text]},
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
    temperature: float = 0.1,
    include_history: bool = True,
) -> str:

    messages = [{"role": "system", "content": system}]

    if include_history:
        messages.extend(chat_history[-MAX_HISTORY:])

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

    if DEBUG:
        print("RESPONSE:", json.dumps(data, indent=2)[:800])

    if "message" not in data:
        return ""

    content = data["message"]["content"].strip()
    return clean_llm_output(content)


# ================= TYPE DETECTION =================

def detect_question_type(question: str) -> str:
    q = question.strip().lower()

    CODE_KEYWORDS = [
        "create", "build", "generate", "make", "implement", "write",
        "show me", "give me", "i want", "i need", "can you make",
        "add a", "add an", "page with", "component with", "example of",
    ]
    if any(kw in q for kw in CODE_KEYWORDS):
        return "code"

    raw = ollama(
        system=SYSTEM_PROMPT_TYPE_DETECTOR,
        user=f"Question: {question}",
        max_tokens=10,
        temperature=0.0,
        include_history=False,
    )

    return "code" if "code" in raw.strip().lower() else "props"


# ================= RETRIEVE =================

def retrieve(
    query: str,
    top_k: int = None,
    threshold: float = None,
    initial_embedding: list = None,
) -> tuple:

    if top_k is None:
        top_k = TOP_K
    if threshold is None:
        threshold = SIMILARITY_THRESHOLD

    print(f"\n🔍 Retrieving for: {query[:80]}...")

    try:
        embedding = initial_embedding if initial_embedding else embed_text(query)
    except Exception as e:
        return f"Retrieval failed: {e}", [], None

    results  = hybrid_search(embedding, query, top_k=top_k * 2)
    filtered = [r for r in results if r["similarity"] >= threshold][:top_k]

    if not filtered:
        filtered = results[:top_k]

    print(f"   📚 {len(filtered)} chunks retrieved (hybrid)")
    print_chunks(filtered)

    context_parts = [r["chunk"].get("text", "") for r in filtered]
    return "\n\n".join(context_parts), filtered, embedding


# ================= GENERATE SUBQUESTIONS =================

def generate_subquestions(question: str, initial_context: str) -> list:

    raw = ollama(
        system=f"""You are a React component analyst.

Generate documentation lookup questions needed to answer the user request.

The ONLY components available in the library are:
{ALLOWED_COMPONENTS_DISPLAY}

Rules:
- Only consider components from the list above
- Think about props needed for those components
- Think about interactions needed
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
        temperature=0.0,
        include_history=True,
    )

    try:
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        if start != -1 and end > 0:
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
        "ready_to_code": False,
    }

    current_section = None
    for line in plan_text.split("\n"):
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
        temperature=0.0,
        include_history=True,
    )

    clarifications = []
    try:
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        if start != -1 and end > 0:
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
        q       = item.get("question", "")
        options = item.get("options", [])
        reason  = item.get("reason", "")

        print(f"  [{i+1}] {q}")
        if reason:
            print(f"       Why: {reason}")
        print()

        if options:
            for j, opt in enumerate(options):
                print(f"       {j+1}. {opt}")
            print(f"       {len(options)+1}. Other")
            print()

            while True:
                choice = input(f"  Your choice [1-{len(options)+1}]: ").strip()
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


# ================= VERIFY + FIX =================

def verify_and_fix(
    code: str,
    raw_chunks_context: str,
    component_props: dict,
) -> str:
    """
    Verifier now receives:
    - raw chunk documents (for full context)
    - component_props whitelist (extracted from chunks — explicit prop validation)
    - the real library import path (injected into the prompt via build_verify_prompt)
    """
    print("\n  🔍 Step 8: Verifying generated code...")

    prop_whitelist_block = build_prop_whitelist_block(component_props)
    verify_prompt = build_verify_prompt(LIBRARY_IMPORT, prop_whitelist_block)

    verdict = ollama(
        system=verify_prompt,
        user=(
            f"Raw component documentation chunks:\n{raw_chunks_context}\n\n"
            f"Code to review:\n{code}"
        ),
        max_tokens=400,
        temperature=0.0,
        include_history=False,
    )

    if verdict.strip().upper().startswith("PASS"):
        print("  ✅ Verification passed\n")
        return code

    print(f"\n  ⚠️  Issues found — attempting fix...\n{verdict}\n")

    # Use the same whitelist in the fix step so the fixer knows the constraints
    fix_code_prompt = build_code_gen_prompt(LIBRARY_IMPORT, prop_whitelist_block)

    fixed = ollama(
        system=fix_code_prompt,
        user=(
            f"The following React code has problems:\n{verdict}\n\n"
            f"Raw component documentation:\n{raw_chunks_context}\n\n"
            f"Fix ALL issues and return corrected code only:\n\n{code}"
        ),
        max_tokens=1536,
        temperature=0.1,
        include_history=False,
    )

    print("  ✅ Fix applied\n")
    return fixed


# ================= UNIFIED PIPELINE =================

def run_pipeline(
    question: str,
    initial_embedding: list,
    initial_chunks: list,
    q_type: str,
) -> str:

    # ── PROPS PATH ──────────────────────────────────────────────────────────
    if q_type == "props":

        print("\n📋 Props Lookup Pipeline\n")

        context_parts = [
            r["chunk"].get("text", "")
            for r in initial_chunks
            if r["similarity"] >= SIMILARITY_THRESHOLD
        ]
        if not context_parts:
            context_parts = [r["chunk"].get("text", "") for r in initial_chunks[:TOP_K]]

        context = "\n\n".join(context_parts)

        return ollama(
            system=SYSTEM_PROMPT_PROPS,
            user=(
                f"Context:\n{context}\n\n"
                f"Question: {question}"
            ),
            max_tokens=512,
            temperature=0.1,
            include_history=True,
        )

    # ── CODE PATH ────────────────────────────────────────────────────────────
    print("\n🧑‍💻 Code Generation Pipeline (Self-Ask + Planning)\n")

    initial_context = "\n\n".join(
        r["chunk"].get("text", "") for r in initial_chunks[:20]
    )

    # Step 1 — Sub-questions
    print("  📋 Step 1: Generating sub-questions...")
    subquestions = generate_subquestions(question, initial_context)
    print(f"  ✅ {len(subquestions)} sub-question(s):\n")
    for i, q in enumerate(subquestions):
        print(f"     [{i+1}] {q}")

    # Step 2 — Answer each sub-question; accumulate raw chunks for verifier
    print("\n  🔍 Step 2: Answering sub-questions...\n")
    qa_pairs   = []
    raw_chunks = [initial_context]

    for i, subq in enumerate(subquestions):
        print(f"\n  Answering [{i+1}]: {subq}")

        context, _, _ = retrieve(subq, top_k=20)
        raw_chunks.append(context)

        answer = ollama(
            system=SYSTEM_PROMPT_SUBANSWER,
            user=f"Context:\n{context}\n\nQuestion: {subq}",
            max_tokens=200,
            temperature=0.0,
            include_history=False,
        )

        qa_pairs.append({"question": subq, "answer": answer})
        print(f"  ✅ {answer[:100]}...")

    # Step 3 — Build Q&A summary + keep raw chunks separate
    print("\n  🔧 Step 3: Building documentation summary...")
    docs_summary = (
        f"Available UI components (exported from index.ts): {ALLOWED_COMPONENTS_DISPLAY}\n\n"
        "Component Q&A:\n\n"
        + "".join(f"Q: {p['question']}\nA: {p['answer']}\n\n" for p in qa_pairs)
    )
    raw_chunks_context = "\n\n---\n\n".join(raw_chunks)

    # ── Extract prop whitelist from all retrieved chunks ──────────────────
    # This is built from the actual sub-answer text (SUBANSWER format) which
    # uses "Component: X" / "- propName: type" lines, so it's reliable.
    component_props = extract_valid_props(raw_chunks_context)
    prop_whitelist_block = build_prop_whitelist_block(component_props)

    if component_props:
        print(f"\n  📋 Prop whitelist built: {len(component_props)} component(s)")
        for comp, props in sorted(component_props.items()):
            print(f"     {comp}: {', '.join(sorted(props)) or '(none parsed)'}")

    # Step 4 — Clarify ambiguities
    clarification_answers = clarify_with_user(question, docs_summary)
    if clarification_answers:
        docs_summary += clarification_answers

    # Step 5 — Plan
    print("  🗺️  Step 5: Creating implementation plan...")
    plan_text = ollama(
        system=SYSTEM_PROMPT_PLANNER,
        user=f"{docs_summary}\nUser request: {question}",
        max_tokens=800,
        temperature=0.3,
        include_history=True,
    )
    print(f"\n📋 Plan:\n{plan_text}\n")
    parsed = parse_plan(plan_text)

    # Step 6 — Collect answers to planner questions
    if parsed["questions_for_user"]:
        print("\n❓ AI has additional questions:\n")
        for i, q in enumerate(parsed["questions_for_user"]):
            print(f"  [{i+1}] {q}")
        print("\n(Press Enter to skip — AI will use best defaults)\n")

        user_answers = []
        for i, q in enumerate(parsed["questions_for_user"]):
            ans = input(f"  Answer [{i+1}]: ").strip()
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

    # Step 7 — Generate final code (real import path + whitelist baked into prompt)
    print("  🤖 Step 7: Generating final React code...")
    code_gen_prompt = build_code_gen_prompt(LIBRARY_IMPORT, prop_whitelist_block)

    final_answer = ollama(
        system=code_gen_prompt,
        user=(
            f"Component documentation:\n{docs_summary}\n\n"
            f"Implementation plan:\n{plan_text}\n\n"
            f"User request: {question}\n\n"
            f"Write the React code now:"
        ),
        max_tokens=1536,
        temperature=0.1,
        include_history=True,
    )

    # Step 8 — Verify against raw chunks + strict prop whitelist
    final_answer = verify_and_fix(final_answer, raw_chunks_context, component_props)

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

print(f"✅ RAG system ready!  [library import: '{LIBRARY_IMPORT}']")
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

        # Step 1 — Embed
        print("\n🔍 Step 1: Embedding question...")
        initial_embedding = embed_text(question)

        # Step 2 — Hybrid search
        print("🔍 Step 2: Hybrid search...")
        where = None
        if ALLOWED_COMPONENT_NAMES:
            where = (
                {"component": ALLOWED_COMPONENT_NAMES[0]}
                if len(ALLOWED_COMPONENT_NAMES) == 1
                else {"component": {"$in": ALLOWED_COMPONENT_NAMES}}
            )
        initial_results = hybrid_search(initial_embedding, question, top_k=TOP_K * 2, where=where)

        print(f"\n📚 Top results:")
        print_chunks(initial_results, limit=10)

        # Step 3 — Detect type
        print("\n🎯 Step 3: Detecting question type...")
        q_type = detect_question_type(question)
        print(f"  Detected: {'🧑‍💻 Code Generation' if q_type == 'code' else '📋 Prop Lookup'}")

        # Step 4 — Run pipeline
        answer = run_pipeline(
            question=question,
            initial_embedding=initial_embedding,
            initial_chunks=initial_results,
            q_type=q_type,
        )

        # Print result
        mode_label = "🧑‍💻 React Code" if q_type == "code" else "📋 Prop Documentation"
        print(f"\n{'═' * 60}")
        print(f"  {mode_label}")
        print(f"{'═' * 60}\n")
        print(answer.strip())
        print(f"\n{'─' * 60}")
        print(f"  ✅ Done  |  history: {len(chat_history) // 2} turn(s)")
        print(f"{'─' * 60}\n")

        # Save to history
        chat_history.append({"role": "user", "content": question})
        chat_history.append({"role": "assistant", "content": answer[:4000]})

    except requests.exceptions.Timeout:
        print("❌ Timed out — try restarting ollama serve")

    except Exception as e:
        print(f"❌ Error: {e}")

    print("\n" + "═" * 60 + "\n")