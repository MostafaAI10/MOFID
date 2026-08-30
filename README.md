# Mofid - MVP Work Plan (Hackathon Build)

**Goal:** Prove the core loop end-to-end, a student asks a question, gets a grounded, cited answer from the offline curriculum, fully demoed with no internet on stage.

**Scope:** One subject, one grade level, text-only, single laptop/desktop with one GPU.

**Team split:** Mostafa 45% · Nayra 27.5% · Momen 27.5%

---

## 1. Workstreams and Ownershio

| # | Workstream | Owner | Why this owner |
|---|---|---|---|
| A | LLM serving (Karnak-40B quantized via llama.cpp) | **Mostafa** | Backend/AI role, model + inference layer |
| B | RAG pipeline (chunking, embeddings, retrieval, citation logic) | **Mostafa** | Core AI grounding logic the heart of the "prove it's real" claim |
| C | Backend API (orchestrates LLM + RAG, serves the frontend, "not in curriculum" fallback) | **Mostafa** | Sits directly on top of A + B |
| D | Curriculum digitization (textbook chapters → clean text, chunked, tagged) | **Nayra** | Content prep, independent of code stack |
| E | Student web app (chat interface, connects over local hotspot) | **Nayra** | Frontend-facing, pairs naturally with content work once API contract is set |
| F | Teacher dashboard (upload new content, FAQ/most-asked-topics view) | **Momen** | Self-contained feature, own UI + own small backend endpoints |
| G | Local network / offline deployment (hotspot setup, on-device install, "airplane mode" rehearsal) | **Momen** | Infra/ops task, distinct skillset from D/E/F content work |
| H | Pitch deck + live demo script | **Shared** (Momen drafts, all review) | Needs input from every workstream but one clear pen-holder |

---

## 2. Task Breakdown by Person

### Mostafa (45%)
**Owns the AI core: model serving, RAG, and the API that ties everything together.**

1. Stand up llama.cpp locally, get quantized Karnak-40B running with acceptable latency on the target hardware (GPU + CPU-only quantization fallback tested).
2. Design the RAG pipeline: chunking strategy for textbook content, embedding model choice, local vector store (SQLite-Vec or ChromaDB).
3. Build retrieval logic: top-k chunk retrieval, relevance thresholding, source citation formatting (chapter/page reference returned with every answer).
4. Implement the "not in curriculum" fallback detect low-relevance retrieval and respond honestly instead of hallucinating.
5. Build the backend API (endpoints: ask question → retrieve → generate → return answer + citation).
6. Wire the API to accept new content uploads (used by Momen's teacher dashboard) and re-index automatically.
7. Own end-to-end latency and reliability tuning, this is what has to survive the live, offline demo.
8. Integration testing with Nayra's frontend and Momen's dashboard once their pieces are ready.

### Nayra (27.5%)
**Owns curriculum content and the student-facing app.**

1. Select and digitize the chosen subject/grade's official textbook chapters (clean text extraction, remove headers/footers/noise).
2. Structure and tag content (chapter, section, topic) in the format Mostafa's chunking pipeline expects coordinate on the exact schema early.
3. Build the student web app: chat interface, message history, citation display under each answer.
4. Make the app reachable over the local WiFi hotspot (lightweight, installable, works after first load per the offline-app requirement).
5. Basic UX polish: loading states, "thinking" indicator, clear display of the "not in curriculum" fallback message.
6. Test the app against real questions from the digitized chapters to catch gaps in content coverage.

### Momen (27.5%)
**Owns the teacher dashboard, offline deployment, and demo readiness.**

1. Build the teacher dashboard UI: file upload for new content, simple most-asked-topics/FAQ list view.
2. Build the small backend endpoints the dashboard needs (upload handling, FAQ aggregation from logged questions) coordinate with Mostafa on the API contract.
3. Set up the local network layer: box broadcasts its own WiFi hotspot, confirm devices can join and reach the app with zero internet.
4. Full offline rehearsal: WiFi/data disabled on the presenting machine and on audience devices, confirm nothing breaks.
5. First draft of the pitch deck (problem, solution, architecture diagram, demo flow, impact) owns the deck, pulls content from all three of us.
6. Own the live demo script/runbook: what gets shown, in what order, backup plan if something glitches on stage.

---

## 3. Suggested Sequence

1. **Kickoff (all):** Lock the subject + grade level, lock the content schema (chunk format, metadata fields) so Mostafa's pipeline and Nayra's digitization work don't diverge.
2. **Parallel build:**
   - Mostafa → LLM serving, then RAG pipeline, then API.
   - Nayra → digitizes content in parallel with Mostafa's early pipeline work, then builds the chat UI once the API contract is stable.
   - Momen → builds the dashboard UI and sets up offline networking in parallel; doesn't block on Mostafa/Nayra until the API contract lands.
3. **Integration:** Wire student app + teacher dashboard to the real API. Fix seams.
4. **Offline hardening:** Full airplane-mode rehearsal on real hardware, multiple times.
5. **Polish + deck:** Final UX pass, pitch deck finalized, demo script rehearsed live at least twice end-to-end.

---

## 4. Where We Start Together

Given your 45% covers the AI core (A, B, C), that's the natural place for us to work through first, it's also the highest-risk, highest-dependency part, since Nayra and Momen's pieces both plug into your API. I'd suggest we start with **local Karnak serving via llama.cpp**, then move into the **RAG pipeline design**, so your teammates have a stable contract to build against as early as possible.

Ready to start on Task 1 (llama.cpp + Karnak setup) whenever you are.
