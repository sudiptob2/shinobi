// Run the check over the labeled shortlist and score the reader against the hand labels.
import { readCsv } from "../src/mastra/csv.ts";
import { mastra } from "../src/mastra/index.ts";

const rows = readCsv("data/shortlist.csv");
const wf = mastra.getWorkflow("check");
const confusion: Record<string, number> = {};
const misses: string[] = [];
let n = 0;

for (const r of rows) {
  const t0 = Date.now();
  const run = await wf.createRun();
  const res = await run.start({ inputData: { name: r.name, url: r.page_url, affiliation: r.affiliation.split(",")[0] } });
  let got = "error";
  if (res.status === "success") {
    const v = res.result;
    got = v.tier === "stated" ? v.stated!.status : v.tier === "inferred" ? "unstated" : `not_scored`;
  }
  const key = `${r.status} -> ${got}`;
  confusion[key] = (confusion[key] ?? 0) + 1;
  const ok = got === r.status || (r.status === "unstated" && got === "not_scored");
  if (!ok) misses.push(`${r.name}: labeled ${r.status}, got ${got}${res.status !== "success" ? ` (${(res as any).error?.message ?? res.status})` : ""}`);
  console.log(`${String(++n).padStart(2)}/${rows.length} ${ok ? "ok  " : "MISS"} ${r.name.padEnd(26)} ${key.padEnd(32)} ${Date.now() - t0}ms`);
}

console.log("\nhand label -> reader:");
for (const [k, v] of Object.entries(confusion).sort()) console.log(`  ${k.padEnd(32)} ${v}`);
const agree = rows.length - misses.length;
console.log(`\nagreement: ${agree}/${rows.length} (${((100 * agree) / rows.length).toFixed(0)}%)`);
if (misses.length) console.log("\nmisses:\n  " + misses.join("\n  "));
process.exit(0);
