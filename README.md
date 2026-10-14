# Shinobi

[![CI](https://github.com/sudiptob2/shinobi/actions/workflows/ci.yml/badge.svg)](https://github.com/sudiptob2/shinobi/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-compose%20up-2496ED?logo=docker&logoColor=white)](compose.yaml)
[![Deploy to Render](https://img.shields.io/badge/deploy-Render-46E3B7?logo=render&logoColor=black)](https://render.com/deploy?repo=https://github.com/sudiptob2/shinobi)

**Shinobi tells you whether a professor is taking PhD students, before you email them.**
Type a name and a university.
About thirty seconds later you get the professor's own words if they said anything, a score based on their publication record either way, and the reasons behind both.

Live at https://askshinobi.tech

![Shinobi verdict card](docs/screenshot.png)

## Why

When I was applying for a PhD, I made a list of professors whose work I liked and emailed them one by one.
**Most of them never replied.**
At first I thought my emails were the problem.
Then I looked closer at the list and saw that many of those professors were simply **not taking new students that year**.
Some of their pages said nothing about it.
Some said "I am always looking for students", but the note was *three or four years old*.
There was *no way to know* before sending the email.

That made me think this is something **every prospective student runs into**.
We all spend weeks writing to people who were never going to say yes, and the professors who are actually recruiting get lost in the same pile.

To check how common it is, I read the faculty and lab pages of 59 machine learning professors by hand.
Thirty said they were taking students, four said they were not, and **twenty-five said nothing at all**.
Even among the thirty who said yes, several had old notes, and several more had a publication record that did not look like a group with room for new students.

## How it works

![Architecture](docs/architecture.png)

A check is a [Mastra](https://mastra.ai) workflow with six steps.
Two of the steps are run by an **agent**: a reader built on Gemma, served from any OpenAI-compatible endpoint.
The other four are ordinary code.

1. **parse** (agent): turns what you typed into a person and a university.
2. **locate**: searches with SerpApi for the faculty or lab page, preferring university sites and skipping aggregator sites.
3. **read** (agent): fetches the page and its lab pages, then the reader answers four questions: is there a recruiting statement, *what exactly does it say*, which page is it on, and when was it written.
   A statement about a past admissions cycle is marked as *stale* and ignored.
4. **grants**: counts the professor's active NSF awards and checks how recent the latest one is.
5. **infer**: turns the publication record from OpenAlex into ten numbers, asks TabPFN for a probability, and writes an explanation from those same numbers, so *the words can never disagree with the score*.
   It **refuses to guess** when the field lists authors alphabetically, when the record is too thin, or when the name is ambiguous.
6. **save**: stores the verdict in your history.

The two signals, **what the page says** and **what the record says**, are combined into one label: *Taking students*, *Says taking but slower intake*, *Says taking but rarely does*, *Not taking*, *Likely*, *Toss-up*, *Unlikely*, or *Not scored* with the reason.

Around the workflow there is a React front end that shows each step as it runs, accounts and rate limits, MongoDB Atlas for users, checks and the labeled data, and a Sentry trace for every run.
Everything ships as **one Docker image**: the same image runs locally with Compose and in production on Render, deployed from `main` once CI passes.

In the last batch run, the reader agreed with my hand labels for **50 of 59** professors.

## Run it

```
cp .env.example .env            # SerpApi, Prior Labs and Gemma keys
docker compose up --build       # http://localhost:4111
```

The first start fills the labeled table that TabPFN learns from, which takes a couple of minutes.
For development, run `docker compose up mongo seed` and then `npm run dev`.
To check your changes: `npm test`, `npm run typecheck`, `npm run lint --prefix web`, and `npm run batch` to score the reader against the hand labels.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0.
