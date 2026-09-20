# Mofid API Contract

Single source of truth for the backend's HTTP surface. `webapp/api.js`
(`ask`, `health`) is written against this. If the backend's shape and
this file ever disagree, **this file wins and the backend gets fixed**
the frontend is already built and tested against it.

Base URL: same origin as the webapp by default (`webapp/api.js`
`BASE_URL`), or an absolute URL if the API is hosted separately.

---

## `POST /ask`

Ask a question grounded in the loaded curriculum.

### Request

```json
{
  "question": "يعني إيه فيزياء كلاسيكية؟",
  "lang": "ar",
  "subject": "الفيزياء",
  "grade": "12"
}
```

| Field      | Type   | Required | Notes                                                                 |
|------------|--------|----------|------------------------------------------------------------------------|
| `question` | string | yes      | —                                                                      |
| `lang`     | string | no       | `"ar"` \| `"en"`. Accepted now; not yet used to change answer language, one Arabic curriculum is loaded for MVP. |
| `subject`  | string | no       | Narrows retrieval to one course. Must match the `subject` on the indexed chunks exactly (e.g. `"الفيزياء"`). Omit to search everything. |
| `grade`    | string | no       | Same as above (e.g. `"12"`).                                          |

### Response — `200`

```json
{
  "answer": "...",
  "in_curriculum": true,
  "citations": [
    {
      "id": "phy_g12_ch5_sec1",
      "subject": "الفيزياء",
      "grade": "12",
      "chapter": "الفصل الخامس: ازدواجية الموجة والجسيم",
      "section": "مقدمة",
      "text": "..."
    }
  ],
  "latency_ms": 842
}
```

| Field           | Type          | Notes                                                                                   |
|-----------------|---------------|------------------------------------------------------------------------------------------|
| `answer`        | string        | On refusal, the "not in curriculum" message.                                             |
| `in_curriculum` | bool          | `false` → frontend renders the refusal card, ignores `citations`.                        |
| `citations`     | array of chunk objects | **Full chunk objects, not strings.** `app.js` reads `.chapter` / `.section` off each one directly. Same shape as `content/physics_grade12.json` entries. |
| `latency_ms`    | int           | Wall-clock time for this request. Shown in the UI; also useful for our own tuning.       |

Frontend applies `??` fallbacks on all four fields, so a missing field won't
crash the UI, but it will silently render blank/empty, so match this shape
exactly rather than relying on that.

### Errors

Any non-2xx status. Frontend only checks `res.ok`; it doesn't parse a
specific error body shape today, but return `{"detail": "..."}` (FastAPI's
default) for anything we throw deliberately.

---

## `GET /health`

```json
{ "status": "ok", "chunks_indexed": 96 }
```

Frontend only checks that this resolves with a 2xx and JSON body, no
specific fields are required beyond that today. Keep `status`/`chunks_indexed`
anyway; useful for us and cheap to keep.

---

## `POST /upload_content`

Used by the teacher dashboard (Momen, workstream F) to add or update
curriculum chunks and re-index them. Not called by the student webapp.

**Requires auth** — see the Dashboard section below. Send
`Authorization: Bearer <token>`.

### Request

```json
{
  "chunks": [
    {
      "id": "phy_g12_ch5_sec1",
      "subject": "الفيزياء",
      "grade": "12",
      "chapter": "الفصل الخامس: ازدواجية الموجة والجسيم",
      "section": "مقدمة",
      "text": "..."
    }
  ]
}
```

Same chunk schema as `content/physics_grade12.json` — `id`, `subject`,
`grade`, `chapter`, `section`, `text`, all required strings.

### Response `200`

```json
{ "added": 1, "total_in_collection": 97 }
```

---

## Dashboard endpoints (Momen, workstream F)

Everything below is new surface for the teacher dashboard. None of it is
called by the student webapp — `webapp/api.js` never changes because of this
section.

### `POST /auth/login`

```json
{ "username": "teacher", "password": "..." }
```

Response — `200`:

```json
{ "token": "..." }
```

Response — `401` on bad credentials: `{"detail": "invalid credentials"}`.

One shared teacher account is fine for MVP; the account is seeded server-side
(not self-registered). Password stored as a hash, never plaintext.

### `POST /auth/logout`

`Authorization: Bearer <token>` required. `200` with an empty body on
success, invalidates the token immediately.

### Auth on every endpoint below

Every `/content/*`, `/analytics/*`, and `/upload_content` request requires
`Authorization: Bearer <token>`. Missing or invalid token → `401`
`{"detail": "unauthorized"}`.

### `GET /content`

List indexed chunks for the content management table.

Query params: `page` (int, default `1`), `page_size` (int, default `50`).

