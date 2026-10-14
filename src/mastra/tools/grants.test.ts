import { test } from "node:test";
import assert from "node:assert/strict";
import { grantFeatures, grantLine } from "./grants.ts";

const today = new Date("2026-10-13");
const grants = [
  { title: "Big", start: "2026-03-01", end: "2029-02-28", amount: 480000, awardee: "Penn" },
  { title: "Travel", start: "2026-05-01", end: "2027-04-30", amount: 10000, awardee: "Penn" },
  { title: "Old", start: "2020-06-01", end: "2025-05-31", amount: 400000, awardee: "Penn" },
];
test("grant features ignore travel money and count active awards", () => {
  const f = grantFeatures(grants, today);
  assert.equal(f.active_grants, 1);
  assert.equal(f.months_since_grant, 7);
  assert.match(grantLine(grants, f, "University of Pennsylvania"), /1 active NSF award. The latest started March 2026 \(\$480k, runs to 2029\). Grants that recent/);
});
test("no grants", () => {
  const f = grantFeatures([], today);
  assert.deepEqual(f, { active_grants: 0, months_since_grant: 120 });
  assert.match(grantLine([], f, "University of Toronto"), /Canadian lab/);
  assert.match(grantLine([], f, "Stanford University"), /weak signal/);
});
