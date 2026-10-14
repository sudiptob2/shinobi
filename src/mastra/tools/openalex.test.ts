import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFeatures, isAlphabetical, type Work } from "./openalex.ts";

const me = "A1";
const w = (year: number, ...names: string[]): Work => ({
  publication_year: year,
  authorships: names.map((n) => ({ author: { id: `https://openalex.org/${n}`, display_name: n } })),
});

test("features: new first authors, cohort, outflow, trends", () => {
  const works = [
    w(2018, me),             // first paper, me alone
    w(2022, "S1", me),       // S1 new first author
    w(2024, "S2", me),       // S2 new
    w(2025, "S1", me),       // S1 again, not new
    w(2025, "S3", me),       // S3 new
    w(2026, "S3", "S4", me), // S3 again; S4 is not first author
  ];
  const f = computeFeatures(works, me, 2026);
  assert.equal(f.career_years, 8);
  assert.equal(f.years_since_last, 0);
  assert.equal(f.new_first_authors_rate, 2 / 3);            // S2 (2024) + S3 (2025) over 2024..2026
  assert.equal(f.new_first_authors_trend, 2 / 3 - 1 / 3);   // vs S1 (2022) over 2021..2023
  assert.equal(f.junior_cohort, 3);                          // S1, S2, S3 all active since 2024
  assert.equal(f.outflow, 2);                                // S1 last 2025, S2 last 2024
  assert.equal(f.pub_rate, 4 / 3);
  assert.equal(f.active_grants, 0);
});

test("alphabetical detection", () => {
  const abc = Array.from({ length: 6 }, (_, i) => w(2020 + i, "Adams", "Baker", "Clark"));
  const mixed = Array.from({ length: 6 }, (_, i) => w(2020 + i, "Clark", "Adams", "Baker"));
  assert.equal(isAlphabetical(abc), true);
  assert.equal(isAlphabetical(mixed), false);
  assert.equal(isAlphabetical(abc.slice(0, 3)), false); // too few papers to call it
});
