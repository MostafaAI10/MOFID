#!/usr/bin/env python3
"""
Mofid - curriculum chunk validator (Workstream D).

Checks a digitized curriculum JSON file against the checklist in section 7 of
the Mofid Content Guide. The schema is exactly the 6 fields the guide defines:
id, subject, grade, chapter, section, text. Anything else is flagged as an extra.

Usage:
    python tools/validate_chunks.py content/physics_grade12.json
    python tools/validate_chunks.py content/physics_grade12.json --gold eval/gold_set.json

Exit code is 0 when there are no errors, 1 otherwise. Warnings never fail.
"""
import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

REQUIRED_FIELDS = ("id", "subject", "grade", "chapter", "section", "text")

# sci_g9_ch1_sec2  /  sci_g9_ch1_sec2_a  /  sci_g9_ch1_sec2_p1
ID_RE = re.compile(r"^[a-z]+_g\d+_ch\d+_sec\d+(?:_[a-z0-9]+)?$")

WORDS_WARN_LOW, WORDS_WARN_HIGH = 50, 150     # the guide's target range
WORDS_ERR_LOW, WORDS_ERR_HIGH = 15, 400       # clearly broken

ARABIC = re.compile(r"[؀-ۿ]")
LATIN = re.compile(r"[A-Za-z]")
# Presentation forms: a sign the PDF was extracted without normalisation
PRESENTATION_FORMS = re.compile(r"[ﭐ-﷿ﹰ-﻿]")
ZERO_WIDTH = re.compile(r"[​-‏‪-‮﻿]")
TATWEEL = "ـ"
DIACRITICS = re.compile(r"[ً-ْٰ]")

# Leftover page furniture the guide says must not appear inside `text`
FURNITURE = [
    (re.compile(r"^\s*\d{1,4}\s*$", re.M), "a line containing only a number (page number?)"),
    (re.compile(r"continued on next page", re.I), "an English 'continued' note"),
    (re.compile(r"(?:^|\n)\s*(?:يتبع|تابع)\b"), "a line starting with an Arabic 'continued' note"),
    (re.compile(r"صفحة\s*\d+"), "an Arabic 'safha N' page marker"),
    (re.compile(r"\x0c"), "a form-feed character"),
]

# Openers that break the "self-contained chunk" rule
BACKREFS = [
    "كما ذكرنا",   # kama zakarna
    "كما سبق",               # kama sabaq
    "مما سبق",               # mimma sabaq
    "كما رأينا",   # kama ra'ayna
    "as mentioned",
    "as we saw",
    "as discussed",
]

# Arabic ordinals, so "al-fasl al-awwal" is recognised as chapter 1
ARABIC_ORDINALS = {
    "الأول": 1,
    "الثاني": 2,
    "الثالث": 3,
    "الرابع": 4,
    "الخامس": 5,
    "السادس": 6,
    "السابع": 7,
    "الثامن": 8,
    "التاسع": 9,
    "العاشر": 10,
}


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, where, msg):
        self.errors.append((where, msg))

    def warn(self, where, msg):
        self.warnings.append((where, msg))


def normalise(s):
    """Loose form used only to detect 'same label spelled two ways'."""
    s = unicodedata.normalize("NFKC", s)
    s = DIACRITICS.sub("", s).replace(TATWEEL, "")
    s = re.sub("[أإآ]", "ا", s)   # alef variants -> plain alef
    s = re.sub(r"\s+", " ", s).strip().strip(".:-،").casefold()
    return s


def chapter_number(label):
    """Pull a chapter number out of an English or Arabic chapter label."""
    m = re.search(r"\d+", label)
    if m:
        return int(m.group())
    for word, num in ARABIC_ORDINALS.items():
        if word in label:
            return num
    return None


def word_count(text):
    return len([w for w in re.split(r"\s+", text.strip()) if w])


def check_structure(data, rep):
    """Return a list of (index, chunk) pairs, or None if the file shape is unusable."""
    if not isinstance(data, list):
        rep.error("file", "top level must be a JSON array [ ... ], got "
                          f"{type(data).__name__}")
        return None
    if not data:
        rep.error("file", "the file is an empty array - no chunks to check")
        return None
    ok = []
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            rep.error(f"item #{i}", f"expected an object, got {type(item).__name__}")
            continue
        ok.append((i, item))
    return ok


def check_fields(idx, chunk, rep):
    where = chunk.get("id") or f"item #{idx}"
    for field in REQUIRED_FIELDS:
        if field not in chunk:
            rep.error(where, f"missing required field `{field}`")
            continue
        value = chunk[field]
        if not isinstance(value, str):
            rep.error(where, f"`{field}` must be a string, got {type(value).__name__}")
        elif not value.strip():
            rep.error(where, f"`{field}` is empty")
    for extra in sorted(set(chunk) - set(REQUIRED_FIELDS)):
        rep.warn(where, f"unexpected extra field `{extra}` - the loader will ignore it")