Response — `200`:

```json
{
  "chunks": [
    {
      "id": "phy_g12_ch5_sec1",
      "subject": "الفيزياء",
      "grade": "12",
      "chapter": "...",
      "section": "...",
      "text": "..."
    }
  ],
  "total": 96,
  "page": 1,
  "page_size": 50
}
```

### `PUT /content/{id}`

Edit a single chunk's text or metadata in place, then re-embed it.

Request body — same shape as one chunk in `/upload_content`, `id` in the
body must match the URL and is not itself changeable via this endpoint
(delete + re-add with a new id if the id itself needs to change):

```json
{
  "id": "phy_g12_ch5_sec1",
  "subject": "الفيزياء",
  "grade": "12",
  "chapter": "...",
  "section": "...",
  "text": "updated text..."
}
```

Response — `200`: `{"updated": true}`. Response — `404` if the id doesn't
exist: `{"detail": "chunk not found"}`.

### `DELETE /content/{id}`

Response — `200`: `{"deleted": true}`. Response — `404` if the id doesn't
exist.

### `POST /content/reindex`

Rebuilds embeddings for every chunk currently in the collection. For use
after bulk edits, or if the embedding model ever changes.

Response — `200`: `{"reindexed": 96}`.

### Document source upload (teacher content flow)

Uploaded source documents (PDF / DOCX / TXT) are the primary teacher content
flow. Each upload is parsed, split into chunks in the **same chunk schema**
(`id/subject/grade/chapter/section/text`) plus one extra metadata field
`source_doc`, indexed into the same collection, and recorded in a local
document registry (`work/documents.sqlite3` + `work/documents/` for the stored
file). `POST /upload_content` above remains as the JSON compatibility
fallback.

#### `POST /documents`

Multipart form (`Authorization: Bearer <token>` required):

| Field     | Type | Required | Notes |
|-----------|------|----------|-------|
| `file`    | file | yes      | `.pdf`, `.docx` or `.txt`, up to `MOFID_DOC_MAX_MB` (default 50) |
| `subject` | str  | no       | Indexed chunk `subject` (defaults to the filename stem) |
| `grade`   | str  | no       | Indexed chunk `grade` |
| `chapter` | str  | no       | Indexed chunk `chapter` (defaults to the filename stem) |

Response — `201`:

```json
{
  "document": {
    "id": "3f4a1c92be01",
    "title": "lasers",
    "filename": "lasers.pdf",
    "doc_type": "pdf",
    "subject": "الفيزياء",
    "grade": "12",
    "chapter": "lasers",
    "status": "indexed",
    "chunk_count": 14,
    "empty_pages": 0,
    "created_at": "2026-09-18T20:00:00+00:00",
    "indexed_at": "2026-09-18T20:00:00+00:00"
  },
  "indexed": 14,
  "empty_pages": 0,
  "total_in_collection": 97
}
```

`400` when the file has no extractable text (scanned pages need the OCR tool
in `tools/extract_pdf.py` — the upload is rejected, not half-indexed).

#### `GET /documents`

List documents, newest first: `{ "documents": [...same shape...], "count": 0 }`.

#### `GET /documents/{doc_id}`

Document record plus its indexed chunks (chunk order == source order):
`{ ...document fields..., "chunks": [{ "id", "subject", "grade", "chapter", "section", "text", "source_doc" }] }`.

#### `DELETE /documents/{doc_id}`

Deletes the document's chunks from the collection and the stored file.
Response — `200`: `{"deleted": "<doc_id>", "chunks_removed": 14, "total_in_collection": 96}`.

#### `GET /documents/{doc_id}/search?q=<text>&n=<int>`

Semantic search **confined to one document**. Returns every match with its
embedding distance (no curriculum threshold — the teacher is browsing inside
the source, not asking the tutor):

```json
{
  "document_id": "3f4a1c92be01",
  "query": "ليزر",
  "hits": [
    { "id": "doc_lasers_3f4a1c92be01_ch02", "text": "...", "distance": 0.34, "subject": "الفيزياء",
      "grade": "12", "chapter": "lasers", "section": "مقاطع المستند", "source_doc": "3f4a1c92be01" }
  ]
}
```

### `GET /analytics/faq`

Query params: `days` (int, default `7`).

Response — `200`:

```json
{
  "period_days": 7,
  "top_questions": [
    { "question": "يعني إيه فيزياء كلاسيكية؟", "count": 14 }
  ]
}
```

Questions are grouped by exact text match for MVP — no fuzzy clustering of
near-duplicate phrasings yet (that's the Phase 2
`/analytics/misconceptions` work below).

### `GET /analytics/usage`

Response — `200`:

