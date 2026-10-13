// The check: find the page, read it, and either quote the professor or infer from their publications.
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { Verdict } from "./verdict.ts";
import { professors } from "./db.ts";
import { findFacultyPage } from "./tools/serpapi.ts";
import { readSite } from "./tools/page.ts";
import { parseQuery, readPages, Reading } from "./tools/gemma.ts";
import { computeFeatures, fetchFirstYear, fetchWorks, findAuthor, isAlphabetical } from "./tools/openalex.ts";
import { predict } from "./tools/tabpfn.ts";

const Input = z.object({
  query: z.string().optional(), // free text, parsed by the model
  name: z.string().optional(),
  url: z.string().url().optional(),
  affiliation: z.string().optional(),
});

/** Prefer the page's own form of the name ("Pamela Bishop" over "Pam Bishop") when it is clearly the same person. */
export function formalName(typed: string, fromTitle: string): string {
  const clean = fromTitle.replace(/\b(dr|prof|professor|phd|mr|ms|mrs)\.?\s*/gi, "").trim();
  if (!typed) return clean;
  if (!clean) return typed;
  const a = typed.toLowerCase().split(/\s+/), b = clean.toLowerCase().split(/\s+/);
  const sameSurname = a.at(-1) === b.at(-1);
  const firstFits = b[0]?.startsWith(a[0]) || a[0]?.startsWith(b[0] ?? "~");
  return sameSurname && firstFits && b.length <= 4 ? clean : typed;
}

const Located = z.object({ name: z.string(), url: z.string().url(), affiliation: z.string().optional() });

const Read = Located.extend({
  reading: Reading,
  pages: z.array(z.string().url()),
  pageError: z.string().optional(),
});

const Parsed = z.object({ name: z.string(), affiliation: z.string().optional(), url: z.string().url().optional() });

// The model reads whatever was typed and turns it into a person and an institution.
const parse = createStep({
  id: "parse",
  inputSchema: Input,
  outputSchema: Parsed,
  execute: async ({ inputData }) => {
    if (inputData.url) return { name: inputData.name ?? "", affiliation: inputData.affiliation, url: inputData.url };
    if (inputData.query) {
      if (/^https?:\/\//i.test(inputData.query.trim())) return { name: "", url: inputData.query.trim() };
      return parseQuery(inputData.query);
    }
    if (!inputData.name) throw new Error("Give a professor's name or page URL");
    return { name: inputData.name, affiliation: inputData.affiliation };
  },
});

const locate = createStep({
  id: "locate",
  inputSchema: Parsed,
  outputSchema: Located,
  execute: async ({ inputData }) => {
    const { name, url, affiliation } = inputData;
    if (url) return { name, url, affiliation };
    const hit = await findFacultyPage(name, affiliation);
    if (!hit) throw new Error(`No faculty page found for "${name}". Add the university, or paste the page URL.`);
    return { name, url: hit.url, affiliation: affiliation ?? hit.affiliation };
  },
});

const read = createStep({
  id: "read",
  inputSchema: Located,
  outputSchema: Read,
  execute: async ({ inputData }) => {
    let site: Awaited<ReturnType<typeof readSite>>;
    try {
      site = await readSite(inputData.url, inputData.name.split(/\s+/).pop());
    } catch (e) {
      // an unreachable page is not a verdict; fall through to inference and say so
      const unstated = { status: "unstated" as const, quote: "", page: 0, confidence: 0 };
      const why = String((e as Error).message).match(/^(\d{3})/)?.[1];
      return { ...inputData, reading: unstated, pages: [], pageError: `The page could not be read${why ? ` (HTTP ${why})` : ""}, so nothing is quoted.` };
    }
    const name = formalName(inputData.name, site.name);
    const reading = await readPages(name, site.pages);
    return { ...inputData, name, affiliation: inputData.affiliation ?? site.school, reading, pages: site.pages.map((p) => p.url) };
  },
});

const stated = createStep({
  id: "stated",
  inputSchema: Read,
  outputSchema: Verdict,
  execute: async ({ inputData: d }) => ({
    name: d.name, affiliation: d.affiliation, pageUrl: d.url, tier: "stated" as const,
    stated: { status: d.reading.status as "recruiting" | "not_recruiting", quote: d.reading.quote, sourceUrl: d.pages[d.reading.page - 1] ?? d.url },
    checkedAt: new Date().toISOString(),
  }),
});

const infer = createStep({
  id: "infer",
  inputSchema: Read,
  outputSchema: Verdict,
  execute: async ({ inputData: d }) => {
    const base = { name: d.name, affiliation: d.affiliation, pageUrl: d.url, checkedAt: new Date().toISOString(), ...(d.pageError && { note: d.pageError }) };
    const author = await findAuthor(d.name, d.affiliation);
    if ("reason" in author) return { ...base, tier: "not_scored" as const, reason: author.reason };
    const works = await fetchWorks(author.id);
    if (works.length < 5) return { ...base, tier: "not_scored" as const, reason: `OpenAlex has only ${works.length} papers for this author since 2008, too few to score.` };
    if (isAlphabetical(works)) return { ...base, tier: "not_scored" as const, reason: "This professor's papers list authors alphabetically, so first authorship carries no signal about students." };
    const features = computeFeatures(works, author.id, new Date().getFullYear(), await fetchFirstYear(author.id));
    const probability = await predict(features);
    return { ...base, tier: "inferred" as const, inferred: { probability, features: { ...features } }, openalexId: author.id };
  },
});

const save = createStep({
  id: "save",
  inputSchema: z.object({ stated: Verdict.optional(), infer: Verdict.optional() }),
  outputSchema: Verdict,
  execute: async ({ inputData }) => {
    const verdict = (inputData.stated ?? inputData.infer)!;
    await professors.replaceOne({ name: verdict.name }, verdict, { upsert: true });
    return verdict;
  },
});

export const check = createWorkflow({ id: "check", inputSchema: Input, outputSchema: Verdict })
  .then(parse)
  .then(locate)
  .then(read)
  .branch([
    [async ({ inputData }) => inputData.reading.status !== "unstated", stated],
    [async ({ inputData }) => inputData.reading.status === "unstated", infer],
  ])
  .then(save)
  .commit();
