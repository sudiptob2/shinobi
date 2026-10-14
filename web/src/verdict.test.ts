import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictOf } from "./verdict.ts";
import type { Verdict } from "./api.ts";

const v = (stated?: "recruiting" | "not_recruiting", p?: number): Verdict => ({
  name: "A", tier: stated ? "stated" : p == null ? "not_scored" : "inferred", checkedAt: "2026-10-13T00:00:00Z",
  ...(stated && { stated: { status: stated, quote: "", sourceUrl: "https://x.edu" } }),
  ...(p != null && { inferred: { probability: p, features: {} } }),
});

test("one label from the page and the publications", () => {
  const cases: [Verdict, string][] = [
    [v("not_recruiting", 0.9), "Not taking"],
    [v("recruiting"), "Says taking, unverified"],
    [v("recruiting", 0.9), "Taking students"],
    [v("recruiting", 0.6), "Says taking, slower intake"],
    [v("recruiting", 0.2), "Says taking, rarely does"],
    [v(undefined, 0.9), "Likely taking"],
    [v(undefined, 0.6), "Toss-up"],
    [v(undefined, 0.2), "Unlikely"],
    [v(), "Not scored"],
  ];
  for (const [x, want] of cases) assert.equal(verdictOf(x).label, want);
});
