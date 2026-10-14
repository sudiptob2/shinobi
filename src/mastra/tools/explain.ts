// Why this professor scored the way they did, in sentences a student can act on.
// Deterministic: every sentence comes from a feature. The model only supplies the probability, so the words can never argue with the score.
import type { Features } from "./openalex.ts";
import { BANDS } from "./judge.ts";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function explain(f: Features, p: number, stated?: "recruiting" | "not_recruiting"): string[] {
  const out: string[] = [];

  // dormancy first: it overrides everything else
  if (f.years_since_last >= 2) {
    out.push(`No new papers for ${f.years_since_last} years. On the shortlist that pattern meant leave, a move to industry, or retirement, and it pulls the score down hard.`);
  } else {
    out.push(
      f.last_author_rate >= 0.4
        ? `Last author on ${pct(f.last_author_rate)} of papers in the last three years: the advisor position. Professors who run a group sit there, and they are the ones taking students.`
        : f.last_author_rate >= 0.2
          ? `Last author on ${pct(f.last_author_rate)} of recent papers, the advisor position, which is on the low side for someone running a group.`
          : `Last author on only ${pct(f.last_author_rate)} of recent papers. More often a collaborator than the lab head, which is how senior, part-time or industry-bound professors look.`,
    );
    if (f.students_active > 0) {
      const turnover = f.students_new_2y >= 2 ? "The group is still taking people in." : f.students_left >= 2 ? "Seats have opened recently." : "Little turnover either way.";
      out.push(`${f.students_active} student${f.students_active === 1 ? "" : "s"} at the same institution publishing with this group now, ${f.students_new_2y} new in the last two years, ${f.students_left} finished in the last three. ${turnover}`);
    } else {
      out.push("No same-institution student has led a paper with this group in six years. Either the group is new, or its students publish elsewhere.");
    }
    if (f.industry_share >= 0.3) out.push(`${pct(f.industry_share)} of recent papers list a company affiliation for this professor, which often means leave or a move to industry.`);
  }

  if (f.career_years <= 6) out.push(`${f.career_years} years since the first paper: an early-career lab. These recruit most and are the most under-applied-to.`);
  else if (f.career_years >= 20) out.push(`${f.career_years} years since the first paper: a senior lab. Intake here depends more on funding and current cohort than on growth.`);

  const chance = `Gemma puts the chance at ${pct(p)} from the record alone`;
  if (stated === "recruiting") out.push(p >= BANDS.high ? `The page says yes, and ${chance}. Both signals agree.` : p >= BANDS.mid ? `The page says yes, and ${chance}. Apply, and expect a slower or more selective intake.` : `The page says yes, but ${chance}. The note may be old or aspirational. Apply, but do not count on it.`);
  else if (stated === "not_recruiting") out.push(`The page says no. ${chance}, but a stated no overrides the record.`);
  else out.push(p >= BANDS.high ? `Nothing is stated, and ${chance}. Worth an application that names this professor.` : p >= BANDS.mid ? `Nothing is stated, and ${chance}. A real chance, not a safe bet.` : `Nothing is stated, and ${chance}. Apply only if the fit is unusually strong.`);
  return out;
}