```json
{
  "questions_today": 42,
  "questions_this_week": 210,
  "refusal_rate": 0.12,
  "avg_latency_ms": 780
}
```

`refusal_rate` is the fraction of questions in the last 7 days where
`in_curriculum` was `false`.

### `GET /analytics/misconceptions` — Phase 2, not MVP

Not implemented for the hackathon demo. Placeholder so the shape is agreed
in advance:
{
  "clusters": [
    { "representative_question": "...", "similar_count": 6, "chunk_ids_considered": ["..."] }
  ]
}
```

The implementation also exposes the following richer views used by the
expanded dashboard:

## `GET /faq`

Teacher dashboard (Momen, workstream F): most-asked questions and top chapters,
aggregated from the questions logged by every `/ask` call. The backend appends
each ask as one JSON line to the file at `MOFID_LOG_PATH` (default
`./work/faq/questions.jsonl`, gitignored). Refusals are logged too, so teachers
can spot off-curriculum questions that hint at missing content.

### Response `200`

```json
{
  "questions": [
    {
      "question": "يعني إيه فيزياء كلاسيكية؟",
      "count": 5,
      "in_curriculum": true,
      "last_asked_at": "2026-09-13T14:02:11+00:00"
    }
  ],
  "by_chapter": [
    { "chapter": "الفصل السابع: الليزر", "count": 17 }
  ],
  "chunks_indexed": 96
}
```

| Field          | Type     | Notes                                                       |
|----------------|----------|-------------------------------------------------------------|
| `questions`    | array    | Grouped by normalized question text; `count` desc.          |
| `by_chapter`   | array    | Chapter-name histogram; `count` desc.                       |
| `chunks_indexed` | int    | Same value as `/health`.                                    |

Optional `?n=` query param caps the number of returned rows (default = backend
`config.FAQ_TOP_N`, 20).

---

## `GET /teacher/analytics`

Filtered teacher analytics for trends and content-gap review.

Optional query parameters:

- `n`: maximum number of grouped questions and chapters.
- `subject`: exact indexed subject to include.
- `grade`: exact indexed grade to include.
- `days`: only include questions from the most recent number of days.

The response includes `questions`, `by_chapter`, daily `trends`, unresolved
out-of-curriculum questions, totals, and the subjects/grades present in the
filtered log.

---

## `GET /teacher/content`

Returns the indexed curriculum grouped into subject/grade courses. Each course
includes its chapter and chunk counts, alongside the total indexed chunk count.

---

## Teacher authentication and content management

The teacher dashboard uses a short-lived in-memory bearer session. The default
local account is `teacher` / `mofid`; override these before first launch with
`MOFID_TEACHER_USERNAME` and `MOFID_TEACHER_PASSWORD`. The password is stored
as a PBKDF2-SHA256 hash in the local SQLite file configured by
`MOFID_TEACHER_DB_PATH`.

- `POST /auth/login`: `{ "username": "...", "password": "..." }` -> `{ "token": "..." }`
- `POST /auth/logout`: invalidates the bearer token.
- `PUT /auth/password`: authenticated password change with
  `{ "current_password": "...", "new_password": "..." }`.

Dashboard endpoints require `Authorization: Bearer <token>`:

- `GET /content?limit=100&offset=0`: paginated indexed chunks.
- `POST /upload_content`: validates and upserts chunks.
- `PUT /content/{id}`: replaces one chunk and re-embeds it.
- `DELETE /content/{id}`: removes one indexed chunk.
- `POST /content/reindex`: re-embeds all indexed chunks.
- `GET /analytics/faq?days=7`: filtered FAQ and question-volume data.
- `GET /analytics/usage`: today/week totals, refusal rate, and average latency.
- `GET /teacher/analytics`: subject/grade/date-filtered analytics and unresolved questions.
- `GET /teacher/content`: subject/grade curriculum summaries.

---

## Internal / not part of this contract

- `GET /debug/chunk/{chunk_id}`: dev-only inspection endpoint used while
  building the RAG pipeline. Not called by any frontend. Keep it for
  debugging, but don't build against it.

---

## Status

- [x] Contract drafted from `webapp/api.js`'s `ask`/`health` and
      `app.js`'s citation rendering (`.chapter` / `.section` access).
- [x] Backend updated to match.
- [x] Verified against the gold set: request and response
      shapes, citations against `content/physics_grade12.json`, refusals, and
      CORS from the webapp origin.
- [x] `GET /faq` added for the teacher dashboard (question logging on `/ask`).
- [ ] Answer quality, which needs the real model rather than the retrieval
      layer alone.
- [ ] Dashboard endpoints above are a proposed contract, not yet built or
      verified — Momen to build backend + frontend against this, flag
      anything that needs to change before locking further.
