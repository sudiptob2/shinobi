// SerpApi: turn a professor's name into their faculty or lab page.
// Google's organic results are noisy, but they almost always contain the professor's
// Google Scholar profile, and Scholar lists the homepage. So: search, hop through
// Scholar when it matches the affiliation, otherwise score the organic results.
const SKIP = /linkedin|scholar\.google|twitter\.com|x\.com|wikipedia|researchgate|dblp|semanticscholar|openalex|youtube|facebook|github\.com|ratemyprofessors|reddit|catalyzex|collaborate\.|\/publications?\/|\/news\/|\/event/i;

async function serp<T>(params: Record<string, string>): Promise<T> {
  const u = new URL("https://serpapi.com/search.json");
  for (const [k, v] of Object.entries({ ...params, api_key: process.env.SERPAPI_API_KEY ?? "" })) u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`SerpApi ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

const tokens = (s?: string) => (s ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !["university", "department", "school", "college", "institute", "professor"].includes(w));

type Organic = { link: string; title: string };
const search = (q: string) => serp<{ organic_results?: Organic[] }>({ engine: "google", q, num: "10", gl: "us", hl: "en" }).then((d) => d.organic_results ?? []);

export async function findFacultyPage(name: string, affiliation?: string): Promise<{ url: string; via: string } | null> {
  const hint = tokens(affiliation);
  const who = `"${name}" ${affiliation ?? ""}`.trim();

  // 1. Scholar profile -> homepage, when the profile's affiliation agrees with the hint
  const results = await search(`${who} google scholar`);
  const ids = [...new Set(results.map((o) => o.link.match(/citations\?.*?user=([\w-]+)/)?.[1]).filter(Boolean))].slice(0, 2) as string[];
  for (const author_id of ids) {
    const a = (await serp<{ author?: { website?: string; affiliations?: string } }>({ engine: "google_scholar_author", author_id })).author;
    if (!a?.website) continue;
    if (!hint.length || tokens(a.affiliations).some((w) => hint.includes(w))) return { url: a.website, via: "scholar" };
  }

  // 2. Plain search, scored: surname in URL, academic host, affiliation in URL
  const surname = name.trim().split(/\s+/).pop()!.toLowerCase();
  const scored = (await search(who))
    .filter((o) => !SKIP.test(o.link))
    .map((o) => {
      const l = o.link.toLowerCase(), host = new URL(o.link).host;
      return { url: o.link, score: (l.includes(surname) ? 3 : 0) + (/\.(edu|ca)$|github\.io$/.test(host) ? 2 : 0) + (hint.some((w) => l.includes(w)) ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0] ? { url: scored[0].url, via: `search:${scored[0].score}` } : null;
}
