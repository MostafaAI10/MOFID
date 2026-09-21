"""
Mofid FastAPI backend.

Endpoint shapes here must match /API_CONTRACT.md at the repo root exactly -
webapp/api.js is written against that contract, not against this file.
"""

import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend import config, documents as doc_store, faq, teacher_store, textnorm
from backend.rag import (
    chunks_in_document,
    collection,
    delete_document,
    index_chunks,
    retrieve_context,
    search_document,
    update_document_metadata,
)

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


class DocumentUpdateRequest(BaseModel):
    title: str | None = None
    subject: str | None = None
    grade: str | None = None
    chapter: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


def teacher_user(authorization: str | None = Header(default=None)) -> str:
    token = authorization.removeprefix("Bearer ").strip() if authorization else None
    username = teacher_store.authenticate(token)
    if not username:
        raise HTTPException(status_code=401, detail="Teacher authentication required")
    return username


@app.get("/health")
def health():
    return {"status": "ok", "chunks_indexed": collection.count()}


@app.get("/curriculum")
def get_curriculum():
    """Public endpoint returning all indexed courses, subjects, grades, and metadata
    dynamically computed from all uploaded documents and core curriculum."""
    result = collection.get(include=["metadatas"])
    metas = result.get("metadatas") or []
    by_course = {}
    for meta in metas:
        subject = meta.get("subject", "غير محدد")
        grade = meta.get("grade", "غير محدد")
        chapter = meta.get("chapter", "غير محدد")
        key = f"{subject}|{grade}"
        if key not in by_course:
            by_course[key] = {
                "subject": subject,
                "grade": grade,
                "chapters": set(),
                "chunks": 0,
            }
        by_course[key]["chapters"].add(chapter)
        by_course[key]["chunks"] += 1

    courses = [
        {
            "subject": v["subject"],
            "grade": v["grade"],
            "chapters": len(v["chapters"]),
            "chunks": v["chunks"],
        }
        for v in by_course.values()
    ]
    meta = {
        "subjects": list({c["subject"] for c in courses}),
        "grades": list({c["grade"] for c in courses}),
        "chapters": sum(c["chapters"] for c in courses),
        "chunks": len(metas),
    }
    return {"courses": courses, "meta": meta, "chunks_indexed": len(metas)}


import random as _random
import hashlib as _hashlib

# --- Question templates keyed by language ---
_Q_TEMPLATES = {
    "ar": [
        "إيه هو {topic}؟",
        "اشرح {topic}",
        "ممكن توضحلي {topic}؟",
        "{topic} بيشتغل إزاي؟",
        "إيه أهمية {topic}؟",
        "إيه العلاقة بين {topic} و{topic2}؟",
        "إيه هي تطبيقات {topic}؟",
        "ليه {topic} مهم؟",
    ],
    "en": [
        "What is {topic}?",
        "Explain {topic}",
        "How does {topic} work?",
        "What is the importance of {topic}?",
        "What is the relationship between {topic} and {topic2}?",
        "What are the applications of {topic}?",
        "Why is {topic} important?",
    ],
}


def _clean_section(name: str) -> str:
    """Strip common prefixes/noise from section names to get a clean topic."""
    import re
    # Remove English terms in parentheses at the end, e.g. "ظاهرة كومبتون Compton Effect"
    # Keep the Arabic part
    cleaned = re.sub(r'\s*[A-Za-z][\w\s\-\'().]*$', '', name).strip()
    if not cleaned:
        cleaned = name.strip()
    # Remove leading "مقدمة" or "تلخيص" etc if that's the whole name
    if cleaned in ("مقدمة", "تلخيص", "مقاطع المستند"):
        return ""
    return cleaned


