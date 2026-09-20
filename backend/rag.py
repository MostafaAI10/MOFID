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
    
    scope_clause = _scope_filter(subject, grade)
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=top_k,
        where=scope_clause,
    ) if scope_clause else collection.query(
        query_embeddings=query_embedding,
        n_results=top_k,
    )

    if not results or not results.get("documents") or not results["documents"][0]:
        return None, None

    chunks, metadatas, distances = [], [], []
    for doc, meta, dist in zip(
        results["documents"][0], results["metadatas"][0], results["distances"][0]
    ):
        if dist <= relevance_threshold:
            chunks.append(doc)
            metadatas.append(meta)
            distances.append(dist)

    if not chunks:
        return None, None

    # Coverage is checked on the best match
    best_dist = distances[0]
    if best_dist > 0.40:
        if textnorm.coverage(query, chunks[0]) < coverage_threshold:
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


def chunks_in_document(source_doc: str) -> list[dict]:
    """Every indexed chunk that belongs to one uploaded document, ordered by
    id so the chunk order matches the source order."""
    if source_doc == "core_physics_g12":
        result = collection.get(
            where={"subject": "الفيزياء"}, include=["documents", "metadatas"]
        )
    else:
        result = collection.get(
            where={"source_doc": source_doc}, include=["documents", "metadatas"]
        )
    chunks = [
        {"id": chunk_id, "text": text, **meta}
        for chunk_id, text, meta in zip(
            result.get("ids") or [],
            result.get("documents") or [],
            result.get("metadatas") or [],
        )
    ]
    return sorted(chunks, key=lambda c: c["id"])


def delete_document(source_doc: str) -> int:
    """Remove a document's chunks from the collection. Returns how many were
    removed."""
    if source_doc == "core_physics_g12":
        return 0
    result = collection.get(where={"source_doc": source_doc}, include=[], limit=5000)
    ids = result.get("ids") or []
    if ids:
        collection.delete(ids=ids)
    return len(ids)


def update_document_metadata(
    source_doc: str,
    *,
    subject: str | None = None,
    grade: str | None = None,
    chapter: str | None = None,
) -> int:
    """Update subject/grade/chapter metadata on all chunks of a document in Chroma."""
    if source_doc == "core_physics_g12":
        return 0
    result = collection.get(
        where={"source_doc": source_doc}, include=["metadatas"], limit=5000
    )
    ids = result.get("ids") or []
    metas = result.get("metadatas") or []
    if not ids:
        return 0
    updated = []
    for m in metas:
        entry = dict(m)
        if subject is not None:
            entry["subject"] = subject.strip()
        if grade is not None:
            entry["grade"] = grade.strip()
        if chapter is not None:
            entry["chapter"] = chapter.strip()
        updated.append(entry)
    collection.update(ids=ids, metadatas=updated)
    return len(ids)


def search_document(
    query: str, source_doc: str, top_k: int = 10, subject: str | None = None, grade: str | None = None
):
    """Semantic search confined to one uploaded document.

    Unlike retrieve_context this does not gate on curriculum relevance - the
    teacher is browsing inside the document, not asking the tutor - so every
    match is returned with its distance, closest first.

    Returns a list of {id, text, chapter, section, distance, ...} dicts.
    """
    query_embedding = embedder.encode(["query: " + query]).tolist()
    scoped = _scope_filter(subject, grade)
    where = {"subject": "الفيزياء"} if source_doc == "core_physics_g12" else {"source_doc": source_doc}
    combined = {"$and": [where, scoped]} if scoped and where else (scoped or where)
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=top_k,
        where=combined,
    )
    ids = results.get("ids") or [[]]
    docs = results.get("documents") or [[]]
    metas = results.get("metadatas") or [[]]
    dists = results.get("distances") or [[]]
    hits = []
    for chunk_id, text, meta, dist in zip(ids[0], docs[0], metas[0], dists[0]):
        hits.append({"id": chunk_id, "text": text, "distance": round(dist, 4), **meta})
    return hits
