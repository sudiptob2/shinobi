// Pull OpenAlex features for every labeled professor into the Atlas features collection.
import { readFileSync, readdirSync } from "node:fs";
import { parse } from "node:path";
import { features } from "../src/mastra/db.ts";
import { computeFeatures, fetchFirstYear, fetchWorks, isAlphabetical } from "../src/mastra/tools/openalex.ts";

const YEAR = new Date().getFullYear();

// minimal CSV reader: quoted fields with doubled quotes, one record per line
function readCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8");
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const rows = readdirSync("data")
  .filter((f) => f.endsWith(".csv"))
  .flatMap((f) => readCsv(`data/${f}`).map((r) => ({ ...r, source: parse(f).name })))
  .filter((r) => r.openalex_id);

let n = 0;
for (const r of rows) {
  const works = await fetchWorks(r.openalex_id);
  const firstYear = await fetchFirstYear(r.openalex_id);
  const doc = {
    openalexId: r.openalex_id,
    name: r.name,
    features: computeFeatures(works, r.openalex_id, YEAR, firstYear),
    alphabetical: isAlphabetical(works),
    works: works.length,
    pulledAt: new Date().toISOString(),
  };
  await features.updateOne({ openalexId: r.openalex_id }, { $set: doc }, { upsert: true });
  console.log(`${String(++n).padStart(2)}/${rows.length} ${r.name.padEnd(28)} works=${String(works.length).padStart(3)} ${doc.alphabetical ? "ALPHABETICAL " : ""}${JSON.stringify(doc.features)}`);
  await new Promise((res) => setTimeout(res, 120));
}
process.exit(0);