@app.get("/suggestions")
def get_suggestions(
    subject: str | None = None,
    grade: str | None = None,
    lang: str = "ar",
    n: int = 6,
):
    """Public endpoint returning dynamic question suggestions based on the
    actual indexed content. Scoped to subject/grade when provided."""
    from backend.rag import _scope_filter

    scope = _scope_filter(subject, grade)
    try:
        if scope:
            result = collection.get(where=scope, include=["metadatas"])
        else:
            result = collection.get(include=["metadatas"])
    except Exception:
        result = collection.get(include=["metadatas"])

    metas = result.get("metadatas") or []
    if not metas:
        return {"suggestions": []}

    # Collect unique section and chapter names as potential topics
    sections = set()
    chapters = set()
    for m in metas:
        sec = m.get("section", "")
        ch = m.get("chapter", "")
        cleaned_sec = _clean_section(sec)
        if cleaned_sec and len(cleaned_sec) > 3:
            sections.add(cleaned_sec)
        # Also extract chapter names without "الفصل X:" prefix
        import re
        ch_clean = re.sub(r'^الفصل\s+\S+\s*:\s*', '', ch).strip()
        if ch_clean and len(ch_clean) > 3 and ch_clean not in ("غير محدد",):
            chapters.add(ch_clean)

    topics = list(sections)
    if not topics:
        topics = list(chapters)
    if not topics:
        return {"suggestions": []}

    templates = _Q_TEMPLATES.get(lang, _Q_TEMPLATES["ar"])
    suggestions = []
    seen = set()

    # Deterministic but varied: seed with subject+grade so same scope = same suggestions
    seed = _hashlib.md5(f"{subject}|{grade}|{lang}".encode()).hexdigest()
    rng = _random.Random(seed)

    # Shuffle topics for variety
    rng.shuffle(topics)

    for topic in topics:
        if len(suggestions) >= n * 3:  # generate more than needed, we'll pick best
            break
        for tmpl in rng.sample(templates, min(2, len(templates))):
            if "{topic2}" in tmpl:
                # Need a second topic
                others = [t for t in topics if t != topic]
                if others:
                    topic2 = rng.choice(others)
                    q = tmpl.format(topic=topic, topic2=topic2)
                else:
                    continue
            else:
                q = tmpl.format(topic=topic)
            if q not in seen:
                seen.add(q)
                suggestions.append(q)

    # Pick n suggestions, favoring variety
    if len(suggestions) > n:
        suggestions = rng.sample(suggestions, n)

    return {"suggestions": suggestions}


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    start = time.monotonic()
    chunks, metas = retrieve_context(
        req.question, subject=req.subject, grade=req.grade
    )

    if not chunks:
        resp = AskResponse(
            answer=config.REFUSAL_MESSAGE,
            in_curriculum=False,
            citations=[],
            latency_ms=int((time.monotonic() - start) * 1000),
        )
        _log_ask(req, resp)
        return resp

    context_text = "\n\n".join(chunks)
    citations = [Citation(text=chunk, **meta) for chunk, meta in zip(chunks, metas)]

    system_prompt = config.SYSTEM_PROMPT_TEMPLATE.format(context=context_text)

    if config.LLM_MODE == "retrieval":
        resp = AskResponse(
            answer="\n\n".join(chunks),
            in_curriculum=True,
            citations=citations,
            latency_ms=int((time.monotonic() - start) * 1000),
        )
        _log_ask(req, resp)
        return resp

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
                "temperature": config.LLM_TEMPERATURE,
                "seed": config.LLM_SEED,
            },
            timeout=200,
        )
        r.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Karnak server error: {exc}")

    raw_answer = r.json()["choices"][0]["message"]["content"].strip()

    
    if textnorm.normalise(raw_answer) == textnorm.normalise(config.REFUSAL_MESSAGE):
        resp = AskResponse(
            answer=config.REFUSAL_MESSAGE,
            in_curriculum=False,
            citations=[],
            latency_ms=int((time.monotonic() - start) * 1000),
        )
        _log_ask(req, resp)
        return resp

    resp = AskResponse(
        answer=raw_answer,
        in_curriculum=True,
        citations=citations,
        latency_ms=int((time.monotonic() - start) * 1000),
    )
    _log_ask(req, resp)
    return resp


def _log_ask(req: AskRequest, resp: AskResponse) -> None:
    try:
        timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        faq.log_question(
            question=req.question,
            lang=req.lang,
            subject=req.subject,
            grade=req.grade,
            in_curriculum=resp.in_curriculum,
            latency_ms=resp.latency_ms,
            chapters=[c.chapter for c in resp.citations],
            sections=[c.section for c in resp.citations],
        )
        teacher_store.log_question(
            question=req.question,
            timestamp=timestamp,
            in_curriculum=resp.in_curriculum,
            matched_chunk_ids=[c.id for c in resp.citations],
            lang=req.lang,
            subject=req.subject,
            grade=req.grade,
            latency_ms=resp.latency_ms,
            chapters=[c.chapter for c in resp.citations],
            sections=[c.section for c in resp.citations],
        )
    except Exception:
        pass


