import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type HistoryItem, type StepEvent, type User, type Verdict } from "./api";
import { Result, SignIn, Table, type Step } from "./views";
import type { Filter } from "./verdict";
import { Logo } from "./Logo";

const STEPS = ["parse", "locate", "read", "grants", "infer", "save"];
type Theme = "light" | "dark";
const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const STACK: [string, string, string, string][] = [
  ["Mastra", "Agent workflow", "https://mastra.ai", "/logos/mastra.svg"],
  ["Gemma", "Reads the pages, judges the record", "https://ai.google.dev/gemma", "/logos/gemma.svg"],
  ["OpenAlex", "Publication data", "https://openalex.org", "/logos/openalex.png"],
  ["SerpApi", "Finds the page", "https://serpapi.com", "/logos/serpapi.svg"],
  ["MongoDB Atlas", "Accounts, checks and workflow state", "https://www.mongodb.com/atlas", "/logos/mongodb.svg"],
  ["Sentry", "Traces every run", "https://sentry.io", "/logos/sentry.svg"],
  ["DigitalOcean", "Hosts Gemma", "https://www.digitalocean.com", "/logos/digitalocean.svg"],
  ["Render", "Hosts the app", "https://render.com", "/logos/render.svg"],
];
const fresh = (): Step[] => STEPS.map((id) => ({ id, state: "wait" }));
const dedupe = (vs: Verdict[]) => vs.filter((v, i) => vs.findIndex((x) => x.name === v.name) === i);

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"search" | "history">("search");
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const flipTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* private mode */ }
    setTheme(next);
  };

  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>(fresh());
  const [runId, setRunId] = useState("");
  const [total, setTotal] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState("");
  const t0 = useRef(0), tStep = useRef(0);

  const clear = () => { setVerdict(null); setSteps(fresh()); setRunId(""); setError(""); setTotal(0); };

  // open a saved verdict as the card, with every step shown as done
  const show = (v: Verdict) => {
    clear();
    setView("search");
    setVerdict(v);
    setSteps(STEPS.map((id) => ({ id, state: "done", detail: id === "parse" ? `${v.name}${v.affiliation ? ` at ${v.affiliation}` : ""}` : id === "locate" ? "Page:" : id === "grants" ? (v.grants?.length ? `${v.grants.length} NSF award${v.grants.length > 1 ? "s" : ""}` : "No NSF award found") : id === "read" ? (v.tier === "stated" ? "The professor said it" : v.note ?? "Nothing stated") : id === "infer" ? (v.inferred ? `Gemma: ${v.inferred.probability.toFixed(2)}` : v.reason ?? "") : "Saved", link: id === "locate" ? v.pageUrl : undefined })));
  };
  // the search page opens on the latest check when there is one
  const home = () => { if (history[0]) show(history[0].verdict); else { clear(); setView("search"); } };

  useEffect(() => { api.me().then(setUser).catch(() => setUser(null)); }, []);
  useEffect(() => { if (user) api.history().then((h) => { setHistory(h); if (h[0]) show(h[0].verdict); }).catch(() => {}); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const auth = async (mode: "signin" | "signup", email: string, password: string) => {
    await (mode === "signin" ? api.signIn(email, password) : api.signUp(email, password));
    setUser(await api.me());
  };
  const signOut = async () => { await api.signOut(); setUser(null); setHistory([]); clear(); };

  const patch = (id: string, p: Partial<Step>) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const onEvent = (e: StepEvent) => {
    const now = Date.now();
    if (e.type === "start") { tStep.current = now; patch(e.step, { state: "on" }); }
    else if (e.type === "result") {
      const o = e.output ?? {};
      const ms = now - tStep.current;
      if (e.step === "parse") patch("parse", { state: "done", ms, detail: o.url ? "A page URL" : `${o.name}${o.affiliation ? ` at ${o.affiliation}` : ", no university given"}` });
      else if (e.step === "locate") patch("locate", { state: "done", ms, detail: "Page:", link: o.url });
      else if (e.step === "read") {
        const r = o.reading ?? {};
        patch("read", { state: "done", ms, detail: o.pageError ? o.pageError : `${(o.pages ?? []).length} pages read. ${r.status === "unstated" ? "Nothing stated" : r.status === "recruiting" ? "States they are taking students" : "States they are not taking students"}` });
      } else if (e.step === "grants") {
        const real = (o.grants ?? []).filter((g: any) => g.amount >= 50000);
        patch("grants", { state: "done", ms, detail: real.length ? `${real.length} NSF award${real.length > 1 ? "s" : ""}, latest ${real[0].start.slice(0, 4)}` : "No NSF award found" });
      } else if (e.step === "infer") {
        patch("infer", { state: "done", ms, detail: o.inferred ? `OpenAlex ${o.openalexId}, Gemma: ${o.inferred.probability.toFixed(2)}` : o.reason ?? "" });
      } else if (e.step === "save") patch("save", { state: "done", ms, detail: "Saved to your checks" });
    } else if (e.type === "verdict") {
      setVerdict(e.verdict);
      setHistory((h) => [{ name: e.verdict.name, verdict: e.verdict, createdAt: e.verdict.checkedAt }, ...h]);
    } else if (e.type === "error") {
      setError(e.message);
      setSteps((s) => s.map((x) => (x.state === "on" ? { ...x, state: "fail", detail: e.message } : x)));
    }
  };

  const runQuery = async (q: string) => {
    if (!q.trim() || running) return;
    setQuery(q);
    clear();
    setRunning(true);
    setRunId(Math.random().toString(16).slice(2, 10));
    setView("search");
    t0.current = Date.now();
    try { await api.check(q.trim(), onEvent); } catch (e) { setError((e as Error).message); }
    setTotal(Date.now() - t0.current);
    setRunning(false);
  };
  const run = (ev: FormEvent) => { ev.preventDefault(); runQuery(query); };

  if (user === undefined) return null;
  if (!user) return <SignIn onSubmit={auth} />;

  const active = running || !!verdict || !!runId;
  const mine = dedupe(history.map((h) => h.verdict));

  return (
    <div className={`page ${view}`}>
      <header className="top">
        <button className="brand" onClick={home} aria-label="Home"><Logo size={24} /></button>
        <nav>
          <button className="icon" onClick={flipTheme} title={theme === "dark" ? "Light mode" : "Dark mode"} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark"
              ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
          </button>
          {view !== "search" && <button className="icon" onClick={home} title="Check a professor" aria-label="Check a professor">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          </button>}
          <button className={`icon ${view === "history" ? "on" : ""}`} onClick={() => setView("history")} title="Your checks" aria-label="Your checks">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg>
            {history.length > 0 && <span className="count">{history.length}</span>}
          </button>
          <div className="account">
            <button className="avatar" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} title={user.email}>{user.email[0].toUpperCase()}</button>
            {menu && (
              <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
                <div className="menu-email">{user.email}</div>
                <button role="menuitem" onClick={signOut}>Sign out</button>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main className="main">
        {view === "search" && (<>
        <div className="hero">
          <h1>Is this professor taking PhD students?</h1>
          <form className="cmd" onSubmit={run}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Professor name and university, or a faculty page URL" aria-label="Professor name or page URL" disabled={running} autoFocus />
            <button disabled={running || !query.trim()}>{running ? "Checking" : "Check"}</button>
          </form>
          <div className="cmd-hint">Their page, their publications, their grants. A verdict in 30 seconds.</div>
        </div>

        <div className="scroll">
          {active && (
            <Result steps={steps} running={running} verdict={verdict} error={error} total={total} />
          )}
          {history.length > 0 && (
            <section className="recent">
              <Table title="Recent checks" empty="" rows={mine} filter={filter} onFilter={setFilter} onPick={show} limit={4} onMore={() => setView("history")} />
            </section>
          )}
        </div>
        </>)}

        {view === "history" && (
          <div className="scroll">
            <section className="full">
              <Table title="Your checks" note="Every professor you have checked, newest first. Click a row to open it." empty="Nothing checked yet." rows={mine} filter={filter} onFilter={setFilter} onPick={show} />
            </section>
          </div>
        )}


      </main>

      <footer className="foot">
        <div className="foot-row">
          <span className="stack-label">Built with</span>
          <div className="stack">
            {STACK.map(([name, role, url, img]) => <a key={name} href={url} target="_blank" rel="noreferrer" title={`${name}: ${role}`} aria-label={name}><img src={img} alt={name} /></a>)}
          </div>
          <a className="source" href="https://github.com/sudiptob2/shinobi" target="_blank" rel="noreferrer">
            <span className="stack-label">Source code</span>
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
        </div>
      </footer>
    </div>
  );
}
