# new_rag/stage6_query.py

import os
import re
import glob
import json
import requests
import chromadb
import cohere
from dotenv import load_dotenv

load_dotenv()

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)

CHROMA_DB_DIR = os.path.join(_HERE, "chroma_db")
EMBEDDING_RESULTS_DIR = os.path.join(_HERE, "embedding2_results")
INDEX_TS_PATH = os.path.join(_ROOT, "mini-commonui/packages/common-ui/src/index.ts")
EMBED_MODEL = "embed-v4.0"
RERANK_MODEL = "rerank-v3.5"
CO_API_KEY = os.getenv("CO_API_KEY")

# ================= GROQ (replaces Ollama for reasoning/generation) =================
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"  # swap to "llama-3.1-8b-instant" for faster/cheaper calls

TOP_K = 20
SIMILARITY_THRESHOLD = 0.5
RERANK_TOP_N = 8  # how many chunks survive reranking

# ================= CHAT MEMORY =================

chat_history = []
MAX_HISTORY = 20

if not CO_API_KEY:
    raise ValueError("❌ Missing CO_API_KEY in .env")

if not GROQ_API_KEY:
    raise ValueError("❌ Missing GROQ_API_KEY in .env")

co = cohere.ClientV2(api_key=CO_API_KEY)


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


SYSTEM_PROMPT_CONSISTENCY_CHECK = """You are a React QA reviewer.

You will be given:
1. The user's request
2. Component documentation (props, types, defaults) gathered so far
3. An implementation plan listing PROPS_TO_USE

Your ONLY job is to catch CONTRADICTIONS between the chosen prop values and
either (a) the user's request, or (b) the component's own documented behavior.

Look specifically for things like:
- A prop that disables interaction (e.g. loading=true, disabled=true) combined
  with a requirement that needs the element to be interactive (e.g. an onClick
  behavior the user asked for that can now never fire)
- A prop value being used in a way its type doesn't support (e.g. feeding a
  non-color string into a color/style field, or a value not in an enum's
  accepted list)
- Two chosen props that logically cancel each other out
- A documented default silently overriding a behavior the user explicitly asked for

Do NOT flag stylistic preferences, missing optional props, or anything that
isn't a genuine contradiction. Do NOT invent issues that aren't there.

Do NOT flag vague concerns like "the interaction between X and Y is unclear"
or "props should be handled correctly" — these aren't contradictions, they're
hedging. Only flag something if you can state the EXACT two things that
conflict and WHY, using specifics from the documentation provided. If you
cannot point to a specific conflicting value or behavior, do not flag it.

Rules:
- If everything is consistent, return EXACTLY: CONSISTENT
- If there are issues, return ONLY this format (no markdown, no extra prose):

ISSUES:
- [one line per contradiction found]

FIXES:
- [one concrete, actionable fix per issue, same order]
"""


