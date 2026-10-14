// NSF awards: a recently started grant is money for a new student, and no faculty page ever states it.
// NSF only. Canadian (NSERC) and NIH funding are not checked, and the explanation says so.
export type Grant = { title: string; start: string; end: string; amount: number; awardee: string };
export type GrantFeatures = { active_grants: number; months_since_grant: number };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
const MIN_AMOUNT = 50_000; // below this it is a travel or workshop grant, not a lab budget

export async function fetchGrants(name: string, affiliation?: string): Promise<Grant[]> {
  const u = new URL("https://api.nsf.gov/services/v1/awards.json");
  u.searchParams.set("pdPIName", `"${name}"`);
  u.searchParams.set("printFields", "title,startDate,expDate,fundsObligatedAmt,awardeeName,piFirstName,piLastName");
  u.searchParams.set("rpp", "25");
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return [];
  const d = (await r.json()) as { response?: { award?: any[] } };
  const want = norm(name);
  const hint = norm(affiliation ?? "").filter((w) => w.length > 3 && !["university", "college", "institute", "school"].includes(w));
  return (d.response?.award ?? [])
    .filter((a) => { const have = norm(`${a.piFirstName} ${a.piLastName}`); return want[0] && have.includes(want[0]) && have.includes(want.at(-1)!); })
    .filter((a) => !hint.length || hint.some((w) => norm(a.awardeeName ?? "").includes(w)))
    .map((a) => ({ title: a.title, start: iso(a.startDate), end: iso(a.expDate), amount: Number(a.fundsObligatedAmt ?? 0), awardee: a.awardeeName ?? "" }))
    .sort((a, b) => (a.start < b.start ? 1 : -1));
}

const iso = (us: string) => { const [m, d, y] = String(us ?? "").split("/"); return y ? `${y}-${m}-${d}` : ""; };

export function grantFeatures(grants: Grant[], today = new Date()): GrantFeatures {
  const real = grants.filter((g) => g.amount >= MIN_AMOUNT);
  const active = real.filter((g) => g.end >= today.toISOString().slice(0, 10));
  const latest = real[0]?.start;
  const months = latest ? (today.getUTCFullYear() - Number(latest.slice(0, 4))) * 12 + (today.getUTCMonth() + 1 - Number(latest.slice(5, 7))) : 120;
  return { active_grants: active.length, months_since_grant: Math.min(months, 120) };
}

export function grantLine(grants: Grant[], f: GrantFeatures, affiliation?: string): string {
  const real = grants.filter((g) => g.amount >= MIN_AMOUNT);
  const canada = /\b(canada|ontario|quebec|alberta|british columbia|toronto|mcgill|waterloo|montr[eé]al|ubc|simon fraser|western university|queen's|mila)\b/i.test(affiliation ?? "");
  if (!real.length) return canada ? "No NSF award found, which is expected for a Canadian lab: NSERC funding is not checked yet, so grants do not count here." : "No NSF award of $50,000 or more found under this name. Many labs run on industry, DARPA or NIH money, so this is a weak signal on its own.";
  const g = real[0];
  const when = new Date(Number(g.start.slice(0, 4)), Number(g.start.slice(5, 7)) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const amt = g.amount >= 1e6 ? `$${(g.amount / 1e6).toFixed(1)}M` : `$${Math.round(g.amount / 1e3)}k`;
  const head = f.active_grants ? `${f.active_grants} active NSF award${f.active_grants > 1 ? "s" : ""}` : "No NSF award currently active";
  const recency = f.months_since_grant <= 18 ? "Grants that recent usually fund a new student in the next cycle." : f.months_since_grant <= 36 ? "A grant from two to three years ago is likely already staffed." : "The last award is old, so funding is not pushing intake right now.";
  return `${head}. The latest started ${when} (${amt}, runs to ${g.end.slice(0, 4)}). ${recency}`;
}
