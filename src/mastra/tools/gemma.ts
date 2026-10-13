// Gemma reads faculty page text and reports whether a recruiting status is stated.
import { Agent } from "@mastra/core/agent";
import { z } from "zod";

// Where Gemma runs is three env vars. Default: Google AI Studio through Mastra's router.
// Set GEMMA_BASE_URL to use any OpenAI-compatible server (LiteLLM, vLLM, LM Studio, OpenRouter)
// with GEMMA_MODEL as the bare model name that server expects.
export const MODEL = process.env.GEMMA_BASE_URL
  ? { providerId: "custom", modelId: process.env.GEMMA_MODEL ?? "gemma-3-27b-it", url: process.env.GEMMA_BASE_URL, apiKey: process.env.GEMMA_API_KEY }
  : (process.env.GEMMA_MODEL ?? "google/gemma-4-26b-a4b-it");

export const Reading = z.object({
  status: z.enum(["recruiting", "not_recruiting", "unstated"]),
  quote: z.string(),
  page: z.number().int(),
  confidence: z.number().min(0).max(1),
  date: z.string().optional(), // a date printed next to the statement, as written on the page
  stale: z.string().optional(), // set by code when the statement is for a past cycle
});
export type Reading = z.infer<typeof Reading>;

export const reader = new Agent({
  id: "page-reader",
  name: "Page reader",
  model: MODEL,
  instructions: `You read a professor's web pages and report whether they state that they are taking new PhD students.
Answer with one JSON object and nothing else.`,
});

const PROMPT = (name: string, year: number, pages: { url: string; text: string }[]) => `Professor: ${name}
Today's year: ${year}. The upcoming admissions cycle starts in Fall ${year + 1}.

Decide from the pages below whether the professor EXPLICITLY states a recruiting status for new PhD students.
- "recruiting": they say they ARE taking, admitting, looking for, or recruiting PhD students, for Fall ${year + 1} or with no cycle named.
- "not_recruiting": they say they are NOT taking new students, the lab is full, they are on leave, or they left academia. This wins over any invitation elsewhere on the pages.
- "unstated": anything else.

These are NOT statements and must be "unstated":
- headings, menu items, section titles or lists of duties ("PhD Supervision", "Graduate students", "Current students")
- invitations to apply, email, send a CV, or read another page ("prospective students, please apply to the department and mention my name")
- conditionals ("I may recruit", "subject to funding")
- statements for a past cycle: anything naming Fall ${year} or earlier as the start. Report any date printed next to the statement in "date" exactly as written (a news-item date, a year in the sentence, a "last updated" line); leave it empty if none
- text about postdocs, interns, undergraduates or master's students only

Copy the decisive sentence VERBATIM into "quote" (empty string if unstated). "page" is the 1-based index of the page the quote came from (0 if none). "confidence" is 0 to 1.

Reply with exactly: {"status": "...", "quote": "...", "page": N, "confidence": X, "date": "..."}

${pages.map((p, i) => `=== PAGE ${i + 1}: ${p.url}\n${p.text}`).join("\n\n")}`;

/** A statement dated before last year, or naming this fall or earlier as the start, is history, not a status. */
export function applyStaleness(r: Reading, year: number): Reading {
  if (r.status === "unstated") return r;
  const text = `${r.date ?? ""} ${r.quote}`;
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  // the start cycle is the latest "Fall YYYY" mentioned; "(Fall 2026) ... start in Fall 2027" is current
  const falls = [...r.quote.matchAll(/\b(?:fall|autumn|september)\s+(20\d{2})/gi)].map((m) => Number(m[1]));
  const dated = r.date ? Math.max(...[...(r.date.matchAll(/\b(20\d{2})\b/g))].map((m) => Number(m[1])), 0) : 0;
  const tooOld = falls.length ? Math.max(...falls) <= year : (dated > 0 && dated < year - 1) || (!dated && years.length > 0 && Math.max(...years) < year - 1);
  if (!tooOld) return r;
  const when = r.date || String(Math.max(...years));
  return { ...r, status: "unstated", stale: `${r.status === "recruiting" ? "A recruiting" : "A not-recruiting"} note dated ${when} was found and ignored as out of date: "${r.quote}"` };
}

export async function readPages(name: string, pages: { url: string; text: string }[]): Promise<Reading> {
  const prompt = PROMPT(name, new Date().getFullYear(), pages);
  // Google AI Studio returns intermittent 500s on Gemma; the SDK's own retries are not enough.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await reader.generate(prompt);
      const json = res.text.match(/\{[\s\S]*\}/)?.[0];
      if (!json) throw new Error(`Gemma returned no JSON: ${res.text.slice(0, 200)}`);
      return applyStaleness(Reading.parse(JSON.parse(json)), new Date().getFullYear());
    } catch (e) {
      if (attempt >= 4) throw e;
      // quota errors say how long to wait; everything else gets a short backoff
      const wait = Number(String(e).match(/retry in ([\d.]+)s/i)?.[1] ?? 0) * 1000 || 2000 * attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait + 500, 60000)));
    }
  }
}

/** Split free text like "Pam Bishop Western" into the person and the institution. */
export async function parseQuery(query: string): Promise<{ name: string; affiliation?: string }> {
  const res = await reader.generate(`A student typed this into a box that asks for a professor's name and university:
"${query}"
Split it into the person and the institution. A person's name is two or three words; anything else is the institution, including short forms and nicknames of universities (Western, Brock, Penn, MIT, CMU, UWO, UofT, Mila). Keep the student's spelling. Do not add a university that was not typed. Titles and degrees (Dr., Prof., PhD, MD, Professor) are not an institution and not part of the name.
Examples:
"Pam Bishop Western" -> {"name": "Pam Bishop", "affiliation": "Western"}
"prof. anwar haque uwo" -> {"name": "anwar haque", "affiliation": "uwo"}
"Hamed Hassani" -> {"name": "Hamed Hassani", "affiliation": ""}
"Isha DeCoito, PhD" -> {"name": "Isha DeCoito", "affiliation": ""}
"Daniel Ansari at Western University psychology" -> {"name": "Daniel Ansari", "affiliation": "Western University"}
Reply with exactly one JSON object: {"name": "...", "affiliation": "..."}`);
  const json = res.text.match(/\{[\s\S]*\}/)?.[0];
  const p = json ? (JSON.parse(json) as { name?: string; affiliation?: string }) : {};
  const strip = (x?: string) => (x ?? "").replace(/\b(dr|prof|professor|phd|ph\.d|md|mr|ms|mrs)\b\.?,?/gi, "").replace(/\s+/g, " ").trim();
  const name = strip(p.name) || strip(query) || query.trim();
  const affiliation = strip(p.affiliation);
  return { name, affiliation: affiliation || undefined };
}
