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

```json
{
  "clusters": [
    { "representative_question": "...", "similar_count": 6, "chunk_ids_considered": ["..."] }
  ]
}
```

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
- [ ] Answer quality, which needs the real model rather than the retrieval
      layer alone.
- [ ] Dashboard endpoints above are a proposed contract, not yet built or
      verified — Momen to build backend + frontend against this, flag
      anything that needs to change before locking further.
