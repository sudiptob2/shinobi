import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateLinks, splitTitle } from "./page.ts";

test("a department profile's homepage link outranks department pages", () => {
  const html = `<a href="/contact-us">Contact us</a> <a href="/people/grad">Graduate students</a> <a href="/~eysenbach">Homepage</a> <a href="https://scholar.google.com/x">Scholar</a>`;
  const links = candidateLinks(html, "https://www.cs.princeton.edu/people/profile/eysenbach");
  assert.equal(links[0], "https://www.cs.princeton.edu/~eysenbach");
  assert.ok(!links.some((l) => l.includes("scholar.google")), "an off-site link with neutral text is not followed");
});

test("titles split on spaced dashes only", () => {
  assert.deepEqual(splitTitle("Anne-Marie Smith | Western University - Computer Science"), ["Anne-Marie Smith", "Western University", "Computer Science"]);
});
