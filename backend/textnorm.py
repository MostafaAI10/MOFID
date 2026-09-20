"""
Arabic normalisation and question/chunk coverage.

Coverage complements the embedding distance: a chunk can be close in meaning
while containing none of what was asked about. Python counterpart of the same
logic in webapp/api.js - the two must agree, or one question gets two
different verdicts in mock and live mode.
"""

import re

_DIACRITICS = re.compile("[ً-ْٰـ]")
# Arabic punctuation sits inside the Arabic unicode block, so _KEEP would
# retain it and every question ending in "؟" would carry the mark into its
# last token.
_PUNCT = re.compile("[،؛؟٪-٭۔«»]")
_KEEP = re.compile(r"[^؀-ۿa-z0-9\s]")
_SPACES = re.compile(r"\s+")
_POSSESSIVE = re.compile(r"'s$")

# Function words carry no retrieval signal. English included, or a question
# like "how does a laser work" spends its coverage on grammar.
STOP = set((
    "من في على عن الى إلى ما هو هي ان أن إن كان يكون هذا هذه ذلك التي الذي و "
    "او أو ثم بين كل لكل عند عندما اذا إذا لان لأن حيث مع دون بعد قبل يعني "
    "ايه إيه ازاي إزاي كام كيف ماذا لماذا هل وما وهو وهي فى "
    "اشرح اشرحي وضح وضحي اذكر اذكري اكتب اكتبي عرف عرفي فسر فسري علل عللي "
    "قارن قارني ناقش ناقشي لخص لخصي وصف صفي حدد حددي عدد عددي استنتج استنتجي "
    "باختصار اختصار مختصر بالتحديد بالتفصيل ببساطة نحو عن ما ايش شنو متى اين أين "
    "the a an and or of in on at to for from with by as is are was were be "
    "been am do does did done have has had can could will would shall should "
    "may might must what how why when where which who whom whose that this "
    "these those it its there their they them we us you your i me my if then "
    "than so such about into over under between both each any some all very "
    "much many more most other another same explain define describe tell give "
    "mean means called work works working happen happens not no yes please"
).split())

# Arabic attaches articles and pronouns to words, so "الإشعاع" / "إشعاعا" /
# "بالإشعاع" are three tokens for one term.
_PREFIXES = ("وال", "بال", "كال", "فال", "لل", "ال", "و", "ف", "ب", "ك", "ل")
_SUFFIXES = ("اتها", "اتهم", "ينها", "هما", "تها", "تهم", "هم", "هن", "ها",
             "ية", "ات", "ون", "ين", "ان", "تي", "ي", "ه", "ا")

# English spellings for concepts the textbook writes in Arabic, without which
# an English question shares almost no tokens with an Arabic chunk. Extend
# when chapters are added.
EN_TO_AR = {
    "modern": "الحديثة", "classical": "الكلاسيكية", "atomic": "الذرية",
    "nuclear": "النووية", "wavelength": "الطول الموجي", "wave": "الموجة",
    "particle": "الجسيم", "mass": "الكتلة", "velocity": "السرعة",
    "speed": "السرعة", "temperature": "الحرارة", "heat": "الحرارة",
    "energy": "الطاقة", "light": "الضوء", "frequency": "التردد",
    "momentum": "كمية الحركة", "constant": "ثابت", "function": "دالة",
    "vacuum": "الفراغ", "series": "مجموعة",
    "mirror": "المرآة", "lens": "العدسة", "prism": "المنشور",
    "screen": "الشاشة", "diffraction": "الحيود", "interference": "التداخل",
    "reflection": "الانعكاس", "refraction": "الانكسار",
    "quantum": "الكم", "photon": "فوتون", "electron": "إلكترون",
    "photoelectric": "الكهروضوئي", "spectrum": "الطيف", "spectra": "الطيف",
    "radiation": "الإشعاع", "emission": "الانبعاث", "absorption": "الامتصاص",
    "hydrogen": "الهيدروجين", "atom": "الذرة", "nucleus": "النواة",
    "orbit": "المدار", "level": "المستوى", "threshold": "الحرج",
    "laser": "ليزر", "hologram": "الهولوجرام", "holography": "التصوير المجسم",
    "microscope": "الميكروسكوب", "crystal": "البلورة", "tube": "أنبوبة",
    "bomb": "القنبلة", "lamp": "المصباح", "bulb": "المصباح",
    "printer": "طابعة", "medicine": "الطب", "eye": "العين",
    "retina": "الشبكية", "sun": "الشمس",
}


def normalise(text: str) -> str:
    """Fold Arabic spelling variants so "الأشعة" and "الاشعة" match."""
    out = (text or "").lower()
    out = _DIACRITICS.sub("", out)
    out = re.sub("[أإآ]", "ا", out)
    out = out.replace("ى", "ي").replace("ة", "ه")
    out = _KEEP.sub(" ", _PUNCT.sub(" ", out))
    return _SPACES.sub(" ", out).strip()


def stem(word: str) -> str:
    """Strip one leading and one trailing clitic, if either is safe to drop."""
    if len(word) <= 3:
        return word
    for prefix in _PREFIXES:
        if len(word) - len(prefix) >= 3 and word.startswith(prefix):
            word = word[len(prefix):]
            break
    for suffix in _SUFFIXES:
        if len(word) - len(suffix) >= 4 and word.endswith(suffix):
            word = word[: -len(suffix)]
            break
    return word


def tokens(text: str) -> list[str]:
    """Content tokens: normalised, stop words dropped, English aliased, stemmed."""
    out = []
    for raw in normalise(text).split(" "):
        # the book writes "Planck's", students type "planck"
        word = _POSSESSIVE.sub("", raw)
        if len(word) <= 1 or word in STOP:
            continue
        alias = EN_TO_AR.get(word)
        if alias:
            out.extend(stem(part) for part in normalise(alias).split(" ")
                       if len(part) > 1 and part not in STOP)
            continue
        out.append(stem(word))
    return out


def coverage(question: str, chunk_text: str) -> float:
    """Fraction of the question's content tokens the chunk actually uses."""
    asked = list(dict.fromkeys(tokens(question)))
    if not asked:
        return 0.0
    present = set(tokens(chunk_text))
    return sum(1 for token in asked if token in present) / len(asked)


def is_arabic(text: str) -> bool:
    """True when the question is in the same script as the corpus."""
    return any("؀" <= ch <= "ۿ" for ch in (text or ""))
