// Gemma judges the publication record: the numbers go in, a probability comes out. Code writes the words.
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { MODEL, generateJson } from "./gemma.ts";
import type { Features } from "./openalex.ts";

/** Where a record score becomes Likely, Toss-up or Unlikely. From `npm run judge` on the labeled professors: below 0.4 one in four said yes, 0.4 to 0.8 about half, 0.8 and above four in five. */
export const BANDS = { mid: 0.4, high: 0.8 };

export const DEFINITIONS: Record<keyof Features, string> = {
  last_author_rate: "share of the professor's papers in the last 3 years where they are last author (the advisor position)",
  students_active: "students (coauthors at the professor's own institution who led a paper with them and started within 6 years) with a paper in the last 2 years",
  students_new_2y: "those students who started in the last 2 years",
  students_left: "students whose last paper with the professor was 2 to 3 years ago",
  group_size_2y: "distinct same-institution coauthors in the last 2 years",
  pub_rate: "papers per year over the last 3 years",
  career_years: "years since the professor's first paper",
  years_since_last: "years since the professor's most recent paper",
  active_grants: "NSF awards of $50,000 or more still running",
  industry_share: "share of the professor's own authorships in the last 2 years that list a company",
};

const judge = new Agent({
  id: "record-judge",
  name: "Record judge",
  model: MODEL,
  instructions: "You estimate, from a publication record alone, whether a machine learning professor is taking new PhD students. Answer with one JSON object and nothing else.",
});

/** Probability that a professor with this record is taking PhD students, from Gemma, deterministic. */
export async function judgeRecord(f: Features, year = new Date().getFullYear()): Promise<number> {
  const prompt = `You do not know what the professor's web page says.

Feature definitions:
${Object.entries(DEFINITIONS).map(([k, d]) => `${k}: ${d}`).join("\n")}

Professor's numbers (year ${year}):
${(Object.keys(DEFINITIONS) as (keyof Features)[]).map((k) => `${k}: ${+f[k].toFixed(2)}`).join("\n")}

Return JSON: {"probability": <0 to 1 that they are taking new PhD students this cycle>, "reason": "<one sentence>"}`;
  const r = await generateJson(judge, prompt, (raw) => z.object({ probability: z.number().min(0).max(1) }).parse(raw), { temperature: 0 });
  return r.probability;
}
