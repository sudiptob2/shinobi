import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Mastra } from "@mastra/core/mastra";
import { registerApiRoute } from "@mastra/core/server";
import { MongoDBStore } from "@mastra/mongodb";
import { Observability } from "@mastra/observability";
import { SentryExporter } from "@mastra/sentry";
import { check } from "./workflow.ts";
import { reader } from "./tools/gemma.ts";
import { checks } from "./db.ts";
import { currentUser, endSession, sessionUserId, signIn, signUp, startSession } from "./auth.ts";

// the server may run from its build directory, so walk up to the project root
function findRoot(dir = process.cwd()): string {
  for (let d = dir; ; d = join(d, "..")) {
    if (existsSync(join(d, "web/dist/index.html")) || existsSync(join(d, "web/package.json"))) return d;
    if (join(d, "..") === d) return dir;
  }
}
const WEB = join(findRoot(), "web/dist");
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

// ponytail: in-memory sliding-window limits, reset on restart; move to Atlas if abuse shows up.
const CHECKS_PER_HOUR = 20, CHECKS_PER_DAY_ALL = 80, SIGNINS_PER_HOUR = 10;
const usage = new Map<string, number[]>();
function allow(key: string, limit: number, windowMs = 36e5) {
  const now = Date.now(), recent = (usage.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return false;
  usage.set(key, [...recent, now]);
  return true;
}
const ip = (c: { req: { header: (n: string) => string | undefined } }) => c.req.header("x-forwarded-for")?.split(",")[0].trim() || "local";

const fail = (e: unknown) => ({ error: (e as Error).message });

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
      // accounts
      registerApiRoute("/app/signup", { method: "POST", handler: async (c) => {
        try { const { email, password } = await c.req.json(); startSession(c, await signUp(email, password)); return c.json({ ok: true }); }
        catch (e) { return c.json(fail(e), 400); }
      } }),
      registerApiRoute("/app/signin", { method: "POST", handler: async (c) => {
        if (!allow(`signin:${ip(c)}`, SIGNINS_PER_HOUR)) return c.json({ error: "Too many sign-in attempts. Try again in an hour" }, 429);
        try { const { email, password } = await c.req.json(); startSession(c, await signIn(email, password)); return c.json({ ok: true }); }
        catch (e) { return c.json(fail(e), 401); }
      } }),
      registerApiRoute("/app/signout", { method: "POST", handler: async (c) => { endSession(c); return c.json({ ok: true }); } }),
      registerApiRoute("/app/me", { method: "GET", handler: async (c) => c.json(await currentUser(c)) }),

      // history and checks need an account
      registerApiRoute("/app/history", { method: "GET", handler: async (c) => {
        const userId = sessionUserId(c);
        if (!userId) return c.json({ error: "Sign in to see your history" }, 401);
        return c.json(await checks.find({ userId }, { projection: { _id: 0, userId: 0 } }).sort({ createdAt: -1 }).limit(100).toArray());
      } }),

      // one check, streamed as server-sent events: step events, then the verdict
      registerApiRoute("/app/check", { method: "POST", handler: async (c) => {
        const userId = sessionUserId(c);
        if (!userId) return c.json({ error: "Sign in to check a professor" }, 401);
        const { query } = (await c.req.json()) as { query?: string };
        const q = query?.trim() ?? "";
        if (!q) return c.json({ error: "Type a professor's name or paste a faculty page URL" }, 400);
        if (!allow(userId, CHECKS_PER_HOUR)) return c.json({ error: `You have used ${CHECKS_PER_HOUR} checks this hour. Try again later` }, 429);
        // the search quota is shared by everyone, so one global cap protects it from throwaway accounts
        if (!allow("all", CHECKS_PER_DAY_ALL, 864e5)) return c.json({ error: "Shinobi has reached its daily limit of checks. Try again tomorrow" }, 429);
        const input = { ...(/^https?:\/\//i.test(q) ? { url: q } : { query: q }), userId };

        const run = await check.createRun();
        const stream = await run.stream({ inputData: input });
        const enc = new TextEncoder();
        const body = new ReadableStream({
          async start(ctrl) {
            const send = (ev: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
            let stepError = "";
            try {
              for await (const chunk of stream.fullStream as AsyncIterable<any>) {
                if (chunk.type === "workflow-step-start") send({ type: "start", step: chunk.payload.id });
                else if (chunk.type === "workflow-step-result") {
                  // a failed step stays "on" in the client until the finish event marks it failed
                  if (chunk.payload.status === "failed") stepError = chunk.payload.error?.message ?? String(chunk.payload.error ?? "");
                  else send({ type: "result", step: chunk.payload.id, output: chunk.payload.output });
                }
                else if (chunk.type === "workflow-finish") {
                  const verdict = chunk.payload.finalWorkflowResult;
                  if (chunk.payload.workflowStatus === "success" && verdict) send({ type: "verdict", verdict });
                  else send({ type: "error", message: stepError || chunk.payload.error?.message || "The check did not finish" });
                }
              }
            } catch (e) { send({ type: "error", message: (e as Error).message }); }
            ctrl.close();
          },
        });
        return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
      } }),

      // the built web app, with the SPA fallback
      registerApiRoute("/*", { method: "GET", handler: async (c) => {
        const path = normalize(new URL(c.req.url).pathname).replace(/^(\.\.[/\\])+/, "");
        const file = join(WEB, path);
        const target = existsSync(file) && extname(file) ? file : join(WEB, "index.html");
        if (!existsSync(target)) return c.text("Web app not built. Run: npm run build", 404);
        return c.body(readFileSync(target), 200, { "content-type": MIME[extname(target)] ?? "application/octet-stream" });
      } }),
    ],
  },
});
