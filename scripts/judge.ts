// The record benchmark: Gemma scores the publication record of every labeled professor, blind to the page, and the scores are compared with the hand labels.
import { readdirSync } from "node:fs";
import { readCsv } from "../src/mastra/csv.ts";
import { computeFeatures, fetchFirstYear, fetchWorks, isAlphabetical } from "../src/mastra/tools/openalex.ts";
import { fetchGrants, grantFeatures } from "../src/mastra/tools/grants.ts";
import { BANDS, judgeRecord } from "../src/mastra/tools/judge.ts";

const YEAR = new Date().getFullYear();
const rows = readdirSync("data").filter((f) => f.endsWith(".csv")).flatMap((f) => readCsv(`data/${f}`)).filter((r) => r.openalex_id && (r.status === "recruiting" || r.status === "not_recruiting"));
const y: number[] = [], p: number[] = [];
for (const r of rows) {
  const works = await fetchWorks(r.openalex_id);
  if (isAlphabetical(works)) { console.log(`   skip ${r.name}: authors listed alphabetically`); continue; }
  const grants = await fetchGrants(r.name, r.affiliation).catch(() => []);
  const f = computeFeatures(works, r.openalex_id, YEAR, await fetchFirstYear(r.openalex_id), grantFeatures(grants));
  const prob = await judgeRecord(f, YEAR);
  y.push(r.status === "recruiting" ? 1 : 0); p.push(prob);
  console.log(`${String(y.length).padStart(2)} ${r.name.padEnd(26)} ${r.status.padEnd(15)} gemma=${prob.toFixed(2)}  last_author=${f.last_author_rate.toFixed(2)} students=${f.students_active}`);
}
let pairs = 0, won = 0;
y.forEach((yi, i) => y.forEach((yj, j) => { if (yi === 1 && yj === 0) { pairs++; won += p[i] > p[j] ? 1 : p[i] === p[j] ? 0.5 : 0; } }));
const n = y.length, pos = y.filter((v) => v === 1).length;
console.log(`\n${n} labeled professors, ${pos} recruiting. AUC ${(won / pairs).toFixed(2)} (0.5 is chance).`);
for (const [name, lo, hi] of [["Unlikely", -1, BANDS.mid], ["Toss-up", BANDS.mid, BANDS.high], ["Likely", BANDS.high, 2]] as const) {
  const idx = p.map((v, i) => i).filter((i) => p[i] >= lo && p[i] < hi);
  console.log(`  ${name.padEnd(9)} ${String(idx.length).padStart(2)} professors, ${idx.filter((i) => y[i] === 1).length} of them said they were recruiting`);
}
process.exit(0);
