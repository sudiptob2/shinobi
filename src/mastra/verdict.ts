import { z } from "zod";
import { Grant } from "./tools/grants.ts";

// The one output of the whole system. Every tier produces exactly this.
export const Verdict = z.object({
  name: z.string(),
  affiliation: z.string().optional(),
  pageUrl: z.string().url().optional(),
  tier: z.enum(["stated", "inferred", "not_scored"]),
  // stated: what the professor wrote, verbatim, and where
  stated: z
    .object({
      status: z.enum(["recruiting", "not_recruiting"]),
      quote: z.string(),
      sourceUrl: z.string().url(),
    })
    .optional(),
  // inferred: Gemma's probability from the publication and grant features
  inferred: z
    .object({
      probability: z.number().min(0).max(1),
      features: z.record(z.string(), z.number()),
    })
    .optional(),
  explanation: z.array(z.string()).optional(), // why the record scored this way, one sentence per driver
  grants: z.array(Grant).optional(), // NSF awards of $50k or more, latest first
  // not_scored: the reason is the output
  reason: z.string().optional(),
  openalexId: z.string().optional(),
  note: z.string().optional(),
  checkedAt: z.string().datetime(),
});
export type Verdict = z.infer<typeof Verdict>;
