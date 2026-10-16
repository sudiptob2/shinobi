import { test } from "node:test";
import assert from "node:assert/strict";
import { sameName } from "./serpapi.ts";

test("a short first name matches the full one, but other people do not", () => {
  assert.equal(sameName("Ben Eysenbach", "Benjamin Eysenbach - Princeton"), true);
  assert.equal(sameName("Benjamin Eysenbach", "Ben Eysenbach"), false);
  assert.equal(sameName("Ben Eysenbach", "Eysenbach Lab"), false);
  assert.equal(sameName("Li Zhang", "Lin Zhang"), false);
});
