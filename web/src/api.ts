import type { Verdict } from "../../src/mastra/verdict";
export type { Verdict };

export type User = { email: string };
export type HistoryItem = { query: string; name: string; verdict: Verdict; createdAt: string };
export type StepEvent =
  | { type: "start"; step: string }
  | { type: "result"; step: string; output: any }
  | { type: "verdict"; verdict: Verdict }
  | { type: "error"; message: string };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  return body as T;
}

export const api = {
  me: () => json<User | null>("/app/me"),
  signIn: (email: string, password: string) => json("/app/signin", { method: "POST", body: JSON.stringify({ email, password }) }),
  signUp: (email: string, password: string) => json("/app/signup", { method: "POST", body: JSON.stringify({ email, password }) }),
  signOut: () => json("/app/signout", { method: "POST" }),
  history: () => json<HistoryItem[]>("/app/history"),

  /** Run one check, calling onEvent for every step and the verdict. */
  async check(query: string, onEvent: (e: StepEvent) => void) {
    const r = await fetch("/app/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
    const reader = r.body!.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i).replace(/^data: /, "");
        buf = buf.slice(i + 2);
        if (line) onEvent(JSON.parse(line));
      }
    }
  },
};
