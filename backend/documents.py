"""
Document store and PDF/Word -> chunk ingestion pipeline for the teacher
workspace.

A teacher uploads a source document (PDF, DOCX or plain text) once; the
backend parses it, splits it into chunks, and indexes those chunks into the
same Chroma collection as the curriculum. The chunk schema is unchanged
(id/subject/grade/chapter/section/text) plus one extra metadata field,
``source_doc``, that ties every generated chunk back to the source document so
the library can list, inspect, search and delete per document without touching
the curriculum chunks.

The file itself is stored under MOFID_DOCUMENTS_DIR (default ./work/documents)
and the registry lives in a small SQLite file (MOFID_DOCUMENTS_DB_PATH).
"""

import re
import sqlite3
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path

from backend import config

PAGE_MARKER = "=== PAGE {} ==="

# Paragraphs meaningfully below the prose target are kept; near-empty ones
# such as page footers are dropped before they pollute the index.
WORDS_MIN, WORDS_TARGET, WORDS_MAX = 40, 100, 160

ZERO_WIDTH = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060\ufeff]")
TATWEEL = "\u0640"
BLANK_LINES = re.compile(r"\n\s*\n")

DOC_TYPES = {"pdf", "docx", "txt"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    path = Path(config.DOCUMENTS_DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            filename TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            doc_type TEXT NOT NULL,
            subject TEXT NOT NULL DEFAULT '',
            grade TEXT NOT NULL DEFAULT '',
            chapter TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'indexed',
            chunk_count INTEGER NOT NULL DEFAULT 0,
            empty_pages INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            created_at TEXT NOT NULL,
            indexed_at TEXT
        )
        """
    )
    connection.commit()
    return connection


def _clean(text: str) -> str:
    """Normalise Arabic and tidy whitespace without changing the wording."""
    text = unicodedata.normalize("NFKC", text)
    text = ZERO_WIDTH.sub("", text)
    text = BLANK_LINES.sub("\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return text.strip()


def _word_count(text: str) -> int:
    return len([w for w in text.split() if w])


def _split_long_paragraph(text: str):
    """Split a long paragraph on sentence ends, keeping pieces near WORDS_MAX."""
    sentences = re.split(r"(?<=[.؟!])\s+", text)
    out, current = [], ""
    for sentence in sentences:
        candidate = (current + " " + sentence).strip()
        if current and _word_count(candidate) > WORDS_MAX:
            out.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        out.append(current)
    return out


def parse_pdf(path: Path) -> tuple[str, int]:
    """Extract the text layer of a PDF. Returns (text, empty_pages) where
    empty_pages counts pages that produced no extractable text (scanned
    images - those need the offline OCR tool in tools/extract_pdf.py)."""
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    parts = []
    empty = 0
    for number, page in enumerate(reader.pages, start=1):
        text = _clean(page.extract_text() or "")
        parts.append(PAGE_MARKER.format(number))
        if text:
            parts.append(text)
        else:
            empty += 1
            parts.append("[empty page - scanned image, needs OCR]")
    return "\n\n".join(parts), empty


def parse_docx(path: Path) -> tuple[str, int]:
    """Extract body paragraphs of a Word document. Returns (text, 0)."""
    import docx

    document = docx.Document(str(path))
    paragraphs = [p.text for p in document.paragraphs if p.text and p.text.strip()]
    return "\n\n".join(paragraphs), 0


def parse_txt(path: Path) -> tuple[str, int]:
    return path.read_text(encoding="utf-8", errors="replace"), 0


def parse_document(path: Path, doc_type: str) -> tuple[str, int]:
    """Dispatch to the right parser. Returns (text, empty_pages)."""
    if doc_type == "pdf":
        return parse_pdf(path)
    if doc_type == "docx":
        return parse_docx(path)
    return parse_txt(path)


def chunk_text(
    text: str,
    subject: str,
    grade: str,
    chapter: str,
    section: str,
    prefix: str,
    source_doc: str,
) -> list[dict]:
    """Split extracted document text into chunks in the standard curriculum
    schema (id/subject/grade/chapter/section/text) plus ``source_doc`` so the
    chunks stay traceable to the uploaded document."""
    paragraphs = [
        re.sub(r"\s+", " ", p).strip()
        for p in BLANK_LINES.split(text)
        if re.sub(r"\s+", " ", p).strip()
    ]
    prefix = prefix.strip().rstrip("_")
    chunks, index = [], 0

    def append(chunk_text_value: str):
        nonlocal index
        index += 1
        chunks.append(
            {
                "id": f"{prefix}_ch{index:02d}",
                "subject": subject,
                "grade": grade,
                "chapter": chapter,
                "section": section,
                "text": chunk_text_value,
                "source_doc": source_doc,
            }
        )

    for paragraph in paragraphs:
        count = _word_count(paragraph)
        if count < 8:
            continue
        if count <= WORDS_MAX:
            append(paragraph)
            continue
        for piece in _split_long_paragraph(paragraph):
            if _word_count(piece) >= 8:
                append(piece)
    return chunks


def new_document_id() -> str:
    return uuid.uuid4().hex[:12]


def save_document_record(
    *,
    doc_id: str,
    title: str,
    filename: str,
    stored_name: str,
    doc_type: str,
    subject: str,
    grade: str,
    chapter: str,
    chunk_count: int,
    empty_pages: int,
) -> str:
    now = _now()
    with _connect() as connection:
        connection.execute(
            "INSERT INTO documents (id, title, filename, stored_name, doc_type, "
            "subject, grade, chapter, status, chunk_count, empty_pages, "
            "created_at, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'indexed', "
            "?, ?, ?, ?)",
            (
                doc_id,
                title,
                filename,
                stored_name,
                doc_type,
                subject,
                grade,
                chapter,
                chunk_count,
                empty_pages,
                now,
                now,
            ),
        )
        connection.commit()
    return doc_id


def _row_to_dict(row) -> dict:
    return dict(row)


def list_documents() -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT * FROM documents ORDER BY created_at DESC"
        ).fetchall()
    return [_row_to_dict(row) for row in rows]


def get_document(doc_id: str) -> dict | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
    return _row_to_dict(row) if row else None


def delete_document_record(doc_id: str) -> bool:
    with _connect() as connection:
        row = connection.execute(
            "SELECT stored_name FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        if row is None:
            return False
        connection.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        connection.commit()
    stored = Path(config.DOCUMENTS_DIR) / row["stored_name"]
    stored.unlink(missing_ok=True)
    return True


def update_document_record(
    doc_id: str,
    *,
    title: str | None = None,
    subject: str | None = None,
    grade: str | None = None,
    chapter: str | None = None,
) -> bool:
    with _connect() as connection:
        updates = []
        params = []
        if title is not None:
            updates.append("title = ?")
            params.append(title.strip())
        if subject is not None:
            updates.append("subject = ?")
            params.append(subject.strip())
        if grade is not None:
            updates.append("grade = ?")
            params.append(grade.strip())
        if chapter is not None:
            updates.append("chapter = ?")
            params.append(chapter.strip())
        if not updates:
            return True
        params.append(doc_id)
        connection.execute(
            f"UPDATE documents SET {', '.join(updates)} WHERE id = ?",
            tuple(params),
        )
        connection.commit()
    return True


def document_storage_path(filename: str) -> Path:
    """Reserved, collision-free storage path for an uploaded file."""
    directory = Path(config.DOCUMENTS_DIR)
    directory.mkdir(parents=True, exist_ok=True)
    safe = Path(filename).name
    stored_name = f"{uuid.uuid4().hex[:8]}_{safe}"
    return directory / stored_name


def chunk_prefix(title: str) -> str:
    """A readable, stable id prefix for a document's chunks."""
    base = re.sub(r"\s+", "_", title.strip().lower())
    base = re.sub(r"[^a-z0-9_ء-ي-]", "", base)
    base = re.sub(r"_+", "_", base).strip("_")
    return f"doc_{base[:40]}" if base else "doc"