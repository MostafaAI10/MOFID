"""
Question logging and FAQ aggregation for the teacher dashboard.

Every /ask call is appended as one JSON line to a JSONL file under work/ (which
is gitignored), so nothing needs a database and everything survives offline.
The dashboard's GET /faq reads that file back and aggregates:
  - by question (grouped by textnorm.normalise so Arabic noise is ignored)
  - by chapter  (which topics students actually ask about)
"""

import datetime
import json
import os
import sqlite3
import threading

from backend import config
from backend.textnorm import normalise

_lock = threading.Lock()


def log_question(
    *,
    question: str,
    lang: str,
    subject: str | None,
    grade: str | None,
    in_curriculum: bool,
    latency_ms: int,
    chapters: list[str],
    sections: list[str],
) -> None:
    path = config.FAQ_LOG_PATH
    entry = {
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "question": question,
        "lang": lang,
        "subject": subject,
        "grade": grade,
        "in_curriculum": bool(in_curriculum),
        "latency_ms": latency_ms,
        "chapters": chapters,
        "sections": sections,
    }
    with _lock:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _read_log() -> list[dict]:
    database = config.TEACHER_DB_PATH
    if os.path.exists(database):
        with sqlite3.connect(database) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute("SELECT * FROM question_log ORDER BY timestamp").fetchall()
        return [
            {
                "ts": row["timestamp"],
                "question": row["question"],
                "lang": row["lang"],
                "subject": row["subject"],
                "grade": row["grade"],
                "in_curriculum": bool(row["in_curriculum"]),
                "latency_ms": row["latency_ms"],
                "chapters": (row["chapters"] or "").splitlines(),
                "sections": (row["sections"] or "").splitlines(),
            }
            for row in rows
        ]
    path = config.FAQ_LOG_PATH
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def top_questions(n: int | None = None) -> list[dict]:
    n = n or config.FAQ_TOP_N
    groups: dict[str, dict] = {}
    for e in _read_log():
        raw = (e.get("question") or "").strip()
        key = normalise(raw)
        if not key:
            continue
        g = groups.setdefault(
            key,
            {"question": raw, "count": 0, "in_curriculum": True, "last_asked_at": ""},
        )
        g["question"] = raw
        g["count"] += 1
        g["in_curriculum"] = bool(e.get("in_curriculum", True))
        ts = e.get("ts") or ""
        if ts > g["last_asked_at"]:
            g["last_asked_at"] = ts
    return sorted(groups.values(), key=lambda g: (-g["count"],))[:n]


def by_chapter(n: int | None = None) -> list[dict]:
    n = n or config.FAQ_TOP_N
    counts: dict[str, int] = {}
    for e in _read_log():
        for ch in e.get("chapters") or []:
            ch = (ch or "").strip()
            if ch:
                counts[ch] = counts.get(ch, 0) + 1
    return [
        {"chapter": ch, "count": c}
        for ch, c in sorted(counts.items(), key=lambda item: (-item[1],))
    ][:n]


def dashboard_data(
    n: int | None = None,
    subject: str | None = None,
    grade: str | None = None,
    days: int | None = None,
) -> dict:
    """Return one filtered analytics payload for the teacher workspace."""
    entries = _read_log()
    cutoff = None
    if days:
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)

    filtered = []
    for entry in entries:
        if subject and entry.get("subject") != subject:
            continue
        if grade and entry.get("grade") != grade:
            continue
        if cutoff:
            try:
                timestamp = datetime.datetime.fromisoformat(entry.get("ts", ""))
            except ValueError:
                continue
            if timestamp < cutoff:
                continue
        filtered.append(entry)

    groups: dict[str, dict] = {}
    chapter_counts: dict[str, int] = {}
    trend_counts: dict[str, int] = {}
    unresolved: list[dict] = []
    for entry in filtered:
        raw = (entry.get("question") or "").strip()
        key = normalise(raw)
        if key:
            group = groups.setdefault(key, {
                "question": raw,
                "count": 0,
                "in_curriculum": True,
                "last_asked_at": "",
                "subject": entry.get("subject"),
                "grade": entry.get("grade"),
            })
            group["question"] = raw
            group["count"] += 1
            group["in_curriculum"] = bool(entry.get("in_curriculum", True))
            group["last_asked_at"] = max(group["last_asked_at"], entry.get("ts") or "")
        if not entry.get("in_curriculum", True):
            unresolved.append({
                "question": raw,
                "asked_at": entry.get("ts", ""),
                "subject": entry.get("subject"),
                "grade": entry.get("grade"),
            })
        for chapter in entry.get("chapters") or []:
            chapter = (chapter or "").strip()
            if chapter:
                chapter_counts[chapter] = chapter_counts.get(chapter, 0) + 1
        try:
            day = datetime.datetime.fromisoformat(entry.get("ts", "")).date().isoformat()
            trend_counts[day] = trend_counts.get(day, 0) + 1
        except ValueError:
            pass

    questions = sorted(groups.values(), key=lambda item: (-item["count"], item["question"]))[: n or config.FAQ_TOP_N]
    chapters = [{"chapter": chapter, "count": count} for chapter, count in sorted(chapter_counts.items(), key=lambda item: (-item[1], item[0]))[: n or config.FAQ_TOP_N]]
    trends = [{"date": date, "count": trend_counts[date]} for date in sorted(trend_counts)]
    return {
        "questions": questions,
        "by_chapter": chapters,
        "trends": trends,
        "unresolved": unresolved[:100],
        "total_questions": len(filtered),
        "in_curriculum": sum(1 for entry in filtered if entry.get("in_curriculum", True)),
        "subjects": sorted({entry.get("subject") for entry in filtered if entry.get("subject")}),
        "grades": sorted({entry.get("grade") for entry in filtered if entry.get("grade")}),
    }