"""
Mofid FastAPI backend.

Endpoint shapes here must match /API_CONTRACT.md at the repo root exactly -
webapp/api.js is written against that contract, not against this file.
"""

import time

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend import config
from backend.rag import collection, index_chunks, retrieve_context

app = FastAPI(title="Mofid API")


# The webapp is served from a different origin than this API during local
# dev/testing (static files vs uvicorn). Restrict to known origins once this
# moves beyond local testing.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    question: str
    lang: str = "ar"
    subject: str | None = None
    grade: str | None = None
    max_tokens: int = config.MAX_ANSWER_TOKENS


class Citation(BaseModel):
    id: str
    subject: str
    grade: str
    chapter: str
    section: str
    text: str


class AskResponse(BaseModel):
    answer: str
    in_curriculum: bool
    citations: list[Citation]
    latency_ms: int


class ContentChunk(BaseModel):
    id: str
    subject: str
    grade: str
    chapter: str
    section: str
    text: str


class UploadRequest(BaseModel):
    chunks: list[ContentChunk]


@app.get("/health")
def health():
    return {"status": "ok", "chunks_indexed": collection.count()}


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    start = time.monotonic()
    chunks, metas = retrieve_context(
        req.question, subject=req.subject, grade=req.grade
    )

    if not chunks:
        return AskResponse(
            answer=config.REFUSAL_MESSAGE,
            in_curriculum=False,
            citations=[],
            latency_ms=int((time.monotonic() - start) * 1000),
        )

    context_text = "\n\n".join(chunks)
    citations = [Citation(text=chunk, **meta) for chunk, meta in zip(chunks, metas)]

    system_prompt = config.SYSTEM_PROMPT_TEMPLATE.format(context=context_text)

    try:
        r = requests.post(
            config.KARNAK_URL,
            json={
                "model": "karnak",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": req.question},
                ],
                "max_tokens": req.max_tokens,
            },
            timeout=200,
        )
        r.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Karnak server error: {exc}")

    answer = r.json()["choices"][0]["message"]["content"]

    return AskResponse(
        answer=answer,
        in_curriculum=True,
        citations=citations,
        latency_ms=int((time.monotonic() - start) * 1000),
    )


@app.post("/upload_content")
def upload_content(req: UploadRequest):
    chunks = [c.model_dump() for c in req.chunks]
    total = index_chunks(chunks)
    return {"added": len(chunks), "total_in_collection": total}


@app.get("/debug/chunk/{chunk_id}")
def get_chunk(chunk_id: str):
    """Internal, dev-only inspection endpoint. Not part of API_CONTRACT.md -
    not called by any frontend, kept for debugging the RAG pipeline."""
    result = collection.get(ids=[chunk_id], include=["documents", "metadatas"])
    if not result["ids"]:
        return {"found": False}
    return {
        "found": True,
        "document": result["documents"][0],
        "metadata": result["metadatas"][0],
    }
