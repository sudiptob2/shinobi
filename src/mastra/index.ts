import { readFileSync } from "node:fs";
import { Mastra } from "@mastra/core/mastra";
import { registerApiRoute } from "@mastra/core/server";
import { MongoDBStore } from "@mastra/mongodb";
import { Observability } from "@mastra/observability";
import { SentryExporter } from "@mastra/sentry";
import { check } from "./workflow.ts";
import { reader } from "./tools/gemma.ts";
import { professors } from "./db.ts";

export const mastra = new Mastra({
  workflows: { check },
  agents: { reader },
  storage: new MongoDBStore({
    id: "shinobi",
    uri: process.env.MONGODB_URI ?? "mongodb://localhost:27017",
    dbName: process.env.MONGODB_DB ?? "shinobi",
  }),
  observability: new Observability({
    configs: { sentry: { serviceName: "shinobi", exporters: [new SentryExporter({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 1 })] } },
  }),
  server: {
    apiRoutes: [
      registerApiRoute("/", { method: "GET", handler: async (c) => c.html(readFileSync("public/index.html", "utf8")) }),
      registerApiRoute("/api/professors", {
        method: "GET",
        handler: async (c) => c.json(await professors.find({}, { projection: { _id: 0 } }).sort({ "inferred.probability": -1 }).toArray()),
      }),
      registerApiRoute("/api/check", {
        method: "POST",
        handler: async (c) => {
          const { query } = (await c.req.json()) as { query?: string };
          if (!query?.trim()) return c.json({ error: "Give a professor's name or page URL" }, 400);
          const input = /^https?:\/\//i.test(query.trim()) ? { url: query.trim() } : { name: query.trim() };
          const run = await check.createRun();
          const result = await run.start({ inputData: input });
          if (result.status !== "success") return c.json({ error: (result as any).error?.message ?? result.status }, 500);
          return c.json(result.result);
        },
      }),
    ],
  },
});
