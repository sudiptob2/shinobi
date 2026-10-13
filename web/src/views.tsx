import { useState, type FormEvent } from "react";
import type { Verdict } from "./api";

/* ---------- small helpers ---------- */

export type Tone = "g" | "y" | "r" | "n";
const band = (p: number) => (p >= 0.6 ? "high" : p >= 0.4 ? "mid" : "low");

/** One verdict from both signals: what the page says and what the publications say. */
export function verdictOf(v: Verdict): { label: string; tone: Tone; filter: Filter } {
  const p = v.inferred?.probability;
  if (v.stated?.status === "not_recruiting") return { label: "Not taking", tone: "r", filter: "r" };
  if (v.stated?.status === "recruiting") {
    if (p == null) return { label: "Says taking, unverified", tone: "g", filter: "g" };
    const b = band(p);
    return b === "high" ? { label: "Taking students", tone: "g", filter: "g" } : b === "mid" ? { label: "Says taking, slower intake", tone: "y", filter: "g" } : { label: "Says taking, rarely does", tone: "y", filter: "g" };
  }
  if (p == null) return { label: "Not scored", tone: "n", filter: "n" };
  const b = band(p);
  return b === "high" ? { label: "Likely taking", tone: "g", filter: "y" } : b === "mid" ? { label: "Toss-up", tone: "y", filter: "y" } : { label: "Unlikely", tone: "r", filter: "y" };
}
export const tone = (v: Verdict): Tone => verdictOf(v).tone;
export const label = (v: Verdict): string => verdictOf(v).label;
export function short(v: Verdict): string {
  if (v.stated) return v.stated.status === "recruiting" ? "yes" : "no";
  return v.inferred ? v.inferred.probability.toFixed(2) : "n/a";
}
export const recordTone = (p: number): Tone => (p >= 0.6 ? "g" : p >= 0.4 ? "y" : "r");
export function recordLine(v: Verdict): string {
  const p = v.inferred!.probability;
  if (!v.stated) return "of labs with this publication pattern said they were taking students";
  if (v.stated.status === "recruiting") return p >= 0.6 ? "of labs that publish like this said yes too. The publications back the page." : p >= 0.4 ? "of labs that publish like this said yes. The page says yes, the publications are unsure." : "of labs that publish like this said yes. The page says yes, but few labs that publish like this were taking students.";
  return p >= 0.6 ? "of labs that publish like this said yes. The page says no, so trust the page." : "of labs that publish like this said yes. The publications agree with the page.";
}
const host = (u?: string) => (u ? u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "");
const pct = (p: number) => `${Math.round(p * 100)}%`;

export const FEATURE_NAMES: Record<string, string> = {
  new_first_authors_rate: "New first authors per year",
  new_first_authors_trend: "Change vs the three years before",
  junior_cohort: "Junior coauthors active now",
  outflow: "Juniors who finished recently",
  pub_rate: "Papers per year",
  pub_rate_trend: "Change in papers per year",
  career_years: "Years since first paper",
  years_since_last: "Years since last paper",
};
const fmt = (k: string, n: number) => (k.includes("trend") ? (n >= 0 ? "+" : "") + n.toFixed(1) : Number.isInteger(n) ? String(n) : n.toFixed(1));

/* ---------- sign in ---------- */

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
      <div className="box">
        <div className="brand"><b>Shinobi</b><span>Taking students?</span></div>
        <p>Check whether a professor is accepting new PhD students. Your checks are saved to your account so you can come back to them.</p>
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" /></div>
          {error && <div className="err" role="alert">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? "One moment" : mode === "signin" ? "Sign in" : "Create account"}</button>
          <div className="alt">
            {mode === "signin" ? <>New here? <button type="button" onClick={() => setMode("signup")}>Create an account</button></> : <>Have an account? <button type="button" onClick={() => setMode("signin")}>Sign in</button></>}
          </div>
        </form>
        <div className="fine">Shinobi never emails professors on your behalf. Your history is private to your account.</div>
      </div>
    </div>
  );
}

/* ---------- result card: step cells on top, verdict in the body, details on click ---------- */

export type Step = { id: string; state: "wait" | "on" | "done" | "fail" | "skip"; detail?: string; link?: string; ms?: number };