@app.post("/auth/login")
def auth_login(req: LoginRequest):
    token = teacher_store.login(req.username, req.password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid teacher credentials")
    return {"token": token, "username": req.username}


@app.post("/auth/logout")
def auth_logout(_: str = Depends(teacher_user), authorization: str | None = Header(default=None)):
    token = authorization.removeprefix("Bearer ").strip() if authorization else None
    if token:
        teacher_store.logout(token)
    return {"ok": True}


@app.put("/auth/password")
def auth_password(req: PasswordChangeRequest, username: str = Depends(teacher_user)):
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    if not teacher_store.change_password(username, req.current_password, req.new_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    return {"ok": True}


@app.post("/upload_content")
def upload_content(req: UploadRequest, _: str = Depends(teacher_user)):
    chunks = [c.model_dump() for c in req.chunks]
    total = index_chunks(chunks)
    return {"added": len(chunks), "total_in_collection": total}


@app.get("/content")
def list_content(page: int = 1, page_size: int = 50, _: str = Depends(teacher_user)):
    if page < 1 or page_size < 1 or page_size > 500:
        raise HTTPException(status_code=400, detail="Invalid page or page_size")
    offset = (page - 1) * page_size
    result = collection.get(include=["documents", "metadatas"])
    documents = result.get("documents") or []
    metadata = result.get("metadatas") or []
    ids = result.get("ids") or []
    chunks = []
    for chunk_id, text, meta in zip(ids[offset:offset + page_size], documents[offset:offset + page_size], metadata[offset:offset + page_size]):
        chunks.append({"id": chunk_id, "text": text, **meta})
    return {"chunks": chunks, "total": len(ids), "page": page, "page_size": page_size}


@app.put("/content/{chunk_id}")
def update_content(chunk_id: str, chunk: ContentChunk, _: str = Depends(teacher_user)):
    if chunk.id != chunk_id:
        raise HTTPException(status_code=400, detail="Chunk id in path and body must match")
    index_chunks([chunk.model_dump()])
    return {"updated": chunk_id, "total_in_collection": collection.count()}


@app.delete("/content/{chunk_id}")
def delete_content(chunk_id: str, _: str = Depends(teacher_user)):
    existing = collection.get(ids=[chunk_id])
    if not existing.get("ids"):
        raise HTTPException(status_code=404, detail="Chunk not found")
    collection.delete(ids=[chunk_id])
    return {"deleted": chunk_id, "total_in_collection": collection.count()}


@app.post("/content/reindex")
def reindex_content(_: str = Depends(teacher_user)):
    result = collection.get(include=["documents", "metadatas"])
    chunks = [
        {"id": chunk_id, "text": text, **meta}
        for chunk_id, text, meta in zip(result.get("ids") or [], result.get("documents") or [], result.get("metadatas") or [])
    ]
    total = index_chunks(chunks) if chunks else 0
    return {"reindexed": len(chunks), "total_in_collection": total}


def _doc_type_from_filename(filename: str) -> str | None:
    suffix = Path(filename).suffix.lower()
    for kind, ext in (("pdf", ".pdf"), ("docx", ".docx"), ("txt", ".txt")):
        if suffix == ext:
            return kind
    return None


def _meaningful_text(text: str) -> str:
    """Document text without the page-marker furniture used by extraction."""
    return re.sub(r"=== PAGE \d+ ===|\[empty page[^\]]*\]", "", text).strip()


@app.post("/documents", status_code=201)
async def upload_document(
    file: UploadFile,
    subject: str | None = Form(default=None),
    grade: str | None = Form(default=None),
    chapter: str | None = Form(default=None),
    _: str = Depends(teacher_user),
):
    """Upload a source document (PDF / DOCX / TXT), parse it, split it into
    standard-schema chunks and index them into the collection. The document is
    stored as-is under work/documents so the teacher can inspect the source."""
    filename = file.filename or ""
    doc_type = _doc_type_from_filename(filename)
    if not doc_type:
        raise HTTPException(
            status_code=400,
            detail="امتداد الملف غير مدعوم. يرجى رفع PDF أو DOCX أو TXT.",
        )

    content = await file.read()
    if len(content) > config.MAX_DOCUMENT_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"الملف أكبر من الحد المسموح ({config.MAX_DOCUMENT_MB}MB).",
        )

    stored_path = doc_store.document_storage_path(filename)
    stored_path.write_bytes(content)
    try:
        text, empty_pages = doc_store.parse_document(stored_path, doc_type)
    except Exception as exc:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"تعذّر قراءة الملف: {exc}")

    meaningful = _meaningful_text(text)
    if len(meaningful.split()) < 15:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail="لا يحتوي الملف على نص قابل للاستخراج (غالبًا ممسوح ضوئيًا). "
                   "يتطلب هذا المستند OCR. تم إلغاء الرفع.",
        )

    doc_id = doc_store.new_document_id()
    title = Path(filename).stem
    prefix = f"{doc_store.chunk_prefix(title)}_{doc_id}"
    chunks = doc_store.chunk_text(
        text,
        subject=(subject or "").strip() or "غير محدد",
        grade=(grade or "").strip() or "غير محدد",
        chapter=(chapter or "").strip() or title,
        section="مقاطع المستند",
        prefix=prefix,
        source_doc=doc_id,
    )
    if not chunks:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail="لم يُستخرج نص كافٍ لتكوين مقاطع. يرجى مراجعة الملف.",
        )

    total = index_chunks(chunks)
    doc_store.save_document_record(
        doc_id=doc_id,
        title=title,
        filename=filename,
        stored_name=stored_path.name,
        doc_type=doc_type,
        subject=(subject or "").strip() or "غير محدد",
        grade=(grade or "").strip() or "غير محدد",
        chapter=(chapter or "").strip() or title,
        chunk_count=len(chunks),
        empty_pages=empty_pages,
    )
    record = doc_store.get_document(doc_id) or {}
    return {
        "document": {k: v for k, v in record.items() if k != "stored_name"},
        "indexed": len(chunks),
        "empty_pages": empty_pages,
        "total_in_collection": total,
    }