def check_id(chunk, rep):
    cid = chunk.get("id")
    if not isinstance(cid, str) or not cid.strip():
        return
    if not ID_RE.match(cid):
        rep.warn(cid, "id does not match subject_gN_chN_secN[_suffix] "
                      "(lowercase letters, digits and underscores only)")
        return
    grade = chunk.get("grade")
    m = re.search(r"_g(\d+)_", cid)
    if m and isinstance(grade, str) and grade.strip() and m.group(1) != grade.strip():
        rep.error(cid, f"id says grade {m.group(1)} but `grade` field says {grade!r}")
    chapter = chunk.get("chapter")
    m = re.search(r"_ch(\d+)_", cid)
    if m and isinstance(chapter, str):
        num = chapter_number(chapter)
        if num is not None and num != int(m.group(1)):
            rep.error(cid, f"id says chapter {m.group(1)} but `chapter` is {chapter!r}")


def check_text(chunk, rep):
    text = chunk.get("text")
    if not isinstance(text, str) or not text.strip():
        return
    where = chunk.get("id") or "?"

    n = word_count(text)
    if n < WORDS_ERR_LOW:
        rep.error(where, f"text is only {n} words - far below the 50-150 target")
    elif n > WORDS_ERR_HIGH:
        rep.error(where, f"text is {n} words - far above the 50-150 target, split it")
    elif n < WORDS_WARN_LOW:
        rep.warn(where, f"text is {n} words, below the 50-150 target")
    elif n > WORDS_WARN_HIGH:
        rep.warn(where, f"text is {n} words, above the 50-150 target")

    for pattern, label in FURNITURE:
        if pattern.search(text):
            rep.error(where, f"page furniture left in text: {label}")

    head = normalise(text)[:40]
    for opener in BACKREFS:
        if head.startswith(normalise(opener)):
            rep.warn(where, "text opens with a back-reference - chunks must stand alone")
            break

    if PRESENTATION_FORMS.search(text):
        rep.error(where, "text contains Arabic presentation forms (bad PDF extraction) - "
                         "re-extract with tools/extract_pdf.py, which normalises them")
    if ZERO_WIDTH.search(text):
        rep.warn(where, "text contains zero-width or bidi control characters")
    if TATWEEL * 2 in text:
        rep.warn(where, "text contains tatweel runs - usually an OCR artifact")

    arabic = len(ARABIC.findall(text))
    latin = len(LATIN.findall(text))
    if arabic and latin > arabic * 0.25:
        rep.warn(where, f"text has {latin} Latin letters vs {arabic} Arabic - "
                        "transliteration or OCR noise?")
    if not arabic and not latin:
        rep.error(where, "text has no letters at all")


def check_collection(chunks, rep):
    """Cross-chunk checks: uniqueness and consistent labelling."""
    ids = Counter(c.get("id") for _, c in chunks if isinstance(c.get("id"), str))
    for cid, count in ids.items():
        if count > 1:
            rep.error(cid, f"id used {count} times - every id must be unique")

    texts = defaultdict(list)
    for _, c in chunks:
        t = c.get("text")
        if isinstance(t, str) and t.strip():
            texts[normalise(t)].append(c.get("id"))
    for dupes in texts.values():
        if len(dupes) > 1:
            rep.warn(dupes[0], "identical text also in: "
                               + ", ".join(str(d) for d in dupes[1:]))

    for field in ("subject", "grade"):
        values = {c.get(field) for _, c in chunks if isinstance(c.get(field), str)}
        if len(values) > 1:
            rep.error("file", f"`{field}` is not consistent across the file: "
                              f"{sorted(values)!r} - one file per subject+grade")

    # "Chapter 1: ..." vs "Ch. 1: ..." -> same number, two spellings, two citations
    by_number = defaultdict(set)
    for _, c in chunks:
        label = c.get("chapter")
        if isinstance(label, str) and label.strip():
            num = chapter_number(label)
            by_number[num if num is not None else label].add(label.strip())
    for key, labels in by_number.items():
        if len(labels) > 1:
            rep.error("file", f"chapter {key} is written {len(labels)} different ways: "
                              f"{sorted(labels)!r} - these become two different citations")

    # The same section label must sit under one chapter only
    section_chapters = defaultdict(set)
    for _, c in chunks:
        sec, chapter = c.get("section"), c.get("chapter")
        if isinstance(sec, str) and isinstance(chapter, str):
            section_chapters[normalise(sec)].add(chapter.strip())
    for sec, chapters in section_chapters.items():
        if len(chapters) > 1:
            rep.warn("file", f"section {sec!r} appears under {len(chapters)} chapters: "
                             f"{sorted(chapters)!r}")