export function Result({ steps, running, verdict, error, total }: { steps: Step[]; running: boolean; verdict: Verdict | null; error: string; total: number }) {
  const [open, setOpen] = useState(false);
  const t = verdict ? tone(verdict) : "n";
  const src = verdict?.stated?.sourceUrl ?? verdict?.pageUrl;
  return (
    <div className="one" aria-live="polite">
      <div className="tl">
        {steps.map((s) => (
          <div key={s.id} className={s.state}>
            <b><i />{s.id}{s.ms != null && s.ms > 0 ? ` ${(s.ms / 1000).toFixed(1)}s` : ""}</b>
            <span title={s.detail}>{s.detail ?? ""}{s.link && <a href={s.link} target="_blank" rel="noreferrer">{host(s.link)}</a>}</span>
          </div>
        ))}
      </div>

      {error && <div className="vd err-row" role="alert">{error}</div>}

      {!error && !verdict && <div className="vd waiting">{running ? "Checking. This takes 5 to 30 seconds." : ""}</div>}

      {verdict && (
        <>
          <div className="vd">
            <div>
              <b className="n">{verdict.name}</b>
              <small>{verdict.affiliation ?? host(verdict.pageUrl)}</small>
              {verdict.stated && <div className={`quote ${t}`}>"{verdict.stated.quote}"</div>}
              {verdict.inferred ? (
                <div className="gauge">
                  <span className="lbl">Publication record</span>
                  <span className="num">{pct(verdict.inferred.probability)}</span>
                  <div className="bar"><i style={{ width: pct(verdict.inferred.probability) }} /></div>
                  <span className="why">{recordLine(verdict)}</span>
                </div>
              ) : (
                <div className="why">{verdict.stated ? "Publications not scored: " : ""}{verdict.reason}</div>
              )}
            </div>
            <div className="pills">
              <span className={`pill ${t}`}><i />{label(verdict)}</span>
              {verdict.inferred && <span className={`pill ${recordTone(verdict.inferred.probability)} soft`}><i />Publications {pct(verdict.inferred.probability)}</span>}
            </div>
          </div>
          <button className="more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span>{src ? <>Source: <a href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{host(src)}</a></> : "No page"}{total > 0 && <> · {(total / 1000).toFixed(1)}s</>}</span>
            <span>{open ? "▴ less" : "▾ details"}</span>
          </button>
          {open && (
            <div className="details">
              {verdict.inferred && (
                <>
                  {verdict.note && <div className="why">{verdict.note}</div>}
                  <div className="expl">{(verdict.explanation ?? []).map((line, i) => <p key={i}>{line}</p>)}</div>
                  <div className="feat">
                    {Object.entries(verdict.inferred!.features).map(([k, n]) => <div key={k}><span>{FEATURE_NAMES[k] ?? k}</span><b>{fmt(k, n)}</b></div>)}
                  </div>
                </>
              )}
              <div className="why mono">Checked {verdict.checkedAt.slice(0, 10)}{verdict.openalexId && <> · OpenAlex {verdict.openalexId}</>}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- table ---------- */

export type Filter = "all" | "g" | "y" | "r" | "n"; // g: page says taking, y: inferred only, r: not taking, n: not scored

const PAGE = 10;

export function Table({ title, note, empty, rows, filter, onFilter, onPick, sorted, limit, onMore }: { title: string; note?: string; empty: string; rows: Verdict[]; filter: Filter; onFilter: (f: Filter) => void; onPick: (v: Verdict) => void; sorted?: boolean; limit?: number; onMore?: () => void }) {
  const [page, setPage] = useState(0);
  const order = (v: Verdict) => { const f = verdictOf(v).filter; const p = v.inferred?.probability ?? 0; return f === "g" ? 1 - p : f === "y" ? 2 - p : f === "r" ? 3 : 4; };
  const all = rows.filter((v) => filter === "all" || verdictOf(v).filter === filter);
  if (sorted) all.sort((a, b) => order(a) - order(b));
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
                  {v.stated && <>"{v.stated.quote}"<a href={v.stated.sourceUrl} target="_blank" rel="noreferrer">{host(v.stated.sourceUrl)}</a></>}
                  {!v.stated && v.inferred && <>Nothing stated. {fmt("x", v.inferred.features.new_first_authors_rate)} new first authors a year, cohort of {v.inferred.features.junior_cohort}, {v.inferred.features.outflow} finished recently.</>}
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
