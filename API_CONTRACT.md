# Mofid API Contract

Single source of truth for the backend's HTTP surface. `webapp/api.js`
(`liveAsk`, `health`) is written against this. If the backend's shape and
this file ever disagree, **this file wins and the backend gets fixed** —
the frontend is already built and tested against it.

Base URL: same origin as the webapp by default (`webapp/api.js`
`CONFIG.BASE_URL`), or an absolute URL if the API is hosted separately.

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
| `lang`     | string | no       | `"ar"` \| `"en"`. Accepted now; not yet used to change answer language — one Arabic curriculum is loaded for MVP. |
| `subject`  | string | no       | Narrows retrieval when the box holds more than one curriculum. Ignored for MVP (single subject loaded). |
| `grade`    | string | no       | Same as above.                                                        |

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
crash the UI — but it will silently render blank/empty, so match this shape
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

Frontend only checks that this resolves with a 2xx and JSON body — no
specific fields are required beyond that today. Keep `status`/`chunks_indexed`
anyway; useful for us and cheap to keep.

---

## `POST /upload_content`

Used by the teacher dashboard (Momen, workstream F) to add or update
curriculum chunks and re-index them. Not called by the student webapp.

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

### Response — `200`

```json
{ "added": 1, "total_in_collection": 97 }
```

---

## Internal / not part of this contract

- `GET /debug/chunk/{chunk_id}` — dev-only inspection endpoint used while
  building the RAG pipeline. Not called by any frontend. Keep it for
  debugging, but don't build against it.
- `POST /transcribe` — voice input. Deferred; out of scope for now.
  `webapp/api.js` already has the client-side plumbing for it
  (`transcribe()`, `canTranscribe`) and degrades gracefully with a mock
  response and a visible notice when this endpoint doesn't exist, so
  nothing breaks by leaving it unimplemented.

---

## Status

- [x] Contract drafted from `webapp/api.js`'s `liveAsk`/`health` and
      `app.js`'s citation rendering (`.chapter` / `.section` access).
- [ ] Backend (`api_code` in `MOFID_Model_v02.ipynb`) updated to match —
      next step.
- [ ] Verified end-to-end with `MODE: "live"` against real gold-set
      questions.
