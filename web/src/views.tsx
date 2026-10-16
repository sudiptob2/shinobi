import { useState, type FormEvent } from "react";
import type { Verdict } from "./api";
import { Logo } from "./Logo";
import { FEATURE_NAMES, type Filter, fmt, label, recordLine, recordTone, tone, verdictOf } from "./verdict";

const host = (u?: string) => (u ? u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "");
const pct = (p: number) => `${Math.round(p * 100)}%`;
const YEAR = new Date().getFullYear();

/* ---------- sign in: brand panel left, form right ---------- */

const POINTS = [
  ["quote", "Quotes the professor's own page, with the link"],
  ["chart", "Scores their publication record when nothing is said"],
  ["refuse", "Tells you when a recruiting note is out of date"],
  ["lock", "Keeps your checks in your account. Never emails anyone"],
] as const;

const ICONS: Record<string, string> = {
  quote: "M4 5h7v7H4zM13 5h7v7h-7zM11 12v3a4 4 0 0 1-4 4M20 12v3a4 4 0 0 1-4 4",
  chart: "M4 19V9M10 19V5M16 19v-7M22 19H2",
  refuse: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  lock: "M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z",
};

export function SignIn({ onSubmit }: { onSubmit: (mode: "signin" | "signup", email: string, password: string) => Promise<void> }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await onSubmit(mode, email, password); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <aside className="auth-brand">
        <Logo size={32} />
        <div className="auth-pitch">
          <h1>Email fewer professors,<br />better.</h1>
          <ul>
            {POINTS.map(([icon, text]) => (
              <li key={icon}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[icon]} /></svg>{text}</li>
            ))}
          </ul>
        </div>
        <p className="auth-foot">© {YEAR} Shinobi · open source</p>
      </aside>

      <section className="auth-form">
        <div className="box">
          <div className="auth-mobile"><Logo size={28} /></div>
          <div>
            <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
            <p>{mode === "signin" ? "Sign in to see your checks and run new ones." : "Your checks are saved to your account, private to you."}</p>
          </div>
          <form onSubmit={submit}>
            <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" /></div>
            <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" /></div>
            {error && <div className="err" role="alert">{error}</div>}
            <button className="primary" disabled={busy}>{busy ? "One moment" : mode === "signin" ? "Sign in" : "Create account"}</button>
          </form>
          <div className="alt">
            {mode === "signin" ? <>New here? <button type="button" onClick={() => setMode("signup")}>Create an account</button></> : <>Have an account? <button type="button" onClick={() => setMode("signin")}>Sign in</button></>}
          </div>
          <p className="fine">Shinobi never emails professors on your behalf.</p>
        </div>
      </section>
    </div>
  );
}

/* ---------- result: the card, then the six steps as one line under it ---------- */

export type Step = { id: string; state: "wait" | "on" | "done" | "fail" | "skip"; detail?: string; link?: string; ms?: number };

