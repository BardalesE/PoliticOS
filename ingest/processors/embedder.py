"""
Embeddings + Qdrant operations.

Usa OpenAI text-embedding-3-small (1536 dim, ~$0.02/1M tokens).
Alternativa: BGE-M3 self-hosted (cambiar embed_text()).
"""

import os, logging
from typing import List, Dict, Any
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue

log = logging.getLogger(__name__)

_qdrant = None
_openai = None

def qdrant():
    global _qdrant
    if _qdrant is None:
        _qdrant = QdrantClient(
            url=os.getenv("QDRANT_URL", "http://localhost:6333"),
            api_key=os.getenv("QDRANT_API_KEY"),
        )
    return _qdrant

def openai_client():
    global _openai
    if _openai is None:
        _openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _openai

EMBEDDING_DIM = int(os.getenv("EMBEDDINGS_DIM", "1536"))
EMBEDDING_MODEL = os.getenv("EMBEDDINGS_MODEL", "text-embedding-3-small")

def embed_text(text: str) -> List[float]:
    r = openai_client().embeddings.create(
        model=EMBEDDING_MODEL,
        input=text[:8000],
    )
    return r.data[0].embedding

def ensure_collection(collection: str):
    try:
        qdrant().get_collection(collection)
    except Exception:
        qdrant().create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )
        log.info(f"Created Qdrant collection: {collection}")

def chunk_text(text: str, size: int = 500, overlap: int = 50) -> List[Dict]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        slice_ = words[i:i+size]
        chunks.append({"text": " ".join(slice_), "word_start": i, "word_end": i+len(slice_)})
        i += size - overlap
    return chunks

def index_document(collection: str, document_id: int, content: str, metadata: Dict = None) -> int:
    metadata = metadata or {}
    ensure_collection(collection)

    chunks = chunk_text(content)
    points = []
    for idx, chunk in enumerate(chunks):
        try:
            vec = embed_text(chunk["text"])
            points.append(PointStruct(
                id=document_id * 100000 + idx,
                vector=vec,
                payload={**metadata, "document_id": document_id, "chunk_index": idx, "text": chunk["text"]},
            ))
        except Exception as e:
            log.warning(f"Failed to embed chunk {idx} of doc {document_id}: {e}")

        if len(points) >= 50:
            qdrant().upsert(collection_name=collection, points=points)
            points = []

    if points:
        qdrant().upsert(collection_name=collection, points=points)

    return len(chunks)

def search_documents(collection: str, query: str, top_k: int = 5, filter_dict: Dict = None) -> List[Dict[str, Any]]:
    ensure_collection(collection)
    vec = embed_text(query)

    qfilter = None
    if filter_dict:
        conditions = [FieldCondition(key=k, match=MatchValue(value=v)) for k, v in filter_dict.items()]
        qfilter = Filter(must=conditions)

    hits = qdrant().search(
        collection_name=collection,
        query_vector=vec,
        limit=top_k,
        query_filter=qfilter,
        with_payload=True,
    )
    return [
        {"score": h.score, "payload": h.payload}
        for h in hits
    ]
