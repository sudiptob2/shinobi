import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET ??= "test";
const { formalName } = await import("./workflow.ts");

test("formal name from the page title", () => {
  assert.equal(formalName("Pam Bishop", "Pamela Bishop"), "Pamela Bishop");
  assert.equal(formalName("Pam Bishop", "Dr. Pamela Bishop"), "Pamela Bishop");
  assert.equal(formalName("Pam Bishop", "Western University"), "Pam Bishop");
  assert.equal(formalName("Anwar Haque", "Anwar Haque"), "Anwar Haque");
  assert.equal(formalName("", "Hamed Hassani"), "Hamed Hassani");
});
