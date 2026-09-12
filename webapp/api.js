/*
 * Mofid - the single point of contact between the app and the backend.
 *
 * MODE "mock" runs retrieval in the browser over the curriculum JSON that ships
 * with the app, so the interface can be exercised before the API exists.
 * MODE "live" calls the backend instead; nothing else in the app changes.
 * Request and response shapes: API_CONTRACT.md.
 */
const MofidAPI = (() => {
  const CONFIG = {
    // Set to "live" once the backend is available.
    MODE: "live", // "mock" | "live"
    // Empty string means same origin. Set an absolute URL only when the app
    // is served from somewhere other than the API.
    BASE_URL: "http://localhost:8082",
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

  /* Light Arabic stemmer. Arabic attaches articles and pronouns to words, so
     "الإشعاع" / "إشعاعا" / "بالإشعاع" are distinct tokens for the same term.
     Stripping the common clitics collapses them. This is not root extraction;
     measured on eval/gold_set.json it raises retrieval from 51% to 69%. */
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

  /* English spellings for concepts the textbook writes only in Arabic. Without
     these, "what is wavelength" is treated as off-syllabus. Extend this map when
     new chapters are added. */
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
  let CHUNKS = null;
  let INDEX = null;

  /* The raw list describes what the device holds. Building the inverted index
     is expensive on low-end hardware and nothing on the landing screen needs
     it, so that work is deferred until the first question. */
  function loadChunks() {
    if (!CHUNKS) CHUNKS = fetch("data/curriculum.json").then((r) => r.json());
    return CHUNKS;
  }

  async function buildIndex() {
    if (INDEX) return INDEX;
    const chunks = await loadChunks();
    const df = new Map();
    const docs = chunks.map((c) => {
      const bag = new Map();
      // headings weigh more than body prose when matching a question
      const weighted = `${c.section} ${c.section} ${c.chapter} ${c.text}`;
      for (const t of tokens(weighted)) bag.set(t, (bag.get(t) || 0) + 1);
      for (const t of bag.keys()) df.set(t, (df.get(t) || 0) + 1);
      return { chunk: c, bag };
    });
    INDEX = { docs, df, n: chunks.length };
    return INDEX;
  }

  const LATIN_TOKEN = /^[a-z][a-z0-9'-]*$/;

  /* Ordinary English words are not the subject of a question. Excluding them
     prevents "what is modern physics" being refused because the textbook never
     writes the word "modern". */
  const COMMON_EN = new Set(("modern classical general basic simple new old big small " +
    "difference between about first second third main important different same " +
    "explain define describe give tell mean means called name type kind part " +
    "please can you your there their some any more most very much many").split(" "));

  /* A Latin-script term absent from the whole corpus is usually the subject of
     an off-syllabus question ("Vin", "Ohm"). Answering anyway would match on the
     remaining generic word and produce a confident but wrong result. Arabic
     tokens are excluded from this rule: they are absent because they are
     colloquial, not because the topic is uncovered. */
  function namesSomethingUnknown(qt, df) {
    return qt.some((t) =>
      LATIN_TOKEN.test(t) && t.length > 2 && !COMMON_EN.has(t) && !df.has(t));
  }

  /** tf-idf scoring, plus how much of the question the chunk actually covers. */
  function inScope(chunk, scope) {
    if (!scope) return true;
    return (!scope.subject || chunk.subject === scope.subject)
      && (!scope.grade || chunk.grade === scope.grade);
  }

  async function retrieve(question, k = 3, scope = null) {
    const index = await buildIndex();
    const { df } = index;
    const docs = index.docs.filter((d) => inScope(d.chunk, scope));
    const n = docs.length || index.n;
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

  /* Refusal thresholds. Coverage separates a curriculum question from an
     off-syllabus one: an electricity question still matches "electron" and
     "field" and can score well while covering little of what was asked. Both
     values were swept against the 67-question gold set. */
  const RELEVANCE_FLOOR = 2.0;
  const COVERAGE_FLOOR = 0.35;
  const UNKNOWN_TERM_COVERAGE = 0.6; // stricter when the question names something unknown

  async function mockAsk(question, lang, scope) {
    const started = performance.now();
    const hits = await retrieve(question, 3, scope);
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
  async function liveAsk(question, lang, scope) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT_MS);
    try {
      const res = await fetch(`${CONFIG.BASE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          lang,
          // narrows retrieval when the box holds more than one curriculum
          subject: scope && scope.subject ? scope.subject : undefined,
          grade: scope && scope.grade ? scope.grade : undefined,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json();
      // tolerate missing fields so a schema change degrades gracefully
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
    ask(question, lang, scope) {
      return CONFIG.MODE === "live"
        ? liveAsk(question, lang, scope)
        : mockAsk(question, lang, scope);
    },
    async health() {
      if (CONFIG.MODE !== "live") {
        const chunks = await loadChunks();
        return { status: "ok", mode: "mock", chunks: chunks.length };
      }
      const res = await fetch(`${CONFIG.BASE_URL}/health`);
      if (!res.ok) throw new Error(`health check failed (${res.status})`);
      return { ...(await res.json()), mode: "live" };
    },
    /* Voice input. The browser SpeechRecognition API is not used: it uploads
       audio to a cloud service, which would break the offline guarantee. Audio
       is posted to the local server for on-device transcription. In mock mode
       the recording path runs but the text returned is a placeholder. */
    get canTranscribe() {
      return typeof MediaRecorder !== "undefined"
        && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    },

    /* True while no transcription backend exists. The interface must surface
       this: mock mode returns a sample question, not what the microphone
       captured. */
    get transcribeIsMock() {
      return CONFIG.MODE !== "live";
    },

    async transcribe(blob, lang) {
      if (CONFIG.MODE !== "live") {
        await new Promise((r) => setTimeout(r, 700));
        const pool = await this.suggestions(lang);
        return { text: pool[Math.floor(Math.random() * pool.length)], mock: true };
      }
      const form = new FormData();
      form.append("audio", blob, "question.webm");
      form.append("lang", lang);
      const res = await fetch(`${CONFIG.BASE_URL}/transcribe`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`transcription failed (${res.status})`);
      const data = await res.json();
      return { text: (data.text || "").trim() };
    },

    /** What the box actually holds, for the header context strip. */
    async meta() {
      const chunks = await loadChunks();
      const chapters = new Set(), subjects = new Set(), grades = new Set();
      for (const chunk of chunks) {
        chapters.add(chunk.chapter);
        if (chunk.subject) subjects.add(chunk.subject);
        if (chunk.grade) grades.add(chunk.grade);
      }
      // Returned as sets so a second curriculum needs no change here.
      return {
        subjects: [...subjects],
        grades: [...grades],
        chapters: chapters.size,
        chunks: chunks.length,
      };
    },

    /* Distinct subject and grade pairs present in the content. */
    async courses() {
      const chunks = await loadChunks();
      const map = new Map();
      for (const chunk of chunks) {
        const key = `${chunk.subject}|${chunk.grade}`;
        const entry = map.get(key)
          || { subject: chunk.subject, grade: chunk.grade, chapters: new Set(), chunks: 0 };
        entry.chapters.add(chunk.chapter);
        entry.chunks++;
        map.set(key, entry);
      }
      return [...map.values()].map((c) => ({ ...c, chapters: c.chapters.size }));
    },

    /** Used by the landing panel. */
    suggestions(lang) {
      const file = lang === "en" ? "data/suggestions.en.json" : "data/suggestions.json";
      return fetch(file).then((r) => r.json());
    },
  };
})();
