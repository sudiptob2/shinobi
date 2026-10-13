import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET ??= "test";
const { applyStaleness } = await import("./gemma.ts");

const r = (quote: string, date = "") => ({ status: "recruiting" as const, quote, page: 1, confidence: 1, date });
test("stale notes become unstated with a note", () => {
  assert.equal(applyStaleness(r("WING lab is currently recruiting", "Jan 1, 2021"), 2026).status, "unstated");
  assert.match(applyStaleness(r("WING lab is currently recruiting", "Jan 1, 2021"), 2026).stale!, /dated Jan 1, 2021/);
  assert.equal(applyStaleness(r("I am looking for PhD students for Fall 2026 start"), 2026).status, "unstated");
  assert.equal(applyStaleness(r("[January 2024] I'm always looking for students"), 2026).status, "unstated");
});
test("current notes stay", () => {
  assert.equal(applyStaleness(r("I plan to admit 2 PhD students to start in Fall 2027", "September 10, 2026"), 2026).status, "recruiting");
  assert.equal(applyStaleness(r("(Fall 2026) I plan to admit 2 – 3 PhD students, to start in Fall 2027."), 2026).status, "recruiting");
  assert.equal(applyStaleness(r("I am always looking for motivated PhD students"), 2026).status, "recruiting");
  assert.equal(applyStaleness(r("Not taking students this year", "2025"), 2026).status, "recruiting");
});
