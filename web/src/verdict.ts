// One verdict from both signals: what the page says and what the publications say.
import type { Verdict } from "./api";

export type Tone = "g" | "y" | "r" | "n";
export type Filter = "all" | "g" | "y" | "r" | "n"; // g: page says taking, y: inferred only, r: not taking, n: not scored

// Gemma scores the record. On the labeled professors: below 0.4 one in four said yes, 0.4 to 0.8 about half, 0.8 and above four in five.
const band = (p: number) => (p >= 0.8 ? "high" : p >= 0.4 ? "mid" : "low");
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

/** The sentence after the record percentage. */
export function recordLine(v: Verdict): string {
  const p = v.inferred!.probability;
  if (!v.stated) return "chance they are taking students, judged by Gemma from the publication record alone";
  if (v.stated.status === "recruiting") return p >= 0.8 ? "chance from the record alone. The publications back the page." : p >= 0.4 ? "chance from the record alone. The page says yes, the record is unsure." : "chance from the record alone. The page says yes, but the record looks like a group that is not taking students.";
  return p >= 0.8 ? "chance from the record alone. The page says no, so trust the page." : "chance from the record alone. The record agrees with the page.";
}

export const FEATURE_NAMES: Record<string, string> = {
  last_author_rate: "Last author on recent papers",
  students_active: "Students publishing now",
  students_new_2y: "Students who started in the last two years",
  students_left: "Students who finished recently",
  group_size_2y: "Same-institution coauthors, last two years",
  pub_rate: "Papers per year",
  career_years: "Years since first paper",
  years_since_last: "Years since last paper",
  active_grants: "Active NSF awards",
  industry_share: "Recent papers from a company",
};
export const fmt = (k: string, n: number) => (k.endsWith("rate") || k.endsWith("share") ? `${Math.round(n * 100)}%` : Number.isInteger(n) ? String(n) : n.toFixed(1));
