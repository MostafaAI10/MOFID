#!/usr/bin/env python3
"""
Mofid - rank draft chunks by how much human attention they need (Workstream D).

The chunks produced from an OCR'd book are not uniformly good: some come out
clean, others have figure-caption text spliced into a sentence, or physics
notation (E1, E2, subscripts) destroyed by the OCR. Reviewing all of them with
equal care wastes time on the ones that are already fine.

This reads a chunk file and writes a report ordered worst-first, so review time
goes where it is actually needed. It never modifies the chunk file, and it does
not add fields - the schema stays at the guide's 6 fields.

Usage:
    python tools/review_report.py content/physics_grade12.json -o work/review.txt
"""
import argparse
import json
import re
import sys
from pathlib import Path

ARABIC = re.compile(r"[؀-ۿ]")
LATIN_TOKEN = re.compile(r"\b[A-Za-z][A-Za-z'’]*\b")
# Characters that are neither Arabic, Latin, digits, nor ordinary punctuation
# Physics notation is expected text, not noise: super/subscripts, Greek symbols,
# and the maths operators an equation written in plain text needs.
NOTATION = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺₀₁₂₃₄₅₆₇₈₉αβγδθλμνπρσφωΦΩΔΣ°Å−±≈≤≥<>·…"
NOISE_CHAR = re.compile(
    r"[^\s؀-ۿA-Za-z0-9٠-٩.,;:!؟،؛\-–—()\[\]/×=+%'\"”“’‘" + NOTATION + "]")

# Short Latin tokens that legitimately appear in an Egyptian physics textbook
KNOWN_SHORT = {
    # units and symbols
    "nm", "cm", "mm", "km", "kg", "eV", "MeV", "keV", "Hz", "kHz", "MHz", "GHz",
    "mmHg", "Watts", "J", "K", "V", "A", "W", "C", "N", "T", "m", "s", "g", "e",
    "h", "c", "f", "E", "P", "Q", "R", "X", "Y", "Z", "L", "M", "O", "n", "En",
    "Ew", "PL", "Pw", "KE",
    # acronyms and elements
    "CRT", "LED", "LASER", "UV", "IR", "AC", "DC", "RF", "CDs", "LADAR",
    "Ne", "He", "Ar", "Kr", "CO", "pn", "np",
    # names and English terms this textbook actually uses
    "Anode", "Atom", "Beam", "Black", "Body", "Bombs", "De", "Dye", "Earth",
    "Flash", "Gabor", "Grid", "Gun", "Hard", "Image", "Lamps", "Laser", "Law",
    "Light", "Line", "Lyman", "Pfund", "Plane", "Power", "Radar", "Radio",
    "Ray", "Ruby", "Scale", "Smart", "Soft", "Spin", "Star", "State", "Toner",
    "Tube", "War", "Wave", "Waves", "Work", "beam", "drum", "by", "of", "or",
}


def junk_latin(text):
    """Latin tokens that look like OCR debris rather than real terms.

    Short Latin cannot be told apart from OCR debris by shape alone - "Pfund"
    and "Gtis" look identical to a rule. So the tool keeps an explicit list of
    the short terms this textbook actually uses (units, quantum numbers, shell
    labels, acronyms, names) and treats anything else short as suspect. A new
    real term will be flagged once; add it to KNOWN_SHORT.
    """
    bad = 0
    for token in LATIN_TOKEN.findall(text):
        if token in KNOWN_SHORT or len(token) >= 6:
            continue
        bad += 1
    return bad


def score(chunk):
    """Higher means it needs more attention. Returns (score, reasons)."""
    text = chunk.get("text", "")
    words = text.split()
    reasons = []
    points = 0

    n = len(words)
    if n < 50:
        points += 2
        reasons.append(f"only {n} words")
    elif n > 150:
        points += 1
        reasons.append(f"{n} words")

    junk = junk_latin(text)
    if junk:
        points += min(junk, 6)
        reasons.append(f"{junk} suspicious Latin fragment(s)")

    noise = len(NOISE_CHAR.findall(text))
    if noise:
        points += min(noise, 5)
        reasons.append(f"{noise} unexpected symbol(s)")

    # Runs of loose digits are usually axis labels from a figure
    digit_runs = len(re.findall(r"(?:(?<=\s)[0-9٠-٩]{1,4}(?=\s)){2,}", text))
    stray = len(re.findall(r"(?<![=×+\-/(])\s[0-9٠-٩]{1,4}(?![\s]*[a-zA-Z°×⁻])(?=\s)", text))
    if stray >= 4:
        points += 2
        reasons.append(f"{stray} loose numbers - figure axis labels?")

    # Single stray letters are almost always broken notation
    # An isolated letter next to "=" or a digit is notation, not damage
    singles = len(re.findall(r"(?<=\s)[A-Za-z](?![\s]*[=₀-₉0-9])(?=[\s,.;])", text))
    if singles >= 4:
        points += 2
        reasons.append(f"{singles} isolated letters - broken symbols?")

    arabic = len(ARABIC.findall(text))
    if arabic == 0:
        points += 8
        reasons.append("no Arabic at all")

    return points, reasons


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(description="Rank draft chunks by review need.")
    parser.add_argument("chunks", help="chunk JSON file")
    parser.add_argument("-o", "--output", help="write the report here (default: stdout)")
    args = parser.parse_args()

    path = Path(args.chunks)
    if not path.exists():
        print(f"ERROR: {path} not found")
        return 1
    data = json.loads(path.read_text(encoding="utf-8-sig"))

    scored = []
    for chunk in data:
        points, reasons = score(chunk)
        scored.append((points, reasons, chunk))
    scored.sort(key=lambda r: -r[0])

    heavy = [s for s in scored if s[0] >= 6]
    light = [s for s in scored if 3 <= s[0] < 6]
    clean = [s for s in scored if s[0] < 3]

    unnamed = [c for c in data if c.get("section") == c.get("chapter")]

    lines = [
        f"Review report - {path.name}",
        f"{len(data)} chunks: {len(heavy)} need real work, "
        f"{len(light)} need a quick look, {len(clean)} look clean",
        "",
        "Ordered worst-first. Open the textbook page alongside the heavy ones.",
        "",
    ]
    if unnamed:
        lines += [
            f"SEPARATE, SYSTEMIC ISSUE: {len(unnamed)} of {len(data)} chunks still",
            "carry the chapter name in `section` because the OCR could not read the",
            "heading. That is one pass of naming work, not a per-chunk defect, so it",
            "is not counted in the scores below.",
            "",
        ]
    lines += ["=" * 70, ""]
    for points, reasons, chunk in scored:
        band = "HEAVY" if points >= 6 else ("CHECK" if points >= 3 else "ok")
        lines.append(f"[{band}] {chunk['id']}  (score {points})")
        for reason in reasons:
            lines.append(f"    - {reason}")
        excerpt = " ".join(chunk.get("text", "").split())[:160]
        lines.append(f"    > {excerpt}...")
        lines.append("")

    report = "\n".join(lines)
    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(report, encoding="utf-8")
        print(f"Wrote report -> {out}")
        print(f"{len(heavy)} need real work, {len(light)} need a quick look, "
              f"{len(clean)} look clean")
    else:
        print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
