import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleHelp,
  CloudUpload,
  Database,
  Download,
  FileJson,
  FileText,
  FileUp,
  Filter,
  KeyRound,
  LayoutDashboard,
  Library,
  LoaderCircle,
  LogOut,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import { api, apiForm, ApiError, clearSession, setUnauthorizedHandler } from "./api.js";

const REQUIRED_FIELDS = ["id", "subject", "grade", "chapter", "section", "text"];
const EMPTY_CHUNK = { id: "", subject: "", grade: "", chapter: "", section: "", text: "" };
const TYPE_LABEL = { pdf: "PDF", docx: "Word", txt: "نص", json: "JSON" };
const DOC_STATUS_LABEL = { indexed: "مفهرس" };
const tabs = [
  { id: "overview", label: "نظرة عامة", icon: LayoutDashboard },
  { id: "faq", label: "أسئلة الطلاب", icon: CircleHelp },
  { id: "topics", label: "المواضيع", icon: BarChart3 },
  { id: "insights", label: "التحليلات", icon: TrendingUp },
  { id: "content", label: "مكتبة المحتوى", icon: Library },
  { id: "upload", label: "إضافة محتوى", icon: CloudUpload },
  { id: "system", label: "حالة النظام", icon: ShieldCheck },
  { id: "settings", label: "الإعدادات", icon: KeyRound },
];

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return date.toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function formatMs(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return "أقل من ثانية";
  return `${(ms / 1000).toLocaleString("ar-EG", { maximumFractionDigits: 1 })} ثانية`;
}

function describeError(err, fallback) {
  return err?.detail || err?.message || fallback;
}

function parseFile(text) {
  const data = JSON.parse(text);
  const chunks = Array.isArray(data) ? data : data.chunks;
  if (!Array.isArray(chunks)) throw new Error('يجب أن يحتوي الملف على مصفوفة مقاطع أو كائن بصيغة { "chunks": [...] }');
  chunks.forEach((chunk, index) => {
    if (!chunk || typeof chunk !== "object") throw new Error(`العنصر رقم ${index + 1} ليس مقطعًا صالحًا`);
    REQUIRED_FIELDS.forEach((field) => {
      if (typeof chunk[field] !== "string" || !chunk[field].trim()) throw new Error(`المقطع رقم ${index + 1} ناقص الحقل «${field}»`);
    });
  });
  return chunks;
}

// The /content endpoint paginates. Fetch every page (deduping by id, since
// collection order is not guaranteed stable across calls) so the chunks table
// can search and count the real library, not just the first page.
async function fetchAllChunks() {
  const pageSize = 500;
  const first = await api(`/content?page=1&page_size=${pageSize}`);
  const seen = new Set();
  let chunks = (first.chunks ?? []).filter((chunk) => {
    if (seen.has(chunk.id)) return false;
    seen.add(chunk.id);
    return true;
  });
  const total = first.total ?? chunks.length;
  const lastPage = Math.ceil(total / pageSize);
  for (let page = 2; page <= lastPage; page += 1) {
    const pageRes = await api(`/content?page=${page}&page_size=${pageSize}`);
    for (const chunk of pageRes.chunks ?? []) {
      if (seen.has(chunk.id)) continue;
      seen.add(chunk.id);
      chunks = [...chunks, chunk];
    }
  }
  return { chunks, total };
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><span /><span /><span /></span>
      <span><strong>مفيد</strong><small>مركز المعرفة التعليمي</small></span>
    </div>
  );
}

function StatusPill({ online, loading }) {
  return (
    <span className={`status-pill ${online ? "online" : "offline"}`}>
      <span className="status-dot" />
      {loading ? "جارٍ الفحص" : online ? "الخادم متصل" : "الخادم غير متاح"}
    </span>
  );
}

