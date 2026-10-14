# Shinobi

[![CI](https://github.com/sudiptob2/shinobi/actions/workflows/ci.yml/badge.svg)](https://github.com/sudiptob2/shinobi/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-compose%20up-2496ED?logo=docker&logoColor=white)](compose.yaml)
[![Deploy to Render](https://img.shields.io/badge/deploy-Render-46E3B7?logo=render&logoColor=black)](https://render.com/deploy?repo=https://github.com/sudiptob2/shinobi)

Shinobi checks whether a professor is taking PhD students before you email them.
Give it a name and a university, and in about thirty seconds you get the professor's own words if they said anything, a score from their publication record either way, and the reasons for both.

Live at https://askshinobi.tech

![Shinobi verdict card](docs/screenshot.png)

## Why

Most emails to professors go unanswered, and a big reason is that much of any shortlist is professors who are not taking students this cycle.
Their page does not say so, or says it with a note from years ago.
I read the pages of 59 machine learning professors by hand: 30 said they were taking students, 4 said no, 25 said nothing.
Several of the 30 had stale notes or a publication record that did not look like a group with open seats.

## How it works

![Architecture](docs/architecture.png)

The check is a [Mastra](https://mastra.ai) workflow with six steps.
Two of them run an agent, the reader, which is Gemma behind any OpenAI-compatible endpoint.
The rest is plain code.

1. **parse** (agent): the typed text becomes a person and an institution.
2. **locate**: SerpApi finds the faculty or lab page, preferring academic hosts and skipping aggregators.
3. **read** (agent): the page and its lab pages are fetched, and the reader returns the recruiting status, the decisive sentence verbatim, its page and its date.
   A statement for a past cycle is reported as stale and ignored.
4. **grants**: active NSF awards and how recent the latest one is.
5. **infer**: ten features from the OpenAlex publication record, a probability from TabPFN fit on the labeled professors, and an explanation built from the features so it never contradicts the number.
   It refuses to score alphabetical-author fields, thin records and ambiguous names.
6. **save**: the verdict goes to the student's history.

The two signals, what the page says and what the record says, become one label: Taking students, Says taking but slower intake, Says taking but rarely does, Not taking, Likely, Toss-up, Unlikely, or Not scored with the reason.

Around the workflow: a React front end that shows each step live over server-sent events, accounts and rate limits, MongoDB Atlas for users, checks and the labeled features, and a Sentry trace per run.
One Docker image runs locally through Compose and in production on Render, deployed from `main` once CI passes.

In the last batch run the reader agreed with the hand labels for 50 of 59 professors.

## Run it

```
cp .env.example .env            # SerpApi, Prior Labs and Gemma keys
docker compose up --build       # http://localhost:4111
```

The first start fills the labeled table TabPFN learns from, which takes a couple of minutes.
For development, `docker compose up mongo seed` then `npm run dev`.
Checks: `npm test`, `npm run typecheck`, `npm run lint --prefix web`, and `npm run batch` to score the reader against the hand labels.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0.
Built for the DEV.to Hacktoberfest Open-Source AI Challenge 2026.
