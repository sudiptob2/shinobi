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

export type AuthorMatch = { id: string; name: string } | { reason: string };

/** The OpenAlex author for a name, or a reason not to guess. */
export async function findAuthor(name: string, affiliation?: string): Promise<AuthorMatch> {
  const u = new URL(`${API}/authors`);
  u.searchParams.set("search", name);
  u.searchParams.set("per_page", "10");
  u.searchParams.set("select", "id,display_name,affiliations,works_count");
  const { results } = await get<{ results: any[] }>(u);
  const norm = (n: string) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  const want = norm(name);
  const named = results.filter((a) => { const have = norm(a.display_name); return want.every((w) => have.includes(w)); }).filter((a) => a.works_count >= 5);
  if (!named.length) return { reason: `OpenAlex has no author named ${name} with at least five papers, so there is no publication history to score.` };

  const hint = (affiliation ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !["university", "department", "school", "college", "institute", "professor"].includes(w));
  if (hint.length) {
    const at = named.filter((a) => (a.affiliations ?? []).some((x: any) => hint.some((w) => x.institution.display_name.toLowerCase().includes(w))));
    if (!at.length) return { reason: `OpenAlex has ${named.length === 1 ? "an author" : "authors"} named ${name}, but none at ${affiliation}. The name may be spelled differently there, so this was not scored.` };
    at.sort((a, b) => b.works_count - a.works_count);
    return { id: at[0].id.split("/").pop(), name: at[0].display_name };
  }
  if (named.length > 1) return { reason: `${named.length} researchers on OpenAlex share the name ${name}. Add the university to the check so the right one is scored.` };
  return { id: named[0].id.split("/").pop(), name: named[0].display_name };
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
