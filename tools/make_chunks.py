#!/usr/bin/env python3
"""
Mofid - turn OCR'd textbook text into draft chunks (Workstream D).

Reads the "=== PAGE n ===" text produced by extract_pdf.py and emits a JSON file
in the exact 6-field schema from the content guide:
    id, subject, grade, chapter, section, text

Everything it writes comes from the text file itself - chapter and section names
are read off the page, never supplied from outside. Where it cannot read a
section heading it writes the chapter's own name into `section`, so the field is
never blank and the gap is visible to the human reviewer.

This produces a DRAFT. Chunk boundaries, section names and OCR errors all need
human review afterwards; the point is to remove the mechanical work, not the
judgement.

Usage:
    python tools/make_chunks.py work/modern_physics_ch5_7.txt \
        --subject "الفيزياء" --grade 12 --prefix phy \
        -o content/physics_grade12.json
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

PAGE_MARKER = re.compile(r"^=== PAGE (\d+) ===$")

# "الفصل الخامس : ازدواجية الموجة والجسيم" on a chapter divider page
CHAPTER_LINE = re.compile(r"الفصل\s+(\S+)\s*[:：]\s*(.+)")

ARABIC_ORDINALS = {
    "الأول": 1, "الاول": 1, "الثاني": 2, "الثانى": 2, "الثالث": 3,
    "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7, "الثامن": 8,
    "التاسع": 9, "العاشر": 10,
}

ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

# A numbered heading such as "٣- الترابط Coherence" or "3 - الشدة"
HEADING = re.compile(r"^\s*[٠-٩\d]{1,2}\s*[-–—]\s*(\S.{0,60})$")

# Lines that are page furniture rather than content
FURNITURE_LINE = [
    re.compile(r"^\s*[٠-٩\d]{1,4}\s*$"),          # a bare page number
    re.compile(r"الفيزياء\s+للصف\s+الثالث\s+الثانو"),        # footer
    re.compile(r"^\s*الوحدة\s+(الأولى|الثانية)\s*$"),
    re.compile(r"مقدمة\s+فى?\s+الفيزياء\s+الحديثة"),         # running header
    re.compile(r"^\s*شكل\s*[\(\)]"),                        # figure caption
    re.compile(r"^\s*[^؀-ۿA-Za-z]{0,6}\s*$"),      # symbol-only noise
]

# Inline figure references: "(شكل ٧ - ١٧)"
FIGURE_REF = re.compile(r"[\(\[]\s*شكل[^\)\]]{0,30}[\)\]]")

WORDS_MIN, WORDS_TARGET, WORDS_MAX = 50, 110, 150

# Worked examples and exercise blocks: the OCR destroys their notation, and a
# grounded-explanation tutor does not retrieve them anyway. They are set aside
# in a separate file rather than dropped, so the gap stays visible (guide s.5).
EXERCISE_OPENER = re.compile(r"^\s*(مثال|تمارين|أسئلة|اسئلة|تمرين|مسائل)\b")
ARABIC_WORD = re.compile(r"^[؀-ۿ]{2,}$")


def is_notation_heavy(text):
    """True when a passage is mostly numbers and symbols rather than prose."""
    tokens = text.split()
    if not tokens:
        return True
    arabic_words = sum(1 for t in tokens if ARABIC_WORD.match(t.strip(".,;:!؟،؛()[]")))
    return arabic_words / len(tokens) < 0.6


def normalise(text):
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"\s+", " ", text).strip()


def word_count(text):
    return len([w for w in text.split() if w])


def read_pages(path):
    """Yield (page_number, [lines]) from an extract_pdf.py output file."""
    page, lines = None, []
    for raw in path.read_text(encoding="utf-8").splitlines():
        m = PAGE_MARKER.match(raw.strip())
        if m:
            if page is not None:
                yield page, lines
            page, lines = int(m.group(1)), []
        elif page is not None:
            lines.append(raw)
    if page is not None:
        yield page, lines


def is_furniture(line):
    stripped = line.strip()
    if not stripped:
        return True
    return any(p.search(stripped) for p in FURNITURE_LINE)


def find_chapter(lines):
    """Read a chapter title off a divider page, if this page is one."""
    for line in lines:
        m = CHAPTER_LINE.search(normalise(line))
        if not m:
            continue
        word, title = m.group(1).strip(), normalise(m.group(2))
        number = ARABIC_ORDINALS.get(word)
        if number is None:
            digits = word.translate(ARABIC_INDIC)
            number = int(digits) if digits.isdigit() else None
        if number and title:
            return number, f"الفصل {word}: {title}"
    return None, None


def find_heading(line):
    m = HEADING.match(normalise(line))
    if not m:
        return None
    title = m.group(1).strip(" .:،")
    # A heading is short and is not a full sentence
    if 2 <= word_count(title) <= 8:
        return title
    return None


def split_paragraph(text):
    """Split a long paragraph on sentence ends, keeping pieces near the target."""
    sentences = re.split(r"(?<=[.؟!])\s+", text)
    out, current = [], ""
    for sentence in sentences:
        candidate = (current + " " + sentence).strip()
        if current and word_count(candidate) > WORDS_MAX:
            out.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        out.append(current)
    return out


def title_number(title):
    """'الفصل السابع: الليزر' -> 7"""
    m = re.search(r"الفصل\s+(\S+)", title)
    if m:
        word = m.group(1).strip(" :،")
        if word in ARABIC_ORDINALS:
            return ARABIC_ORDINALS[word]
        digits = word.translate(ARABIC_INDIC)
        if digits.isdigit():
            return int(digits)
    m = re.search(r"\d+", title.translate(ARABIC_INDIC))
    return int(m.group()) if m else None


def build_chunks(path, subject, grade, prefix, chapter_map=None):
    """chapter_map: {page number: chapter title} for divider pages the OCR
    could not read (their titles are stylised art text). Titles still come from
    the book - they are read off those same divider pages by eye."""
    chapter_map = chapter_map or {}
    chapter_no, chapter_name = None, None
    section = None
    section_index = 0
    buffer = []
    chunks = []
    setaside = []
    counters = {}

    def flush():
        nonlocal buffer
        text = normalise(" ".join(buffer))
        buffer = []
        if not text or chapter_no is None:
            return
        for piece in split_paragraph(text):
            if word_count(piece) < 15:
                continue
            if EXERCISE_OPENER.match(piece) or is_notation_heavy(piece):
                setaside.append((chapter_name, piece))
                continue
            key = (chapter_no, section_index)
            counters[key] = counters.get(key, 0) + 1
            suffix = counters[key]
            cid = f"{prefix}_g{grade}_ch{chapter_no}_sec{section_index}"
            if suffix > 1:
                cid += f"_{suffix}"
            chunks.append({
                "id": cid,
                "subject": subject,
                "grade": str(grade),
                "chapter": chapter_name,
                "section": section or chapter_name,
                "text": piece,
            })

    for page, lines in read_pages(path):
        if page in chapter_map:
            number, name = title_number(chapter_map[page]), chapter_map[page]
        else:
            number, name = find_chapter(lines)
        if number is not None:
            flush()
            chapter_no, chapter_name = number, name
            section, section_index = None, 0
            counters.clear()
            continue  # divider page holds no body text

        for line in lines:
            if is_furniture(line):
                continue
            cleaned = FIGURE_REF.sub("", line).strip()
            if not cleaned:
                continue
            heading = find_heading(cleaned)
            if heading:
                flush()
                section_index += 1
                section = heading
                continue
            buffer.append(cleaned)
        # A page break is a safe place to close a chunk
        if word_count(" ".join(buffer)) >= WORDS_TARGET:
            flush()
    flush()
    return chunks, setaside


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(description="Build draft chunks from OCR'd text.")
    parser.add_argument("text", help="output of extract_pdf.py")
    parser.add_argument("-o", "--output", required=True, help="JSON file to write")
    parser.add_argument("--subject", required=True, help="subject name, e.g. الفيزياء")
    parser.add_argument("--grade", required=True, help="grade number, e.g. 12")
    parser.add_argument("--prefix", required=True, help="id prefix, e.g. phy")
    parser.add_argument("--chapter", action="append", default=[], metavar="PAGE=TITLE",
                        help="chapter title for a divider page the OCR could not read, "
                             "e.g. --chapter \"140=الفصل السابع: الليزر\". Repeatable.")
    args = parser.parse_args()

    chapter_map = {}
    for item in args.chapter:
        if "=" not in item:
            print(f"ERROR: --chapter needs PAGE=TITLE, got {item!r}")
            return 1
        page, title = item.split("=", 1)
        if not page.strip().isdigit():
            print(f"ERROR: --chapter page must be a number, got {page!r}")
            return 1
        chapter_map[int(page.strip())] = title.strip()

    path = Path(args.text)
    if not path.exists():
        print(f"ERROR: {path} not found")
        return 1

    chunks, setaside = build_chunks(path, args.subject, args.grade, args.prefix,
                                    chapter_map)
    if not chunks:
        print("ERROR: no chunks produced - check that the text file has "
              "'=== PAGE n ===' markers and at least one chapter divider page")
        return 1

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(chunks, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")

    chapters = {}
    for c in chunks:
        chapters.setdefault(c["chapter"], set()).add(c["section"])
    if setaside:
        aside = out.parent.parent / "work" / (out.stem + "_setaside.txt")
        aside.parent.mkdir(parents=True, exist_ok=True)
        header = (
            "Passages set aside: worked examples, exercises and notation-heavy\n"
            "text whose symbols the OCR destroyed. Nothing was deleted -\n"
            "review these and add back any that belong in the content.\n\n"
        )
        body = ("\n\n").join(
            f"[{ch}]\n{txt}" for ch, txt in setaside)
        aside.write_text(header + body, encoding="utf-8")
        print(f"Set aside {len(setaside)} passage(s) -> {aside}")

    print(f"Wrote {len(chunks)} draft chunks -> {out}")
    for chapter, sections in chapters.items():
        count = sum(1 for c in chunks if c["chapter"] == chapter)
        print(f"  {chapter}: {count} chunks, {len(sections)} sections")
    print("\nDRAFT - needs human review of chunk boundaries, section names and "
          "OCR errors.\nNext:  python tools/validate_chunks.py " + str(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
