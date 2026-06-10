"""RAG pipeline: FAISS retriever over loyalty_rules.md using NVIDIA NIM embeddings.

See docs/PRD.md sections 4 (F3) and 6 (Tech Stack). Embeddings use the NIM model
`nvidia/nv-embedqa-e5-v5` via the OpenAI-compatible client; the index is FAISS
(faiss-cpu). The public entry point is `retrieve_rules`.
"""

import os
from functools import lru_cache

import faiss
import numpy as np

from src.config import EMBEDDING_MODEL, get_client

RULES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "loyalty_rules.md")


def _load_chunks() -> list[str]:
    """Split the rules markdown into chunks, one per top-level `##` section."""
    with open(RULES_PATH, encoding="utf-8") as f:
        text = f.read()

    chunks: list[str] = []
    current: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            if current:
                chunks.append("\n".join(current).strip())
            current = [line]
        else:
            current.append(line)
    if current:
        chunks.append("\n".join(current).strip())

    return [c for c in chunks if c]


def _embed(texts: list[str], input_type: str) -> np.ndarray:
    """Embed texts with the NIM embedding model.

    `nvidia/nv-embedqa-e5-v5` is asymmetric and requires an `input_type` of
    "passage" (documents) or "query" (search queries), passed via extra_body.
    Vectors are L2-normalized so inner product equals cosine similarity.
    """
    client = get_client()
    resp = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
        extra_body={"input_type": input_type, "truncate": "END"},
    )
    vectors = np.array([d.embedding for d in resp.data], dtype="float32")
    faiss.normalize_L2(vectors)
    return vectors


@lru_cache(maxsize=1)
def _build_index() -> tuple[faiss.Index, tuple[str, ...]]:
    """Embed all rule chunks and build a FAISS inner-product index (cached)."""
    chunks = _load_chunks()
    vectors = _embed(chunks, input_type="passage")
    index = faiss.IndexFlatIP(vectors.shape[1])
    index.add(vectors)
    return index, tuple(chunks)


def retrieve_rules(query: str, k: int = 3) -> list[str]:
    """Return the top-k loyalty-rule chunks most relevant to `query`."""
    index, chunks = _build_index()
    k = min(k, len(chunks))
    query_vec = _embed([query], input_type="query")
    _scores, indices = index.search(query_vec, k)
    return [chunks[i] for i in indices[0] if i != -1]
