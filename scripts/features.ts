// Pull OpenAlex features for every labeled professor into the features collection.
// Skips when the table is already complete, so it can run on every start; pass --refresh to pull again.
import { readdirSync } from "node:fs";
import { readCsv } from "../src/mastra/csv.ts";
import { features, type FeatureRow } from "../src/mastra/db.ts";
import { computeFeatures, fetchFirstYear, fetchWorks, isAlphabetical } from "../src/mastra/tools/openalex.ts";
import { fetchGrants, grantFeatures } from "../src/mastra/tools/grants.ts";

const YEAR = new Date().getFullYear();

const rows = readdirSync("data")
  .filter((f) => f.endsWith(".csv"))
  .flatMap((f) => readCsv(`data/${f}`))
  .filter((r) => r.openalex_id);

const have = await features.countDocuments({ openalexId: { $in: rows.map((r) => r.openalex_id) } });
if (have === rows.length && !process.argv.includes("--refresh")) {
  console.log(`features table already has all ${have} labeled professors. Run with --refresh to pull again.`);
  process.exit(0);
}

let n = 0;
for (const r of rows) {
  const works = await fetchWorks(r.openalex_id);
  const firstYear = await fetchFirstYear(r.openalex_id);
  const grants = await fetchGrants(r.name, r.affiliation).catch(() => []);
  const doc = {
    openalexId: r.openalex_id,
    name: r.name,
    features: computeFeatures(works, r.openalex_id, YEAR, firstYear, grantFeatures(grants)),
    grants: grants.filter((g) => g.amount >= 50000).slice(0, 5),
    alphabetical: isAlphabetical(works),
    status: (r.status || null) as FeatureRow["status"],
    works: works.length,
    pulledAt: new Date().toISOString(),
  };
  await features.updateOne({ openalexId: r.openalex_id }, { $set: doc }, { upsert: true });
  console.log(`${String(++n).padStart(2)}/${rows.length} ${r.name.padEnd(28)} works=${String(works.length).padStart(3)} ${doc.alphabetical ? "ALPHABETICAL " : ""}${JSON.stringify(doc.features)}`);
  await new Promise((res) => setTimeout(res, 120));
}
process.exit(0);
