import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFeatures, isAlphabetical, type Work } from "./openalex.ts";

const me = "A1";
const HOME = "I1", AWAY = "I2", CO = "C1";
// authors are "name@institution" with an optional "!" suffix for a company affiliation; the professor is "A1"
const w = (year: number, ...spec: string[]): Work => ({
  publication_year: year,
  authorships: spec.map((s, i) => {
    const [n, inst] = s.split("@");
    return {
      author: { id: `https://openalex.org/${n}`, display_name: n },
      author_position: i === 0 ? "first" : i === spec.length - 1 ? "last" : "middle",
      institutions: inst ? [{ id: inst.replace("!", ""), type: inst.endsWith("!") ? "company" : "education" }] : [],
    };
  }),
});

test("features: advisor position, same-institution students, turnover, industry", () => {
  const works = [
    w(2018, `${me}@${HOME}`),                                   // first paper, alone
    w(2022, `S1@${HOME}`, `${me}@${HOME}`),                     // S1 leads, same institution: a student
    w(2024, `S2@${HOME}`, `${me}@${HOME}`),                     // S2 student
    w(2025, `X1@${AWAY}`, `${me}@${HOME}`),                     // X1 leads but from elsewhere: a collaborator, not a student
    w(2025, `S3@${HOME}`, `${me}@${HOME}`),                     // S3 student, new
    w(2026, `S3@${HOME}`, `S4@${HOME}`, `${me}@${HOME}`),       // S3 again; S4 never led, so not a student but in the group
    w(2026, `${me}@${HOME}`, `Y@${AWAY}`),                      // professor first author, not the advisor position
  ];
  const f = computeFeatures(works, me, 2026, null, { active_grants: 1 });
  assert.equal(f.career_years, 8);
  assert.equal(f.years_since_last, 0);
  assert.equal(f.last_author_rate, 4 / 5);        // 2024..2026: five papers, last author on four
  assert.equal(f.students_active, 1);             // S3 published in 2025..2026; S1 last 2022, S2 last 2024
  assert.equal(f.students_new_2y, 1);             // S3 started 2025
  assert.equal(f.students_left, 1);               // S2's last paper was 2024, two years ago; S1's was four years ago
  assert.equal(f.group_size_2y, 2);               // S3, S4 at home in 2025..2026; X1 and Y are elsewhere
  assert.equal(f.pub_rate, 5 / 3);
  assert.equal(f.active_grants, 1);
  assert.equal(f.industry_share, 0);
});

test("features: a professor publishing from a company", () => {
  const works = [w(2020, `S@${HOME}`, `${me}@${HOME}`), w(2025, `S@${HOME}`, `${me}@${CO}!`), w(2026, `T@${CO}!`, `${me}@${CO}!`)];
  const f = computeFeatures(works, me, 2026);
  assert.equal(f.industry_share, 1);
  assert.equal(f.last_author_rate, 1);
});

test("alphabetical detection", () => {
  const abc = Array.from({ length: 6 }, (_, i) => w(2020 + i, "Adams", "Baker", "Clark"));
  const mixed = Array.from({ length: 6 }, (_, i) => w(2020 + i, "Clark", "Adams", "Baker"));
  assert.equal(isAlphabetical(abc), true);
  assert.equal(isAlphabetical(mixed), false);
  assert.equal(isAlphabetical(abc.slice(0, 3)), false); // too few papers to call it
});
