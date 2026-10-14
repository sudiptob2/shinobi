# Contributing to Shinobi

Thanks for looking.
Shinobi is small on purpose: one workflow, six steps, a React page in front of it.
Most useful contributions are small too: a better reader prompt, a page the locator misses, a labeled professor, a clearer sentence in a verdict.

## Setting up

You need Docker, Node 22 or newer, and the keys listed in the README.

```
git clone https://github.com/sudiptob2/shinobi && cd shinobi
cp .env.example .env            # fill in the keys
docker compose up mongo          # Mongo
npm install && npm install --prefix web
npm run dev                     # the Mastra server on http://localhost:4111
```

The server serves the built web app from `web/dist`.
After changing anything under `web/`, run `npm run build --prefix web` and reload, or run `npm run dev --prefix web` for a Vite dev server with hot reload on port 5173.

`docker compose up --build` runs the whole thing in containers instead, the way production runs it.

## Before you open a pull request

Run the same checks CI runs.

```
npm run typecheck
npm test
npm run lint --prefix web
npm run build --prefix web
```

If you touched the workflow or a tool, run one real check against the dev server and paste the verdict in the pull request.
If you touched the reader prompt or the page reader, run `npm run batch`, which checks every labeled professor and reports agreement with the hand labels, and include the before and after numbers.

## Commits

One change per commit, with a short subject in the imperative mood, at most 50 characters, no type prefix, and no body unless something needs explaining.
Sign your commits with `git commit --signoff`, which adds the Developer Certificate of Origin line.

```
add NSERC awards to the grants step
```

## Where things live

```
src/mastra/workflow.ts    the six steps: parse, locate, read, grants, infer, save
src/mastra/tools/         one file per external service, each with a small test next to it
src/mastra/verdict.ts     the one output type; the web app imports it
web/src/verdict.ts        how the two signals become one label; tested
web/src/views.tsx         the result card and the table
data/                     the hand-labeled shortlist and the not-recruiting negatives
```

The design rules that keep the code small:

- A step's output is its input plus what it added. No shared mutable state.
- Every external call lives in `tools/` and returns plain data. Nothing in `workflow.ts` talks to the network.
- The verdict is the only thing the web app knows about. If the UI needs a new field, add it to `verdict.ts` first.
- Explanations are deterministic sentences built from the features, not model output, so they can be tested.
- Tests cover logic with branches: feature computation, staleness, grant features, verdict labels. Do not add tests for glue.

## Adding a labeled professor

The labeled professors are the benchmark for both the reader and the record score, so a careful label is the most valuable contribution there is.

1. Read the professor's faculty page and lab page yourself.
2. Add a row to `data/shortlist.csv` or, for a professor who states they are not taking students, `data/negatives.csv`, following the existing columns.
   The status is `recruiting`, `not_recruiting` or `unstated`.
   Copy the statement verbatim with its URL, and record the date you read it.
   A statement for a past cycle, or dated more than a year ago, counts as `unstated`.
3. Find the professor's OpenAlex author id at https://openalex.org and fill `openalex_id`.
4. Mention the agreement from `npm run batch` (the reader) and `npm run judge` (the record score) in the pull request.

## Reporting a wrong verdict

Open an issue with the professor's name, the page URL, what Shinobi said, and what the page actually says.
Wrong verdicts are the best bug reports this project can get.

## License

By contributing you agree that your contributions are licensed under the Apache License 2.0, the same as the project.
