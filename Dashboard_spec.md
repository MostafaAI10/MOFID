# Mofid Teacher Dashboard - Specification

For Momen (workstream F). Read alongside `/API_CONTRACT.md` this document
proposes additions.

## 1. Purpose & scope

A password-protected dashboard, running on the same local network/box as the
backend and student app, that lets a teacher manage curriculum content and see
what students are actually struggling with.

Scope is split the same way the rest of the project is an honest MVP, plus
a clearly separate Phase 2 list, rather than one undifferentiated feature
pile:

**Phase 1 (MVP / demo)**: auth, content management (add/edit/delete/list),
live FAQ view, basic usage stats.

**Phase 2 (post-hackathon roadmap)**: raw PDF/Word auto-chunking, multi-
teacher accounts, misconception clustering, content versioning/history.

---

## 2. Backend

### 2.1 Data model

Reuses the existing curriculum chunk schema exactly, no new shape to learn:

```json
{ "id": "...", "subject": "...", "grade": "...", "chapter": "...", "section": "...", "text": "..." }
```

Two new records, both stored in a local SQLite file (offline-friendly,
zero-config, no new service to run):

- **Question log**: `{id, question, timestamp, in_curriculum, matched_chunk_ids, lang}`. One row per `/ask` call. This is what the FAQ view reads from.
- **Teacher account**: `{username, password_hash}`. One shared teacher account is fine for MVP; per-teacher accounts are Phase 2.

### 2.2 Auth (resolves the open question from before)

Simple session-token auth, not a full OAuth stack matches an offline,
single-box deployment:

- `POST /auth/login` - `{username, password}` → `{token}`
- `POST /auth/logout`
- Every dashboard endpoint below requires `Authorization: Bearer <token>`
- Passwords stored as a hash (e.g. `passlib`/`bcrypt`), never plaintext, even for a single shared account
- Tokens can live in an in-memory dict with an expiry, no need for JWT/Redis at this scale

### 2.3 New endpoints (proposed additions to `API_CONTRACT.md`)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Get a session token |
| `POST` | `/auth/logout` | Invalidate a token |
| `GET` | `/content` | List all indexed chunks (paginated), for the management table |
| `POST` | `/upload_content` | Already built now requires auth |
| `PUT` | `/content/{id}` | Edit a chunk's text/metadata in place |
| `DELETE` | `/content/{id}` | Remove a chunk |
| `POST` | `/content/reindex` | Rebuild embeddings for all chunks (after bulk edits or an embedding-model change) |
| `GET` | `/analytics/faq?days=7` | Top N most-asked questions/topics in the period |
| `GET` | `/analytics/usage` | Total questions today/this week, refusal rate, avg latency |
| `GET` | `/analytics/misconceptions` | *(Phase 2)* clusters of refused/low-confidence questions, candidate curriculum gaps |

Real `PUT`/`DELETE` rather than "re-upload with the same id" cleaner
semantics for a dashboard a non-technical teacher is directly using.

### 2.4 Question logging

`/ask` needs one small, additive change: after each request, write a row to
the question log (question, timestamp, `in_curriculum`, matched chunk ids,
lang). This touches the core `/ask` handler, so worth a quick sync with
Mostafa before changing it — but the analytics endpoints that *read* this log
are entirely Momen's to own.

### 2.5 Security & robustness

- All inputs validated with Pydantic models, same pattern as the existing `ContentChunk`
- If teachers upload raw files (PDF/Word) rather than pre-chunked JSON (Phase 2), validate file type and size before processing
- Basic in-memory rate limiting is enough given this runs on a local network, not the public internet

---

## 3. Frontend

### 3.1 Screens

- **Login**
- **Content management** : table of chunks by chapter/section, search/filter, inline edit, delete, add-new form. Bulk upload from raw PDF/Word with auto-chunking is Phase 2 it's a real NLP task in its own right, not a small addition.
- **FAQ / analytics** : most-asked questions this week, refusal rate, a simple chart of question volume over time
- **Settings** : change password; connected-student count is a nice Phase 2 addition, not required for MVP

### 3.2 Conventions to match

- Talk to the backend only through a single API module, the same pattern Nayra used in `webapp/api.js` keeps a clean seam and makes future contract changes a one-file fix
- Offline-first: no external CDN dependencies at runtime, same constraint as the student app
- Arabic RTL support, matching the student app
- Built for a classroom PC/tablet, not mobile-first

---

## 4. Contract discipline

Before writing any frontend code, the endpoints in section 2.3 should be
finalized and appended to `API_CONTRACT.md` the same discipline that saved
the student-app integration from staying silently broken. Loop in Mostafa
before locking the shapes, since `/ask` and the shared chunk schema are his.

## 5. Suggested build order

1. Lock the new endpoints in `API_CONTRACT.md`
2. Backend: auth + content CRUD (reuses the existing `rag.py` indexing code)
3. Backend: question logging + analytics aggregation
4. Frontend: login + content management, tested against the real backend
5. Frontend: FAQ/analytics screens
6. Full integration test same rigor as the student-app live-mode flip
