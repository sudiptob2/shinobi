# Shinobi

Is this professor taking PhD students?
Live at https://askshinobi.tech

Type a professor's name and university, or paste a faculty page URL.
Shinobi finds the page, reads it, quotes any recruiting statement the professor made, looks up their NSF awards, pulls their publication record from OpenAlex, and scores how likely the lab is to be taking students.
The verdict shows both signals side by side, because a page that says "taking students" is not always current.

## How a verdict is produced

The check is a six-step Mastra workflow, and every step shows in the UI.

1. **parse**: the reader model splits what was typed into a person and an institution.
2. **locate**: SerpApi finds the faculty or lab page.
3. **read**: the page and its lab, news and prospective-student subpages are read by the reader model, which returns any recruiting status with the sentence that states it.
   A statement for a past cycle, or dated more than a year ago, is reported as out of date and ignored.
4. **grants**: the NSF awards API is queried for the professor's name at that institution.
5. **infer**: OpenAlex works become ten features (new first authors per year, junior cohort, outflow, publication rate and trend, career length, dormancy, active grants, months since the last grant).
   TabPFN, fit on the hand-labeled shortlist, returns the probability that a lab with this record is taking students, and a deterministic explanation compares each feature with the labeled medians.
6. **save**: the verdict goes into the user's history.

Every professor gets both signals.
The combined label is one of: Taking students, Says taking but slower intake, Says taking but rarely does, Says taking but unverified, Not taking, Likely taking, Toss-up, Unlikely, Not scored.
Professors whose fields list authors alphabetically, who cannot be matched on OpenAlex, or who have under five papers get a reason instead of a score.

## Built with

Mastra (workflow and agent), Gemma (page reading, through any OpenAI-compatible host), TabPFN by Prior Labs (scoring), OpenAlex (publications), the NSF awards API (grants), SerpApi (search), MongoDB Atlas (accounts, checks, workflow state), Sentry (traces), Render (hosting).

## Run it locally

You need Docker and the keys below.

```
git clone https://github.com/sudiptob2/shinobi && cd shinobi
cp .env.example .env            # fill in the keys
docker compose up --build       # Mongo, then the app on http://localhost:4111
```

The first start also fills the labeled table that TabPFN learns from, by pulling OpenAlex and NSF data for the 76 labeled professors.
That takes a couple of minutes and shows in the `seed` service's log; later starts skip it.
To pull the table again, for example after editing the CSVs, run `docker compose run --rm seed npm run features -- --refresh`.

Create an account in the app and check a professor.

### Keys

| Variable | Needed for | Where |
|---|---|---|
| `SERPAPI_API_KEY` | finding the page | https://serpapi.com, free tier is enough |
| `PRIORLABS_API_KEY` | TabPFN scoring | https://priorlabs.ai |
| `GEMMA_BASE_URL`, `GEMMA_API_KEY`, `GEMMA_MODEL` | reading the page | any OpenAI-compatible server hosting Gemma, or Google AI Studio when the base URL is empty |
| `SESSION_SECRET` | signing the login cookie | `openssl rand -hex 32` |
| `OPENALEX_API_KEY` | optional, lifts the unkeyed OpenAlex rate limit | https://openalex.org |
| `SENTRY_DSN` | optional, traces every run | https://sentry.io |

### Hot reload

For day-to-day work, run Mongo in Docker and the app on your machine.

```
docker compose up mongo seed    # Mongo, with the labeled table filled
npm install && npm install --prefix web
npm run dev                     # the Mastra server on http://localhost:4111
npm run build --prefix web      # rebuild the web app after changing it; the server serves web/dist
```

`npm run dev --prefix web` gives you a Vite dev server with hot reload on port 5173 that proxies `/app` to the Mastra server.

### Checks

```
npm test                        # unit tests for the reader, features, grants, verdict labels
npm run typecheck
npm run lint --prefix web
npm run batch                   # runs the workflow over the labeled shortlist and reports agreement with the hand labels
```

## Deploying

CI runs on every push and pull request: typecheck, tests, lint, the web build and a Docker build.
On `main`, after those pass, the workflow calls Render's deploy hook, and Render builds the same Dockerfile.

To set it up once:

1. In Render, create a Blueprint from this repo. `render.yaml` declares the service and the secrets to enter.
2. Allow Render's outbound IPs in the MongoDB Atlas network access list.
3. Copy the service's deploy hook URL into the repository secret `RENDER_DEPLOY_HOOK`.

The image also runs anywhere else that takes a Dockerfile.
It listens on `PORT`, default 4111, and needs the same variables as `.env.example`.

## Layout

```
src/mastra/
  workflow.ts           the six steps
  verdict.ts            the one output type
  index.ts              the server: Mastra config, auth routes, the check as a server-sent event stream, the web app
  auth.ts               email and password accounts, signed cookie sessions
  db.ts                 Mongo collections: users, checks, features, models
  tools/                serpapi, page, gemma, grants, openalex, tabpfn, explain, text
web/                    the React app (Vite)
scripts/features.ts     OpenAlex and NSF features for the labeled table into Mongo
scripts/batch.ts        runs the workflow over the shortlist and scores it against the hand labels
data/                   the hand-labeled shortlist and the not-recruiting negatives
```

## The shortlist

Fifty-nine ML professors at US and Canadian universities, picked from last authors of NeurIPS 2024 and 2025 papers in OpenAlex, at most three per school, weighted toward early career, plus seventeen professors who state they are not taking students.
Each one's faculty and lab pages were read by hand on 2026-10-13 and the recruiting statement, if any, was copied verbatim with its URL.
A statement dated before 2025 counts as unstated.

| Status | Count |
|---|---|
| Recruiting | 30 |
| Not recruiting | 4 |
| Unstated | 25 |

## Limitations

Alphabetical author order carries no first-author signal, so those professors are not scored.
Publication lag means current intake is never directly observable; the claim is capacity, never an open slot.
OpenAlex author matching is imperfect for common names.
Only NSF grants are checked; NSERC and NIH are not, and the explanation says so for Canadian labs.
Search results vary between runs, so the same professor can resolve to a different page on a second check.
Nothing is ever emailed on your behalf.

## License

MIT.