function Metric({ icon: Icon, label, value, note, accent }) {
  return (
    <article className={`metric metric-${accent}`}>
      <div className="metric-icon"><Icon size={18} /></div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={22} /></div>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function Alert({ kind, children, onClose }) {
  return (
    <div className={`alert ${kind}`}>
      {kind === "error" ? <AlertCircle size={16} /> : kind === "success" ? <CheckCircle2 size={16} /> : <Sparkles size={16} />}
      <span>{children}</span>
      {onClose && (
        <button onClick={onClose} aria-label="إغلاق"><X size={16} /></button>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state">
      <LoaderCircle className="spin" size={22} />
      <span>جارٍ تحميل البيانات…</span>
    </div>
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef(null);

  useEffect(() => { usernameRef.current?.focus(); }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      sessionStorage.setItem("mofid.teacher.token", response.token);
      sessionStorage.setItem("mofid.teacher.user", response.username || username);
      onLogin(response.username || username);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "اسم المستخدم أو كلمة المرور غير صحيحة."
          : "تعذّر الاتصال بالخادم. تأكدي من تشغيله ثم حاولي مرة أخرى.",
      );
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(username.trim()) && Boolean(password);

  return (
    <main className="login-shell">
      <form className="surface login-card" onSubmit={submit}>
        <Brand />
        <p className="eyebrow">مساحة المعلم</p>
        <h1>تسجيل الدخول</h1>
        <p className="section-copy">أدخلي بيانات الحساب للوصول إلى محتوى الطلاب وتحليلاتهم.</p>
        <label>اسم المستخدم
          <input ref={usernameRef} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label>كلمة المرور
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        <button className="primary-button login-button" disabled={busy || !canSubmit}>
          {busy ? "جارٍ الدخول…" : "دخول إلى اللوحة"}
        </button>
      </form>
    </main>
  );
}

function App() {
  const [username, setUsername] = useState(() => sessionStorage.getItem("mofid.teacher.user") || "");
  const [activeTab, setActiveTab] = useState("overview");
  const [faq, setFaq] = useState([]);
  const [topics, setTopics] = useState([]);
  const [analytics, setAnalytics] = useState({ trends: [], unresolved: [], total_questions: 0, in_curriculum: 0 });
  const [usage, setUsage] = useState({ questions_today: 0, questions_this_week: 0, refusal_rate: 0, avg_latency_ms: 0 });
  const [content, setContent] = useState({ courses: [], chunks_indexed: 0 });
  const [contentChunks, setContentChunks] = useState([]);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [documents, setDocuments] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ subject: "", grade: "", days: "30" });
  const [lastSync, setLastSync] = useState(null);

  function logout() {
    clearSession();
    setUsername("");
    setActiveTab("overview");
  }

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, []);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      const [healthData, faqData, analyticsData, contentData, chunkData, usageData, documentsData] = await Promise.all([
        api("/health"),
        api("/faq"),
        api(`/teacher/analytics?${params}`),
        api("/teacher/content"),
        fetchAllChunks(),
        api("/analytics/usage"),
        api("/documents"),
      ]);
      setHealth(healthData);
      setFaq(faqData.questions ?? []);
      setTopics(faqData.by_chapter ?? []);
      setAnalytics(analyticsData);
      setContent(contentData);
      setContentChunks(chunkData.chunks ?? []);
      setChunkTotal(chunkData.total ?? 0);
      setUsage(usageData);
      setDocuments(documentsData.documents ?? []);
      setLastSync(new Date());
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setError("تعذّر تحميل بيانات اللوحة. تأكدي من تشغيل الخادم ثم حاولي مرة أخرى.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (username) refresh();
  }, [filters, username, activeTab]);

  const filteredFaq = useMemo(
    () => faq.filter((item) => item.question?.toLowerCase().includes(query.toLowerCase())),
    [faq, query],
  );
  const totalQuestions = faq.reduce((sum, item) => sum + (item.count || 0), 0);
  const inCurriculum = faq.filter((item) => item.in_curriculum).length;

  if (!username) {
    return <Login onLogin={(value) => setUsername(value)} />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-label">إدارة المحتوى</div>
        <nav className="sidebar-nav" aria-label="التنقل الرئيسي">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button className={activeTab === id ? "active" : ""} key={id} onClick={() => setActiveTab(id)}>
              <Icon size={18} />
              <span>{label}</span>
              {id === "faq" && faq.length > 0 && <em>{faq.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="offline-note">
            <Sparkles size={17} />
            <div>
              <strong>مفيد يعمل محليًا</strong>
              <span>بيانات طلابك تبقى داخل الشبكة</span>
            </div>
          </div>
          <a className="student-link" href="/" target="_blank" rel="noreferrer">
            فتح واجهة الطالب <ArrowUpRight size={15} />
          </a>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><Brand /></div>
          <div className="breadcrumb">
            <span>لوحة المعلم</span>
            <ChevronLeft size={14} />
            <strong>{tabs.find((tab) => tab.id === activeTab)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <StatusPill online={Boolean(health)} loading={loading} />
            <button className="icon-button" onClick={refresh} aria-label="تحديث البيانات" title="تحديث البيانات">
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
            <button className="icon-button" onClick={logout} aria-label="تسجيل الخروج" title="تسجيل الخروج">
              <LogOut size={17} />
            </button>
            <span className="avatar" aria-hidden="true">م</span>
          </div>
        </header>
        <section className="content-wrap">
          <div className="page-heading">
            <div>
              <p className="eyebrow">مساحة عمل مفيد</p>
              <h1>{activeTab === "overview" ? "أهلًا بعودتك" : tabs.find((tab) => tab.id === activeTab)?.label}</h1>
              <p className="lede">راجعي ما يحتاجه طلابك، وحدّثي مكتبة مفيد في خطوة واحدة.</p>
            </div>
            <div className="heading-date">
              <Activity size={16} />
              <span>{lastSync ? `آخر مزامنة ${formatTime(lastSync)}` : "لم تُزامَن البيانات بعد"}</span>
            </div>
          </div>
          {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

          {activeTab === "overview" && (
            <Overview health={health} usage={usage} faq={faq} topics={topics} totalQuestions={totalQuestions} inCurriculum={inCurriculum} documents={documents} onNavigate={setActiveTab} loading={loading} />
          )}
          {activeTab === "faq" && <FaqPanel items={filteredFaq} query={query} setQuery={setQuery} onRefresh={refresh} loading={loading} analytics={analytics} filters={filters} setFilters={setFilters} />}
          {activeTab === "topics" && <TopicsPanel items={topics} loading={loading} />}
          {activeTab === "insights" && <InsightsPanel analytics={analytics} filters={filters} setFilters={setFilters} loading={loading} />}
          {activeTab === "content" && <ContentPanel content={content} chunks={contentChunks} total={chunkTotal} documents={documents} loading={loading} onRefresh={refresh} onNavigate={setActiveTab} />}
          {activeTab === "upload" && <UploadPanel onDone={refresh} onNavigate={setActiveTab} onRefresh={refresh} documents={documents} content={content} />}
          {activeTab === "system" && <SystemPanel health={health} usage={usage} content={content} documents={documents} loading={loading} onRefresh={refresh} />}
          {activeTab === "settings" && <SettingsPanel />}
        </section>
      </main>
    </div>
  );
}

function Overview({ health, usage, faq, topics, totalQuestions, inCurriculum, documents, onNavigate, loading }) {
  const inCurriculumPercent = usage.questions_this_week
    ? Math.round((1 - (usage.refusal_rate ?? 0)) * 100)
    : totalQuestions
      ? Math.round((inCurriculum / totalQuestions) * 100)
      : null;
  return (
    <>
      <div className="metric-grid">
        <Metric icon={Database} label="المقاطع المفهرسة" value={health?.chunks_indexed ?? "—"} note="منهج متاح للبحث" accent="blue" />
        <Metric icon={CircleHelp} label="أسئلة هذا الأسبوع" value={usage.questions_this_week || totalQuestions || "—"} note={`${usage.questions_today || 0} اليوم`} accent="yellow" />
        <Metric icon={CheckCircle2} label="داخل المنهج" value={inCurriculumPercent === null ? "—" : `${inCurriculumPercent}%`} note="نسبة الأسئلة المرتبطة بالمحتوى" accent="green" />
        <Metric icon={Library} label="المستندات المرفوعة" value={documents.length} note="مصادر المكتبة" accent="coral" />
      </div>
      <div className="dashboard-grid">
        <section className="surface activity-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">نبض الفصل</p>
              <h2>ما الذي يشغل طلابك؟</h2>
            </div>
            <button className="text-button" onClick={() => onNavigate("topics")}>عرض كل المواضيع <ChevronLeft size={15} /></button>
          </div>
          {loading ? (
            <LoadingState />
          ) : topics.length ? (
            <div className="topic-list">
              {topics.slice(0, 5).map((topic, index) => (
                <div className="topic-row" key={topic.chapter}>
                  <div className="topic-rank">{index + 1}</div>
                  <div className="topic-info">
                    <strong>{topic.chapter}</strong>
                    <div className="topic-bar"><i style={{ width: `${Math.max(8, (topic.count / topics[0].count) * 100)}%` }} /></div>
                  </div>
                  <span>{topic.count} سؤال</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={BarChart3} title="لا توجد أسئلة بعد" body="ستظهر المواضيع هنا بعد تفاعل الطلاب مع مفيد." />
          )}
        </section>
        <section className="surface quick-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">وصول سريع</p>
              <h2>أكمل من هنا</h2>
            </div>
            <Sparkles size={20} className="section-spark" />
          </div>
          <button className="quick-action" onClick={() => onNavigate("upload")}>
            <span className="quick-icon blue-bg"><UploadCloud size={19} /></span>
            <span><strong>أضف مستندًا للمنهج</strong><small>ارفع PDF أو Word وافهرسه تلقائيًا</small></span>
            <ChevronLeft size={16} />
          </button>
          <button className="quick-action" onClick={() => onNavigate("content")}>
            <span className="quick-icon yellow-bg"><FileText size={19} /></span>
            <span><strong>مكتبة المحتوى</strong><small>{documents.length ? `${documents.length} مستندًا مرفوعًا` : "ارفع أول مستند الآن"}</small></span>
            <ChevronLeft size={16} />
          </button>
          <div className="tip"><Sparkles size={16} /><span>المحتوى الموثّق يجعل إجابات مفيد أدق وأكثر فائدة.</span></div>
        </section>
      </div>
    </>
  );
}

function FilterBar({ filters, setFilters }) {
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <div className="filter-bar">
      <div className="filter-label"><Filter size={15} /> تصفية البيانات</div>
      <label>الفترة
        <select value={filters.days} onChange={(event) => update("days", event.target.value)}>
          <option value="7">آخر 7 أيام</option>
          <option value="30">آخر 30 يومًا</option>
          <option value="90">آخر 90 يومًا</option>
          <option value="">كل الوقت</option>
        </select>
      </label>
      <label>الصف<input value={filters.grade} onChange={(event) => update("grade", event.target.value)} placeholder="كل الصفوف" /></label>
      <label>المادة<input value={filters.subject} onChange={(event) => update("subject", event.target.value)} placeholder="كل المواد" /></label>
    </div>
  );
}

function FaqPanel({ items, query, setQuery, onRefresh, loading, analytics, filters, setFilters }) {
  return (
    <section className="surface table-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">سجل التفاعل</p>
          <h2>الأسئلة الأكثر تكرارًا</h2>
          <p className="section-copy">تعرفي على ما يبحث عنه الطلاب، وما يحتاج إلى توضيح إضافي في المنهج.</p>
        </div>
        <button className="outline-button" onClick={onRefresh}><RefreshCw size={15} /> تحديث</button>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} />
      <div className="table-tools">
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في الأسئلة…" aria-label="البحث في الأسئلة" />
        </div>
        <span className="result-count">{analytics.total_questions || items.length} سؤالًا</span>
      </div>
      {loading ? (
        <LoadingState />
      ) : items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>#</th><th>السؤال</th><th>التكرار</th><th>النطاق</th><th>آخر نشاط</th></tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.question}>
                  <td><span className="row-number">{index + 1}</span></td>
                  <td className="question-cell">{item.question}</td>
                  <td><strong>{item.count}</strong></td>
                  <td><span className={`badge ${item.in_curriculum ? "in" : "out"}`}>{item.in_curriculum ? "داخل المنهج" : "خارج المنهج"}</span></td>
                  <td className="muted-cell">{formatWhen(item.last_asked_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={CircleHelp} title="لم نعثر على أسئلة" body={query ? "جرّبي كلمة بحث مختلفة." : "ستظهر الأسئلة المسجلة عبر واجهة الطالب هنا."} />
      )}
    </section>
  );
}

function InsightsPanel({ analytics, filters, setFilters, loading }) {
  const max = Math.max(...analytics.trends.map((item) => item.count), 1);
  return (
    <section className="insights-layout">
      <div className="surface table-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">اتجاهات الاستخدام</p>
            <h2>نبض الطلاب عبر الوقت</h2>
            <p className="section-copy">تابعي حجم الأسئلة واكتشفي أثر تحديثات المحتوى.</p>
          </div>
          <CalendarDays size={22} className="upload-heading-icon" />
        </div>
        <FilterBar filters={filters} setFilters={setFilters} />
        {loading ? (
          <LoadingState />
        ) : analytics.trends.length ? (
          <div className="trend-chart" aria-label="مخطط الأسئلة اليومية">
            {analytics.trends.map((item) => (
              <div className="trend-column" key={item.date} title={`${item.date}: ${item.count}`}>
                <i style={{ height: `${Math.max(8, (item.count / max) * 100)}%` }} />
                <span>{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={BarChart3} title="لا توجد اتجاهات بعد" body="ستظهر حركة الأسئلة بعد تفاعل الطلاب." />
        )}
      </div>
      <div className="surface review-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">فرص التحسين</p>
            <h2>خارج المنهج</h2>
            <p className="section-copy">أسئلة يمكن تحويلها إلى محتوى جديد أو توضيح للطلاب.</p>
          </div>
          <span className="review-count">{analytics.unresolved.length}</span>
        </div>
        {analytics.unresolved.length ? (
          <div className="review-list">
            {analytics.unresolved.slice(0, 8).map((item, index) => (
              <div className="review-item" key={`${item.question}-${index}`}>
                <AlertCircle size={15} />
                <div>
                  <strong>{item.question}</strong>
                  <small>{formatWhen(item.asked_at)}{item.subject ? ` · ${item.subject}${item.grade ? ` ${item.grade}` : ""}` : ""}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="لا توجد فجوات مرصودة" body="كل الأسئلة الحالية مرتبطة بالمحتوى المتاح." />
        )}
      </div>
    </section>
  );
}

function TopicsPanel({ items, loading }) {
  return (
    <section className="surface table-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">تركيز المذاكرة</p>
          <h2>المواضيع الأكثر تداولًا</h2>
          <p className="section-copy">الفصول التي يطرح عنها الطلاب أكبر عدد من الأسئلة.</p>
        </div>
        <span className="data-badge"><BarChart3 size={15} /> حسب الفصل</span>
      </div>
      {loading ? (
        <LoadingState />
      ) : items.length ? (
        <div className="topic-table-list">
          {items.map((item, index) => (
            <div className="topic-table-row" key={item.chapter}>
              <span className="rank-chip">{index + 1}</span>
              <div>
                <strong>{item.chapter}</strong>
                <div className="topic-bar"><i style={{ width: `${Math.max(6, (item.count / items[0].count) * 100)}%` }} /></div>
              </div>
              <strong className="topic-count">{item.count}<small> سؤال</small></strong>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={BarChart3} title="لا توجد بيانات بعد" body="ستظهر إحصاءات المواضيع بعد تسجيل أسئلة الطلاب." />
      )}
    </section>
  );
}

function CreatableSelect({
  value,
  onChange,
  options = [],
  placeholder = "",
  label = "",
  createNewPrefix = "إضافة جديد:",
  disabled = false,
  required = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const trimmedSearch = search.trim().toLowerCase();

  const uniqueOptions = useMemo(() => {
    const set = new Set();
    options.forEach((opt) => {
      if (opt && String(opt).trim()) set.add(String(opt).trim());
    });
    return Array.from(set);
  }, [options]);

  const filtered = useMemo(() => {
    if (!trimmedSearch) return uniqueOptions;
    return uniqueOptions.filter((opt) =>
      opt.toLowerCase().includes(trimmedSearch)
    );
  }, [uniqueOptions, trimmedSearch]);

  const exactMatch = uniqueOptions.some(
    (opt) => opt.toLowerCase() === trimmedSearch
  );

  function handleSelect(opt) {
    onChange(opt);
    setSearch("");
    setOpen(false);
  }

  function handleInputChange(e) {
    const val = e.target.value;
    setSearch(val);
    onChange(val);
    if (!open) setOpen(true);
  }

  function handleCreateNew() {
    if (search.trim()) {
      onChange(search.trim());
      setSearch("");
      setOpen(false);
    }
  }

  return (
    <div className="creatable-select-wrap" ref={containerRef}>
      {label && <span className="creatable-label">{label}</span>}
      <div className="creatable-input-box">
        <input
          type="text"
          value={open ? (search !== "" ? search : value) : value}
          onChange={handleInputChange}
          onFocus={() => {
            setSearch("");
            setOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
        />
        <button
          type="button"
          className="creatable-arrow-btn"
          onClick={() => setOpen((prev) => !prev)}
          tabIndex={-1}
          aria-label="قائمة الخيارات"
        >
          <ChevronDown size={15} className={open ? "rotate-180" : ""} />
        </button>
      </div>

      {open && (
        <div className="creatable-menu" role="listbox">
          {search.trim() && !exactMatch && (
            <div
              className="creatable-item create-new"
              onMouseDown={(e) => {
                e.preventDefault();
                handleCreateNew();
              }}
              role="option"
              aria-selected="false"
            >
              <Sparkles size={14} />
              <span>{createNewPrefix} «<strong>{search.trim()}</strong>»</span>
            </div>
          )}

          {filtered.map((opt) => (
            <div
              key={opt}
              className={`creatable-item ${opt === value ? "selected" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(opt);
              }}
              role="option"
              aria-selected={opt === value}
            >
              <span>{opt}</span>
              {opt === value && <Check size={14} />}
            </div>
          ))}

          {filtered.length === 0 && (!search.trim() || exactMatch) && (
            <div className="creatable-empty">لا توجد خيارات مطابقة</div>
          )}
        </div>
      )}
    </div>
  );
}

function EditDocModal({ doc, onClose, onRefresh, onNotify, contentCourses = [], allDocs = [] }) {
  const [title, setTitle] = useState(doc?.title || "");
  const [subject, setSubject] = useState(doc?.subject || "");
  const [grade, setGrade] = useState(doc?.grade || "");
  const [chapter, setChapter] = useState(doc?.chapter || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!doc) return null;

  const subjectOptions = useMemo(() => {
    const list = [
      "الفيزياء", "الكيمياء", "الأحياء", "الرياضيات", "اللغة العربية",
      "اللغة الإنجليزية", "الجيولوجيا", "الذكاء الاصطناعي", "الحاسب الآلي",
      "التاريخ", "الجغرافيا", "الفلسفة", "علم النفس",
    ];
    (contentCourses || []).forEach((c) => { if (c.subject) list.push(c.subject); });
    (allDocs || []).forEach((d) => { if (d.subject) list.push(d.subject); });
    return list;
  }, [contentCourses, allDocs]);

  const gradeOptions = useMemo(() => {
    const list = [
      "12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1",
      "الأول الثانوي", "الثاني الثانوي", "الثالث الثانوي",
      "الأول الإعدادي", "الثاني الإعدادي", "الثالث الإعدادي",
      "عام / مراجع إضافية",
    ];
    (contentCourses || []).forEach((c) => { if (c.grade) list.push(c.grade); });
    (allDocs || []).forEach((d) => { if (d.grade) list.push(d.grade); });
    return list;
  }, [contentCourses, allDocs]);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/documents/${encodeURIComponent(doc.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subject: subject.trim(),
          grade: grade.trim(),
          chapter: chapter.trim(),
        }),
      });
      onNotify?.("success", `تم تحديث بيانات المستند «${title}» وتحديث مقاطعه في الفهرس بنجاح.`);
      onClose();
      await onRefresh?.();
    } catch (err) {
      setError(describeError(err, "تعذّر تحديث بيانات المستند."));
    } finally {
      setBusy(false);
    }
  }

  const isCore = doc.id === "core_physics_g12";

  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <div className="surface modal-card edit-doc-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-icon info">
            <Pencil size={22} />
          </div>
          <div className="modal-header-text">
            <h3>تعديل بيانات المستند</h3>
            <p className="modal-copy">
              تحديث المادة والصف وعنوان المستند ينعكس تلقائيًا على مقاطعه في الفهرس ومطابقة أسئلة الطلاب.
            </p>
          </div>
        </div>

        {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}

        <form onSubmit={handleSubmit} className="edit-doc-form">
          <label>
            اسم المستند
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={busy || isCore}
            />
          </label>

          <div className="edit-doc-grid">
            <CreatableSelect
              label="المادة"
              value={subject}
              onChange={setSubject}
              options={subjectOptions}
              placeholder="اختر أو اكتب اسم مادة جديدة…"
              createNewPrefix="+ إنشاء مادة جديدة:"
              disabled={busy}
              required
            />
            <CreatableSelect
              label="الصف"
              value={grade}
              onChange={setGrade}
              options={gradeOptions}
              placeholder="اختر أو اكتب الصف…"
              createNewPrefix="+ تحديد صف جديد:"
              disabled={busy}
              required
            />
          </div>

          <label>
            الفصل / الوحدة (اختياري)
            <input
              type="text"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              placeholder="اسم الفصل أو الباب…"
              disabled={busy}
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="outline-button" onClick={onClose} disabled={busy}>
              إلغاء
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
              {busy ? "جارٍ الحفظ والتحديث…" : "حفظ التعديلات"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({ target, onConfirm, onCancel, busy }) {
  if (!target) return null;
  const isProtected = target.type === "protected_doc";
  const isDoc = target.type === "document";

  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) onCancel(); }}>
      <div className="surface modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className={`modal-icon ${isProtected ? "info" : "danger"}`}>
            {isProtected ? <ShieldCheck size={24} /> : <Trash2 size={24} />}
          </div>
          <div className="modal-header-text">
            <h3>
              {isProtected
                ? "تنبيه: المنهج الأساسي محمي"
                : isDoc
                ? "حذف المستند من الفهرس"
                : "حذف المقطع من الفهرس"}
            </h3>
            <p className="modal-copy">
              {isProtected ? (
                <>هذا هو <strong>المنهج الأساسي المعتمد</strong> ولا يمكن حذفه للحفاظ على استمرار عمل المعلم الذكي للطلاب.</>
              ) : isDoc ? (
                <>هل أنت متأكد من حذف المستند «<strong>{target.doc?.title}</strong>»؟ سيتم حذف جميع مقاطعه المرتبطة (<strong>{target.doc?.chunk_count} مقطع</strong>) من قاعدة المعرفة فورًا.</>
              ) : (
                <>هل أنت متأكد من حذف هذا المقطع نهائيًا من الفهرس؟ لن يتمكن المعلم الذكي من استرجاعه بعد الحذف.</>
              )}
            </p>
          </div>
        </div>
        <div className="modal-actions">
          {isProtected ? (
            <button className="primary-button" onClick={onCancel} autoFocus>
              حسناً، فهمت
            </button>
          ) : (
            <>
              <button className="outline-button" onClick={onCancel} disabled={busy}>
                إلغاء
              </button>
              <button className="danger-button-primary" onClick={onConfirm} disabled={busy} autoFocus>
                {busy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                {busy ? "جارٍ الحذف…" : "تأكيد الحذف"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentCard({ doc, onRequestDelete, onRequestEdit }) {
  const [open, setOpen] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    setError("");
    if (next && !loaded) {
      setLoadingChunks(true);
      try {
        const data = await api(`/documents/${encodeURIComponent(doc.id)}`);
        setChunks(data.chunks ?? []);
      } catch {
        setChunks([]);
      }
      setLoaded(true);
      setLoadingChunks(false);
    }
  }

  async function runSearch(event) {
    event.preventDefault();
    if (!q.trim()) { setResults(null); return; }
    setSearching(true);
    setError("");
    try {
      const data = await api(`/documents/${encodeURIComponent(doc.id)}/search?q=${encodeURIComponent(q.trim())}&n=10`);
      setResults(data.hits ?? []);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }

  async function downloadFile(event) {
    event.stopPropagation();
    setDownloading(true);
    setError("");
    try {
      const token = sessionStorage.getItem("mofid.teacher.token");
      const resp = await fetch(`/documents/${encodeURIComponent(doc.id)}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error("تعذّر تنزيل الملف المصدر.");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename || `${doc.title}.${doc.doc_type}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(describeError(err, "تعذّر تنزيل الملف المصدر."));
    } finally {
      setDownloading(false);
    }
  }

  function handleDeleteClick(event) {
    event.stopPropagation();
    if (doc.id === "core_physics_g12") {
      onRequestDelete?.({ type: "protected_doc", doc });
      return;
    }
    onRequestDelete?.({ type: "document", doc });
  }

  const isCore = doc.id === "core_physics_g12";
  const visible = results ?? chunks;
  return (
    <article className={`doc-card ${isCore ? "core-doc" : ""}`}>
      <div className="doc-row" onClick={toggle} role="button" aria-expanded={open}>
        <span className={`doc-type type-${doc.doc_type}`}>{TYPE_LABEL[doc.doc_type] || doc.doc_type}</span>
        <div className="doc-info">
          <div className="doc-title-row">
            <strong>{doc.title}</strong>
            {isCore && <span className="core-badge">المنهج الأساسي</span>}
          </div>
          <small>
            {doc.filename && doc.filename !== doc.title ? <span>{doc.filename} · </span> : null}
            {doc.subject}{doc.grade ? ` · الصف ${doc.grade}` : ""}{doc.chapter ? ` · ${doc.chapter}` : ""} · {doc.chunk_count} مقطع · {formatWhen(doc.created_at)}
            {doc.empty_pages ? ` · ${doc.empty_pages} صفحة فارغة` : ""}
          </small>
        </div>
        <span className={`badge ${doc.status === "indexed" ? "in" : "out"}`}>{DOC_STATUS_LABEL[doc.status] || doc.status || "—"}</span>
        <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestEdit?.(doc);
            }}
            aria-label="تعديل بيانات المستند"
            title="تعديل بيانات المستند"
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button"
            onClick={downloadFile}
            disabled={downloading}
            aria-label="تنزيل الملف المصدر"
            title="تنزيل الملف المصدر"
          >
            <Download size={15} />
          </button>
          {!isCore && (
            <button
              className="icon-button danger"
              onClick={handleDeleteClick}
              aria-label="حذف المستند"
              title="حذف المستند"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
        {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </div>
      {open && (
        <div className="doc-body">
          {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}
          <form className="doc-search" onSubmit={runSearch}>
            <Search size={16} />
            <input value={q} onChange={(event) => { setQ(event.target.value); if (!event.target.value) setResults(null); }} placeholder="ابحث داخل هذا المستند…" aria-label={`البحث داخل ${doc.title}`} />
            <button className="outline-button" type="submit" disabled={searching}>{searching ? "جارٍ البحث…" : "بحث"}</button>
          </form>
          {loadingChunks ? (
            <LoadingState />
          ) : visible.length ? (
            <div className="doc-chunk-list">
              {visible.map((chunk) => (
                <div className="doc-chunk" key={chunk.id}>
                  <code>{chunk.id}{results !== null && <em className="doc-dist">مسافة {chunk.distance}</em>}</code>
                  <p>{chunk.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Search} title={results !== null ? "لا نتائج" : "لا توجد مقاطع"} body={results !== null ? "جرّبي صياغة مختلفة." : "تعذّر جلب مقاطع هذا المستند."} />
          )}
        </div>
      )}
    </article>
  );
}

function ContentPanel({ content, chunks, total, documents, loading, onRefresh, onNavigate }) {
  const [view, setView] = useState("documents");
  const [docSearch, setDocSearch] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(null); // null | { mode: "add" } | { mode: "edit", chunk }
  const [form, setForm] = useState(EMPTY_CHUNK);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((doc) =>
      `${doc.title || ""} ${doc.filename || ""} ${doc.subject || ""} ${doc.chapter || ""} ${doc.grade || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [documents, docSearch]);

  const trimmed = query.trim().toLowerCase();
  const visible = chunks.filter((chunk) =>
    `${chunk.subject} ${chunk.grade} ${chunk.chapter} ${chunk.section} ${chunk.text}`.toLowerCase().includes(trimmed),
  );

  function notify(kind, message) {
    setFeedback({ kind, message });
  }

  function openAdd() {
    setView("chunks");
    setForm(EMPTY_CHUNK);
    setEditor({ mode: "add" });
  }

  function openEdit(chunk) {
    setView("chunks");
    setForm({ ...chunk });
    setEditor({ mode: "edit", chunk });
  }

  function closeEditor() {
    setEditor(null);
  }

  function requestDeleteChunk(chunkId) {
    setConfirmTarget({ type: "chunk", chunkId });
  }

  async function handleConfirmDelete() {
    if (!confirmTarget) return;
    setBusy(true);
    if (confirmTarget.type === "document") {
      const doc = confirmTarget.doc;
      try {
        const result = await api(`/documents/${encodeURIComponent(doc.id)}`, { method: "DELETE" });
        setConfirmTarget(null);
        notify("success", `تم حذف المستند «${doc.title}» بنجاح وإزالة ${result?.chunks_removed ?? doc.chunk_count} مقطع من الفهرس.`);
        await onRefresh();
      } catch (err) {
        notify("error", describeError(err, "تعذّر حذف المستند."));
      } finally {
        setBusy(false);
      }
    } else if (confirmTarget.type === "chunk") {
      const chunkId = confirmTarget.chunkId;
      try {
        const result = await api(`/content/${encodeURIComponent(chunkId)}`, { method: "DELETE" });
        setConfirmTarget(null);
        notify("success", `تم حذف المقطع بنجاح. إجمالي الفهرس ${result?.total_in_collection ?? "—"} مقطعًا.`);
        await onRefresh();
      } catch (err) {
        notify("error", describeError(err, "تعذّر حذف المقطع."));
      } finally {
        setBusy(false);
      }
    }
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/content/${encodeURIComponent(editor.chunk.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      notify("success", "تم تحديث المقطع وإعادة فهرسته بنجاح.");
      closeEditor();
      await onRefresh();
    } catch (err) {
      notify("error", describeError(err, "تعذّر حفظ التعديلات."));
    } finally {
      setBusy(false);
    }
  }

  async function add(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api("/upload_content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunks: [form] }),
      });
      notify("success", `تمت إضافة المقطع بنجاح. أصبح إجمالي الفهرس ${result.total_in_collection} مقطعًا.`);
      closeEditor();
      await onRefresh();
    } catch (err) {
      notify("error", describeError(err, "تعذّر إضافة المقطع."));
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    setBusy(true);
    try {
      const result = await api("/content/reindex", { method: "POST" });
      notify("success", `تمت إعادة فهرسة ${result.reindexed} مقطعًا بنجاح.`);
      await onRefresh();
    } catch (err) {
      notify("error", describeError(err, "تعذّر إعادة الفهرسة."));
    } finally {
      setBusy(false);
    }
  }

  const field = (key, label, { textarea = false, locked = false, wide = false } = {}) => (
    <label className={wide ? "wide" : ""}>
      {label}
      {textarea ? (
        <textarea value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required />
      ) : (
        <input value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required disabled={locked} />
      )}
    </label>
  );

  return (
    <section className="surface table-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">قاعدة المعرفة</p>
          <h2>مكتبة المحتوى</h2>
          <p className="section-copy">اطلعي على المستندات المصدرية، أو راجعي المقاطع المفهرسة مباشرة.</p>
        </div>
        <div className="content-actions">
          <div className="segmented">
            <button className={view === "documents" ? "active" : ""} onClick={() => setView("documents")}><FileText size={15} /> المستندات ({documents.length})</button>
            <button className={view === "chunks" ? "active" : ""} onClick={() => setView("chunks")}><Database size={15} /> المقاطع ({total})</button>
          </div>
          {onNavigate && (
            <button className="primary-button" onClick={() => onNavigate("upload")}><UploadCloud size={16} /> رفع مستند جديد</button>
          )}
          <button className="outline-button" onClick={openAdd}><FileUp size={15} /> مقطع يدوي</button>
          <button className="outline-button" onClick={reindex} disabled={busy}><RefreshCw size={15} /> إعادة الفهرسة</button>
        </div>
      </div>

      {feedback && <Alert kind={feedback.kind} onClose={() => setFeedback(null)}>{feedback.message}</Alert>}

      {view === "documents" ? (
        loading ? (
          <LoadingState />
        ) : documents.length ? (
          <>
            <div className="table-tools">
              <div className="search-box">
                <Search size={17} />
                <input
                  value={docSearch}
                  onChange={(event) => setDocSearch(event.target.value)}
                  placeholder="ابحث في المستندات المرفوعة بالاسم أو المادة أو الصف…"
                  aria-label="البحث في المستندات"
                />
              </div>
              <span className="result-count">
                {filteredDocs.length} من أصل {documents.length} مستند
              </span>
            </div>
            {(content.courses ?? []).length > 0 && (
              <div className="course-chips">
                {content.courses.map((course) => (
                  <span className="course-chip" key={`${course.subject}-${course.grade}`}>
                    {course.subject} · الصف {course.grade} · {course.chunks} مقطع
                  </span>
                ))}
              </div>
            )}
            <div className="doc-list">
              {filteredDocs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onRequestDelete={(t) => setConfirmTarget(t)}
                  onRequestEdit={(d) => setEditTarget(d)}
                  onRefresh={onRefresh}
                />
              ))}
            </div>
            {filteredDocs.length === 0 && (
              <EmptyState icon={Search} title="لم يتم العثور على مستندات مطابقة" body="جرّبي البحث بكلمة أخرى أو مسح حقل البحث." />
            )}
          </>
        ) : (
          <EmptyState icon={FileText} title="لا توجد مستندات بعد" body="ارفعي أول مستند (PDF أو Word) من تبويب «إضافة محتوى» ليُفهرس تلقائيًا." />
        )
      ) : (
        <>
          {editor && (
            <form className="editor-panel" onSubmit={editor.mode === "edit" ? save : add}>
              <div className="section-head">
                <div>
                  <p className="eyebrow">{editor.mode === "edit" ? "مراجعة المقطع" : "مقطع جديد"}</p>
                  <h2>{editor.mode === "edit" ? "تعديل المقطع" : "إضافة إلى الفهرس"}</h2>
                  <p className="section-copy">{editor.mode === "edit" ? "يُعاد فهرسة المقطع تلقائيًا بعد الحفظ." : "أدخلي بيانات المقطع وسيُفهرس في نفس مخطط المنهج."}</p>
                </div>
                <button type="button" className="icon-button" onClick={closeEditor} aria-label="إغلاق"><X size={17} /></button>
              </div>
              <div className="editor-grid">
                {field("id", "المعرّف", { locked: editor.mode === "edit" })}
                {field("subject", "المادة")}
                {field("grade", "الصف")}
                {field("chapter", "الفصل")}
                {field("section", "القسم")}
                {field("text", "النص", { textarea: true, wide: true })}
              </div>
              <button className="primary-button" type="submit" disabled={busy}>
                <Check size={16} /> {busy ? "جارٍ الحفظ…" : "حفظ المقطع"}
              </button>
            </form>
          )}
          <div className="table-tools">
            <div className="search-box">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في المقاطع…" aria-label="البحث في المقاطع" />
            </div>
            <span className="result-count">
              {chunks.length ? `${visible.length} من أصل ${total} مقطعًا` : "لا توجد مقاطع"}
            </span>
          </div>
          {loading ? (
            <LoadingState />
          ) : visible.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>المادة / الصف</th><th>الفصل</th><th>القسم</th><th>النص</th><th>إجراءات</th></tr>
                </thead>
                <tbody>
                  {visible.map((chunk) => (
                    <tr key={chunk.id}>
                      <td>{chunk.subject}<br /><span className="muted-cell">{chunk.grade}</span></td>
                      <td>{chunk.chapter}</td>
                      <td>{chunk.section}</td>
                      <td className="chunk-text">{chunk.text}</td>
                      <td>
                        <div className="row-actions">
                          <button className="outline-button" onClick={() => openEdit(chunk)}><Pencil size={13} /> تعديل</button>
                          <button className="danger-button" onClick={() => requestDeleteChunk(chunk.id)}><Trash2 size={13} /> حذف</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Database} title="لا توجد مقاطع مطابقة" body={query ? "جرّبي كلمة بحث مختلفة." : "لم يُضف أي مقطع إلى الفهرس بعد."} />
          )}
        </>
      )}
      <ConfirmModal
        target={confirmTarget}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmTarget(null)}
        busy={busy}
      />
      <EditDocModal
        doc={editTarget}
        onClose={() => setEditTarget(null)}
        onRefresh={onRefresh}
        onNotify={notify}
        contentCourses={content?.courses}
        allDocs={documents}
      />
    </section>
  );
}


function SystemPanel({ health, usage, content, documents, loading, onRefresh }) {
  return (
    <section className="surface table-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">التشغيل المحلي</p>
          <h2>حالة النظام</h2>
          <p className="section-copy">فحص سريع للمكونات التي يحتاجها المعلم والطلاب.</p>
        </div>
        <button className="outline-button" onClick={onRefresh}><RefreshCw size={15} /> فحص الآن</button>
      </div>
      <div className="system-list">
        <div><span>واجهة API</span><strong className={health ? "good" : "bad"}>{health ? "متصلة" : loading ? "جارٍ الفحص" : "غير متاحة"}</strong></div>
        <div><span>فهرس المنهج</span><strong>{content.chunks_indexed || health?.chunks_indexed || "—"} مقطع</strong></div>
        <div><span>المستندات المرفوعة</span><strong>{documents.length} مستند</strong></div>
        <div><span>أسئلة اليوم / الأسبوع</span><strong>{usage.questions_today ?? 0} / {usage.questions_this_week ?? 0}</strong></div>
        <div><span>نسبة الرفض</span><strong>{Math.round((usage.refusal_rate ?? 0) * 100)}%</strong></div>
        <div><span>متوسط زمن الرد</span><strong>{formatMs(usage.avg_latency_ms)}</strong></div>
        <div><span>وضع التشغيل</span><strong>شبكة محلية / بدون إنترنت</strong></div>
        <div><span>تخزين الأسئلة</span><strong>سجل محلي</strong></div>
      </div>
    </section>
  );
}

function SettingsPanel() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState("info");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setMessage("تم تغيير كلمة المرور بنجاح.");
      setMessageKind("success");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setMessage(describeError(err, "تعذّر تغيير كلمة المرور."));
      setMessageKind("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface table-card settings-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">حماية الحساب</p>
          <h2>الإعدادات</h2>
          <p className="section-copy">غيّري كلمة مرور حساب المعلم المحفوظة محليًا.</p>
        </div>
        <ShieldCheck size={24} className="upload-heading-icon" />
      </div>
      <form onSubmit={submit}>
        <label>كلمة المرور الحالية
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        </label>
        <label>كلمة المرور الجديدة
          <input type="password" minLength="8" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
        </label>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}</button>
      </form>
      {message && <Alert kind={messageKind} onClose={() => setMessage("")}>{message}</Alert>}
    </section>
  );
}

function UploadPanel({ onDone, onNavigate, onRefresh, documents = [], content = {} }) {
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [chapter, setChapter] = useState("");
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ type: "idle", message: "" });
  const [busy, setBusy] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [pendingChunks, setPendingChunks] = useState(null);
  const [jsonFileName, setJsonFileName] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const dropRef = useRef(null);
  const jsonRef = useRef(null);

  const subjectOptions = useMemo(() => {
    const list = [
      "الفيزياء", "الكيمياء", "الأحياء", "الرياضيات", "اللغة العربية",
      "اللغة الإنجليزية", "الجيولوجيا", "الذكاء الاصطناعي", "الحاسب الآلي",
      "التاريخ", "الجغرافيا", "الفلسفة", "علم النفس",
    ];
    (content?.courses || []).forEach((c) => { if (c.subject) list.push(c.subject); });
    (documents || []).forEach((d) => { if (d.subject) list.push(d.subject); });
    return list;
  }, [content, documents]);

  const gradeOptions = useMemo(() => {
    const list = [
      "12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1",
      "الأول الثانوي", "الثاني الثانوي", "الثالث الثانوي",
      "الأول الإعدادي", "الثاني الإعدادي", "الثالث الإعدادي",
      "عام / مراجع إضافية",
    ];
    (content?.courses || []).forEach((c) => { if (c.grade) list.push(c.grade); });
    (documents || []).forEach((d) => { if (d.grade) list.push(d.grade); });
    return list;
  }, [content, documents]);

  function pick(next) {
    if (!next) return;
    setFile(next);
    setState({ type: "idle", message: "" });
  }

  async function uploadDocument(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setState({ type: "loading", message: "جارٍ قراءة المستند وتقسيمه وفهرسته…" });
    try {
      const form = new FormData();
      form.append("file", file);
      if (subject.trim()) form.append("subject", subject.trim());
      if (grade.trim()) form.append("grade", grade.trim());
      if (chapter.trim()) form.append("chapter", chapter.trim());
      const result = await apiForm("/documents", form);
      setState({
        type: "success",
        message: `تمت فهرسة المستند بنجاح: ${result.indexed} مقطعًا أُضيف إلى الفهرس (الإجمالي ${result.total_in_collection}).${result.empty_pages ? ` تنبيه: ${result.empty_pages} صفحة بدون نص (تحتاج OCR).` : ""}`,
      });
      setSubject(""); setGrade(""); setChapter(""); setFile(null);
      await onDone?.();
      await onRefresh?.();
    } catch (err) {
      setState({ type: "error", message: describeError(err, "تعذّر رفع المستند.") });
    } finally {
      setBusy(false);
    }
  }

  function handleJsonFile(file) {
    if (!file) return;
    setState({ type: "idle", message: "" });
    setJsonFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setPendingChunks(parseFile(String(reader.result)));
      } catch (err) {
        setPendingChunks(null);
        setState({ type: "error", message: err.message });
      }
    };
    reader.onerror = () => setState({ type: "error", message: "تعذّرت قراءة الملف." });
    reader.readAsText(file);
  }

  async function uploadJson() {
    if (!pendingChunks) return;
    setState({ type: "loading", message: "جارٍ رفع المقاطع وإعادة الفهرسة…" });
    try {
      const result = await api("/upload_content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunks: pendingChunks }),
      });
      setState({ type: "success", message: `تمت إضافة ${result.added ?? 0} مقطع بنجاح. أصبح إجمالي الفهرس ${result.total_in_collection ?? "—"} مقطعًا.` });
      setPendingChunks(null);
      setJsonFileName("");
      if (jsonRef.current) jsonRef.current.value = "";
      await onDone?.();
      await onRefresh?.();
    } catch (err) {
      setState({ type: "error", message: describeError(err, "تعذّر الرفع.") });
    }
  }

  function downloadTemplate(event) {
    event.preventDefault();
    const template = { chunks: [{ id: "phy_g12_new_sec1", subject: "الفيزياء", grade: "12", chapter: "الفصل ...", section: "مقدمة", text: "اكتب نص المقطع هنا (فقرة واحدة مركّزة، حوالي 50-150 كلمة)." }] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(template, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mofid_content_template.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleMiniDocDelete() {
    if (!confirmTarget || confirmTarget.type !== "document") return;
    setConfirmBusy(true);
    const doc = confirmTarget.doc;
    try {
      const result = await api(`/documents/${encodeURIComponent(doc.id)}`, { method: "DELETE" });
      setConfirmTarget(null);
      setState({
        type: "success",
        message: `تم حذف المستند «${doc.title}» بنجاح وإزالة ${result?.chunks_removed ?? doc.chunk_count} مقطع من الفهرس.`,
      });
      await onDone?.();
      await onRefresh?.();
    } catch (err) {
      setState({ type: "error", message: describeError(err, "تعذّر حذف المستند.") });
    } finally {
      setConfirmBusy(false);
    }
  }

  const dropZone = (
    <div
      ref={dropRef}
      className="drop-zone"
      onDragOver={(event) => { event.preventDefault(); dropRef.current?.classList.add("dragging"); }}
      onDragLeave={() => dropRef.current?.classList.remove("dragging")}
      onDrop={(event) => { event.preventDefault(); dropRef.current?.classList.remove("dragging"); pick(event.dataTransfer.files[0]); }}
    >
      <div className="drop-icon"><UploadCloud size={25} /></div>
      <strong>{file ? file.name : "اسحبي مستندًا إلى هنا (PDF / Word / نص)"}</strong>
      <span>أو اختاري ملفًا من جهازك</span>
      <label className="primary-button" htmlFor="doc-file-input">
        <FileUp size={16} /> اختيار ملف
        <input id="doc-file-input" type="file" accept=".pdf,.docx,.txt" hidden onChange={(event) => { pick(event.target.files[0]); event.target.value = ""; }} />
      </label>
      <small>يُقسَّم تلقائيًا ويُفهرس في نفس مخطط المنهج</small>
    </div>
  );

  return (
    <section className="upload-layout">
      <div className="surface upload-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">تحديث قاعدة المعرفة</p>
            <h2>أضيفي مستندًا للمنهج</h2>
            <p className="section-copy">ارفعي ملف PDF أو Word من مدرس مادة، وسيُقرأ ويُقسّم ويُفهرس فورًا في مكتبة مفيد.</p>
          </div>
          <FileText size={28} className="upload-heading-icon" />
        </div>
        <form onSubmit={uploadDocument}>
          {dropZone}
          <div className="upload-fields">
            <CreatableSelect
              label="المادة"
              value={subject}
              onChange={setSubject}
              options={subjectOptions}
              placeholder="الفيزياء أو اكتب مادة جديدة…"
              createNewPrefix="+ إنشاء مادة جديدة:"
              disabled={busy}
            />
            <CreatableSelect
              label="الصف"
              value={grade}
              onChange={setGrade}
              options={gradeOptions}
              placeholder="12 أو اكتب صف جديد…"
              createNewPrefix="+ تحديد صف جديد:"
              disabled={busy}
            />
            <label>الفصل (اختياري)<input value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder="اسم الفصل" /></label>
          </div>
          <button className="primary-button" type="submit" disabled={busy || !file}>
            <UploadCloud size={16} /> {busy ? "جارٍ المعالجة…" : "فهرسة المستند"}
          </button>
        </form>
        {state.message && (
          <div className={`alert ${state.type === "error" ? "error" : state.type === "success" ? "success" : "info"}`}>
            {state.type === "error" ? <AlertCircle size={16} /> : state.type === "success" ? <CheckCircle2 size={16} /> : <Sparkles size={16} />}
            <div className="alert-body-with-action">
              <span>{state.message}</span>
              {state.type === "success" && onNavigate && (
                <button type="button" className="alert-nav-button" onClick={() => onNavigate("content")}>
                  عرض المستند في مكتبة المحتوى <ChevronLeft size={14} />
                </button>
              )}
            </div>
          </div>
        )}
        {file && (
          <div className="upload-ready">
            <div><strong>{file.name}</strong><span>سيُقسّم إلى مقاطع ويُضاف إلى الفهرس.</span></div>
          </div>
        )}

        {documents && documents.length > 0 && (
          <div className="recent-docs-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">المكتبة الحالية</p>
                <h3>المستندات المحفوظة ({documents.length})</h3>
              </div>
              {onNavigate && (
                <button type="button" className="text-button" onClick={() => onNavigate("content")}>
                  فتح مكتبة المحتوى كاملة <ChevronLeft size={14} />
                </button>
              )}
            </div>
            <div className="mini-doc-list">
              {documents.map((doc) => (
                <div className="mini-doc-row" key={doc.id}>
                  <div className="mini-doc-click" onClick={() => onNavigate?.("content")} role="button" title="انقر لعرض المستند في المكتبة">
                    <span className={`doc-type type-${doc.doc_type}`}>{TYPE_LABEL[doc.doc_type] || doc.doc_type}</span>
                    <div className="mini-doc-info">
                      <div className="doc-title-row">
                        <strong>{doc.title}</strong>
                        {doc.id === "core_physics_g12" && <span className="core-badge">المنهج الأساسي</span>}
                      </div>
                      <small>{doc.subject}{doc.grade ? ` · الصف ${doc.grade}` : ""} · {doc.chunk_count} مقطع · {formatWhen(doc.created_at)}</small>
                    </div>
                  </div>
                  <div className="mini-doc-actions">
                    <button
                      className="icon-button mini-edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTarget(doc);
                      }}
                      aria-label="تعديل بيانات المستند"
                      title="تعديل بيانات المستند"
                    >
                      <Pencil size={14} />
                    </button>
                    {doc.id !== "core_physics_g12" && (
                      <button
                        className="icon-button danger mini-del-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmTarget({ type: "document", doc });
                        }}
                        aria-label="حذف المستند"
                        title="حذف المستند"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                    <button className="icon-button mini-arrow-btn" onClick={() => onNavigate?.("content")} title="فتح في المكتبة">
                      <ChevronLeft size={16} className="mini-arrow" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <aside className="surface schema-card">
        <div className="schema-icon"><FileText size={20} /></div>
        <h3>كيف يعمل الرفع؟</h3>
        <p>يُستخرج نص المستند، ثم يُقسم إلى مقاطع بنفس مخطط المنهج (id, subject, grade, chapter, section, text) ويُبوبّب في الفهرس.</p>
        <p className="section-copy">الصفحات المصوّرة بدون نص تحتاج إلى OCR — أداة CLI جاهزة في tools/extract_pdf.py.</p>
        <button className="text-button" onClick={() => setShowJson((value) => !value)}>
          بديل متقدم: رفع مقاطع JSON {showJson ? "▲" : "▼"}
        </button>
        {showJson && (
          <div className="json-fallback">
            <div className="drop-zone compact" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleJsonFile(event.dataTransfer.files[0]); }}>
              <div className="drop-icon"><FileJson size={22} /></div>
              <strong>{jsonFileName || "اسحب ملف JSON إلى هنا"}</strong>
              <label className="primary-button" htmlFor="json-file-input">
                <FileUp size={15} /> اختيار ملف
                <input ref={jsonRef} id="json-file-input" type="file" accept=".json,application/json" hidden onChange={(event) => handleJsonFile(event.target.files[0])} />
              </label>
            </div>
            <div className="json-actions">
              <button className="outline-button" onClick={downloadTemplate}>تحميل قالب الملف</button>
              {pendingChunks && (
                <button className="primary-button" onClick={uploadJson}><UploadCloud size={16} /> رفع {pendingChunks.length} مقطع</button>
              )}
            </div>
          </div>
        )}
      </aside>
      <ConfirmModal
        target={confirmTarget}
        onConfirm={handleMiniDocDelete}
        onCancel={() => setConfirmTarget(null)}
        busy={confirmBusy}
      />
      <EditDocModal
        doc={editTarget}
        onClose={() => setEditTarget(null)}
        onRefresh={onRefresh}
        onNotify={(kind, msg) => setState({ type: kind, message: msg })}
        contentCourses={content?.courses}
        allDocs={documents}
      />
    </section>
  );
}

export default App;