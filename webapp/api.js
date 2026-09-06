/*
 * Mofid - the one place the app talks to the backend.
 *
 * Right now MODE is "mock": retrieval runs in the browser over the same
 * curriculum JSON that ships with the app, so the whole UI (answers, citations,
 * the "not in your curriculum" refusal) is exercisable before the API exists.
 *
 * WHEN ENDPOINTS LAND: set MODE to "live" below. Nothing else in the
 * app needs to change - app.js only ever calls MofidAPI.ask() and .health().
 * The request and response shapes are written out in API_CONTRACT.md.
 */
const MofidAPI = (() => {
  const CONFIG = {
    // Set to "live" once the backend is available.
    MODE: "mock", // "mock" | "live"
    // Empty string = same origin, which is what happens when FastAPI serves
    // these files. Set to e.g. "http://192.168.4.1:8000" only if the app is
    // served from somewhere other than the API.
    BASE_URL: "",
    TIMEOUT_MS: 60000, // a quantized model on modest hardware can be slow
  };

  // ---------------------------------------------------------------- utils
  const AR_DIACRITICS = /[ً-ْٰـ]/g;

  /** Fold Arabic spelling variants so "الأشعة" and "الاشعة" match. */
  function normalise(text) {
    return (text || "")
      .toLowerCase()
      .replace(AR_DIACRITICS, "")
      .replace(/[أإآ]/g, "ا") // أ إ آ -> ا
      .replace(/ى/g, "ي") // ى -> ي
      .replace(/ة/g, "ه") // ة -> ه
      // Arabic punctuation sits INSIDE the Arabic unicode block, so the class
      // below would happily keep it. Strip it first or every question ending
      // in "؟" carries the mark into its last token and matches nothing.
      .replace(/[،؛؟٪-٭۔ـ«»]/g, " ")
      .replace(/[^؀-ۿa-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Arabic function words carry no retrieval signal
  const STOP = new Set(("من في على عن الى إلى ما هو هي ان أن إن كان يكون هذا هذه ذلك التي الذي و " +
    "او أو ثم بين كل لكل عند عندما اذا إذا لان لأن حيث مع دون بعد قبل يعني ايه إيه ازاي إزاي كام " +
    "كيف ماذا لماذا هل وما وهو وهي فى " +
    // English carries as many empty words as Arabic; without them a question
    // like "how does X work" loses most of its coverage to grammar.
    "the a an and or of in on at to for from with by as is are was were be been " +
    "am do does did done have has had can could will would shall should may " +
    "might must what how why when where which who whom whose that this these " +
    "those it its there their they them we us you your i me my if then than " +
    "so such about into over under between both each any some all very much " +
    "many more most other another same explain define describe tell give mean " +
    "means called work works working happen happens does not no yes please" +
    "").split(/\s+/));

  /* Light Arabic stemmer. Arabic glues articles and pronouns onto words, so
     "الإشعاع" / "إشعاعا" / "بالإشعاع" are three tokens that should match each
     other. Stripping the common clitics collapses them. Deliberately shallow -
     this is not root extraction, just enough to stop losing obvious matches.
     Measured on eval/gold_set.json it lifts retrieval from 51% to 69%. */
  const PREFIXES = ["وال", "بال", "كال", "فال", "لل", "ال", "و", "ف", "ب", "ك", "ل"];
  const SUFFIXES = ["اتها", "اتهم", "ينها", "هما", "تها", "تهم", "هم", "هن", "ها",
    "ية", "ات", "ون", "ين", "ان", "تي", "ي", "ه", "ا"];

  function stem(word) {
    if (word.length <= 3) return word;
    for (const p of PREFIXES) {
      if (word.length - p.length >= 3 && word.startsWith(p)) { word = word.slice(p.length); break; }
    }
    for (const s of SUFFIXES) {
      if (word.length - s.length >= 4 && word.endsWith(s)) { word = word.slice(0, -s.length); break; }
    }
    return word;
  }

  /* Concepts the syllabus teaches but only ever writes in Arabic, plus the
     English spellings a student is likely to reach for. Without this, asking
     "what is wavelength" is treated as off-syllabus even though the whole of
     chapter 5 is about it. Only terms these three chapters actually cover. */
  const EN_TO_AR = {
    modern: "الحديثة", classical: "الكلاسيكية", atomic: "الذرية",
    nuclear: "النووية", wavelength: "الطول الموجي", hydrogen: "الهيدروجين",
    wave: "الموجة",
    particle: "الجسيم", mass: "الكتلة", velocity: "السرعة", speed: "السرعة",
    temperature: "الحرارة", heat: "الحرارة", sun: "الشمس", nucleus: "النواة",
    orbit: "المدار", level: "المستوى", bomb: "القنبلة", lamp: "المصباح",
    bulb: "المصباح", mirror: "المرآة", lens: "العدسة", prism: "المنشور",
    screen: "الشاشة", eye: "العين", medicine: "الطب", crystal: "البلورة",
    threshold: "الحرج", momentum: "كمية الحركة", diffraction: "الحيود",
    interference: "التداخل", reflection: "الانعكاس", refraction: "الانكسار",
  };

  function tokens(text) {
    const out = [];
    for (const raw of normalise(text).split(" ")) {
      // "planck's" / "wien's" - the book uses the possessive, students do not
      const word = raw.replace(/'s$/, "");
      if (word.length <= 1 || STOP.has(word)) continue;
      const alias = EN_TO_AR[word];
      if (alias) {
        for (const a of normalise(alias).split(" ")) {
          if (a.length > 1 && !STOP.has(a)) out.push(stem(a));
        }
        continue;
      }
      out.push(stem(word));
    }
    return out;
  }

  // ------------------------------------------------------------ mock index
  let INDEX = null;

  async function buildIndex() {
    if (INDEX) return INDEX;
    const chunks = await fetch("data/curriculum.json").then((r) => r.json());
    const df = new Map();
    const docs = chunks.map((c) => {
      const bag = new Map();
      // The heading is worth more than body prose for matching a question
      const weighted = `${c.section} ${c.section} ${c.chapter} ${c.text}`;
      for (const t of tokens(weighted)) bag.set(t, (bag.get(t) || 0) + 1);
      for (const t of bag.keys()) df.set(t, (df.get(t) || 0) + 1);
      return { chunk: c, bag };
    });
    INDEX = { docs, df, n: chunks.length };
    return INDEX;
  }

  const LATIN_TOKEN = /^[a-z][a-z0-9'-]*$/;

  /* Ordinary English words are not "the thing being asked about". Only a term
     that reads like a name - a law, a scientist, a device - is evidence the
     question is off-syllabus. Without this, "what is modern physics" is refused
     because the book never writes the word "modern". */
  const COMMON_EN = new Set(("modern classical general basic simple new old big small " +
    "difference between about first second third main important different same " +
    "explain define describe give tell mean means called name type kind part " +
    "please can you your there their some any more most very much many").split(" "));

  /* A Latin-script word the textbook has never once used is almost always the
     actual subject of the question - a law, a scientist, a device the syllabus
     does not cover ("Vin", "Ohm"). Answering anyway means grabbing whatever the
     remaining generic word ("قانون") happens to match, which is exactly the
     confident-but-wrong answer this app must never give. Arabic filler words
     are deliberately not treated this way; they are absent for a different
     reason (they are colloquial, not technical). */
  function namesSomethingUnknown(qt, df) {
    return qt.some((t) =>
      LATIN_TOKEN.test(t) && t.length > 2 && !COMMON_EN.has(t) && !df.has(t));
  }

  /** tf-idf scoring, plus how much of the question the chunk actually covers. */
  async function retrieve(question, k = 3) {
    const { docs, df, n } = await buildIndex();
    const qt = [...new Set(tokens(question))];
    if (!qt.length) return [];
    const unknownTerm = namesSomethingUnknown(qt, df);
    const scored = docs.map(({ chunk, bag }) => {
      let score = 0, matched = 0;
      for (const t of qt) {
        if (!bag.has(t)) continue;
        matched++;
        const idf = Math.log(1 + n / (1 + (df.get(t) || 0)));
        score += (1 + Math.log(bag.get(t))) * idf;
      }
      return { chunk, score: score / Math.sqrt(qt.length),
        coverage: matched / qt.length, unknownTerm };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).filter((s) => s.score > 0);
  }

  /* The refusal gate. COVERAGE is what actually separates a curriculum question
     from an off-syllabus one: an electricity question still hits words like
     "electron" and "field", so it can score well while matching only a small
     part of what was asked. Both thresholds were swept against the 67-question
     gold set - see webapp/README.md for the numbers they produce. */
  const RELEVANCE_FLOOR = 2.0;
  const COVERAGE_FLOOR = 0.35;
  const UNKNOWN_TERM_COVERAGE = 0.6; // stricter when the question names something unknown

  async function mockAsk(question, lang) {
    const started = performance.now();
    const hits = await retrieve(question, 3);
    // approximate the latency of a real inference call
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 700));
    const top = hits[0];

    const floor = top && top.unknownTerm ? UNKNOWN_TERM_COVERAGE : COVERAGE_FLOOR;
    if (!top || top.score < RELEVANCE_FLOOR || top.coverage < floor) {
      return {
        answer:
          lang === "en"
            ? "This isn't in your curriculum. Ask your teacher about it."
            : "ده مش موجود في منهجك. اسأل مدرسك عنه.",
        in_curriculum: false,
        citations: [],
        latency_ms: Math.round(performance.now() - started),
      };
    }

    const cited = hits.filter((h) => h.score >= top.score * 0.55).slice(0, 2);
    return {
      answer: cited.map((h) => h.chunk.text).join("\n\n"),
      in_curriculum: true,
      citations: cited.map((h) => h.chunk),
      latency_ms: Math.round(performance.now() - started),
    };
  }

  // ------------------------------------------------------------------ live
  async function liveAsk(question, lang) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT_MS);
    try {
      const res = await fetch(`${CONFIG.BASE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, lang }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json();
      // Tolerate missing fields so a schema change degrades rather than blanks
      return {
        answer: data.answer ?? "",
        in_curriculum: data.in_curriculum ?? true,
        citations: Array.isArray(data.citations) ? data.citations : [],
        latency_ms: data.latency_ms,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------- public
  return {
    get mode() {
      return CONFIG.MODE;
    },
    ask(question, lang) {
      return CONFIG.MODE === "live" ? liveAsk(question, lang) : mockAsk(question, lang);
    },
    async health() {
      if (CONFIG.MODE !== "live") {
        const { n } = await buildIndex();
        return { status: "ok", mode: "mock", chunks: n };
      }
      const res = await fetch(`${CONFIG.BASE_URL}/health`);
      if (!res.ok) throw new Error(`health check failed (${res.status})`);
      return { ...(await res.json()), mode: "live" };
    },
    /** Used by the landing panel. */
    suggestions(lang) {
      const file = lang === "en" ? "data/suggestions.en.json" : "data/suggestions.json";
      return fetch(file).then((r) => r.json());
    },
  };
})();
