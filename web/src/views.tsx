import { useState, type FormEvent } from "react";
import type { Verdict } from "./api";

/* ---------- small helpers ---------- */

export type Tone = "g" | "y" | "r" | "n";
export function tone(v: Verdict): Tone {
  if (v.tier === "stated") return v.stated!.status === "recruiting" ? "g" : "r";
  return v.tier === "inferred" ? "y" : "n";
}
export function label(v: Verdict): string {
  if (v.tier === "stated") return v.stated!.status === "recruiting" ? "Taking students" : "Not taking";
  if (v.tier === "inferred") { const p = v.inferred!.probability; return p >= 0.6 ? "Likely" : p >= 0.4 ? "Toss-up" : "Unlikely"; }
  return "Not scored";
}
export function short(v: Verdict): string {
  if (v.tier === "stated") return v.stated!.status === "recruiting" ? "yes" : "no";
  if (v.tier === "inferred") return v.inferred!.probability.toFixed(2);
  return "n/a";
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
              {verdict.tier === "stated" && <div className={`quote ${t}`}>"{verdict.stated!.quote}"</div>}
              {verdict.tier === "inferred" && (
                <div className="gauge">
                  <span className="num">{pct(verdict.inferred!.probability)}</span>
                  <div className="bar"><i style={{ width: pct(verdict.inferred!.probability) }} /></div>
                  <span className="why">of labs with this publication pattern said they were taking students</span>
                </div>
              )}
              {verdict.tier === "not_scored" && <div className="why">{verdict.reason}</div>}
            </div>
            <span className={`pill ${t}`}><i />{label(verdict)}{verdict.tier === "stated" && verdict.stated!.quote.match(/Fall \d{4}|\d{4}-\d{2,4}/) ? `, ${verdict.stated!.quote.match(/Fall \d{4}|\d{4}-\d{2,4}/)![0]}` : ""}</span>
          </div>
          <button className="more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span>{src ? <>Source: <a href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{host(src)}</a></> : "No page"}{total > 0 && <> · {(total / 1000).toFixed(1)}s</>}</span>
            <span>{open ? "▴ less" : "▾ details"}</span>
          </button>
          {open && (
            <div className="details">
              {verdict.tier === "inferred" && (
                <>
                  <div className="why">{verdict.note ? verdict.note + " " : "The page says nothing either way. "}The number means capacity, never an open slot.</div>
                  <div className="feat">
                    {Object.entries(verdict.inferred!.features).map(([k, n]) => <div key={k}><span>{FEATURE_NAMES[k] ?? k}</span><b>{fmt(k, n)}</b></div>)}
                  </div>
                </>
              )}
              {verdict.tier === "stated" && <div className="why">The professor said it. Nothing is inferred. Quoted verbatim from the page linked above.</div>}
              <div className="why mono">Checked {verdict.checkedAt.slice(0, 10)}{verdict.openalexId && <> · OpenAlex {verdict.openalexId}</>}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- table ---------- */

export type Filter = "all" | "g" | "y" | "r" | "n";

const PAGE = 10;

export function Table({ title, note, empty, rows, filter, onFilter, onPick, sorted, limit, onMore }: { title: string; note?: string; empty: string; rows: Verdict[]; filter: Filter; onFilter: (f: Filter) => void; onPick: (v: Verdict) => void; sorted?: boolean; limit?: number; onMore?: () => void }) {
  const [page, setPage] = useState(0);
  const order = (v: Verdict) => (tone(v) === "g" ? 0 : tone(v) === "y" ? 1 - v.inferred!.probability : tone(v) === "r" ? 2 : 3);
  const all = rows.filter((v) => filter === "all" || tone(v) === filter);
  if (sorted) all.sort((a, b) => order(a) - order(b));
  const pages = limit ? 1 : Math.max(1, Math.ceil(all.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = limit ? all.slice(0, limit) : all.slice(at * PAGE, at * PAGE + PAGE);
  const count = (f: Filter) => rows.filter((v) => f === "all" || tone(v) === f).length;
  const filters: [Filter, string][] = [["all", "All"], ["g", "Taking"], ["y", "Inferred"], ["r", "Not taking"], ["n", "Not scored"]];
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
                <td className="p">{v.tier === "inferred" ? v.inferred!.probability.toFixed(2) : ""}</td>
                <td className="e">
                  {v.tier === "stated" && <>"{v.stated!.quote}"<a href={v.stated!.sourceUrl} target="_blank" rel="noreferrer">{host(v.stated!.sourceUrl)}</a></>}
                  {v.tier === "inferred" && <>Nothing stated. {fmt("x", v.inferred!.features.new_first_authors_rate)} new first authors a year, cohort of {v.inferred!.features.junior_cohort}, {v.inferred!.features.outflow} finished recently.</>}
                  {v.tier === "not_scored" && v.reason}
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
