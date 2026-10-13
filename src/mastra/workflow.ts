// The check: find the page, read it, and either quote the professor or infer from their publications.
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { Verdict } from "./verdict.ts";
import { professors } from "./db.ts";
import { findFacultyPage } from "./tools/serpapi.ts";
import { readSite } from "./tools/page.ts";
import { readPages, Reading } from "./tools/gemma.ts";
import { computeFeatures, fetchFirstYear, fetchWorks, findAuthor, isAlphabetical } from "./tools/openalex.ts";
import { predict } from "./tools/tabpfn.ts";

const Input = z.object({
  name: z.string().optional(),
  url: z.string().url().optional(),
  affiliation: z.string().optional(),
});

const Located = z.object({ name: z.string(), url: z.string().url(), affiliation: z.string().optional() });

const Read = Located.extend({
  reading: Reading,
  pages: z.array(z.string().url()),
  pageError: z.string().optional(),
});

const locate = createStep({
  id: "locate",
  inputSchema: Input,
  outputSchema: Located,
  execute: async ({ inputData: { name, url, affiliation } }) => {
    if (url) return { name: name ?? "", url, affiliation };
    if (!name) throw new Error("Give a professor's name or page URL");
    const hit = await findFacultyPage(name, affiliation);
    if (!hit) throw new Error(`No faculty page found for ${name}`);
    return { name, url: hit.url, affiliation };
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
      return { ...inputData, reading: unstated, pages: [], pageError: `Could not read ${inputData.url}: ${(e as Error).message}` };
    }
    const name = inputData.name || site.name;
    const reading = await readPages(name, site.pages);
    return { ...inputData, name, reading, pages: site.pages.map((p) => p.url) };
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
    if (!author) return { ...base, tier: "not_scored" as const, reason: "No OpenAlex author record matched this name, so there is no publication history to score." };
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
    await professors.updateOne({ name: verdict.name }, { $set: verdict }, { upsert: true });
    return verdict;
  },
});

export const check = createWorkflow({ id: "check", inputSchema: Input, outputSchema: Verdict })
  .then(locate)
  .then(read)
  .branch([
    [async ({ inputData }) => inputData.reading.status !== "unstated", stated],
    [async ({ inputData }) => inputData.reading.status === "unstated", infer],
  ])
  .then(save)
  .commit();
