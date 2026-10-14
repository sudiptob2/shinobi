// SerpApi: turn a professor's name into their faculty or lab page.
// Google's organic results are noisy, but they almost always contain the professor's
// Google Scholar profile, and Scholar lists the homepage. So: search, hop through
// Scholar when it matches the affiliation, otherwise score the organic results.
import { splitTitle } from "./page.ts";
import { schoolWords, words } from "./text.ts";

const SKIP = /linkedin|scholar\.google|twitter\.com|x\.com|wikipedia|researchgate|dblp|semanticscholar|openalex|youtube|facebook|github\.com|ratemyprofessors|reddit|catalyzex|scholargps|scholarlink|academia\.edu|orcid|aminer|frontiersin|x-mol|ieee\.org|acm\.org|springer|sciencedirect|arxiv|openreview|rocketreach|zoominfo|crunchbase|collaborate\.|\/publications?\/|\/news\/|\/event/i;

async function serp<T>(params: Record<string, string>): Promise<T> {
  const u = new URL("https://serpapi.com/search.json");
  for (const [k, v] of Object.entries({ ...params, api_key: process.env.SERPAPI_API_KEY ?? "" })) u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`SerpApi ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

/** Every meaningful token of the query name appears in the candidate name (initials ignored). */
export function sameName(query: string, candidate?: string): boolean {
  const c = words(candidate);
  return c.length > 0 && words(query).every((w) => c.includes(w));
}

const hostOf = (u: string) => { try { return new URL(u).host; } catch { return ""; } };

type Organic = { link: string; title: string };

/**
 * DuckDuckGo through SerpApi ranks faculty pages first for a name and school;
 * Google through SerpApi returned aggregators and namesakes, so it is not used.
 */
export async function findFacultyPage(name: string, affiliation?: string): Promise<{ url: string; via: string; affiliation?: string } | null> {
  let results: Organic[] = [];
  for (const q of [`"${name}" ${affiliation ?? ""}`.trim(), `${name} ${affiliation ?? ""} professor`.trim()]) {
    const d = await serp<{ organic_results?: Organic[] }>({ engine: "duckduckgo", q, kl: "us-en" });
    results = (d.organic_results ?? []).filter((o) => sameName(name, o.title));
    if (results.length) break;
  }
  // academic hosts first, then pages whose title reads academic; people-search and social sites never
  const score = (o: Organic) => {
    const host = hostOf(o.link);
    if (!host || SKIP.test(o.link) || /whitepages|spokeo|peoplefinder|mylife|radaris|peoplesearch|zabasearch|instagram|tiktok/i.test(host)) return -1;
    return (/\.(edu|ca|ac\.[a-z]+|edu\.[a-z]+)$|github\.io$|univ|college/i.test(host) ? 3 : 0)
      + (/universit|college|institute|professor|faculty|lab\b|research|department/i.test(o.title) ? 2 : 0)
      + (/\/~|github\.io/i.test(o.link) ? 1 : 0);
  };
  const pages = results.map((o) => ({ o, s: score(o) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.o);
  const page = pages[0];
  if (page) {
    // the result title usually names the university, which helps the OpenAlex lookup when no school was given
    const fromTitle = splitTitle(page.title).find((t) => /universit|college|institute|school/i.test(t));
    return { url: page.link, via: "duckduckgo", affiliation: affiliation ?? fromTitle };
  }
  // only a Scholar profile surfaced: take its homepage if the name and school agree
  const author_id = results.map((o) => o.link.match(/citations\?.*?user=([\w-]+)/)?.[1]).find(Boolean);
  if (author_id) {
    const a = (await serp<{ author?: { name?: string; website?: string; affiliations?: string } }>({ engine: "google_scholar_author", author_id })).author;
    const hint = schoolWords(affiliation);
    if (a?.website && sameName(name, a.name) && !SKIP.test(a.website) && (!hint.length || schoolWords(a.affiliations).some((w) => hint.includes(w))))
      return { url: a.website, via: "scholar", affiliation: affiliation ?? a.affiliations };
  }
  return null;
}
