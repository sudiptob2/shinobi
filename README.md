# Shinobi

Taking students?
Live at https://askshinobi.tech
Ranks a shortlist of professors by how likely they are to accept new PhD students, with the evidence behind each verdict, and checks one more professor by name or URL.

## How a verdict is produced

1. Stated.
   If the professor's page says it, the verdict is their words, quoted verbatim with a link.
2. Inferred.
   If nothing is stated, TabPFN predicts from seven OpenAlex publication features, using the hand-labeled shortlist as context.
3. Not scored.
   Fields with alphabetical author order, unmatched OpenAlex authors, and pages that cannot be found get a reason instead of a guess.

## Layout

```
data/shortlist.csv      hand-labeled table, the dataset: the only data in git
src/mastra/
  verdict.ts            the one output type
  db.ts                 Atlas client, collections: professors, features
  index.ts              Mastra config with the MongoDB store
  tools/                serpapi, page, gemma, openalex, tabpfn
  workflow.ts           the check
scripts/features.ts     OpenAlex features for the shortlist into Atlas
scripts/batch.ts        runs the workflow over the shortlist into Atlas
public/index.html       ranked list and check-one box
```

## The shortlist

Fifty-nine ML professors at US and Canadian universities, picked from last authors of NeurIPS 2024 and 2025 papers in OpenAlex, at most three per school, weighted toward early career.
Each one's faculty and lab pages were read by hand on 2026-10-13 and the recruiting statement, if any, was copied verbatim with its URL.
A statement dated before 2025 counts as unstated.

| Status | Count |
|---|---|
| Recruiting | 30 |
| Not recruiting | 4 |
| Unstated | 25 |

## Run

```
cp .env.example .env   # fill in keys
npm install
npm run dev
```

To deploy, build with `npm install && npm run build` and start with `npm start` on Node 22 or newer.
Set every key from `.env.example` plus `NODE_ENV=production`, which marks the session cookie secure.

## Limitations

Alphabetical author order carries no first-author signal, so those professors are not scored.
Publication lag means current intake is never directly observable; the claim is capacity, never an open slot.
OpenAlex author matching is imperfect for common names.
Nothing is ever emailed on your behalf.
