import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET ??= "test-secret";
const { hashPassword, verifyPassword } = await import("./auth.ts");

test("password hash verifies and rejects", () => {
  const h = hashPassword("correct horse battery");
  assert.equal(verifyPassword("correct horse battery", h), true);
  assert.equal(verifyPassword("correct horse batteries", h), false);
  assert.notEqual(hashPassword("x"), hashPassword("x"), "salted");
});
