# RAG Pipeline Architecture

```mermaid
flowchart TD
    subgraph SRC["Source Code"]
        A["Component .tsx files\ncommon-ui / common-ui-icons / common-ui-templates"]
    end

    subgraph PARSER["Parser  ·  TypeScript"]
        B["pipeline.ts\n+ stage2_ast.ts\n+ stage6_transform.ts"]
        E["parser/parsing-results/\nfinal.*.schema.json\none file per component"]
    end

    subgraph S1["Stage 1  ·  stage1_embed.py"]
        F["schema_to_chunks()\nsplits schema into typed chunks"]
        G["chunk types\nimports · component_overview · extends\ncss_classes · prop · enum\ninterface_summary · demo · story"]
        H["Cohere-embed-v-4-0\n1536-dim vectors"]
        I["new_rag/embedding2_results/\nembeddings2.*.json\none file per component ✅"]
    end

    subgraph S2["Stage 2  ·  stage2_cluster.ts"]
        J["cosine similarity clustering\nthreshold = 0.84\nwithin same component only"]
        K["new_rag/clustering_results/\nclustering.*.json"]
    end

    subgraph S3["Stage 3  ·  stage3_rechunk.py"]
        L["merge cluster items\ninto combined text block\n+ keywords + interfaces"]
        M["new_rag/rechunked_results/\nrechunked.*.json"]
    end

    subgraph S4["Stage 4  ·  stage4_reembed.py"]
        N["embed merged cluster text\nCohere-embed-v-4-0"]
        O["new_rag/embedding3_results/\nembeddings2.*.json"]
    end

    subgraph S5["Stage 5  ·  stage5_store_chroma.py"]
        P["BM25 index + vector upsert\nalpha=0.7 hybrid"]
        Q[("new_rag/chroma_db/\nChromaDB")]
    end

    subgraph S6["Stage 6  ·  stage6_query.py"]
        R["embed query\nhybrid search BM25 + cosine\nre-rank top-K"]
        S["LLM Answer\nModel Manager API"]
    end

    A --> B --> E
    E --> F --> G --> H --> I
    I --> J --> K
    K --> L --> M
    M --> N --> O
    O --> P --> Q
    Q --> R
    USER["User Query"] --> R --> S
```

## Folder Map

| Folder | Stage | Contents |
|--------|-------|----------|
| `parser/parsing-results/` | Parser out | `final.*.schema.json` — raw component schemas |
| `new_rag/embedding2_results/` | Stage 1 out | `embeddings2.*.json` — per-component typed chunks + vectors |
| `new_rag/clustering_results/` | Stage 2 out | `clustering.*.json` — cluster groups per component |
| `new_rag/rechunked_results/` | Stage 3 out | `rechunked.*.json` — merged cluster text |
| `new_rag/embedding3_results/` | Stage 4 out | `embeddings2.*.json` — re-embedded cluster chunks |
| `new_rag/chroma_db/` | Stage 5 out | ChromaDB vector store |

## Dead Folders (ignore)

| Folder | Reason |
|--------|--------|
| `rag/text-results/` | Old pipeline artifact |
| `new_rag/embedding_results/` | Old monolithic embedding output (all icons in one file) |

## Key Design Rule

Each `embeddings2.*.json` = **exactly one component**.  
Stage 2 processes one file at a time → clustering never crosses component boundaries.
```
