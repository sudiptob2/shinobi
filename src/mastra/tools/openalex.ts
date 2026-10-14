// OpenAlex: fetch an author's works and turn them into the publication features
// the record judge sees, plus the alphabetical-order flag that disables it.
import { schoolWords, words } from "./text.ts";

export type Authorship = {
  author: { id: string | null; display_name: string };
  author_position?: "first" | "middle" | "last";
  institutions?: { id: string; display_name?: string; type?: string }[];
};
export type Work = { publication_year: number; authorships: Authorship[] };

export type Features = {
  last_author_rate: number; // share of papers in the last 3 years with the professor as last author, the advisor position
  students_active: number; // students with a paper in the last 2 years (a student: shares the professor's institution, led a paper with them, started within 6 years)
  students_new_2y: number; // students who started in the last 2 years
  students_left: number; // students whose last paper with the professor was 2 to 3 years ago
  group_size_2y: number; // distinct same-institution coauthors in the last 2 years
  pub_rate: number; // papers per year, last 3 years
  career_years: number; // since first paper
  years_since_last: number; // since most recent paper
  active_grants: number; // NSF awards of $50k or more still running
  industry_share: number; // share of the professor's own authorships in the last 2 years that list a company
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
  const want = words(name);
  const named = results.filter((a) => { const have = words(a.display_name); return want.every((w) => have.includes(w)); }).filter((a) => a.works_count >= 5);
  if (!named.length) return { reason: `OpenAlex has no author named ${name} with at least five papers, so there is no publication history to score.` };

  const hint = schoolWords(affiliation);
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

export function computeFeatures(works: Work[], authorId: string, year: number, careerStart?: number | null, grants: { active_grants: number } = { active_grants: 0 }): Features {
  const me = `https://openalex.org/${authorId}`;
  const mine = (w: Work) => w.authorships.find((a) => a.author.id === me);
  const years = works.map((w) => w.publication_year).sort((a, b) => a - b);
  const first = careerStart ?? years[0] ?? year, last = years.at(-1) ?? year;
  const recent3 = works.filter((w) => w.publication_year >= year - 2), recent2 = works.filter((w) => w.publication_year >= year - 1);

  // home: the university that appears most on the professor's own recent authorships (the author record itself is too noisy)
  const count = new Map<string, number>();
  for (const w of recent3) for (const i of mine(w)?.institutions ?? []) if (i.type === "education") count.set(i.id, (count.get(i.id) ?? 0) + 1);
  const home = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  const atHome = (a: Authorship) => !home || (a.institutions ?? []).some((i) => i.id === home);

  // every coauthor: first and last year with the professor, whether they ever led a paper, whether they ever shared the home institution
  const firstYear = new Map<string, number>(), lastYear = new Map<string, number>(), led = new Set<string>(), homeEver = new Set<string>();
  for (const w of works) for (const a of w.authorships) {
    const id = a.author.id;
    if (!id || id === me) continue;
    firstYear.set(id, Math.min(firstYear.get(id) ?? Infinity, w.publication_year));
    lastYear.set(id, Math.max(lastYear.get(id) ?? -Infinity, w.publication_year));
    if (a.author_position === "first") led.add(id);
    if (atHome(a)) homeEver.add(id);
  }
  const students = [...firstYear].filter(([id, fy]) => fy >= year - 6 && led.has(id) && homeEver.has(id)).map(([id]) => id);
  const lastAuthor = recent3.filter((w) => mine(w)?.author_position === "last").length;

  return {
    last_author_rate: recent3.length ? lastAuthor / recent3.length : 0,
    students_active: students.filter((id) => lastYear.get(id)! >= year - 1).length,
    students_new_2y: students.filter((id) => firstYear.get(id)! >= year - 1).length,
    students_left: students.filter((id) => { const ly = lastYear.get(id)!; return ly >= year - 3 && ly <= year - 2; }).length,
    group_size_2y: new Set(recent2.flatMap((w) => w.authorships.filter((a) => a.author.id && a.author.id !== me && atHome(a)).map((a) => a.author.id!))).size,
    pub_rate: recent3.length / 3,
    career_years: year - first,
    years_since_last: year - last,
    active_grants: grants.active_grants,
    industry_share: recent2.length ? recent2.filter((w) => (mine(w)?.institutions ?? []).some((i) => i.type === "company")).length / recent2.length : 0,
  };
}
