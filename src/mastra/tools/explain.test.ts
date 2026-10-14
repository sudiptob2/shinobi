import { test } from "node:test";
import assert from "node:assert/strict";
import { explain } from "./explain.ts";

const base = { last_author_rate: 0.6, students_active: 6, students_new_2y: 3, students_left: 1, group_size_2y: 12, pub_rate: 10, career_years: 10, years_since_last: 0, active_grants: 1, industry_share: 0 };

test("dormancy leads, the page-versus-score line closes", () => {
  const healthy = explain(base, 0.85);
  assert.match(healthy[0], /Last author on 60%/);
  assert.match(healthy[1], /6 students .* 3 new/);
  assert.match(healthy.at(-1)!, /85% from the record alone/);
  const dormant = explain({ ...base, years_since_last: 3 }, 0.1, "recruiting");
  assert.match(dormant[0], /3 years/);
  assert.match(dormant.at(-1)!, /page says yes, but .*10%/);
  const away = explain({ ...base, industry_share: 0.5 }, 0.2, "not_recruiting");
  assert.match(away.join(" "), /50% of recent papers list a company/);
  assert.match(away.at(-1)!, /page says no/);
});