SYSTEM_PROMPT_COMPLETENESS_CHECK = """You are a strict React/TypeScript QA reviewer focused ONLY on required props.

You will be given:
1. Component documentation (props, including which are required vs optional)
2. Generated React code

Your ONLY job is to check: for every component instance used in the code, are
ALL of that component's REQUIRED props actually passed? A prop is required
when its TypeScript type has NO trailing '?' (e.g. "title: string;" is
required, "title?: string;" is optional) and no default value is documented.

Rules:
- Do NOT flag optional props that are simply omitted — omitting optional
  props is normal and correct, not an error.
- Do NOT flag stylistic issues, naming, or anything unrelated to required-prop
  presence.
- If a component's full prop list isn't in the provided documentation, do NOT
  guess or flag anything for it — only check components you have full
  documentation for.
- Do NOT invent issues that aren't there.

Rules for output:
- If every required prop is present for every component used, return EXACTLY:
COMPLETE
- Otherwise, return ONLY this format (no markdown, no extra prose):

ISSUES:
- [ComponentName is missing required prop `propName`]

FIXES:
- [concrete instruction with a sensible real value, e.g. 'Add id="stats-alert" to the Alert instance', not a placeholder]
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
        parts = comp_name.split(".")
        if any(p in allowed_bases for p in parts):
            full_names.append(comp_name)

    print(f"✅ ChromaDB component names accessible to user: {full_names}")
    return allowed_bases, full_names


ALLOWED_COMPONENT_BASES, ALLOWED_COMPONENT_NAMES = load_allowed_components()

# Human-readable list for LLM prompts, e.g. "Alert, Badge, Card, DataPanel, ..."
ALLOWED_COMPONENTS_DISPLAY = ", ".join(
    b.capitalize() for b in sorted(ALLOWED_COMPONENT_BASES)
) if ALLOWED_COMPONENT_BASES else "all available components"


# ================= EXACT EXPORT NAMES (case-sensitive) =================

def load_allowed_export_names() -> set:
    """
    Parses index.ts for the ACTUAL exported identifiers with their real
    casing, e.g. 'DataPanel' not 'Datapanel'.

    This is separate from load_allowed_components(), which only extracts
    folder names for the component filter — folder names don't tell you
    the exact casing of the exported symbol (folder 'datapanel' but
    export 'DataPanel').

    Matches both:
      export { Card, ICard };
      export {
        DataPanel,
        DataPanelHeader,
        ...
      };

    Falls back to empty set on error, meaning no casing check is applied.
    """
    try:
        with open(INDEX_TS_PATH, "r") as f:
            content = f.read()
    except Exception as e:
        print(f"⚠️  Could not parse index.ts for export names: {e}")
        return set()

    names = set()
    for block in re.findall(r"export\s*\{([^}]+)\}", content, re.DOTALL):
        for raw_name in block.split(","):
            name = raw_name.strip()
            # Strip "X as Y" aliasing if present, keep the exported (right) side
            if " as " in name:
                name = name.split(" as ")[-1].strip()
            if name and name.isidentifier():
                names.add(name)

    return names


ALLOWED_EXPORT_NAMES = load_allowed_export_names()

# Build a lowercase → correct-casing lookup, used to auto-fix mismatches
# like 'Datapanel' -> 'DataPanel' without needing another LLM call.
_EXPORT_NAME_BY_LOWER = {name.lower(): name for name in ALLOWED_EXPORT_NAMES}

ALLOWED_EXPORTS_DISPLAY = ", ".join(sorted(ALLOWED_EXPORT_NAMES)) if ALLOWED_EXPORT_NAMES else ""

if ALLOWED_EXPORT_NAMES:
    print(f"🔡 Exact exported identifiers (for import casing): {sorted(ALLOWED_EXPORT_NAMES)}")


def fix_import_casing(code: str) -> str:
    """
    Deterministically corrects case-mismatched identifiers in generated code
    against the real exports from index.ts — e.g. 'Datapanel' -> 'DataPanel'.

    This is NOT an LLM call. Case mismatches are mechanical (the model knew
    the right component, just typed the wrong case), so a plain find/replace
    against the known-correct name is more reliable and much cheaper than
    asking the model to fix itself.

    Only touches whole-word matches so it never accidentally mangles
    substrings (e.g. won't touch 'Card' inside 'DataPanelCard' if that
    were ever a real distinct identifier).
    """
    if not _EXPORT_NAME_BY_LOWER or not code:
        return code

    # Find identifier-like tokens in the code (JSX tags, import names, etc.)
    def _replace(match):
        token = match.group(0)
        correct = _EXPORT_NAME_BY_LOWER.get(token.lower())
        if correct and correct != token:
            return correct
        return token

    # Only rewrite tokens that (case-insensitively) match a known export,
    # so plain variables/props/etc. are left untouched.
    pattern = r"\b(" + "|".join(re.escape(n) for n in _EXPORT_NAME_BY_LOWER.keys()) + r")\b"
    # re is case-sensitive by default; we need case-insensitive matching here
    fixed_code = re.sub(pattern, _replace, code, flags=re.IGNORECASE)

    if fixed_code != code:
        print("🔧 Auto-corrected import/identifier casing to match real exports")

    return fixed_code


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


# ================= SEARCH PER COMPONENT =================

def search_per_component(
    query_embedding: list,
    top_k_per_component: int = TOP_K,
    min_similarity: float = 0.3
) -> list:
    """
    Queries ChromaDB once PER allowed component, instead of one combined
    top-K search across all components together.

    Each component can contribute UP TO `top_k_per_component` chunks — but
    only chunks that clear `min_similarity`. A component with no genuinely
    relevant matches contributes 0 chunks; it is never padded with weak
    matches just to fill a quota. This avoids two opposite problems:
      - a single combined top-K search letting one strongly-matching
        component crowd out other relevant components entirely, AND
      - forcing every component to contribute chunks regardless of whether
        anything it has is actually relevant to the query.

    Falls back to a single unfiltered search if no component filter is set.
    """
    components_to_search = ALLOWED_COMPONENT_NAMES if ALLOWED_COMPONENT_NAMES else [None]

    all_scores = []

    for component_name in components_to_search:
        where = {"component": component_name} if component_name else None

        query_kwargs = dict(
            query_embeddings=[query_embedding],
            n_results=min(top_k_per_component, collection.count()),
            include=["documents", "metadatas", "distances"],
        )
        if where:
            query_kwargs["where"] = where

        results = collection.query(**query_kwargs)

        docs = results["documents"][0] if results["documents"] else []
        if not docs:
            continue

        for i, doc in enumerate(docs):
            meta = results["metadatas"][0][i]
            distance = results["distances"][0][i]
            similarity = 1 - distance

            # Skip chunks that don't meet the relevance floor — this is what
            # stops a component from being padded up to top_k_per_component
            # with irrelevant matches just because it was in the allowed list.
            if similarity < min_similarity:
                continue

            all_scores.append({
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

    return all_scores


# ================= RERANK =================

def rerank(query: str, results: list, top_n: int = RERANK_TOP_N) -> list:
    """
    Reranks search() output using Cohere rerank-v3.5.

    `results` is the list returned by search(): [{"chunk": {...}, "similarity": ...}, ...]
    Returns the same shape, reordered by relevance and truncated to top_n,
    with 'rerank_score' added to each chunk dict.

    Falls back to the original similarity-sorted results (truncated) if the
    rerank call fails, so the pipeline never breaks because of a rerank error.
    """
    if not results:
        return []

    docs = [r["chunk"].get("text", "") for r in results]

    try:
        response = co.rerank(
            model=RERANK_MODEL,
            query=query,
            documents=docs,
            top_n=min(top_n, len(docs)),
        )
    except Exception as e:
        print(f"⚠️  Rerank failed, falling back to similarity order: {e}")
        return results[:top_n]

    reranked = []
    for result in response.results:
        original = results[result.index]
        original["chunk"]["rerank_score"] = result.relevance_score
        reranked.append(original)

    return reranked


# ================= EMBED TEXT =================

def embed_text(text: str) -> list:
    """
    Embeds a user query using Cohere embed-v4.0.

    input_type="search_query" is required here — it MUST match the
    input_type used at storage time ("search_document" in stage1/stage4),
    otherwise the query and document vectors won't be optimally aligned.
    """
    try:
        response = co.embed(
            model=EMBED_MODEL,
            texts=[text],
            input_type="search_query",
            embedding_types=["float"],
        )
        return response.embeddings.float[0]
    except Exception as e:
        raise ValueError(f"❌ Cohere embed error: {e}")


# ================= GROQ (was Ollama) =================

def ollama(
    system: str,
    user: str,
    max_tokens: int = 512,
    temperature: float = 0.1
) -> str:
    """
    Kept the name `ollama()` so every call site in the rest of the pipeline
    stays untouched — internally this now calls the Groq API instead of a
    local model.
    """

    messages = [{"role": "system", "content": system}]

    # Add previous chat history
    messages.extend(chat_history[-MAX_HISTORY:])

    # Add current message
    messages.append({"role": "user", "content": user})

    response = requests.post(
        GROQ_URL,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": GROQ_MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=60
    )

    if response.status_code != 200:
        print(f"❌ Groq API error {response.status_code}: {response.text[:300]}")
        return ""

    data = response.json()

    try:
        content = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError):
        return ""

    # Remove think blocks (in case a reasoning-style model is swapped in later)
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
    Reuses initial_embedding if provided to avoid duplicate Cohere calls.
    """

    print(f"\n🔍 Retrieving for: {query[:80]}...")

    try:
        embedding = initial_embedding if initial_embedding else embed_text(query)
    except Exception as e:
        return f"Retrieval failed: {e}", [], None

    results = search_per_component(embedding, top_k_per_component=top_k)

    filtered = [r for r in results if r["similarity"] >= threshold][:top_k]

    if not filtered:
        filtered = results[:top_k]

    # Rerank the similarity-filtered candidates before building context
    filtered = rerank(query, filtered, top_n=min(RERANK_TOP_N, len(filtered)))

    print(f"   📚 {len(filtered)} chunks retrieved (post-rerank)")

    context_parts = []

    for i, r in enumerate(filtered):
        chunk = r["chunk"]
        text = chunk.get("text", "")
        title     = chunk.get("title", "")
        prop      = chunk.get("prop", "")
        interface = chunk.get("interface", "")
        chunk_type = chunk.get("type", "")
        rerank_score = chunk.get("rerank_score")
        score_str = f"{rerank_score:.4f}" if rerank_score is not None else "n/a"
        title_str = (title[:50] + "…") if len(title) > 50 else title
        print(
            f"   [{i+1}] {chunk.get('component', 'unknown')} "
            f"| title: {title_str} "
            f"| {interface} | prop: {prop} | type: {chunk_type} "
            f"| similarity: {r['similarity']:.4f} | rerank: {score_str}"
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


# ================= CONSISTENCY CHECK =================

def check_consistency(question: str, docs_summary: str, plan_text: str) -> str:
    """
    Runs after planning, before final code generation.

    Catches contradictions the planner didn't notice — most commonly a prop
    that disables interaction (loading/disabled) combined with a requirement
    that needs the element to be interactive, or a prop value that isn't
    actually valid for its type (e.g. a non-color string in a style prop).

    Returns "CONSISTENT" if nothing is wrong, otherwise a block of
    ISSUES: / FIXES: text that gets appended to docs_summary so the final
    code-gen step sees it as a correction, not a suggestion.

    Falls back to "CONSISTENT" (i.e. does not block code-gen) if the LLM
    call fails, so a broken check never stalls the pipeline.
    """

    print("\n  🧪 Step 6: Running consistency check...")

    try:
        raw = ollama(
            system=SYSTEM_PROMPT_CONSISTENCY_CHECK,
            user=(
                f"User request: {question}\n\n"
                f"Component documentation:\n{docs_summary}\n\n"
                f"Implementation plan:\n{plan_text}"
            ),
            max_tokens=400,
            temperature=0.0
        )
    except Exception as e:
        print(f"  ⚠️  Consistency check failed, skipping: {e}\n")
        return "CONSISTENT"

    result = raw.strip()

    if not result or result.upper().startswith("CONSISTENT"):
        print("  ✅ No contradictions found\n")
        return "CONSISTENT"

    print(f"  ⚠️  Contradictions found:\n{result}\n")
    return result


# ================= REQUIRED-PROP COMPLETENESS CHECK =================

def check_prop_completeness(raw_context: str, code: str) -> str:
    """
    Runs after final code generation (and after casing is fixed).

    IMPORTANT: takes the RAW retrieved chunk text (literal interface source,
    e.g. 'color?: BadgeColor;'), NOT the summarized docs_summary. The
    summarized Q&A format used elsewhere in the pipeline doesn't preserve
    whether a prop is optional ('?') or required, so checking completeness
    against that lossy summary caused false positives — e.g. flagging
    Badge.color/invisible/className as "missing required" when they're
    actually optional. The raw source text still has the real '?' markers,
    so the model can tell required from optional correctly.

    Cross-references every component instance in the generated code against
    its documented required props. Catches bugs like a required `id` or
    `title` being silently dropped — the exact class of bug seen with
    Alert.id, WrapperWithTitle.title, and Badge.children.

    Returns "COMPLETE" if nothing is missing, otherwise an ISSUES: / FIXES:
    block describing what to add and how.

    Falls back to "COMPLETE" (does not block returning code) if the LLM call
    fails, or if no raw context is available at all, so a broken check never
    stalls the pipeline or hallucinates issues with nothing to check against.
    """

    print("\n  🧾 Step 8: Checking required-prop completeness...")

    if not raw_context.strip():
        print("  ⚠️  No raw documentation available to check against, skipping\n")
        return "COMPLETE"

    try:
        raw = ollama(
            system=SYSTEM_PROMPT_COMPLETENESS_CHECK,
            user=(
                f"Component documentation (literal source — '?' means optional, "
                f"no '?' means required):\n{raw_context}\n\n"
                f"Generated code:\n{code}"
            ),
            max_tokens=400,
            temperature=0.0
        )
    except Exception as e:
        print(f"  ⚠️  Completeness check failed, skipping: {e}\n")
        return "COMPLETE"

    result = raw.strip()

    if not result or result.upper().startswith("COMPLETE"):
        print("  ✅ All required props present\n")
        return "COMPLETE"

    print(f"  ⚠️  Missing required props found:\n{result}\n")
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

        # Build context from already retrieved (and reranked) chunks
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
            max_tokens=1024,
            temperature=0.1
        )

        return answer

    # ── CODE PATH ────────────────────────────────────────────
    print("\n🧑‍💻 Code Generation Pipeline (Self-Ask + Planning)\n")

    # Build initial context from already retrieved (and reranked) chunks
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
    raw_contexts = []  # keeps the literal retrieved chunk text (with real '?' markers)

    for i, subq in enumerate(subquestions):
        print(f"\n  Answering [{i + 1}]: {subq}")

        # Each sub-question gets its own embed + search + rerank (via retrieve())
        context, _, _ = retrieve(subq, top_k=20, threshold=0.15)

        if context:
            raw_contexts.append(context)

        answer = ollama(
            system=SYSTEM_PROMPT_SUBANSWER,
            user=f"Context:\n{context}\n\nQuestion: {subq}",
            max_tokens=200,
            temperature=0.0
        )

        qa_pairs.append({"question": subq, "answer": answer})
        print(f"  ✅ Answer: {answer[:100]}...")

    # Deduplicated raw context, used ONLY for the completeness check — the
    # summarized docs_summary below is lossy (SYSTEM_PROMPT_SUBANSWER's
    # output format doesn't preserve which props are optional vs required),
    # so completeness checking against it caused false positives like
    # flagging Badge.color/invisible/className as "missing required" when
    # they're actually optional in the real IBadgeProps.
    seen = set()
    raw_context_combined_parts = []
    for c in raw_contexts:
        if c not in seen:
            seen.add(c)
            raw_context_combined_parts.append(c)
    raw_context_combined = "\n\n".join(raw_context_combined_parts)

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

    # Step 6 — Consistency check (catches contradictions the planner missed,
    # e.g. loading=true disabling a button that also needs an onClick to fire)
    consistency_result = check_consistency(question, docs_summary, plan_text)

    if consistency_result != "CONSISTENT":
        plan_text += (
            "\n\nCONSISTENCY CHECK CORRECTIONS "
            "(these override any conflicting prop choices above):\n"
            f"{consistency_result}"
        )

    # Step 7 — Generate final code
    print("  🤖 Step 7: Generating final React code...")

    casing_instruction = (
        f"\n\nCRITICAL — exact import casing:\n"
        f"The ONLY valid exported identifiers, with their EXACT casing, are:\n"
        f"{ALLOWED_EXPORTS_DISPLAY}\n"
        f"You MUST import and reference components using this EXACT casing "
        f"(e.g. 'DataPanel', NOT 'Datapanel' or 'dataPanel'). Do not alter "
        f"capitalization even slightly."
    ) if ALLOWED_EXPORTS_DISPLAY else ""

    final_answer = ollama(
        system=SYSTEM_PROMPT_FINAL_CODE,
        user=(
            f"Chat history:\n{json.dumps(chat_history, indent=2)}\n\n"
            f"Component documentation:\n{docs_summary}\n\n"
            f"Implementation plan:\n{plan_text}\n\n"
            f"User request: {question}\n\n"
            f"{casing_instruction}\n\n"
            f"Write the React code now:"
        ),
        max_tokens=1536,
        temperature=0.1
    )

    # Deterministic safety net — fixes any casing slip the model still made,
    # without needing another LLM call (see fix_import_casing()).
    final_answer = fix_import_casing(final_answer)

    # Step 8 — Required-prop completeness check. Unlike casing, this isn't
    # mechanical to fix (the model has to decide what value to fill in), so
    # if anything's missing we do ONE corrective regeneration pass rather
    # than trying to patch the JSX with string edits.
    completeness_result = check_prop_completeness(raw_context_combined, final_answer)

    if completeness_result != "COMPLETE":
        print("  🔁 Regenerating with required-prop fixes applied...")

        final_answer = ollama(
            system=SYSTEM_PROMPT_FINAL_CODE,
            user=(
                f"Previously generated code:\n{final_answer}\n\n"
                f"This code is missing required props. Apply these fixes "
                f"exactly, keeping everything else the same:\n{completeness_result}\n\n"
                f"Component documentation:\n{docs_summary}\n\n"
                f"Rewrite the COMPLETE corrected code now (return only code):"
            ),
            max_tokens=1536,
            temperature=0.1
        )

        # Re-apply the casing safety net since this is a fresh generation
        final_answer = fix_import_casing(final_answer)

    return final_answer


