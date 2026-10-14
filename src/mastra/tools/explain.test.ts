import { test } from "node:test";
import assert from "node:assert/strict";
import { explain } from "./explain.ts";

const ref = { yes: { new_first_authors_rate: 4 }, no: { new_first_authors_rate: 2 } };
const base = { new_first_authors_rate: 6, new_first_authors_trend: 2, junior_cohort: 20, outflow: 10, pub_rate: 10, pub_rate_trend: 1, career_years: 10, years_since_last: 0, active_grants: 0, months_since_grant: 120 };

test("explanation names the drivers", () => {
  const lines = explain(base, 0.8, ref);
  assert.match(lines[0], /6 new first authors.*median of 4 and those not taking students 2.*looks healthy/);
  assert.match(lines[1], /rising/);
  assert.match(lines[2], /10 junior coauthors.*graduated/);
  assert.match(lines.at(-1)!, /80%.*taking students/);
});
test("dormant lab", () => {
  const lines = explain({ ...base, years_since_last: 3 }, 0.1, ref, "recruiting");
  assert.match(lines[0], /No new papers for 3 years/);
  assert.match(lines.at(-1)!, /page says yes, but only 10%/);
});
