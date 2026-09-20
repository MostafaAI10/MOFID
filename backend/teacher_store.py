"""Offline SQLite storage and session auth for the teacher workspace."""

import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from pathlib import Path

from backend import config

_SESSIONS: dict[str, tuple[str, float]] = {}
_SESSION_TTL = 8 * 60 * 60


def _connect() -> sqlite3.Connection:
    path = Path(config.TEACHER_DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("""
        CREATE TABLE IF NOT EXISTS teacher_accounts (
            username TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS question_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            in_curriculum INTEGER NOT NULL,
            matched_chunk_ids TEXT NOT NULL,
            lang TEXT NOT NULL,
            subject TEXT,
            grade TEXT,
            latency_ms INTEGER NOT NULL,
            chapters TEXT NOT NULL DEFAULT '',
            sections TEXT NOT NULL DEFAULT ''
        )
    """)
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(question_log)")}
    if "chapters" not in columns:
        connection.execute("ALTER TABLE question_log ADD COLUMN chapters TEXT NOT NULL DEFAULT ''")
    if "sections" not in columns:
        connection.execute("ALTER TABLE question_log ADD COLUMN sections TEXT NOT NULL DEFAULT ''")
    connection.commit()
    return connection


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 240_000)
    return f"pbkdf2_sha256$240000${salt.hex()}${digest.hex()}"


def _check_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt_hex, digest_hex = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def ensure_default_account() -> None:
    username = os.environ.get("MOFID_TEACHER_USERNAME", "teacher")
    password = os.environ.get("MOFID_TEACHER_PASSWORD", "mofid")
    with _connect() as connection:
        if connection.execute("SELECT 1 FROM teacher_accounts LIMIT 1").fetchone() is None:
            connection.execute("INSERT INTO teacher_accounts VALUES (?, ?)", (username, _hash_password(password)))
            connection.commit()


def login(username: str, password: str) -> str | None:
    ensure_default_account()
    with _connect() as connection:
        row = connection.execute("SELECT password_hash FROM teacher_accounts WHERE username = ?", (username,)).fetchone()
    if row is None or not _check_password(password, row["password_hash"]):
        return None
    token = secrets.token_urlsafe(32)
    _SESSIONS[token] = (username, time.time() + _SESSION_TTL)
    return token


def logout(token: str) -> None:
    _SESSIONS.pop(token, None)


def change_password(username: str, current_password: str, new_password: str) -> bool:
    ensure_default_account()
    with _connect() as connection:
        row = connection.execute("SELECT password_hash FROM teacher_accounts WHERE username = ?", (username,)).fetchone()
        if row is None or not _check_password(current_password, row["password_hash"]):
            return False
        connection.execute("UPDATE teacher_accounts SET password_hash = ? WHERE username = ?", (_hash_password(new_password), username))
        connection.commit()
    return True


def authenticate(token: str | None) -> str | None:
    if not token:
        return None
    session = _SESSIONS.get(token)
    if not session:
        return None
    username, expires_at = session
    if expires_at <= time.time():
        _SESSIONS.pop(token, None)
        return None
    return username


def log_question(*, question: str, timestamp: str, in_curriculum: bool, matched_chunk_ids: list[str], lang: str, subject: str | None, grade: str | None, latency_ms: int, chapters: list[str] | None = None, sections: list[str] | None = None) -> None:
    ensure_default_account()
    with _connect() as connection:
        connection.execute(
            "INSERT INTO question_log (question, timestamp, in_curriculum, matched_chunk_ids, lang, subject, grade, latency_ms, chapters, sections) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (question, timestamp, int(in_curriculum), "\n".join(matched_chunk_ids), lang, subject, grade, latency_ms, "\n".join(chapters or []), "\n".join(sections or [])),
        )
        connection.commit()


def average_latency(days: int = 7) -> int:
    ensure_default_account()
    with _connect() as connection:
        row = connection.execute("SELECT AVG(latency_ms) AS average FROM question_log WHERE timestamp >= datetime('now', ?)", (f"-{days} days",)).fetchone()
    return round(row["average"] or 0)
