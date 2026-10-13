import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type HistoryItem, type StepEvent, type User, type Verdict } from "./api";
import { Result, SignIn, Table, type Filter, type Step } from "./views";

const STEPS = ["parse", "locate", "read", "infer", "save"];
const fresh = (): Step[] => STEPS.map((id) => ({ id, state: "wait" }));
const dedupe = (vs: Verdict[]) => vs.filter((v, i) => vs.findIndex((x) => x.name === v.name) === i);

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"search" | "history">("search");

  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>(fresh());
  const [runId, setRunId] = useState("");
  const [total, setTotal] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState("");
  const t0 = useRef(0), tStep = useRef(0);

  useEffect(() => { api.me().then(setUser).catch(() => setUser(null)); }, []);
  useEffect(() => { if (user) api.history().then(setHistory).catch(() => {}); else setHistory([]); }, [user]);

  const auth = async (mode: "signin" | "signup", email: string, password: string) => {
    await (mode === "signin" ? api.signIn(email, password) : api.signUp(email, password));
    setUser(await api.me());
  };
  const clear = () => { setVerdict(null); setSteps(fresh()); setRunId(""); setError(""); setTotal(0); };
  const signOut = async () => { await api.signOut(); setUser(null); clear(); };

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
      } else if (e.step === "infer") {
        patch("infer", { state: "done", ms, detail: o.inferred ? `OpenAlex ${o.openalexId}, TabPFN: ${o.inferred.probability.toFixed(2)}` : o.reason ?? "" });
      } else if (e.step === "save") patch("save", { state: "done", ms, detail: "Saved to your checks" });
    } else if (e.type === "verdict") {
      setVerdict(e.verdict);
      setHistory((h) => [{ query, name: e.verdict.name, verdict: e.verdict, createdAt: e.verdict.checkedAt }, ...h]);
    } else if (e.type === "error") {
      setError(e.message);
      setSteps((s) => s.map((x) => (x.state === "on" ? { ...x, state: "fail", detail: e.message } : x)));
    }
  };

  const run = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!query.trim() || running) return;
    clear();
    setRunning(true);
    setRunId(Math.random().toString(16).slice(2, 10));
    setView("search");
    t0.current = Date.now();
    try { await api.check(query.trim(), onEvent); } catch (e) { setError((e as Error).message); }
    setTotal(Date.now() - t0.current);
    setRunning(false);
  };

  const show = (v: Verdict) => {
    clear();
    setView("search");
    setVerdict(v);
    setSteps(STEPS.map((id) => ({ id, state: "done", detail: id === "parse" ? `${v.name}${v.affiliation ? ` at ${v.affiliation}` : ""}` : id === "locate" ? "Page:" : id === "read" ? (v.tier === "stated" ? "The professor said it" : v.note ?? "Nothing stated") : id === "infer" ? (v.inferred ? `TabPFN: ${v.inferred.probability.toFixed(2)}` : v.reason ?? "") : "Saved", link: id === "locate" ? v.pageUrl : undefined })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (user === undefined) return null;
  if (!user) return <SignIn onSubmit={auth} />;

  const active = running || !!verdict || !!runId;
  const mine = dedupe(history.map((h) => h.verdict));

  return (
    <div className={`page ${view}`}>
      <header className="top">
        <button className="brand" onClick={() => { clear(); setView("search"); }}><b>Shinobi</b><span>Taking students?</span></button>
        <nav>
          <button className={view === "history" ? "on" : ""} onClick={() => setView("history")}>Your checks</button>
          <span className="me" title={user.email}>{user.email}</span>
          <button onClick={signOut}>Sign out</button>
        </nav>
      </header>

      <main className="main">
        {view === "search" && (<>
        <div className="hero">
          <h1>Is this professor taking PhD students?</h1>
          <form className="cmd" onSubmit={run}>
            <span className="caret">❯</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Professor name and university, or a faculty page URL" aria-label="Professor name or page URL" disabled={running} autoFocus />
            <button disabled={running || !query.trim()}>{running ? "Checking" : "Check"}</button>
          </form>
          <div className="cmd-hint">
            <span>Reads their page and quotes them. If nothing is stated, predicts from their publication record.</span>
          </div>
        </div>

        {view === "search" && active && (
          <div className="result"><Result steps={steps} running={running} verdict={verdict} error={error} total={total} /></div>
        )}

        {history.length > 0 && (
          <section className="recent">
            <Table title="Recent checks" empty="" rows={mine} filter={filter} onFilter={setFilter} onPick={show} limit={5} onMore={() => setView("history")} />
          </section>
        )}
        </>)}

        {view === "history" && (
          <section className="full">
            <Table title="Your checks" note="Every professor you have checked, newest first. Click a row to open it." empty="Nothing checked yet." rows={mine} filter={filter} onFilter={setFilter} onPick={show} />
          </section>
        )}


        <footer className="foot">
          <span>A prediction means steady intake and capacity, never an open slot.</span>
          <span>Alphabetical-order fields are refused rather than guessed.</span>
          <span>Nothing is ever emailed to a professor.</span>
          <a href="https://github.com/sudiptob2/shinobi" target="_blank" rel="noreferrer">Source on GitHub</a>
        </footer>
      </main>
    </div>
  );
}
