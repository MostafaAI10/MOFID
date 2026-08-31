#!/usr/bin/env python3
"""
Mofid - find the textbook page a chunk came from, and render it (Workstream D).

A chunk carries no page number (the schema is the guide's 6 fields), but the OCR
text file still has "=== PAGE n ===" markers. This matches a chunk's text back
against that file to recover its page, then optionally renders that page as an
image so the original can be read while correcting OCR damage.

Correcting against the printed page is the point: a Mofid answer cites a chapter,
and a student will compare it with their own book. Guessing at damaged text can
drift from what the book actually says; reading the page cannot.

Usage:
    python tools/find_source.py phy_g12_ch5_sec0_29
    python tools/find_source.py phy_g12_ch5_sec0_29 --render
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

CHUNKS = Path("content/physics_grade12.json")
OCR_TEXT = Path("work/modern_physics_ch5_7.txt")
PDF = Path("work/Physics_Arabic_Sec3.pdf")
RENDER_DIR = Path("work/pages")


def normalise(text):
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"\s+", " ", text).strip()


def read_pages(path):
    pages, page, buf = {}, None, []
    for raw in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^=== PAGE (\d+) ===$", raw.strip())
        if m:
            if page is not None:
                pages[page] = "\n".join(buf)
            page, buf = int(m.group(1)), []
        elif page is not None:
            buf.append(raw)
    if page is not None:
        pages[page] = "\n".join(buf)
    return pages


def locate(chunk_text, pages):
    """Score each page by how many of the chunk's distinctive words it holds."""
    words = [w for w in normalise(chunk_text).split() if len(w) >= 4]
    if not words:
        return []
    probe = words[:40]
    scored = []
    for number, body in pages.items():
        body_n = normalise(body)
        hits = sum(1 for w in probe if w in body_n)
        if hits:
            scored.append((hits / len(probe), number))
    scored.sort(reverse=True)
    return scored[:3]


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(description="Find and render a chunk's source page.")
    parser.add_argument("chunk_id", help="id of the chunk, e.g. phy_g12_ch5_sec0_29")
    parser.add_argument("--render", action="store_true", help="render the page to a PNG")
    parser.add_argument("--dpi", type=int, default=130)
    parser.add_argument("--chunks", default=str(CHUNKS))
    parser.add_argument("--text", default=str(OCR_TEXT))
    args = parser.parse_args()

    data = json.loads(Path(args.chunks).read_text(encoding="utf-8-sig"))
    chunk = next((c for c in data if c.get("id") == args.chunk_id), None)
    if chunk is None:
        print(f"ERROR: no chunk with id {args.chunk_id!r} in {args.chunks}")
        return 1

    pages = read_pages(Path(args.text))
    matches = locate(chunk["text"], pages)
    if not matches:
        print("ERROR: could not match this chunk to any page")
        return 1

    print(f"chunk   : {chunk['id']}")
    print(f"chapter : {chunk['chapter']}")
    print(f"section : {chunk['section']}")
    print("source  : " + ", ".join(f"PDF page {n} ({s:.0%} match)" for s, n in matches))
    print()
    print("current text:")
    print(chunk["text"])

    if args.render:
        try:
            import fitz
        except ImportError:
            print("\nERROR: PyMuPDF is not installed. Run:  pip install pymupdf")
            return 1
        RENDER_DIR.mkdir(parents=True, exist_ok=True)
        best = matches[0][1]
        out = RENDER_DIR / f"page_{best}.png"
        doc = fitz.open(str(PDF))
        doc[best - 1].get_pixmap(dpi=args.dpi).save(str(out))
        print(f"\nrendered PDF page {best} -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
