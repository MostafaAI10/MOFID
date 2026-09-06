/* Mofid - student app UI. Talks to the backend only through MofidAPI. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = { scroll: $("scroll"), thread: $("thread"), hero: $("hero"), chips: $("chips"),
    app: $("app"), form: $("composer"), input: $("input"), send: $("send"), status: $("status"),
    newChat: $("newChat"), context: $("context"), contextText: $("contextText"),
    filters: $("filters"), gradeOpts: $("gradeOpts"), subjectOpts: $("subjectOpts"),
    gradeLabel: $("gradeLabel"), subjectLabel: $("subjectLabel"),
    toBottom: $("toBottom"),
    mic: $("mic"), recorder: $("recorder"), recTime: $("recTime"), recLevel: $("recLevel"),
    recHint: $("recHint"), recCancel: $("recCancel"), recDone: $("recDone"),
    statusText: $("statusText"), lang: $("lang"), theme: $("theme"), foot: $("foot") };

  // --------------------------------------------------------------- strings
  const T = {
    ar: {
      dir: "rtl", other: "EN", title: "مفيد",
      heroTitle: "اسأل عن أي حاجة في منهجك",
      heroSub: "كل إجابة بترجع من كتاب المنهج نفسه، وهتلاقي تحتها الفصل والدرس اللي جات منه. ولو السؤال مش في منهجك، هقولك بصراحة.",
      placeholder: "اكتب سؤالك…",
      foot: "مفيد بيشتغل من غير إنترنت · الإجابات من كتاب المنهج نفسه",
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
      micLabel: "سؤال بالصوت",
      newChat: "محادثة جديدة",
      grades: { "7": "الأول الإعدادي", "8": "الثاني الإعدادي", "9": "الثالث الإعدادي",
                "10": "الأول الثانوي", "11": "الثاني الثانوي", "12": "الثالث الثانوي" },
      subjectsLabel: (n) => `${n} مواد`,
      gradesLabel: (n) => `${n} صفوف`,
      chaptersLabel: (n) => (n === 1 ? "فصل واحد" : n === 2 ? "فصلين" : `${n} فصول`),
      scopeSearching: (m) => `بدور في ${m.chunks} مقطع من المنهج…`,
      copy: "نسخ", copied: "اتنسخ",
      gradeWord: "الصف",
      subjectWord: "المادة",
      allWord: "الكل",
      everything: "كل المناهج الموجودة",
      changeCourse: "تغيير الصف أو المادة",
      recording: "بتسجّل…",
      recordingMock: "بتسجّل… (تجريبي)",
      sttMockNotice: "تحويل الصوت لنص لسه مش متوصّل بالسيرفر. النص اللي ظهر ده عيّنة من المنهج، مش كلامك. لما endpoint ‏/transcribe يجهز هيتحوّل كلامك فعلًا.",
      transcribing: "بحوّل الكلام لنص…",
      micDenied: "محتاج إذن الميكروفون. افتحي إعدادات الموقع في المتصفح واسمحي بالميكروفون.",
      micFailed: "مقدرتش أسجّل. اتأكدي إن في ميكروفون متوصّل.",
      sttFailed: "مقدرتش أحوّل الكلام لنص. جربي تاني أو اكتبي السؤال.",
      sttEmpty: "مسمعتش حاجة واضحة. جربي تاني.",
    },
    en: {
      dir: "ltr", other: "ع", title: "Mofid",
      heroTitle: "Ask anything from your curriculum",
      heroSub: "Every answer comes from the textbook itself, with the chapter and lesson it came from shown underneath. If it isn't in your curriculum, I'll say so.",
      placeholder: "Type your question…",
      foot: "Mofid runs with no internet · Answers come from the textbook itself",
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
      micLabel: "Ask by voice",
      newChat: "New conversation",
      grades: { "7": "Grade 7", "8": "Grade 8", "9": "Grade 9",
                "10": "Grade 10", "11": "Grade 11", "12": "Grade 12" },
      subjectsLabel: (n) => `${n} subjects`,
      gradesLabel: (n) => `${n} grades`,
      chaptersLabel: (n) => (n === 1 ? "1 chapter" : `${n} chapters`),
      scopeSearching: (m) => `Searching ${m.chunks} passages…`,
      copy: "Copy", copied: "Copied",
      gradeWord: "Grade",
      subjectWord: "Subject",
      allWord: "All",
      everything: "Everything on this box",
      changeCourse: "Change grade or subject",
      recording: "Recording…",
      recordingMock: "Recording… (placeholder mode)",
      sttMockNotice: "Speech-to-text is not connected to the server yet. The text above is a sample question from the curriculum, not what you said. It will transcribe for real once the /transcribe endpoint is available.",
      transcribing: "Transcribing…",
      micDenied: "Microphone permission is needed. Allow it in your browser's site settings.",
      micFailed: "Couldn't start recording. Check that a microphone is connected.",
      sttFailed: "Couldn't turn that into text. Try again, or type the question.",
      sttEmpty: "I didn't catch anything clear. Try again.",
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

  function nearBottom() {
    return el.scroll.scrollHeight - el.scroll.scrollTop - el.scroll.clientHeight < 120;
  }

  function toBottom(force) {
    if (!force && !nearBottom()) return; // never yank the page from under a reader
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
  function addUser(text, restoring) {
    const msg = node("div", "msg me");
    if (restoring) msg.style.animation = "none";
    msg.append(autoDir(node("div", "body", text)));
    el.thread.append(msg);
    toBottom(true);
    if (!restoring) { history.push({ role: "me", text }); saveHistory(); }
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

  /* Jump from an inline marker to the matching source card and open it. */
  function openCitation(msg, index) {
    const card = msg.querySelectorAll(".cite")[index];
    if (!card) return;
    if (!card.classList.contains("open")) card.querySelector("button").click();
    card.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 900);
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

  async function addAnswer(res, restoring) {
    const msg = node("div", "msg bot");
    if (restoring) msg.style.animation = "none";
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
      if (restoring) bodyEl.textContent = res.answer;
      else await revealText(bodyEl, res.answer);

      const seen = new Set();
      const cites = (res.citations || []).filter((c) => {
        const key = `${c.chapter}|${c.section}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      /* Attach a numbered marker to the paragraph each source produced, rather
         than leaving the sources stranded at the bottom of the answer. Only
         done when the answer splits into exactly as many paragraphs as there
         are sources, which is when the mapping is unambiguous; otherwise the
         cards below carry the citation on their own. */
      const paras = res.answer.split(/\n{2,}/).filter((x) => x.trim());
      if (cites.length && paras.length === cites.length && !restoring) {
        bodyEl.replaceChildren();
        paras.forEach((text, i) => {
          const para = node("p", "para", text);
          para.setAttribute("dir", "auto");
          const marker = node("button", "cite-marker", String(i + 1));
          marker.type = "button";
          marker.setAttribute("aria-label", `${t().source} ${i + 1}`);
          marker.addEventListener("click", () => openCitation(msg, i));
          para.append(marker);
          bodyEl.append(para);
        });
      }

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

    if (res.in_curriculum !== false && res.answer) {
      const row = node("div", "actions reveal");
      const copy = node("button", "action");
      copy.type = "button";
      copy.append(node("span", null, t().copy));
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(res.answer);
          copy.firstChild.textContent = t().copied;
          copy.classList.add("done");
          setTimeout(() => {
            copy.firstChild.textContent = t().copy;
            copy.classList.remove("done");
          }, 1600);
        } catch { /* clipboard blocked - nothing useful to say about it */ }
      });
      row.append(copy);
      msg.append(row);
    }

    if (res.latency_ms) msg.append(node("div", "meta reveal", t().took(res.latency_ms)));
    if (!msg.isConnected) el.thread.append(msg);
    toBottom();
    if (!restoring) { history.push({ role: "bot", res }); saveHistory(); }
  }

  function addNotice(text) {
    enterChatMode();
    const msg = node("div", "msg bot");
    const nf = node("div", "notfound");
    nf.append(node("div", "icon", "!"));
    nf.append(node("p", null, text));
    msg.append(nf);
    el.thread.append(msg);
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
    el.newChat.hidden = false;
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
    setBusy(true);
    el.send.disabled = true;
    enterChatMode();

    addUser(question);
    const pending = addThinking();

    try {
      const res = await MofidAPI.ask(question, lang, scope);
      pending.remove();
      await addAnswer(res);
    } catch (err) {
      console.error(err);
      pending.remove();
      addError();
    } finally {
      setBusy(false);
      syncSend();
      el.input.focus();
    }
  }

  /* Describes whatever the box happens to hold. One subject and one grade read
     naturally; more than one collapses to a count rather than a long list. */
  function scopeLabel(m) {
    const s = t();
    const subject = m.subjects.length === 1 ? m.subjects[0]
      : s.subjectsLabel(m.subjects.length);
    const grade = m.grades.length === 1 ? (s.grades[m.grades[0]] || m.grades[0])
      : s.gradesLabel(m.grades.length);
    const parts = [subject, grade, s.chaptersLabel(m.chapters)].filter(Boolean);
    return parts.join(" · ");
  }

  const SCOPE_KEY = "mofid.scope";

  function courseLabel(c) {
    const s = t();
    return `${c.subject} · ${s.grades[c.grade] || c.grade}`;
  }

  /* Grade and subject are independent filters, and neither is required. Leaving
     one unset means "search across all of them", which is the sensible default
     while the box holds a single curriculum and stays correct as more arrive.
     Options that would produce an empty search are disabled rather than hidden,
     so the student can see what exists without being able to reach a dead end. */
  function optionsFor(field) {
    const other = field === "grade" ? "subject" : "grade";
    const values = [...new Set(courses.map((c) => c[field]))];
    return values.map((value) => ({
      value,
      available: courses.some((c) => c[field] === value
        && (!scope[other] || c[other] === scope[other])),
    }));
  }

  function renderFilterRow(container, field) {
    container.replaceChildren();
    for (const opt of optionsFor(field)) {
      const b = node("button", "filter-opt");
      b.type = "button";
      b.textContent = field === "grade"
        ? (t().grades[opt.value] || opt.value)
        : opt.value;
      b.setAttribute("aria-pressed", String(scope[field] === opt.value));
      if (scope[field] === opt.value) b.classList.add("on");
      if (!opt.available) b.disabled = true;
      b.addEventListener("click", () => {
        // clicking the active option clears it, back to searching everything
        scope[field] = scope[field] === opt.value ? null : opt.value;
        saveScope();
        buildCoursePicker();
        paintContext();
        loadChips();
        el.input.focus();
      });
      container.append(b);
    }
  }

  function saveScope() {
    try {
      if (scope.subject || scope.grade) {
        sessionStorage.setItem(SCOPE_KEY, JSON.stringify(scope));
      } else {
        sessionStorage.removeItem(SCOPE_KEY);
      }
    } catch { /* storage unavailable - the choice will not survive a reload */ }
  }

  function buildCoursePicker() {
    if (!courses.length) {
      el.filters.hidden = true;
      el.context.disabled = true;
      return;
    }
    el.filters.hidden = false;
    el.gradeLabel.textContent = t().gradeWord;
    el.subjectLabel.textContent = t().subjectWord;
    renderFilterRow(el.gradeOpts, "grade");
    renderFilterRow(el.subjectOpts, "subject");
    el.context.disabled = false;
  }

  function openCoursePicker() {
    startNewChat();
  }

  function paintContext() {
    if (!scopeMeta) return;
    if (busy) {
      el.contextText.textContent = t().scopeSearching(scopeMeta);
      return;
    }
    const s = t();
    // Nothing narrowed - describe the whole box rather than a bare count.
    if (!scope.subject && !scope.grade) {
      el.contextText.textContent = scopeLabel(scopeMeta);
      el.context.title = s.changeCourse;
      return;
    }
    const parts = [];
    if (scope.subject) parts.push(scope.subject);
    if (scope.grade) parts.push(s.grades[scope.grade] || scope.grade);
    const matching = courses.filter((c) =>
      (!scope.subject || c.subject === scope.subject)
      && (!scope.grade || c.grade === scope.grade));
    const chapters = matching.reduce((sum, c) => sum + c.chapters, 0);
    if (chapters) parts.push(s.chaptersLabel(chapters));
    el.contextText.textContent = parts.join(" · ");
    el.context.title = s.changeCourse;
  }

  function setBusy(on) {
    busy = on;
    el.app.dataset.busy = on ? "true" : "false";
    paintContext();
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
    el.mic.setAttribute("aria-label", s.micLabel);
    el.mic.title = s.micLabel;
    el.newChat.setAttribute("aria-label", s.newChat);
    el.newChat.title = s.newChat;
    el.foot.textContent = s.foot;
    document.querySelectorAll("[data-i18n]").forEach((n) => {
      const key = n.dataset.i18n;
      if (s[key]) n.textContent = s[key];
    });
    paintStatus();
    paintContext();
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

  // ---------------------------------------------------------------- history
  /* The conversation is kept in sessionStorage, not localStorage: a reload or an
     accidental back-navigation should not lose the thread, but closing the tab
     must clear it. These are shared classroom devices, and the next student has
     no business seeing the previous one's questions. Nothing leaves the device
     and nothing is tied to a person - there are no accounts by design. */
  let scopeMeta = null;
  let courses = [];
  // Either field may be null, which means "do not narrow on this one".
  let scope = { subject: null, grade: null };
  let mockVoiceNoticeShown = false;
  const HISTORY_KEY = "mofid.thread";
  let history = [];

  function saveHistory() {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40)));
    } catch { /* private mode or a full quota - the thread stays on screen */ }
  }

  function clearHistory() {
    history = [];
    try { sessionStorage.removeItem(HISTORY_KEY); } catch { /* nothing to do */ }
  }

  async function restoreHistory() {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]"); } catch { return; }
    if (!Array.isArray(saved) || !saved.length) return;
    history = saved;
    enterChatMode();
    el.hero.hidden = true;
    for (const item of saved) {
      if (item.role === "me") addUser(item.text, true);
      else await addAnswer(item.res, true);
    }
    el.newChat.hidden = false;
  }

  function startNewChat() {
    clearHistory();
    el.thread.replaceChildren();
    el.newChat.hidden = true;
    el.app.dataset.mode = "landing";
    el.hero.hidden = false;
    el.hero.classList.remove("leaving");
    el.input.value = "";
    autogrow();
    syncSend();
    buildCoursePicker();
    loadChips();
    el.input.focus();
  }

  // ------------------------------------------------------------------ voice
  const rec = {
    media: null, stream: null, chunks: [], started: 0,
    timer: null, raf: null, audioCtx: null, analyser: null, cancelled: false,
  };

  function stopTracks() {
    if (rec.stream) rec.stream.getTracks().forEach((t) => t.stop());
    if (rec.audioCtx) rec.audioCtx.close().catch(() => {});
    clearInterval(rec.timer);
    cancelAnimationFrame(rec.raf);
    rec.stream = rec.audioCtx = rec.analyser = null;
  }

  function showRecorder(on) {
    el.recorder.hidden = !on;
    el.form.hidden = on;
    el.app.dataset.recording = on ? "true" : "false";
  }

  /* Draws the live input level. It is the only signal that the microphone is
     actually picking something up, which matters on shared classroom devices. */
  function meter() {
    const bars = el.recLevel.children;
    const data = new Uint8Array(rec.analyser.frequencyBinCount);
    const draw = () => {
      rec.analyser.getByteFrequencyData(data);
      const step = Math.floor(data.length / bars.length);
      for (let i = 0; i < bars.length; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += data[i * step + j];
        const v = Math.min(1, (sum / step) / 128);
        bars[i].style.transform = `scaleY(${(0.12 + v * 0.88).toFixed(3)})`;
      }
      rec.raf = requestAnimationFrame(draw);
    };
    draw();
  }

  function tick() {
    const secs = Math.floor((Date.now() - rec.started) / 1000);
    el.recTime.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    if (secs >= 120) stopRecording(false); // a question is never two minutes long
  }

  async function startRecording() {
    if (busy || rec.media) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      addNotice(err && err.name === "NotAllowedError" ? t().micDenied : t().micFailed);
      return;
    }
    rec.stream = stream;
    rec.chunks = [];
    rec.cancelled = false;

    try {
      rec.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      rec.analyser = rec.audioCtx.createAnalyser();
      rec.analyser.fftSize = 128;
      rec.audioCtx.createMediaStreamSource(stream).connect(rec.analyser);
      meter();
    } catch { /* the meter is decoration; recording matters more */ }

    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      .find((m) => MediaRecorder.isTypeSupported(m));
    rec.media = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.media.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
    rec.media.onstop = onRecordingStopped;
    rec.media.start();

    rec.started = Date.now();
    el.recTime.textContent = "0:00";
    el.recHint.textContent = MofidAPI.transcribeIsMock ? t().recordingMock : t().recording;
    rec.timer = setInterval(tick, 250);
    showRecorder(true);
  }

  function stopRecording(cancelled) {
    if (!rec.media) return;
    rec.cancelled = cancelled;
    try { rec.media.stop(); } catch { /* already stopped */ }
  }

  async function onRecordingStopped() {
    const blob = new Blob(rec.chunks, { type: rec.media.mimeType || "audio/webm" });
    rec.media = null;
    stopTracks();

    if (rec.cancelled || blob.size < 1200) {
      showRecorder(false);
      el.input.focus();
      return;
    }

    el.recHint.textContent = t().transcribing;
    el.app.dataset.transcribing = "true";
    try {
      const { text, mock } = await MofidAPI.transcribe(blob, lang);
      showRecorder(false);
      if (!text) {
        addNotice(t().sttEmpty);
      } else {
        if (mock && !mockVoiceNoticeShown) {
          mockVoiceNoticeShown = true;
          addNotice(t().sttMockNotice);
        }
        // Land it in the box rather than sending: transcription makes mistakes
        // and the student should get to fix them first.
        el.input.value = text;
        autogrow();
        syncSend();
      }
    } catch (err) {
      console.error(err);
      showRecorder(false);
      addNotice(t().sttFailed);
    } finally {
      el.app.dataset.transcribing = "false";
      el.input.focus();
    }
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

    el.newChat.addEventListener("click", startNewChat);
    el.context.addEventListener("click", openCoursePicker);
    el.toBottom.addEventListener("click", () => toBottom(true));
    el.scroll.addEventListener("scroll", () => {
      el.app.dataset.scrolled = el.scroll.scrollTop > 8 ? "true" : "false";
      el.toBottom.hidden = nearBottom() || !el.thread.children.length;
    }, { passive: true });

    if (MofidAPI.canTranscribe) {
      el.mic.hidden = false;
      el.mic.addEventListener("click", startRecording);
      el.recDone.addEventListener("click", () => stopRecording(false));
      el.recCancel.addEventListener("click", () => stopRecording(true));
    }

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

    Promise.all([MofidAPI.meta(), MofidAPI.courses()])
      .then(([m, list]) => {
        scopeMeta = m;
        courses = list;
        try {
          const saved = JSON.parse(sessionStorage.getItem(SCOPE_KEY) || "null");
          if (saved) {
            if (list.some((c) => c.subject === saved.subject)) scope.subject = saved.subject;
            if (list.some((c) => c.grade === saved.grade)) scope.grade = saved.grade;
          }
        } catch { /* nothing stored */ }
        buildCoursePicker();
        paintContext();
      })
      .catch(() => {});
    loadChips();
    checkHealth();
    restoreHistory();
    el.input.focus();

    const preset = params.get("q");
    if (preset) ask(preset);

    if ("serviceWorker" in navigator) {
      addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }

  init();
})();
