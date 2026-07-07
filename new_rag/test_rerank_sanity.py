# test_rerank_sanity.py — run standalone first
import os
import cohere
from dotenv import load_dotenv

load_dotenv()
co = cohere.ClientV2(api_key=os.getenv("CO_API_KEY"))

docs = [
    "Button component with variant prop: primary, secondary, ghost",
    "IconButton component wraps an icon with click handling",
    "ButtonGroup arranges multiple buttons with spacing prop",
]

response = co.rerank(
    model="rerank-v3.5",
    query="What prop controls button spacing in a group?",
    documents=docs,
    top_n=3,
)

for r in response.results:
    print(f"[{r.index}] score={r.relevance_score:.4f} → {docs[r.index]}")