if __name__ == "__main__":

    # ================= CHECK GROQ =================

    print("🔍 Checking Groq API key...")

    try:
        test_resp = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 5,
            },
            timeout=15
        )
        if test_resp.status_code == 200:
            print(f"✅ Groq is reachable — model: {GROQ_MODEL}\n")
        else:
            print(f"❌ Groq API returned {test_resp.status_code}: {test_resp.text[:300]}")
            exit(1)
    except Exception as e:
        print(f"❌ Could not reach Groq API: {e}")
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

            # ── STEP 2: INITIAL SEARCH (per component) ────────────
            print("🔍 Step 2: Initial search (per component)...")
            initial_results = search_per_component(initial_embedding, top_k_per_component=TOP_K)
            print(f"   🐛 DEBUG raw count after search_per_component: {len(initial_results)}")
            from collections import Counter as _Counter
            _comp_counts = _Counter(r["chunk"]["component"] for r in initial_results)
            print(f"   🐛 DEBUG per-component breakdown BEFORE rerank: {dict(_comp_counts)}")

            # ── STEP 2b: RERANK ───────────────────────────────────
            # top_n = len(initial_results): rerank REORDERS everything from
            # the per-component search but does NOT truncate it back down to
            # a flat TOP_K. Truncating here would undo the per-component
            # expansion (e.g. DataPanel + NotificationCenter both contributing
            # up to 20 chunks each) by collapsing it back to one global top-20.
            print("🎯 Step 2b: Reranking...")
            initial_results = rerank(
                question,
                initial_results,
                top_n=len(initial_results) if initial_results else 1
            )
            print(f"   🐛 DEBUG count AFTER rerank: {len(initial_results)}")
            _comp_counts_after = _Counter(r["chunk"]["component"] for r in initial_results)
            print(f"   🐛 DEBUG per-component breakdown AFTER rerank: {dict(_comp_counts_after)}")

            print(f"\n📚 Top results (post-rerank):")
            for i, r in enumerate(initial_results):
                chunk = r["chunk"]
                title = chunk.get("title", "")
                title_str = (title[:50] + "…") if len(title) > 50 else title
                rerank_score = chunk.get("rerank_score")
                score_str = f"{rerank_score:.4f}" if rerank_score is not None else "n/a"
                print(
                    f"  [{i+1}] {chunk.get('component', 'unknown')} "
                    f"| title: {title_str} "
                    f"| {chunk.get('interface', '')} "
                    f"| prop: {chunk.get('prop', '')} "
                    f"| type: {chunk.get('type', '')} "
                    f"| similarity: {r['similarity']:.4f} "
                    f"| rerank: {score_str}"
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
            print("❌ Timed out — try again")

        except Exception as e:
            print(f"❌ Error: {e}")

        print("\n" + "═" * 60 + "\n")