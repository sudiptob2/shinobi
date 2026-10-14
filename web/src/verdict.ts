// One verdict from both signals: what the page says and what the publications say.
import type { Verdict } from "./api";

export type Tone = "g" | "y" | "r" | "n";
export type Filter = "all" | "g" | "y" | "r" | "n"; // g: page says taking, y: inferred only, r: not taking, n: not scored

const band = (p: number) => (p >= 0.6 ? "high" : p >= 0.4 ? "mid" : "low");
const TONE = { high: "g", mid: "y", low: "r" } as const;
export const recordTone = (p: number): Tone => TONE[band(p)];

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

/** The sentence after the publication percentage. */
export function recordLine(v: Verdict): string {
  const p = v.inferred!.probability;
  if (!v.stated) return "of labs with this publication pattern said they were taking students";
  if (v.stated.status === "recruiting") return p >= 0.6 ? "of labs that publish like this said yes too. The publications back the page." : p >= 0.4 ? "of labs that publish like this said yes. The page says yes, the publications are unsure." : "of labs that publish like this said yes. The page says yes, but few labs that publish like this were taking students.";
  return p >= 0.6 ? "of labs that publish like this said yes. The page says no, so trust the page." : "of labs that publish like this said yes. The publications agree with the page.";
}

export const FEATURE_NAMES: Record<string, string> = {
  new_first_authors_rate: "New first authors per year",
  new_first_authors_trend: "Change vs the three years before",
  junior_cohort: "Junior coauthors active now",
  outflow: "Juniors who finished recently",
  pub_rate: "Papers per year",
  pub_rate_trend: "Change in papers per year",
  career_years: "Years since first paper",
  years_since_last: "Years since last paper",
  active_grants: "Active NSF awards",
  months_since_grant: "Months since the latest NSF award",
};
export const fmt = (k: string, n: number) => (k.includes("trend") ? (n >= 0 ? "+" : "") + n.toFixed(1) : Number.isInteger(n) ? String(n) : n.toFixed(1));