@app.get("/documents")
def list_documents(_: str = Depends(teacher_user)):
    documents = [
        {k: v for k, v in item.items() if k != "stored_name"}
        for item in doc_store.list_documents()
    ]
    return {"documents": documents, "count": len(documents)}


@app.get("/documents/{doc_id}")
def get_document(doc_id: str, _: str = Depends(teacher_user)):
    record = doc_store.get_document(doc_id)
    if not record:
        raise HTTPException(status_code=404, detail="Document not found")
    return {**{k: v for k, v in record.items() if k != "stored_name"}, "chunks": chunks_in_document(doc_id)}


@app.get("/documents/{doc_id}/file")
def get_document_file(doc_id: str, _: str = Depends(teacher_user)):
    record = doc_store.get_document(doc_id)
    if not record:
        raise HTTPException(status_code=404, detail="Document not found")
    stored_name = record.get("stored_name")
    if not stored_name:
        raise HTTPException(status_code=404, detail="No file associated with document")
    path = Path(config.DOCUMENTS_DIR) / stored_name
    if not path.is_file():
        content_path = Path(config.CONTENT_PATH)
        if stored_name == content_path.name and content_path.is_file():
            path = content_path
        else:
            raise HTTPException(status_code=404, detail="Stored file missing on disk")
    return FileResponse(
        path=path,
        filename=record.get("filename") or path.name,
        media_type="application/octet-stream",
    )


@app.put("/documents/{doc_id}")
def update_document_endpoint(doc_id: str, req: DocumentUpdateRequest, _: str = Depends(teacher_user)):
    record = doc_store.get_document(doc_id)
    if not record:
        raise HTTPException(status_code=404, detail="Document not found")
    doc_store.update_document_record(
        doc_id,
        title=req.title,
        subject=req.subject,
        grade=req.grade,
        chapter=req.chapter,
    )
    if doc_id != "core_physics_g12":
        update_document_metadata(
            doc_id,
            subject=req.subject,
            grade=req.grade,
            chapter=req.chapter,
        )
    return {"updated": doc_id, "document": doc_store.get_document(doc_id)}


