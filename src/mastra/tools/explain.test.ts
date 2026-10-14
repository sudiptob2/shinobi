import { test } from "node:test";
import assert from "node:assert/strict";
import { explain } from "./explain.ts";

const ref = { yes: { new_first_authors_rate: 4 }, no: { new_first_authors_rate: 2 } };
const base = { new_first_authors_rate: 6, new_first_authors_trend: 2, junior_cohort: 20, outflow: 10, pub_rate: 10, pub_rate_trend: 1, career_years: 10, years_since_last: 0, active_grants: 0, months_since_grant: 120 };

test("dormancy leads, the page-versus-score line closes", () => {
  const healthy = explain(base, 0.8, ref);
  assert.match(healthy[0], /6 new first authors/);
  assert.match(healthy.at(-1)!, /80%/);
  const dormant = explain({ ...base, years_since_last: 3 }, 0.1, ref, "recruiting");
  assert.match(dormant[0], /3 years/);
  assert.match(dormant.at(-1)!, /page says yes.*10%/);
});
