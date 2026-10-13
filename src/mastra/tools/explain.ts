// Why this professor scored the way they did, in sentences a student can act on.
// Deterministic: each sentence comes from a feature compared with the labeled labs.
import { features as featuresCollection } from "../db.ts";
import type { Features } from "./openalex.ts";

export type Reference = { yes: Partial<Features>; no: Partial<Features> }; // medians of recruiting and not-recruiting labs

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

let cached: Reference | null = null;
/** Medians per feature for the labeled recruiting and not-recruiting labs, loaded once. */
export async function reference(): Promise<Reference> {
  if (cached) return cached;
  const docs = await featuresCollection.find({ status: { $in: ["recruiting", "not_recruiting"] }, alphabetical: false }).toArray();
  const pick = (status: string) => {
    const rows = docs.filter((d) => d.status === status).map((d) => d.features);
    const out: Partial<Features> = {};
    for (const k of Object.keys(rows[0] ?? {}) as (keyof Features)[]) out[k] = median(rows.map((r) => r[k]));
    return out;
  };
  return (cached = { yes: pick("recruiting"), no: pick("not_recruiting") });
}

const n1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export function explain(f: Features, p: number, ref: Reference, stated?: "recruiting" | "not_recruiting"): string[] {
  const out: string[] = [];
  const yes = ref.yes.new_first_authors_rate ?? 0, no = ref.no.new_first_authors_rate ?? 0;

  // dormancy first: it overrides everything else
  if (f.years_since_last >= 2) {
    out.push(`No new papers for ${f.years_since_last} years. On the shortlist that pattern meant leave, a move to industry, or retirement, and it pulls the score down hard.`);
  } else {
    const rate = f.new_first_authors_rate;
    out.push(`${n1(rate)} new first authors a year over the last three years. A new first author is usually a new student. Among the labeled labs, those taking students had a median of ${n1(yes)} and those not taking students ${n1(no)}, so this number alone ${rate >= Math.max(yes, no) ? "looks healthy" : rate <= Math.min(yes, no) ? "looks low" : "is in the middle"}.`);
    const t = f.new_first_authors_trend;
    if (Math.abs(t) >= 1) out.push(t > 0 ? `Intake is rising: ${n1(t)} more new first authors a year than in the three years before. Growing groups keep taking students.` : `Intake is falling: ${n1(-t)} fewer new first authors a year than in the three years before. Groups that slow down are often full or winding down.`);
  }

  if (f.outflow >= 2) out.push(`${f.outflow} junior coauthors published their last paper with this group one to two years ago, which usually means they graduated. Seats have opened recently.`);
  else if (f.junior_cohort >= 8) out.push(`${f.junior_cohort} junior coauthors are active and almost none have finished recently. The group is large and may be at capacity.`);
  else if (f.junior_cohort > 0) out.push(`${f.junior_cohort} junior coauthors active, ${f.outflow} finished recently. A small group with little turnover.`);

  if (f.career_years <= 6) out.push(`${f.career_years} years since the first paper: an early-career lab. These recruit most and are the most under-applied-to.`);
  else if (f.career_years >= 20) out.push(`${f.career_years} years since the first paper: a senior lab. Intake here depends more on funding and current cohort than on growth.`);

  const pct = Math.round(p * 100);
  if (stated === "recruiting") out.push(p >= 0.6 ? `The page says yes and ${pct}% of labs that publish like this said yes. Both signals agree.` : p >= 0.4 ? `The page says yes, but only ${pct}% of labs that publish like this said yes. Apply, and expect a slower or more selective intake.` : `The page says yes, but only ${pct}% of labs that publish like this were taking students. The note may be old or aspirational. Apply, but do not count on it.`);
  else if (stated === "not_recruiting") out.push(`The page says no. ${pct}% of labs that publish like this said yes, but a stated no overrides the publications.`);
  else out.push(p >= 0.6 ? `Nothing is stated, and ${pct}% of labs that publish like this said they were taking students. Worth an application that names this professor.` : p >= 0.4 ? `Nothing is stated, and ${pct}% of labs that publish like this said yes. A real chance, not a safe bet.` : `Nothing is stated, and only ${pct}% of labs that publish like this said yes. Apply only if the fit is unusually strong.`);
  return out;
}