@app.delete("/documents/{doc_id}")
def remove_document(doc_id: str, _: str = Depends(teacher_user)):
    if doc_id == "core_physics_g12":
        raise HTTPException(status_code=400, detail="لا يمكن حذف المنهج الأساسي")
    if not doc_store.get_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    removed = delete_document(doc_id)
    doc_store.delete_document_record(doc_id)
    return {"deleted": doc_id, "chunks_removed": removed, "total_in_collection": collection.count()}


@app.get("/documents/{doc_id}/search")
def search_document_endpoint(
    doc_id: str,
    q: str,
    n: int = 10,
    _: str = Depends(teacher_user),
):
    """Semantic search confined to one uploaded document. No-holds-barred:
    returns every match with its embedding distance, closest first, so the
    teacher can see what the tutor would retrieve for a question."""
    if not doc_store.get_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    if not q.strip():
        return {"document_id": doc_id, "hits": []}
    hits = search_document(q.strip(), doc_id, top_k=max(1, min(n, 50)))
    return {"document_id": doc_id, "query": q.strip(), "hits": hits}


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


@app.get("/faq")
def faq_endpoint(n: int | None = None, _: str = Depends(teacher_user)):
    """Teacher dashboard: most-asked questions and top chapters, aggregated
    from the questions logged by /ask."""
    return {
        "questions": faq.top_questions(n),
        "by_chapter": faq.by_chapter(n),
        "chunks_indexed": collection.count(),
    }


@app.get("/teacher/analytics")
def teacher_analytics(
    n: int | None = None,
    subject: str | None = None,
    grade: str | None = None,
    days: int | None = None,
    _: str = Depends(teacher_user),
):
    """Filtered teacher analytics, trends, and unresolved questions."""
    return faq.dashboard_data(n=n, subject=subject, grade=grade, days=days)


@app.get("/teacher/content")
def teacher_content(_: str = Depends(teacher_user)):
    """Summarize the indexed curriculum for the teacher content library."""
    result = collection.get(include=["metadatas"])
    metadata = result.get("metadatas") or []
    groups: dict[tuple[str, str], dict] = {}
    for item in metadata:
        subject = item.get("subject", "غير محدد")
        grade = item.get("grade", "غير محدد")
        key = (subject, grade)
        group = groups.setdefault(key, {"subject": subject, "grade": grade, "chunks": 0, "chapters": set()})
        group["chunks"] += 1
        if item.get("chapter"):
            group["chapters"].add(item["chapter"])
    courses = [
        {**group, "chapters": len(group["chapters"])}
        for group in groups.values()
    ]
    return {"courses": courses, "chunks_indexed": collection.count()}


@app.get("/analytics/usage")
def analytics_usage(_: str = Depends(teacher_user)):
    data = faq.dashboard_data(days=7, n=config.FAQ_TOP_N)
    return {
        "questions_today": faq.dashboard_data(days=1)["total_questions"],
        "questions_this_week": data["total_questions"],
        "refusal_rate": round(1 - (data["in_curriculum"] / data["total_questions"]), 4) if data["total_questions"] else 0,
        "avg_latency_ms": teacher_store.average_latency(),
    }


@app.get("/analytics/faq")
def analytics_faq(days: int = 7, n: int | None = None, _: str = Depends(teacher_user)):
    data = faq.dashboard_data(n=n, days=days)
    return {
        "period_days": days,
        "top_questions": [
            {"question": item["question"], "count": item["count"]}
            for item in data["questions"]
        ],
        "by_chapter": data["by_chapter"],
    }


_dashboard_root = os.path.realpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dashboard")
)
_dashboard_dir = os.path.join(_dashboard_root, "dist")
if not os.path.isdir(_dashboard_dir):
    _dashboard_dir = _dashboard_root


@app.get("/dashboard", include_in_schema=False)
async def _dashboard_redirect():
    return RedirectResponse(url="/dashboard/")


app.mount("/dashboard", StaticFiles(directory=_dashboard_dir, html=True), name="dashboard")

_webapp_dir = os.path.realpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "webapp")
)
app.mount("/", StaticFiles(directory=_webapp_dir, html=True), name="webapp")
