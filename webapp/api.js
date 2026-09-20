/* Mofid - the app's only contact point with the backend. See API_CONTRACT.md. */
const MofidAPI = (() => {
  const BASE_URL = "";
  const TIMEOUT_MS = 90000;

  let chunks = null;
  const loadChunks = () => (chunks ||= fetch("data/curriculum.json").then((r) => r.json()));

  async function ask(question, lang, scope = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          lang,
          subject: scope.subject || undefined,
          grade: scope.grade || undefined,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json();
      return {
        answer: data.answer ?? "",
        in_curriculum: data.in_curriculum ?? true,
        citations: data.citations ?? [],
        latency_ms: data.latency_ms,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function health() {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error(`health check failed (${res.status})`);
    return res.json();
  }

  async function loadCurriculum() {
    try {
      const res = await fetch(`${BASE_URL}/curriculum`);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch {}
    // Fallback if offline or backend unreachable
    const all = await loadChunks();
    const byCourse = new Map();
    for (const c of all) {
      const key = `${c.subject}|${c.grade}`;
      const entry = byCourse.get(key)
        || { subject: c.subject, grade: c.grade, chapters: new Set(), chunks: 0 };
      entry.chapters.add(c.chapter);
      entry.chunks++;
      byCourse.set(key, entry);
    }
    return {
      courses: [...byCourse.values()].map((c) => ({ ...c, chapters: c.chapters.size })),
      meta: {
        subjects: [...new Set(all.map((c) => c.subject))],
        grades: [...new Set(all.map((c) => c.grade))],
        chapters: new Set(all.map((c) => c.chapter)).size,
        chunks: all.length,
      },
    };
  }

  async function meta() {
    const cur = await loadCurriculum();
    return cur.meta;
  }

  async function courses() {
    const cur = await loadCurriculum();
    return cur.courses;
  }

  async function suggestions(lang, scope = {}) {
    try {
      const params = new URLSearchParams({ lang });
      if (scope.subject) params.set("subject", scope.subject);
      if (scope.grade) params.set("grade", scope.grade);
      const res = await fetch(`${BASE_URL}/suggestions?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.suggestions && data.suggestions.length) return data.suggestions;
      }
    } catch {}
    // Fallback to static files
    return fetch(lang === "en" ? "data/suggestions.en.json" : "data/suggestions.json").then((r) => r.json());
  }

  return { ask, health, meta, courses, suggestions };
})();