def check_gold_set(path, chunks, rep):
    try:
        gold = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        rep.error("gold set", f"{path} not found")
        return
    except json.JSONDecodeError as exc:
        rep.error("gold set", f"invalid JSON: {exc}")
        return

    if not isinstance(gold, list):
        rep.error("gold set", "top level must be a JSON array")
        return

    known = {c.get("id") for _, c in chunks}
    seen = set()
    for i, item in enumerate(gold):
        where = f"gold #{i}"
        if not isinstance(item, dict):
            rep.error(where, "expected an object")
            continue
        question = item.get("question")
        if not isinstance(question, str) or not question.strip():
            rep.error(where, "missing or empty `question`")
        else:
            key = normalise(question)
            if key in seen:
                rep.warn(where, f"duplicate question: {question!r}")
            seen.add(key)
        expected = item.get("expected_chunk_ids")
        refusal = item.get("expect_refusal") is True
        if not isinstance(expected, list):
            rep.error(where, "`expected_chunk_ids` must be an array of chunk ids")
            continue
        if refusal:
            # An out-of-curriculum question: the system must refuse, not retrieve
            if expected:
                rep.error(where, "expect_refusal is true, so `expected_chunk_ids` must be empty")
            continue
        if not expected:
            rep.error(where, "`expected_chunk_ids` is empty - add the chunk ids that answer "
                             'this, or set "expect_refusal": true for an out-of-curriculum question')
            continue
        for cid in expected:
            if cid not in known:
                rep.error(where, f"expected_chunk_ids references unknown chunk {cid!r}")
    if gold and len(gold) < 40:
        rep.warn("gold set", f"only {len(gold)} questions - aim for 40-50 so the "
                             "accuracy number is worth quoting")


def summarise(chunks):
    chapters = defaultdict(set)
    words = []
    for _, c in chunks:
        if isinstance(c.get("chapter"), str):
            chapters[c["chapter"]].add(c.get("section"))
        if isinstance(c.get("text"), str):
            words.append(word_count(c["text"]))
    lines = [f"  chunks    : {len(chunks)}",
             f"  chapters  : {len(chapters)}",
             f"  sections  : {sum(len(s) for s in chapters.values())}"]
    if words:
        lines.append(f"  words     : min {min(words)}, median "
                     f"{sorted(words)[len(words) // 2]}, max {max(words)}")
    for chapter in sorted(chapters, key=lambda c: (chapter_number(c) or 0, c)):
        lines.append(f"    - {chapter}  ({len(chapters[chapter])} sections)")
    return lines


def main():
    # Windows consoles default to cp1252 and crash on Arabic output
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(description="Validate a Mofid curriculum chunk file.")
    parser.add_argument("chunks", help="path to the chunk JSON file")
    parser.add_argument("--gold", help="optional gold-set JSON to cross-check against")
    args = parser.parse_args()

    path = Path(args.chunks)
    rep = Report()
    print(f"Mofid chunk validator - {path}\n")

    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        print(f"ERROR: {path} not found")
        return 1

    if raw.startswith(b"\xef\xbb\xbf"):
        rep.warn("file", "file starts with a UTF-8 BOM - save as plain UTF-8 without BOM")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        print(f"ERROR: file is not valid UTF-8 ({exc}). Re-save it as UTF-8.")
        return 1

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        print(f"ERROR: invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
        return 1

    chunks = check_structure(data, rep) or []
    for idx, chunk in chunks:
        check_fields(idx, chunk, rep)
        check_id(chunk, rep)
        check_text(chunk, rep)
    if chunks:
        check_collection(chunks, rep)
        if args.gold:
            check_gold_set(args.gold, chunks, rep)

    if rep.errors:
        print(f"ERRORS ({len(rep.errors)}) - these must be fixed")
        for where, msg in rep.errors:
            print(f"  [{where}] {msg}")
        print()
    if rep.warnings:
        print(f"WARNINGS ({len(rep.warnings)}) - worth a look")
        for where, msg in rep.warnings:
            print(f"  [{where}] {msg}")
        print()

    if chunks:
        print("SUMMARY")
        for line in summarise(chunks):
            print(line)
        print()

    if rep.errors:
        print(f"FAILED - {len(rep.errors)} error(s), {len(rep.warnings)} warning(s)")
        return 1
    print(f"PASSED - 0 errors, {len(rep.warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
