// Pull OpenAlex features for every labeled professor into the Atlas features collection.
import { readdirSync } from "node:fs";
import { readCsv } from "../src/mastra/csv.ts";
import { parse } from "node:path";
import { features } from "../src/mastra/db.ts";
import { computeFeatures, fetchFirstYear, fetchWorks, isAlphabetical } from "../src/mastra/tools/openalex.ts";
import { fetchGrants, grantFeatures } from "../src/mastra/tools/grants.ts";

const YEAR = new Date().getFullYear();

const rows = readdirSync("data")
  .filter((f) => f.endsWith(".csv"))
  .flatMap((f) => readCsv(`data/${f}`).map((r) => ({ ...r, source: parse(f).name })))
  .filter((r) => r.openalex_id);

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
    status: r.status || null,
    works: works.length,
    pulledAt: new Date().toISOString(),
  };
  await features.updateOne({ openalexId: r.openalex_id }, { $set: doc }, { upsert: true });
  console.log(`${String(++n).padStart(2)}/${rows.length} ${r.name.padEnd(28)} works=${String(works.length).padStart(3)} ${doc.alphabetical ? "ALPHABETICAL " : ""}${JSON.stringify(doc.features)}`);
  await new Promise((res) => setTimeout(res, 120));
}
process.exit(0);
