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

from backend import config, textnorm

print("Loading embedder...")
embedder = SentenceTransformer(config.EMBEDDING_MODEL_NAME, device="cpu")

print("Connecting to ChromaDB...")
_client = chromadb.HttpClient(host=config.CHROMA_HOST, port=config.CHROMA_PORT)
collection = _client.get_or_create_collection(name=config.COLLECTION_NAME)


def _scope_filter(subject: str | None, grade: str | None):
    """Chroma `where` clause restricting retrieval to one course."""
    clauses = []
    if subject:
        clauses.append({"subject": subject})
    if grade:
        clauses.append({"grade": grade})
    if not clauses:
        return None
    return clauses[0] if len(clauses) == 1 else {"$and": clauses}


def retrieve_context(
    query: str,
    top_k: int = config.TOP_K,
    subject: str | None = None,
    grade: str | None = None,
):
    """Embed the query, retrieve the closest chunks within the requested course,
    and drop anything that fails either gate: distance, then coverage of the
    best match. Both thresholds read looser when the query is not in the
    corpus language.

    Returns (chunks, metadatas): chunks is a list of chunk text, metadatas is
    the matching list of metadata dicts (id/subject/grade/chapter/section).
    Returns (None, None) when nothing relevant enough is found.
    """
    arabic = textnorm.is_arabic(query)
    relevance_threshold = (
        config.RELEVANCE_THRESHOLD if arabic else config.RELEVANCE_THRESHOLD_XLING
    )
    coverage_threshold = (
        config.COVERAGE_THRESHOLD if arabic else config.COVERAGE_THRESHOLD_XLING
    )

    query_embedding = embedder.encode(["query: " + query]).tolist()
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=top_k,
        where=_scope_filter(subject, grade),
    )

    if not results["documents"][0]:
        return None, None

    chunks, metadatas = [], []
    for doc, meta, dist in zip(
        results["documents"][0], results["metadatas"][0], results["distances"][0]
    ):
        if dist <= relevance_threshold:
            chunks.append(doc)
            metadatas.append(meta)

    # Coverage is read off the best match only; a second chunk that is close
    # enough is supporting context.
    if not chunks or textnorm.coverage(query, chunks[0]) < coverage_threshold:
        return None, None
    return chunks, metadatas


def index_chunks(chunks: list[dict]) -> int:
    """Embed and write curriculum chunk dicts
    (id/subject/grade/chapter/section/text) into the collection.

    upsert, not add: in Chroma, `add` on an existing id is a silent no-op and
    the old text stays, so edits to content/*.json would never reach the index.

    Returns the new total chunk count in the collection.
    """
    texts = [c["text"] for c in chunks]
    embeddings = embedder.encode(["passage: " + t for t in texts]).tolist()

    collection.upsert(
        ids=[c["id"] for c in chunks],
        embeddings=embeddings,
        documents=texts,
        metadatas=[{k: v for k, v in c.items() if k != "text"} for c in chunks],
    )
    return collection.count()
