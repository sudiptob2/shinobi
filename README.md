# Shinobi

[![CI](https://github.com/sudiptob2/shinobi/actions/workflows/ci.yml/badge.svg)](https://github.com/sudiptob2/shinobi/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node 22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](package.json)
[![Docker](https://img.shields.io/badge/docker-compose%20up-2496ED?logo=docker&logoColor=white)](compose.yaml)
[![Deploy to Render](https://img.shields.io/badge/deploy-Render-46E3B7?logo=render&logoColor=black)](https://render.com/deploy?repo=https://github.com/sudiptob2/shinobi)

Shinobi checks whether a professor is taking PhD students before you email them.
Give it a name and a university, or a faculty page URL, and about thirty seconds later you get the professor's own words if they said anything, a score from their publication record either way, and the reasons for both.

Live at https://askshinobi.tech

![Shinobi verdict card showing a quoted statement, the publication score and the six workflow steps](docs/screenshot.png)

## Why

Applying to a PhD means emailing professors, and most of those emails go unanswered.
A big part of the reason is upstream of the email: much of any shortlist is professors who are not taking students this cycle.
Their page does not say so, or it says "always looking for students" and was last touched years ago, or it says "recruiting" and means a seat that is already filled.

To see how common this is, I read the faculty and lab pages of 59 machine learning professors by hand.
Thirty said they were taking students, four said they were not, and twenty-five said nothing at all.
Several of the thirty had notes that were years old, and several more had a publication record that did not look like a group with open seats.

Shinobi does that day of reading in thirty seconds, and it does not stop at what the page says.

## What it does

For one professor, Shinobi finds the right page, reads it and the lab pages behind it, quotes any recruiting statement with its source, and discards statements that are out of date.
It then looks up the professor's NSF awards, pulls their publication record from OpenAlex, turns it into ten features about how many students the group takes and how many finish, and scores that record with TabPFN, fit on the hand-labeled professors.
Both signals go into one label, and when the data would mislead, it refuses to score and says why.

| Label | Meaning |
|---|---|
| Taking students | the page says yes and the record agrees |
| Says taking, slower intake | the page says yes; the record looks like a group that takes fewer students than it says |
| Says taking, rarely does | the page says yes; the record looks like a group that has not taken students in a while |
| Says taking, unverified | the page says yes; the record could not be scored |
| Not taking | the page says no |
| Likely taking, Toss-up, Unlikely | the page says nothing; the record alone, above 60%, 40 to 60%, or below 40% |
| Not scored | nothing stated and the record cannot be trusted; the reason is shown |

The second row is the case this project exists for.

## How it works

![Architecture: the web app talks to a Mastra server that runs a six-step workflow calling Gemma, SerpApi, the NSF API, OpenAlex and TabPFN, with MongoDB Atlas and Sentry alongside](docs/architecture.png)

The check is a [Mastra](https://mastra.ai) workflow with six steps.
Two of them run an agent, the reader, which is Gemma behind any OpenAI-compatible endpoint.
The other four are plain code.

**parse** (agent) splits the typed text into a person and an institution, expanding short forms like MIT or UWO and dropping titles.

**locate** searches through SerpApi, requires every token of the name in the result, prefers academic hosts, and never follows LinkedIn, ResearchGate or people-search sites.
If only a Google Scholar profile turns up, it takes the homepage listed there.

**read** (agent) fetches the page and up to five linked pages that look like they could carry a recruiting note, then asks the reader for one JSON object: the status, the decisive sentence verbatim, the page it came from and any date next to it.
The prompt is explicit about what does not count: headings, invitations to apply, conditionals, anything about postdocs or master's students, anything naming a past cycle.
Code then checks the date, and a statement for a past cycle or more than a year old is reported as stale and ignored.

**grants** queries the NSF awards API by investigator name, filtered to the institution, ignoring awards under $50,000.

**infer** builds the features from OpenAlex, calls TabPFN for the probability, and writes the explanation as deterministic sentences that compare each feature with the labeled groups, so the text can never contradict the number.
It refuses when the field lists authors alphabetically, when there are fewer than five papers, or when the name matches several authors or none at the given school.

**save** writes the verdict to the student's history.

The plan is fixed on purpose: a student gets the same kind of answer every time, every step is visible as it runs, and anything that can be tested is done without a model.
The model does the two jobs that need reading comprehension.

Around the workflow: a React front end that streams the steps over server-sent events, email and password accounts, rate limits that protect the shared search quota, MongoDB Atlas for users, checks and the labeled feature table, and a Sentry trace for every run.

Every part swaps by configuration.
The reader has run on Google AI Studio, a self-hosted Gemma and a proxy without a code change, the labeled data is two CSV files, and the features are plain numbers a person can check.

In the last batch run the reader agreed with the hand label for 50 of 59 professors; `npm run batch` reproduces that.

## Run it

You need Docker and the keys below.

```
git clone https://github.com/sudiptob2/shinobi && cd shinobi
cp .env.example .env            # fill in the keys
docker compose up --build       # Mongo, then the app on http://localhost:4111
```

The first start also fills the labeled table that TabPFN learns from, which takes a couple of minutes.
Later starts skip it; `docker compose run --rm seed npm run features -- --refresh` pulls it again.

| Variable | For | Where |
|---|---|---|
| `SERPAPI_API_KEY` | finding the page | https://serpapi.com, free tier is enough |
| `PRIORLABS_API_KEY` | TabPFN | https://priorlabs.ai |
| `GEMMA_BASE_URL`, `GEMMA_API_KEY`, `GEMMA_MODEL` | the reader | any OpenAI-compatible host, or Google AI Studio when the base URL is empty |
| `SESSION_SECRET` | the login cookie | `openssl rand -hex 32` |
| `OPENALEX_API_KEY` | optional, higher OpenAlex rate limit | https://openalex.org |
| `SENTRY_DSN` | optional, traces | https://sentry.io |

For development, run Mongo in Docker and the app on your machine:

```
docker compose up mongo seed
npm install && npm install --prefix web
npm run dev                     # http://localhost:4111
npm run build --prefix web      # after changing the web app
```

Checks: `npm test`, `npm run typecheck`, `npm run lint --prefix web`, and `npm run batch` to score the reader against the hand labels.

## Deploying

CI runs the typecheck, tests, lint, web build and a Docker build on every push and pull request.
Render watches `main` with auto-deploy set to "after CI checks pass" and builds the same Dockerfile.
`render.yaml` declares the service; the only manual step is allowing Render's outbound IPs in Atlas.

## The data

Fifty-nine ML professors at US and Canadian universities, picked from last authors of NeurIPS 2024 and 2025 papers, at most three per school, plus seventeen who state they are not taking students.
Every page was read by hand on 2026-10-13 and each statement copied verbatim with its URL.
The two CSV files in `data/` are the whole dataset, and a careful new label is the most useful contribution this project can get.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Limitations

Alphabetical author order carries no first-author signal, so those professors are not scored.
Publication lag means current intake is never directly observable; the claim is capacity, not an open slot.
Only NSF grants are checked.
Search results vary between runs, so a second check can land on a different page.
The labels cover machine learning only.
Nothing is ever emailed on your behalf.

## License

Apache 2.0.
Built for the DEV.to Hacktoberfest Open-Source AI Challenge 2026.
