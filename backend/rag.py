"""
RAG pipeline: embedding model + Chroma-backed retrieval and indexing.

Both this module and app.py connect to Chroma as an HttpClient talking to a
standalone `chroma run` server (see scripts/start_chroma.sh) rather than each
opening their own PersistentClient on the same directory. Two independent
PersistentClients on one on-disk path is not safe for concurrent access and
was the root cause of an `Error finding id` failure during development -
one process must own the directory, everyone else talks to it over HTTP.
"""

import chromadb
from sentence_transformers import SentenceTransformer

from backend import config

print("Loading embedder...")
embedder = SentenceTransformer(config.EMBEDDING_MODEL_NAME, device="cpu")

print("Connecting to ChromaDB...")
_client = chromadb.HttpClient(host=config.CHROMA_HOST, port=config.CHROMA_PORT)
collection = _client.get_or_create_collection(name=config.COLLECTION_NAME)


def retrieve_context(
    query: str,
    top_k: int = config.TOP_K,
    relevance_threshold: float = config.RELEVANCE_THRESHOLD,
):
    """Embed the query, retrieve the closest chunks, and drop anything below
    the relevance threshold.

    Returns (chunks, metadatas): chunks is a list of chunk text, metadatas is
    the matching list of metadata dicts (id/subject/grade/chapter/section).
    Returns (None, None) when nothing relevant enough is found.
    """
    query_embedding = embedder.encode(["query: " + query]).tolist()
    results = collection.query(query_embeddings=query_embedding, n_results=top_k)

    if not results["documents"][0]:
        return None, None

    chunks, metadatas = [], []
    for doc, meta, dist in zip(
        results["documents"][0], results["metadatas"][0], results["distances"][0]
    ):
        if dist <= relevance_threshold:
            chunks.append(doc)
            metadatas.append(meta)

    if not chunks:
        return None, None
    return chunks, metadatas


def index_chunks(chunks: list[dict]) -> int:
    """Embed and add curriculum chunk dicts
    (id/subject/grade/chapter/section/text) to the collection.

    Returns the new total chunk count in the collection.
    """
    texts = [c["text"] for c in chunks]
    embeddings = embedder.encode(["passage: " + t for t in texts]).tolist()

    collection.add(
        ids=[c["id"] for c in chunks],
        embeddings=embeddings,
        documents=texts,
        metadatas=[{k: v for k, v in c.items() if k != "text"} for c in chunks],
    )
    return collection.count()
