// OpenAlex: fetch an author's works and turn them into the seven features
// the predictor sees, plus the alphabetical-order flag that disables it.

export type Work = {
  publication_year: number;
  authorships: { author: { id: string | null; display_name: string } }[];
};

export type Features = {
  new_first_authors_rate: number; // new distinct first authors per year, mean of last 3 years
  new_first_authors_trend: number; // last 3 years minus the 3 before
  junior_cohort: number; // juniors with a paper in the last 2 years
  outflow: number; // juniors whose last paper was 1 to 2 years ago
  pub_rate: number; // papers per year, last 3 years
  pub_rate_trend: number; // last 3 years minus the 3 before
  career_years: number; // since first paper
  years_since_last: number; // since most recent paper
};

const API = "https://api.openalex.org";

// Unkeyed requests share a small daily budget per IP; a free key removes that.
async function get<T>(u: URL): Promise<T> {
  if (process.env.OPENALEX_API_KEY) u.searchParams.set("api_key", process.env.OPENALEX_API_KEY);
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(u);
    if (r.ok) return (await r.json()) as T;
    if (r.status === 429 && attempt < 4) { await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); continue; }
    throw new Error(`OpenAlex ${u.pathname} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

export async function findAuthor(name: string, affiliation?: string) {
  const u = new URL(`${API}/authors`);
  u.searchParams.set("search", name);
  u.searchParams.set("per_page", "5");
  u.searchParams.set("select", "id,display_name,last_known_institutions,works_count");
  const { results } = await get<{ results: any[] }>(u);
  const hint = affiliation?.toLowerCase().split(/[, ]+/).filter((w) => w.length > 3) ?? [];
  const score = (a: any) => {
    const inst = (a.last_known_institutions ?? []).map((i: any) => i.display_name.toLowerCase()).join(" ");
    return hint.filter((w) => inst.includes(w)).length * 1000 + a.works_count;
  };
  results.sort((a, b) => score(b) - score(a));
  return results[0] ? { id: results[0].id.split("/").pop() as string, name: results[0].display_name as string } : null;
}

export async function fetchWorks(authorId: string, since = 2008): Promise<Work[]> {
  const works: Work[] = [];
  let cursor = "*";
  while (cursor) {
    const u = new URL(`${API}/works`);
    u.searchParams.set("filter", `authorships.author.id:${authorId},type:article|preprint,from_publication_date:${since}-01-01`);
    u.searchParams.set("select", "publication_year,authorships");
    u.searchParams.set("per_page", "200");
    u.searchParams.set("cursor", cursor);
    const d = await get<{ results: Work[]; meta: { next_cursor: string | null } }>(u);
    works.push(...d.results);
    cursor = d.meta.next_cursor ?? "";
  }
  return works;
}

/** Career start: the earliest year with at least two papers, which skips one-off misattributed early works. */
export async function fetchFirstYear(authorId: string): Promise<number | null> {
  const u = new URL(`${API}/works`);
  u.searchParams.set("filter", `authorships.author.id:${authorId},type:article|preprint`);
  u.searchParams.set("group_by", "publication_year");
  const d = await get<{ group_by: { key: string; count: number }[] }>(u);
  const years = d.group_by.filter((g) => g.count >= 2).map((g) => Number(g.key)).filter(Number.isFinite);
  return years.length ? Math.min(...years) : null;
}

const surname = (n: string) => n.trim().split(/\s+/).pop()!.toLowerCase();

/** True when author lists are sorted by surname far more often than chance. */
export function isAlphabetical(works: Work[]): boolean {
  const multi = works.filter((w) => w.authorships.length >= 3);
  if (multi.length < 5) return false;
  const sorted = multi.filter((w) => {
    const s = w.authorships.map((a) => surname(a.author.display_name));
    return s.every((x, i) => i === 0 || s[i - 1] <= x);
  });
  return sorted.length / multi.length > 0.5;
}

export function computeFeatures(works: Work[], authorId: string, year: number, careerStart?: number | null): Features {
  const me = `https://openalex.org/${authorId}`;
  const byYear = [...works].sort((a, b) => a.publication_year - b.publication_year);
  const years = byYear.map((w) => w.publication_year);
  const first = careerStart ?? years[0] ?? year, last = years.at(-1) ?? year;

  // first authors other than me, in order of first appearance
  const seen = new Set<string>();
  const newFirstByYear = new Map<number, number>();
  const firstYear = new Map<string, number>(), lastYear = new Map<string, number>();
  for (const w of byYear) {
    const fa = w.authorships[0]?.author;
    if (!fa?.id || fa.id === me) continue;
    firstYear.set(fa.id, Math.min(firstYear.get(fa.id) ?? Infinity, w.publication_year));
    lastYear.set(fa.id, Math.max(lastYear.get(fa.id) ?? -Infinity, w.publication_year));
    if (!seen.has(fa.id)) {
      seen.add(fa.id);
      newFirstByYear.set(w.publication_year, (newFirstByYear.get(w.publication_year) ?? 0) + 1);
    }
  }
  const mean = (m: Map<number, number>, from: number, to: number) => {
    let s = 0;
    for (let y = from; y <= to; y++) s += m.get(y) ?? 0;
    return s / (to - from + 1);
  };
  const papersByYear = new Map<number, number>();
  for (const y of years) papersByYear.set(y, (papersByYear.get(y) ?? 0) + 1);

  // a junior is a first author whose first paper with me is within the last 6 years
  const juniors = [...firstYear].filter(([, fy]) => fy >= year - 6).map(([id]) => id);
  const junior_cohort = juniors.filter((id) => lastYear.get(id)! >= year - 2).length;
  const outflow = juniors.filter((id) => { const ly = lastYear.get(id)!; return ly >= year - 2 && ly <= year - 1 && ly < year; }).length;

  return {
    new_first_authors_rate: mean(newFirstByYear, year - 2, year),
    new_first_authors_trend: mean(newFirstByYear, year - 2, year) - mean(newFirstByYear, year - 5, year - 3),
    junior_cohort,
    outflow,
    pub_rate: mean(papersByYear, year - 2, year),
    pub_rate_trend: mean(papersByYear, year - 2, year) - mean(papersByYear, year - 5, year - 3),
    career_years: year - first,
    years_since_last: year - last,
  };
}