export function Result({ steps, running, verdict, error, total }: { steps: Step[]; running: boolean; verdict: Verdict | null; error: string; total: number }) {
  const [open, setOpen] = useState(false);
  const t = verdict ? tone(verdict) : "n";
  const src = verdict?.stated?.sourceUrl ?? verdict?.pageUrl;
  // under the trace while running: the failed step, else the latest finished step's detail
  const current = steps.find((s) => s.state === "fail") ?? [...steps].reverse().find((s) => s.state === "done" && s.detail);
  return (
    <div className="result" aria-live="polite">
      <div className="one">
        {error && <div className="vd err-row" role="alert">{error}</div>}
        {!error && !verdict && <div className="vd waiting">{running ? "Checking. This takes 5 to 30 seconds." : ""}</div>}
        {verdict && (
          <>
            <div className="vd">
              <div className="who">
                <div><b className="n">{verdict.name}</b><small>{verdict.affiliation ?? host(verdict.pageUrl)}</small></div>
                <span className={`pill ${t}`}><i />{label(verdict)}</span>
              </div>
              {verdict.stated && <div className={`quote ${t}`}>“{verdict.stated.quote}”</div>}
              {!verdict.stated && verdict.note && <div className="note">{verdict.note}</div>}
              {verdict.inferred ? (
                <div className="gauge">
                  <span className="num">{pct(verdict.inferred.probability)}</span>
                  <span className="why">{recordLine(verdict)}</span>
                  <div className={`bar ${recordTone(verdict.inferred.probability)}`}><i style={{ width: pct(verdict.inferred.probability) }} /></div>
                </div>
              ) : (
                <div className="why">{verdict.stated ? "Publications not scored: " : ""}{verdict.reason}</div>
              )}
            </div>
            <button className="more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              <span>{src ? <>Source <a className="link" href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{host(src)}</a></> : "No page"}</span>
              <span className="toggle">{open ? "Less" : "Why this score"}<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} /></svg></span>
            </button>
            {open && (
              <div className="details">
                {verdict.inferred && (
                  <>
                    <div className="expl">{(verdict.explanation ?? []).map((line, i) => <p key={i}>{line}</p>)}</div>
                    <div className="feat">
                      {Object.entries(verdict.inferred.features).map(([k, n]) => <div key={k}><span>{FEATURE_NAMES[k] ?? k}</span><b>{fmt(k, n)}</b></div>)}
                    </div>
                    {!!verdict.grants?.length && (
                      <div className="grants">
                        <span className="lbl">NSF awards</span>
                        {verdict.grants.map((g, i) => <div key={i}><span>{g.title}</span><b>{g.start.slice(0, 4)}–{g.end.slice(0, 4)} · ${g.amount >= 1e6 ? (g.amount / 1e6).toFixed(1) + "M" : Math.round(g.amount / 1e3) + "k"}</b></div>)}
                      </div>
                    )}
                  </>
                )}
                <div className="meta">Checked {verdict.checkedAt.slice(0, 10)}{verdict.openalexId && <> · OpenAlex {verdict.openalexId}</>}</div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="trace">
        {steps.map((s) => <span key={s.id} className={s.state} title={s.detail}>{s.id}</span>)}
        {total > 0 && <span className="t">{(total / 1000).toFixed(1)}s</span>}
      </div>
      {current?.detail && !verdict && <div className="trace-detail">{current.detail}{current.link && <> <a className="link" href={current.link} target="_blank" rel="noreferrer">{host(current.link)}</a></>}</div>}
    </div>
  );
}

/* ---------- table ---------- */

const PAGE = 10;

export function Table({ title, note, empty, rows, filter, onFilter, onPick, limit, onMore }: { title: string; note?: string; empty: string; rows: Verdict[]; filter: Filter; onFilter: (f: Filter) => void; onPick: (v: Verdict) => void; limit?: number; onMore?: () => void }) {
  const [page, setPage] = useState(0);
  const all = rows.filter((v) => filter === "all" || verdictOf(v).filter === filter);
  const pages = limit ? 1 : Math.max(1, Math.ceil(all.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = limit ? all.slice(0, limit) : all.slice(at * PAGE, at * PAGE + PAGE);
  const count = (f: Filter) => rows.filter((v) => f === "all" || verdictOf(v).filter === f).length;
  const filters: [Filter, string][] = [["all", "All"], ["g", "Says taking"], ["y", "Inferred"], ["r", "Not taking"], ["n", "Not scored"]];
  return (
    <>
      <div className="table-head">
        <div><h2>{title}</h2>{note && <div className="note">{note}</div>}</div>
        <div className="f">{filters.map(([f, name]) => <button key={f} className={filter === f ? "on" : ""} onClick={() => { onFilter(f); setPage(0); }}>{name} {count(f)}</button>)}</div>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>Professor</th><th>Verdict</th><th className="p">Score</th><th>Evidence</th></tr></thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.name} className="click" onClick={() => onPick(v)}>
                <td className="n"><b>{v.name}</b><span>{v.affiliation ?? host(v.pageUrl)}</span></td>
                <td><span className={`pill ${tone(v)}`}><i />{label(v)}</span></td>
                <td className="p">{v.inferred ? v.inferred.probability.toFixed(2) : ""}</td>
                <td className="e">
                  {v.stated && <>“{v.stated.quote}”<a className="link" href={v.stated.sourceUrl} target="_blank" rel="noreferrer">{host(v.stated.sourceUrl)}</a></>}
                  {!v.stated && v.inferred && <>Nothing stated.{v.explanation?.[0] ? ` ${v.explanation[0]}` : ""}</>}
                  {!v.stated && !v.inferred && v.reason}
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={4} className="e">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      {limit && all.length > limit && onMore && (
        <div className="more-row"><button onClick={onMore}>Show all {all.length} checks</button></div>
      )}
      {pages > 1 && (
        <div className="pager">
          <button disabled={at === 0} onClick={() => setPage(at - 1)} aria-label="Previous page">‹</button>
          {Array.from({ length: pages }, (_, i) => <button key={i} className={i === at ? "on" : ""} onClick={() => setPage(i)}>{i + 1}</button>)}
          <button disabled={at >= pages - 1} onClick={() => setPage(at + 1)} aria-label="Next page">›</button>
        </div>
      )}
    </>
  );
}
