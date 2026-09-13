/* Mofid - student app UI. Talks to the backend only through MofidAPI. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = { scroll: $("scroll"), thread: $("thread"), hero: $("hero"), chips: $("chips"),
    app: $("app"), form: $("composer"), input: $("input"), send: $("send"), status: $("status"),
    newChat: $("newChat"), context: $("context"), contextText: $("contextText"),
    picker: $("picker"), cards: $("cards"),
    pickBack: $("pickBack"), pickBackText: $("pickBackText"),
    toBottom: $("toBottom"),
    statusText: $("statusText"), lang: $("lang"), theme: $("theme"), foot: $("foot") };

  // --- strings ---
  const T = {
    ar: {
      dir: "rtl", other: "EN", title: "مفيد",
      heroTitle: "اسأل عن أي موضوع في منهجك",
      heroSub: "كل إجابة مأخوذة من كتاب المنهج، ويظهر أسفلها الفصل والدرس. وإذا كان السؤال خارج المنهج، يوضّح مفيد ذلك.",
      placeholder: "اكتب سؤالك…",
      foot: "مفيد يعمل دون إنترنت · الإجابات من كتاب المنهج",
      thinking: "جارٍ البحث في المنهج…",
      bot: "مفيد",
      source: "المصدر",
      sources: "المصادر",
      notFoundTitle: "هذا السؤال خارج المنهج",
      notFoundBody: "لم يُعثر على إجابة في كتاب المنهج. يُرجى الرجوع إلى المعلم في هذا الموضوع.",
      offline: "غير متصل",
      online: "متصل بالشبكة",
      down: "الخادم غير متاح",
      errTitle: "تعذّر الاتصال",
      errBody: "تعذّر الوصول إلى الخادم. يُرجى التأكد من الاتصال بشبكة مفيد ثم إعادة المحاولة.",
      fileTitle: "يجب تشغيل التطبيق من خادم",
      fileBody: "التطبيق مفتوح مباشرة من ملف (file://)، ولا يسمح المتصفح بتحميل ملفات المنهج بهذه الطريقة. يُرجى تشغيل الخادم المحلي وفتح العنوان التالي:",
      took: (ms) => `زمن الرد ${(ms / 1000).toFixed(1)} ثانية`,
      themeLabel: "تبديل الوضع الليلي",
      sendLabel: "إرسال",
      toBottom: "الانتقال إلى آخر المحادثة",
      newChat: "محادثة جديدة",
      grades: { "7": "الأول الإعدادي", "8": "الثاني الإعدادي", "9": "الثالث الإعدادي",
                "10": "الأول الثانوي", "11": "الثاني الثانوي", "12": "الثالث الثانوي" },
      subjectsLabel: (n) => `${n} مواد`,
      gradesLabel: (n) => `${n} صفوف`,
      chaptersLabel: (n) => (n === 1 ? "فصل واحد" : n === 2 ? "فصلان" : `${n} فصول`),
      scopeSearching: (m) => `جارٍ البحث في مقاطع المنهج (${m.chunks})…`,
      copy: "نسخ", copied: "تم النسخ",
      changeCourse: "تغيير الصف أو المادة",
      greetMorning: "صباح الخير",
      greetAfternoon: "مساء الخير",
      greetEvening: "مساء الخير",
      askGrade: "اختر الصف الدراسي",
      askSubject: "اختر المادة",
      readyToAsk: "اسأل عن أي موضوع في منهجك",
      notFoundIcon: "؟",
    },
    en: {
      dir: "ltr", other: "ع", title: "Mofid",
      heroTitle: "Ask anything from your curriculum",
      heroSub: "Every answer comes from the textbook, with its chapter and lesson shown underneath. If a question is outside the curriculum, Mofid says so.",
      placeholder: "Type your question…",
      foot: "Mofid works without internet · Answers come from the textbook",
      thinking: "Searching the curriculum…",
      bot: "Mofid",
      source: "Source",
      sources: "Sources",
      notFoundTitle: "This question is outside the curriculum",
      notFoundBody: "No answer was found in the textbook. Please ask your teacher about this topic.",
      offline: "No internet",
      online: "On network",
      down: "Server unavailable",
      errTitle: "Connection failed",
      errBody: "The server could not be reached. Check the connection to the Mofid network and try again.",
      fileTitle: "This app needs to be served",
      fileBody: "The app was opened directly from a file (file://), and the browser blocks loading the curriculum that way. Start the local server and open this address:",
      took: (ms) => `answered in ${(ms / 1000).toFixed(1)}s`,
      themeLabel: "Toggle dark mode",
      sendLabel: "Send",
      toBottom: "Jump to latest message",
      newChat: "New conversation",
      grades: { "7": "Grade 7", "8": "Grade 8", "9": "Grade 9",
                "10": "Grade 10", "11": "Grade 11", "12": "Grade 12" },
      subjectsLabel: (n) => `${n} subjects`,
      gradesLabel: (n) => `${n} grades`,
      chaptersLabel: (n) => (n === 1 ? "1 chapter" : `${n} chapters`),
      scopeSearching: (m) => `Searching ${m.chunks} passages…`,
      copy: "Copy", copied: "Copied",
      changeCourse: "Change grade or subject",
      greetMorning: "Good morning",
      greetAfternoon: "Good afternoon",
      greetEvening: "Good evening",
      askGrade: "Choose your grade",
      askSubject: "Choose a subject",
      readyToAsk: "Ask anything from your curriculum",
      notFoundIcon: "?",
    },
  };

  let lang = localStorage.getItem("mofid.lang") || "ar";
  let busy = false;
  const t = () => T[lang];

  // --- utils ---
  function node(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function autoDir(n) {
    n.setAttribute("dir", "auto");
    return n;
  }

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    if (!force && !nearBottom()) return;
    requestAnimationFrame(() => { el.scroll.scrollTop = el.scroll.scrollHeight; });
  }

  function svgEl(tag, attrs = {}) {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  const MARK_PATHS = [
    "M22.5,28.5 L40.0,20.0 L40.0,74.5 L22.5,83.0 Z",
    "M34.3,25.8 L51.8,17.3 L51.8,71.8 L34.3,80.3 Z",
    "M46.1,23.1 L63.6,14.6 L63.6,69.1 L46.1,77.6 Z",
  ];

  const fillMark = (svg) =>
    MARK_PATHS.forEach((d, i) => svg.append(svgEl("path", { class: `s${i + 1}`, d })));

  function markEl() {
    const svg = svgEl("svg", { class: "mark", viewBox: "22 14 43 70", "aria-hidden": "true" });
    fillMark(svg);
    return svg;
  }

  // [x, y, radius]
  const STARS = [
    [69.3, 117.3, 2.48], [828.2, 23.1, 4.03], [522.2, 66.5, 4.03], [478, 17.1, 2.17],
    [135.1, 88.5, 3.1], [1149.9, 50.7, 2.48], [95.4, 155.9, 2.48], [625.6, 24.2, 4.03],
    [95.2, 140.6, 3.1], [406, 91, 4.96], [117.2, 58.2, 4.03], [797.7, 19, 4.03],
    [1059.3, 122.4, 2.79], [1136.5, 102.5, 2.17], [1029.5, 122.8, 4.03], [640.5, 77.6, 2.17],
    [935.2, 138, 2.48], [1064.4, 147, 2.79], [322.8, 126.4, 3.1], [468.4, 119.8, 2.17],
    [798.1, 38.5, 4.03], [495, 133.7, 3.1], [229.5, 137.9, 4.96], [293.4, 55.1, 2.79],
    [466.3, 163.4, 2.48], [135.4, 11.7, 4.03], [604.2, 87.4, 2.17], [174.4, 59.5, 2.48],
    [277.5, 96.9, 3.1], [41.9, 67.1, 2.79],
  ];
  // [left foot, apex x, apex y, ridge foot, right foot, base y]
  const PYRAMIDS = [
    [48, 178, 92, 216, 308, 246], [258, 368, 124, 400, 478, 248], [438, 508, 172, 530, 578, 250],
  ];
  // [x, y, scale, flap delay, drift delay]
  const BIRDS = [[690, 108, 1, 0, 0], [742, 92, 0.78, 0.35, 1.4], [662, 86, 0.62, 0.7, 2.8]];

  function drawScene() {
    const svg = document.querySelector(".scene .horizon");
    const r2 = (n) => +n.toFixed(2);

    STARS.forEach(([x, y, r], i) => {
      const k = r2(r * 0.17);
      const [a, b, c, d] = [r2(x - r), r2(x - k), r2(x + k), r2(x + r)];
      const [e, f, g, h] = [r2(y - r), r2(y - k), r2(y + k), r2(y + r)];
      svg.insertBefore(svgEl("path", {
        class: "glint",
        style: `--d:${r2((i * 1.37) % 4.4)}s;--dur:${r2(2.8 + ((i * 0.91) % 3.7))}s`,
        d: `M${x} ${e} Q${c} ${f} ${d} ${y} Q${c} ${g} ${x} ${h} Q${b} ${g} ${a} ${y} Q${b} ${f} ${x} ${e} Z`,
      }), svg.querySelector(".moon-glow"));
    });

    PYRAMIDS.forEach(([l, ax, ay, rf, r, base], n) => {
      const group = svgEl("g", { class: "pyr", style: `--n:${n}` });
      group.append(
        svgEl("path", { class: "face lit", d: `M${l} ${base} L${ax} ${ay} L${rf} ${base} Z` }),
        svgEl("path", { class: "face dim", d: `M${ax} ${ay} L${r} ${base} L${rf} ${base} Z` }),
        svgEl("path", { class: "edge", d: `M${l} ${base} L${ax} ${ay} L${r} ${base}` }),
        svgEl("path", { class: "ridge", d: `M${ax} ${ay} L${rf} ${base}` }),
      );
      svg.insertBefore(group, svg.querySelector(".dune.near"));
    });

    BIRDS.forEach(([x, y, scale, flap, drift]) => {
      const bird = svgEl("g", { class: "bird", transform: `translate(${x} ${y}) scale(${scale})` });
      bird.append(
        svgEl("path", { class: "wing left", d: "M0 0 c-7-8 -14-9 -19-6" }),
        svgEl("path", { class: "wing right", d: "M0 0 c7-8 14-9 19-6" }),
      );
      const flock = svgEl("g", { class: "flock", style: `--fd:${flap}s;--bd:${drift}s` });
      flock.append(bird);
      svg.insertBefore(flock, svg.querySelector(".sweep"));
    });

    document.querySelectorAll("svg[data-mark]").forEach(fillMark);
  }
  drawScene();

  // --- rendering ---
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
      nf.append(node("div", "icon", t().notFoundIcon));
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
        } catch {}
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

  // --- send ---
  function enterChatMode() {
    pickerAnswered = true;
    if (el.app.dataset.mode === "chat") return;
    el.app.dataset.mode = "chat";
    el.newChat.hidden = false;
    el.chips.hidden = false;
    el.context.hidden = false;
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

  let step = "grade";

  const SUBJECT_ICONS = {
    default: '<path d="M4 5a2 2 0 0 1 2-2h11v18H6a2 2 0 0 1-2-2z"/><path d="M17 3h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-1"/>',
    physics: '<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="9.5" ry="4" /><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(120 12 12)"/>',
    chemistry: '<path d="M9 3h6M10 3v6.5L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.5V3"/><path d="M7.5 15h9"/>',
    maths: '<path d="M5 6h8M9 3v6M5 18h8M5 15.5h8M16 6l5 5M21 6l-5 5M18.5 16.5h4M18.5 20h4"/>',
    arabic: '<path d="M6 15c0-3 2-5 5-5s5 2 5 5"/><path d="M4 19h16"/><circle cx="17" cy="7" r="1"/>',
    english: '<path d="M4 19l6-14 6 14M6.5 14h7"/><path d="M18 19V9m0 0h1.6a2.4 2.4 0 0 1 0 4.8H18"/>',
    biology: '<path d="M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 21h10M6 8h12M6.5 16h11"/>',
    geology: '<path d="M3 19l6-11 4 6 3-4 5 9z"/>',
  };

  const SUBJECT_KEYS = [
    [/فيزياء|physics/i, "physics"],
    [/كيمياء|chemistry/i, "chemistry"],
    [/رياضيات|رياضة|math/i, "maths"],
    [/عرب|arabic/i, "arabic"],
    [/انجليز|إنجليز|english/i, "english"],
    [/أحياء|احياء|biology/i, "biology"],
    [/جيولوجيا|geology/i, "geology"],
  ];

  function subjectIcon(name) {
    const hit = SUBJECT_KEYS.find(([re]) => re.test(name || ""));
    const paths = SUBJECT_ICONS[hit ? hit[1] : "default"];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }

  function gradesAvailable() {
    return [...new Set(courses.map((c) => c.grade))]
      .sort((a, b) => Number(a) - Number(b));
  }

  function subjectsFor(grade) {
    return courses.filter((c) => !grade || c.grade === grade);
  }

  function makeCard(opts) {
    const b = node("button", "card" + (opts.on ? " on" : ""));
    b.type = "button";
    b.style.setProperty("--i", String(opts.i));
    if (opts.icon) {
      const ic = node("span", "card-icon");
      ic.innerHTML = opts.icon;
      b.append(ic);
    }
    const text = node("span", "card-text");
    text.append(node("span", "card-title", opts.title));
    if (opts.meta) text.append(node("span", "card-meta", opts.meta));
    b.append(text);
    b.addEventListener("click", opts.onClick);
    return b;
  }

  function isPicking() {
    return el.app.dataset.mode !== "chat" && !pickerAnswered && courses.length > 0;
  }

  function paintPickingState() {
    const picking = isPicking();
    el.chips.hidden = picking;
    el.context.hidden = picking;
  }

  function renderPicker() {
    const s = t();
    if (!courses.length) {
      el.picker.hidden = true;
      el.context.disabled = true;
      return;
    }
    el.context.disabled = false;
    if (pickerAnswered) {
      el.picker.hidden = true;
      el.pickBack.hidden = true;
      el.hero.querySelector("h2").textContent = greeting();
      el.hero.querySelector("p").textContent = s.readyToAsk;
      return;
    }
    el.picker.hidden = false;
    el.context.disabled = false;
    el.cards.replaceChildren();

    if (step === "grade") {
      el.pickBack.hidden = true;
      el.hero.querySelector("h2").textContent = `${greeting()}`;
      el.hero.querySelector("p").textContent = s.askGrade;
      gradesAvailable().forEach((g, i) => {
        const subjects = subjectsFor(g);
        el.cards.append(makeCard({
          i,
          title: s.grades[g] || g,
          meta: subjects.length === 1 ? subjects[0].subject
            : s.subjectsLabel(subjects.length),
          on: scope.grade === g,
          onClick: () => chooseGrade(g),
        }));
      });
      return;
    }

    el.pickBack.hidden = false;
    el.pickBackText.textContent = s.grades[scope.grade] || scope.grade;
    el.hero.querySelector("h2").textContent = s.askSubject;
    el.hero.querySelector("p").textContent = "";
    subjectsFor(scope.grade).forEach((c, i) => {
      el.cards.append(makeCard({
        i,
        icon: subjectIcon(c.subject),
        title: c.subject,
        meta: `${t().chaptersLabel(c.chapters)}`,
        on: scope.subject === c.subject,
        onClick: () => chooseSubject(c),
      }));
    });
  }

  function greeting() {
    const h = new Date().getHours();
    const s = t();
    if (h < 12) return s.greetMorning;
    if (h < 17) return s.greetAfternoon;
    return s.greetEvening;
  }

  function chooseGrade(g) {
    scope.grade = g;
    scope.subject = null;
    step = "subject";
    saveScope();
    renderPicker();
    paintPickingState();
    paintContext();
    loadChips();
  }

  function chooseSubject(c) {
    scope.subject = c.subject;
    pickerAnswered = true;
    saveScope();
    renderPicker();
    paintPickingState();
    paintContext();
    loadChips();
    el.input.focus();
  }

  function backToGrades() {
    step = "grade";
    scope.subject = null;
    saveScope();
    renderPicker();
    paintPickingState();
    paintContext();
    loadChips();
  }

  function saveScope() {
    try {
      if (scope.subject || scope.grade) {
        sessionStorage.setItem(SCOPE_KEY, JSON.stringify(scope));
      } else {
        sessionStorage.removeItem(SCOPE_KEY);
      }
    } catch {}
  }

  function buildCoursePicker() {
    step = scope.grade ? "subject" : "grade";
    renderPicker();
    paintPickingState();
  }

  function openCoursePicker() {
    if (courses.length < 2 && !scope.subject) return;
    scope = { subject: null, grade: null };
    pickerAnswered = false;
    saveScope();
    startNewChat();
  }

  function paintContext() {
    if (!scopeMeta) return;
    if (busy) {
      el.contextText.textContent = t().scopeSearching(scopeMeta);
      return;
    }
    const s = t();
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

  // --- status ---
  function paintStatus() {
    const offline = !navigator.onLine;
    el.status.dataset.state = offline ? "offline" : "online";
    el.statusText.textContent = offline ? t().offline : t().online;
  }

  async function checkHealth() {
    try {
      const h = await MofidAPI.health();
      paintStatus();
      return h;
    } catch {
      el.status.dataset.state = "down";
      el.statusText.textContent = t().down;
    }
  }

  // --- language ---
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
    el.newChat.setAttribute("aria-label", s.newChat);
    el.newChat.title = s.newChat;
    el.toBottom.setAttribute("aria-label", s.toBottom);
    el.foot.textContent = s.foot;
    document.querySelectorAll("[data-i18n]").forEach((n) => {
      const key = n.dataset.i18n;
      if (s[key]) n.textContent = s[key];
    });
    paintStatus();
    paintContext();
    if (courses.length) renderPicker();
    localStorage.setItem("mofid.lang", lang);
  }

  // --- theme ---
  function applyTheme(mode) {
    document.documentElement.dataset.theme = mode;
    document.querySelector('meta[name="theme-color"]')
      .setAttribute("content", mode === "dark" ? "#000000" : "#ffffff");
    localStorage.setItem("mofid.theme", mode);
  }

  // --- composer ---
  function autogrow() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 168) + "px";
  }

  function syncSend() {
    el.send.disabled = busy || !el.input.value.trim();
  }

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

  // --- history ---
  let scopeMeta = null;
  let courses = [];
  let scope = { subject: null, grade: null };
  let pickerAnswered = false;
  const HISTORY_KEY = "mofid.thread";
  let history = [];

  function saveHistory() {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40)));
    } catch {}
  }

  function clearHistory() {
    history = [];
    try { sessionStorage.removeItem(HISTORY_KEY); } catch {}
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
    el.scroll.scrollTop = 0;
    el.toBottom.hidden = true;
    el.app.dataset.scrolled = "false";
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

  // --- init ---
  async function loadChips() {
    try {
      const all = await MofidAPI.suggestions(lang);
      const picks = all.sort(() => Math.random() - 0.5).slice(0, 4);
      el.chips.replaceChildren();
      picks.forEach((q, i) => {
        const b = node("button", "chip", q);
        b.type = "button";
        b.style.setProperty("--i", String(i));
        b.addEventListener("click", () => ask(q));
        el.chips.append(b);
      });
    } catch {}
  }

  function init() {
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
    el.pickBack.addEventListener("click", backToGrades);
    el.toBottom.addEventListener("click", () => toBottom(true));
    el.scroll.addEventListener("scroll", () => {
      el.app.dataset.scrolled = el.scroll.scrollTop > 8 ? "true" : "false";
      el.toBottom.hidden = nearBottom() || !el.thread.children.length;
    }, { passive: true });

    el.lang.addEventListener("click", () => {
      lang = lang === "ar" ? "en" : "ar";
      applyLang();
      loadChips();
    });

    el.theme.addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });

    const headerMark = document.querySelector(".brand .mark");
    if (headerMark && !reduceMotion) {
      headerMark.addEventListener("click", () => {
        headerMark.classList.remove("intro");
        void headerMark.offsetWidth;
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
            if (scope.subject) pickerAnswered = true;
          }
        } catch {}
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
