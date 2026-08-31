#!/usr/bin/env python3
"""
Mofid - textbook PDF to plain text, with page markers (Workstream D).

Writes one text file where every page is preceded by a "=== PAGE n ===" marker,
so the page number for each chunk's `page` field is always in front of you while
you are chunking. Pages that produce no text are scanned images and are reported
at the end - those need OCR before they can be used.

Arabic presentation forms are normalised to normal Arabic letters (NFKC), which
is the single most common source of garbled Arabic when extracting from PDFs.

Usage:
    python tools/extract_pdf.py textbook.pdf -o work/science_g9.txt
    python tools/extract_pdf.py textbook.pdf -o work/science_g9.txt --pages 10-45

Requires pypdf (pip install pypdf).
"""
import argparse
import re
import sys
import unicodedata
from pathlib import Path

TATWEEL = "ـ"
ZERO_WIDTH = re.compile(r"[​-‏‪-‮﻿]")


def parse_range(spec, total):
    """'10-45' or '12' -> a 1-based inclusive page range clamped to the document."""
    if not spec:
        return 1, total
    m = re.fullmatch(r"(\d+)(?:-(\d+))?", spec.strip())
    if not m:
        raise ValueError(f"could not read --pages {spec!r}, expected e.g. 10-45")
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else start
    if start < 1 or end < start:
        raise ValueError(f"--pages {spec!r} is not a valid range")
    return start, min(end, total)


def clean(text):
    """Normalise Arabic and tidy whitespace without changing the wording."""
    text = unicodedata.normalize("NFKC", text)
    text = ZERO_WIDTH.sub("", text)
    text = text.replace("\x0c", "\n")
    text = re.sub(TATWEEL + "{2,}", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return reflow(text.strip())


def reflow(text):
    """Some PDFs emit one word per line. Join runs of 3+ single-word lines."""
    out, run = [], []
    for line in text.split("\n"):
        if line.strip() and len(line.split()) == 1:
            run.append(line.strip())
            continue
        if not line.strip() and run:
            continue  # blank lines between single-word lines are part of the artifact
        if run:
            out.append(" ".join(run) if len(run) >= 3 else "\n".join(run))
            run = []
        out.append(line)
    if run:
        out.append(" ".join(run) if len(run) >= 3 else "\n".join(run))
    return "\n".join(out)


def run_ocr(args):
    """OCR path, for books that are scanned images with no text layer."""
    try:
        import fitz
    except ImportError:
        print("ERROR: PyMuPDF is not installed. Run:  pip install pymupdf")
        return 1
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        print("ERROR: OCR needs pytesseract and Pillow. Run:")
        print("  pip install pytesseract pillow")
        print("You also need the Tesseract program itself, with Arabic data:")
        print("  https://github.com/UB-Mannheim/tesseract/wiki")
        print("  (tick 'Arabic' under Additional language data during install)")
        return 1

    import io

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"ERROR: {pdf_path} not found")
        return 1

    doc = fitz.open(str(pdf_path))
    try:
        start, end = parse_range(args.pages, doc.page_count)
    except ValueError as exc:
        print(f"ERROR: {exc}")
        return 1

    try:
        pytesseract.get_tesseract_version()
    except Exception:
        print("ERROR: Tesseract is installed as a Python wrapper but the program "
              "itself was not found on PATH.")
        print("Install it from https://github.com/UB-Mannheim/tesseract/wiki and "
              "make sure Arabic language data is selected.")
        return 1

    out_lines = []
    empty_pages = []
    for number in range(start, end + 1):
        pix = doc[number - 1].get_pixmap(dpi=args.dpi)
        image = Image.open(io.BytesIO(pix.tobytes("png")))
        text = clean(pytesseract.image_to_string(image, lang=args.lang))
        out_lines.append(f"=== PAGE {number} ===")
        if text:
            out_lines.append(text)
        else:
            empty_pages.append(number)
            out_lines.append("[OCR produced nothing for this page]")
        out_lines.append("")
        done = number - start + 1
        print(f"\rOCR {done}/{end - start + 1} pages", end="", flush=True)
    print()

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(out_lines), encoding="utf-8")

    print(f"OCR'd pages {start}-{end} at {args.dpi} dpi -> {out_path}")
    if empty_pages:
        print(f"WARNING: {len(empty_pages)} page(s) produced nothing: "
              + ", ".join(str(p) for p in empty_pages[:20]))
    print("\nOCR output ALWAYS needs proofreading before it goes into a chunk - "
          "see section 5 of the content guide.")
    return 0


def main():
    # Windows consoles default to cp1252 and crash on Arabic output
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(description="Extract textbook PDF text with page markers.")
    parser.add_argument("pdf", help="path to the textbook PDF")
    parser.add_argument("-o", "--output", required=True, help="where to write the text file")
    parser.add_argument("--pages", help="page range to extract, e.g. 10-45 (default: all)")
    parser.add_argument("--ocr", action="store_true",
                        help="OCR the pages instead of reading a text layer "
                             "(needed for scanned books like the Ministry PDFs)")
    parser.add_argument("--dpi", type=int, default=300,
                        help="render resolution for --ocr (default 300)")
    parser.add_argument("--lang", default="ara+eng",
                        help="tesseract languages for --ocr (default ara+eng, because "
                             "Egyptian science books mix Arabic prose with English terms)")
    args = parser.parse_args()

    if args.ocr:
        return run_ocr(args)

    try:
        from pypdf import PdfReader
    except ImportError:
        print("ERROR: pypdf is not installed. Run:  pip install pypdf")
        return 1

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"ERROR: {pdf_path} not found")
        return 1

    reader = PdfReader(str(pdf_path))
    total = len(reader.pages)
    try:
        start, end = parse_range(args.pages, total)
    except ValueError as exc:
        print(f"ERROR: {exc}")
        return 1

    out_lines = []
    empty_pages = []
    for number in range(start, end + 1):
        text = clean(reader.pages[number - 1].extract_text() or "")
        out_lines.append(f"=== PAGE {number} ===")
        if text:
            out_lines.append(text)
        else:
            empty_pages.append(number)
            out_lines.append("[no extractable text - scanned image, needs OCR]")
        out_lines.append("")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(out_lines), encoding="utf-8")

    print(f"Extracted pages {start}-{end} of {total} -> {out_path}")
    if empty_pages:
        preview = ", ".join(str(p) for p in empty_pages[:20])
        more = f" (+{len(empty_pages) - 20} more)" if len(empty_pages) > 20 else ""
        print(f"\nWARNING: {len(empty_pages)} page(s) produced no text: {preview}{more}")
        print("Those pages are scanned images. They need OCR, or pick other chapters.")
    else:
        print("Every page produced text - no OCR needed.")
    print("\nNext: chunk the text into content/<subject>_grade<N>.json, then run")
    print("  python tools/validate_chunks.py content/<subject>_grade<N>.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
