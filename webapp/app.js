/* Mofid - student app UI. Talks to the backend only through MofidAPI. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = { scroll: $("scroll"), thread: $("thread"), hero: $("hero"), chips: $("chips"),
    app: $("app"), form: $("composer"), input: $("input"), send: $("send"), status: $("status"),
    statusText: $("statusText"), lang: $("lang"), theme: $("theme"), foot: $("foot") };

  // --------------------------------------------------------------- strings
  const T = {
    ar: {
      dir: "rtl", other: "EN", title: "مفيد",
      heroTitle: "اسأل عن أي حاجة في منهجك",
      heroSub: "كل إجابة بترجع من كتاب المنهج نفسه، وهتلاقي تحتها الفصل والدرس اللي جات منه. ولو السؤال مش في منهجك، هقولك بصراحة.",
      placeholder: "اكتب سؤالك…",
      foot: "مفيد بيشتغل من غير إنترنت · الإجابات من منهج الفيزياء للصف الثالث الثانوي",
      thinking: "بدور في المنهج…",
      bot: "مفيد",
      source: "المصدر",
      sources: "المصادر",
      notFoundTitle: "ده مش في منهجك",
      notFoundBody: "مالقيتش الإجابة في كتاب المنهج، ومش هخمّن. اسأل مدرسك عن الموضوع ده.",
      offline: "بدون إنترنت",
      online: "متصل بالشبكة",
      down: "الخادم مش شغال",
      ready: "جاهز",
      errTitle: "في مشكلة",
      errBody: "مقدرتش أوصل للخادم. اتأكدي إنك متصلة بشبكة مفيد وجربي تاني.",
      fileTitle: "التطبيق محتاج يتفتح من سيرفر",
      fileBody: "انتي فاتحة الملف مباشرة (file://)، والمتصفح بيمنع تحميل ملفات المنهج كده. شغّلي السيرفر المحلي وافتحي العنوان اللي هيطلع:",
      took: (ms) => `الرد في ${(ms / 1000).toFixed(1)} ثانية`,
      themeLabel: "تبديل الوضع الليلي",
      sendLabel: "إرسال",
    },
    en: {
      dir: "ltr", other: "ع", title: "Mofid",
      heroTitle: "Ask anything from your curriculum",
      heroSub: "Every answer comes from the textbook itself, with the chapter and lesson it came from shown underneath. If it isn't in your curriculum, I'll say so.",
      placeholder: "Type your question…",
      foot: "Mofid runs with no internet · Answers from Grade 12 Physics",
      thinking: "Searching the curriculum…",
      bot: "Mofid",
      source: "Source",
      sources: "Sources",
      notFoundTitle: "This isn't in your curriculum",
      notFoundBody: "I couldn't find this in the textbook, and I won't guess. Ask your teacher about it.",
      offline: "No internet",
      online: "On network",
      down: "Server unreachable",
      ready: "Ready",
      errTitle: "Something went wrong",
      errBody: "I couldn't reach the server. Check you're connected to the Mofid network and try again.",
      fileTitle: "This app needs to be served",
      fileBody: "You opened the file directly (file://), and the browser blocks loading the curriculum that way. Start the local server and open the address it prints:",
      took: (ms) => `answered in ${(ms / 1000).toFixed(1)}s`,
      themeLabel: "Toggle dark mode",
      sendLabel: "Send",
    },
  };

  let lang = localStorage.getItem("mofid.lang") || "ar";
  let busy = false;
  const t = () => T[lang];

  // ----------------------------------------------------------------- utils
  function node(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* The curriculum is Arabic whatever the interface language is, so any node
     holding book text decides its own direction rather than inheriting the
     page's. Without this, Arabic paragraphs render LTR in the English UI and
     the punctuation lands on the wrong side. */
  function autoDir(n) {
    n.setAttribute("dir", "auto");
    return n;
  }

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Reveals the answer progressively. The response has already arrived in
     full, so this is presentation rather than real streaming; token streaming
     would require a streamed response from the backend. */
  function revealText(target, text) {
    if (reduceMotion) {
      target.textContent = text;
      return Promise.resolve();
    }
    const words = text.split(/(\s+)/);
    let i = 0;
    target.textContent = "";
    target.classList.add("typing");
    return new Promise((resolve) => {
      const step = () => {
        // a few words per frame, so long answers do not crawl
        const budget = Math.max(2, Math.round(words.length / 90));
        for (let n = 0; n < budget && i < words.length; n++, i++) {
          target.append(words[i]);
        }
        if (i < words.length) {
          if (i % 12 < budget) toBottom();
          requestAnimationFrame(step);
        } else {
          target.classList.remove("typing");
          toBottom();
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  function toBottom() {
    requestAnimationFrame(() => { el.scroll.scrollTop = el.scroll.scrollHeight; });
  }

  const MARK_PATHS = [
    "M22.5,28.5 L40.0,20.0 L40.0,74.5 L22.5,83.0 Z",
    "M34.3,25.8 L51.8,17.3 L51.8,71.8 L34.3,80.3 Z",
    "M46.1,23.1 L63.6,14.6 L63.6,69.1 L46.1,77.6 Z",
  ];

  /** The logo mark, same geometry as icons/ - see webapp/README.md. */
  function markEl(extraClass) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "mark" + (extraClass ? " " + extraClass : ""));
    svg.setAttribute("viewBox", "22 14 43 70");
    svg.setAttribute("aria-hidden", "true");
    MARK_PATHS.forEach((d, i) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "s" + (i + 1));
      path.setAttribute("d", d);
      svg.append(path);
    });
    return svg;
  }

  // ------------------------------------------------------------- rendering
  function addUser(text) {
    const msg = node("div", "msg me");
    msg.append(autoDir(node("div", "body", text)));
    el.thread.append(msg);
    toBottom();
  }

  function addThinking() {
    const msg = node("div", "msg bot");
    const box = node("div", "thinking");
    box.append(markEl(), node("span", null, t().thinking));
    msg.append(box);
    el.thread.append(msg);
    toBottom();
    return msg;
  }

  function citationEl(chunk, index) {
    const wrap = node("div", "cite");
    const head = node("button");
    head.type = "button";

    const badge = node("span", "badge", String(index + 1));
    const where = node("div", "where");
    where.append(autoDir(node("div", "chapter", chunk.chapter || "")),
                 autoDir(node("div", "section", chunk.section || "")));
    const caret = node("span", "caret");
    caret.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" ' +
      'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    head.append(badge, where, caret);

    const quote = autoDir(node("p", "quote", chunk.text || ""));
    const quoteWrap = node("div", "quote-wrap");
    quoteWrap.append(quote);

    head.addEventListener("click", () => {
      const open = wrap.classList.toggle("open");
      head.setAttribute("aria-expanded", String(open));
    });
    head.setAttribute("aria-expanded", "false");

    wrap.append(head, quoteWrap);
    return wrap;
  }

  async function addAnswer(res) {
    const msg = node("div", "msg bot");
    const who = node("div", "who");
    who.append(markEl(), node("span", null, t().bot));
    msg.append(who);

    if (res.in_curriculum === false) {
      const nf = node("div", "notfound");
      nf.append(node("div", "icon", "؟"));
      const body = node("div");
      body.append(node("strong", null, t().notFoundTitle),
                  node("p", null, res.answer || t().notFoundBody));
      nf.append(body);
      msg.append(nf);
    } else {
      const bodyEl = autoDir(node("div", "body"));
      msg.append(bodyEl);
      el.thread.append(msg);
      await revealText(bodyEl, res.answer);

      const seen = new Set();
      const cites = (res.citations || []).filter((c) => {
        const key = `${c.chapter}|${c.section}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (cites.length) {
        const box = node("div", "cites reveal");
        const label = node("div", "chapter",
          cites.length > 1 ? t().sources : t().source);
        label.style.cssText = "font-size:12px;color:var(--muted);margin-bottom:2px";
        box.append(label);
        cites.forEach((c, i) => box.append(citationEl(c, i)));
        msg.append(box);
      }
    }

    if (res.latency_ms) msg.append(node("div", "meta reveal", t().took(res.latency_ms)));
    if (!msg.isConnected) el.thread.append(msg);
    toBottom();
  }

  function addError() {
    const msg = node("div", "msg bot");
    const nf = node("div", "notfound");
    nf.append(node("div", "icon", "!"));
    const body = node("div");
    body.append(node("strong", null, t().errTitle), node("p", null, t().errBody));
    nf.append(body);
    msg.append(nf);
    el.thread.append(msg);
    toBottom();
  }

  // ------------------------------------------------------------------ send
  /* Switches from the landing layout to the conversation layout. The opening
     panel is animated out and the thread takes the full column; the composer
     keeps its position so focus is never displaced. */
  function enterChatMode() {
    if (el.app.dataset.mode === "chat") return;
    el.app.dataset.mode = "chat";
    if (reduceMotion) {
      el.hero.hidden = true;
      return;
    }
    el.hero.classList.add("leaving");
    el.hero.addEventListener("animationend", () => {
      el.hero.hidden = true;
      el.hero.classList.remove("leaving");
    }, { once: true });
  }

  async function ask(question) {
    if (busy || !question.trim()) return;
    busy = true;
    el.send.disabled = true;
    enterChatMode();

    addUser(question);
    const pending = addThinking();

    try {
      const res = await MofidAPI.ask(question, lang);
      pending.remove();
      await addAnswer(res);
    } catch (err) {
      console.error(err);
      pending.remove();
      addError();
    } finally {
      busy = false;
      syncSend();
      el.input.focus();
    }
  }

  // ---------------------------------------------------------------- status
  function paintStatus() {
    // The device has no uplink by design, so offline is the expected state.
    const offline = !navigator.onLine;
    el.status.dataset.state = offline ? "offline" : "online";
    el.statusText.textContent = offline ? t().offline : t().online;
  }

  async function checkHealth() {
    try {
      const h = await MofidAPI.health();
      if (navigator.onLine) el.statusText.textContent = t().ready;
      paintStatus();
      return h;
    } catch {
      el.status.dataset.state = "down";
      el.statusText.textContent = t().down;
    }
  }

  // ------------------------------------------------------------- language
  function applyLang() {
    const s = t();
    document.documentElement.lang = lang;
    document.documentElement.dir = s.dir;
    document.title = s.title;
    el.lang.textContent = s.other;
    el.lang.title = lang === "ar" ? "English" : "العربية";
    el.theme.setAttribute("aria-label", s.themeLabel);
    el.send.setAttribute("aria-label", s.sendLabel);
    el.input.placeholder = s.placeholder;
    el.foot.textContent = s.foot;
    document.querySelectorAll("[data-i18n]").forEach((n) => {
      const key = n.dataset.i18n;
      if (s[key]) n.textContent = s[key];
    });
    paintStatus();
    localStorage.setItem("mofid.lang", lang);
  }

  // ----------------------------------------------------------------- theme
  function applyTheme(mode) {
    document.documentElement.dataset.theme = mode;
    document.querySelector('meta[name="theme-color"]')
      .setAttribute("content", mode === "dark" ? "#000000" : "#ffffff");
    localStorage.setItem("mofid.theme", mode);
  }

  // ------------------------------------------------------------- composer
  function autogrow() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 168) + "px";
  }

  function syncSend() {
    el.send.disabled = busy || !el.input.value.trim();
  }

  /* Opened as file:// - fetch() is blocked against the local filesystem, so
     every request fails with a network-looking error that sends people hunting
     for the wrong problem. Say what is actually wrong instead. */
  function showFileProtocolNotice() {
    el.hero.hidden = true;
    const msg = node("div", "msg bot");
    const nf = node("div", "notfound");
    nf.append(node("div", "icon", "!"));
    const body = node("div");
    body.append(node("strong", null, t().fileTitle), node("p", null, t().fileBody));
    const cmd = node("pre", "cmd", [
      "cd webapp",
      "python -m http.server 8080 --bind 127.0.0.1",
    ].join("\n"));
    cmd.setAttribute("dir", "ltr");
    body.append(cmd);
    body.append(node("p", null, "http://127.0.0.1:8080"));
    nf.append(body);
    msg.append(nf);
    el.thread.append(msg);
    el.input.disabled = true;
    el.send.disabled = true;
  }

  // ------------------------------------------------------------------ init
  async function loadChips() {
    try {
      const all = await MofidAPI.suggestions(lang);
      // A different sample on each load
      const picks = all.sort(() => Math.random() - 0.5).slice(0, 4);
      el.chips.replaceChildren();
      picks.forEach((q, i) => {
        const b = node("button", "chip", q);
        b.type = "button";
        b.style.setProperty("--i", String(i));
        b.addEventListener("click", () => ask(q));
        el.chips.append(b);
      });
    } catch { /* suggestions are a nicety, never a blocker */ }
  }

  function init() {
    /* URL overrides, for testing and for the demo runbook:
       ?theme=light|dark   ?lang=ar|en   ?q=<question> (asks it on load) */
    const params = new URLSearchParams(location.search);

    if (["ar", "en"].includes(params.get("lang"))) lang = params.get("lang");

    let saved = params.get("theme") || localStorage.getItem("mofid.theme");
    if (!["light", "dark"].includes(saved)) {
      saved = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(saved);
    applyLang();

    el.input.addEventListener("input", () => { autogrow(); syncSend(); });
    el.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        el.form.requestSubmit();
      }
    });

    el.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = el.input.value.trim();
      if (!q) return;
      el.input.value = "";
      autogrow();
      ask(q);
    });

    el.lang.addEventListener("click", () => {
      lang = lang === "ar" ? "en" : "ar";
      applyLang();
      loadChips();
    });

    el.theme.addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });

    // Clicking the mark replays the opening animation.
    const headerMark = document.querySelector(".brand .mark");
    if (headerMark && !reduceMotion) {
      headerMark.addEventListener("click", () => {
        headerMark.classList.remove("intro");
        void headerMark.offsetWidth; // force a reflow so the animation restarts
        headerMark.classList.add("intro");
      });
    }

    addEventListener("online", paintStatus);
    addEventListener("offline", paintStatus);

    if (location.protocol === "file:") {
      el.status.dataset.state = "down";
      el.statusText.textContent = t().down;
      showFileProtocolNotice();
      return;
    }

    loadChips();
    checkHealth();
    el.input.focus();

    const preset = params.get("q");
    if (preset) ask(preset);

    if ("serviceWorker" in navigator) {
      addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }

  init();
})();
