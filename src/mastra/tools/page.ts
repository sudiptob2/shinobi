// Fetch a faculty page as text, plus the subpages most likely to carry a recruiting statement.
export type Page = { url: string; text: string };

const UA = "Mozilla/5.0 (compatible; Shinobi/0.1; +https://askshinobi.tech)";
const STRONG = /\b(prospective|join(ing)?( us| the lab)?|openings?|recruit(ing|ment)?|hiring|positions?)\b/i;
const FOLLOW = /\b(prospective|join(ing)?|students?|openings?|recruit(ing|ment)?|positions?|hiring|faq|apply|contact)\b/i;
const LAB = /\b(lab|laboratory|group)\b/i;
const MAX_CHARS = 6000;
const KEYWORDS = /ph\.?d|doctoral|graduate student|prospective|recruit|opening|position|hiring|join|advis|supervis|on leave|sabbatical|lab is full|not (taking|accepting|hiring|recruiting)/i;

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** Keep the passages around student-related keywords, so a long page still fits and the statement is not cut off. */
export function focus(text: string, max = MAX_CHARS): string {
  if (text.length <= max) return text;
  const paras = text.split("\n");
  const keep = new Set<number>();
  paras.forEach((p, i) => { if (KEYWORDS.test(p)) for (let j = i - 1; j <= i + 1; j++) keep.add(j); });
  let out = paras.slice(0, 3).join("\n") + "\n[...]\n";
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i < 3 || !paras[i]) continue;
    if (out.length + paras[i].length > max) break;
    out += paras[i] + "\n";
  }
  return out;
}

export function title(html: string): string {
  return htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").split(/[|–-]/)[0].trim();
}

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.text();
}

/** Links on the page worth reading for a recruiting statement, best first. */
export function candidateLinks(html: string, base: string): string[] {
  const host = new URL(base).host;
  const out = new Map<string, number>();
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = htmlToText(m[2]);
    let href: string;
    try { href = new URL(m[1], base).href; } catch { continue; }
    if (!/^https?:/.test(href) || /\.(pdf|jpg|png|zip|bib)$/i.test(href)) continue;
    const offsite = new URL(href).host !== host;
    // off-site links are followed only when they look like the professor's own lab or a recruiting page
    if (offsite && !LAB.test(text) && !STRONG.test(text)) continue;
    const score = (STRONG.test(text + " " + href) ? 3 : 0) + (FOLLOW.test(text) ? 2 : 0) + (FOLLOW.test(href) ? 1 : 0) + (offsite && LAB.test(text) ? 2 : 0);
    if (score) out.set(href, Math.max(out.get(href) ?? 0, score));
  }
  return [...out].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}

// ponytail: no Wayback fallback for dead pages; add if live checks hit many 404s.
export async function readSite(url: string, surname?: string, maxPages = 6): Promise<{ name: string; pages: Page[] }> {
  const html = await fetchHtml(url);
  const name = title(html);
  const who = (surname ?? name.split(/\s+/).pop() ?? "").toLowerCase();
  const pages: Page[] = [{ url, text: focus(htmlToText(html)) }];
  const queue = candidateLinks(html, url).map((l) => ({ link: l, depth: 1 }));
  while (queue.length && pages.length < maxPages) {
    const { link, depth } = queue.shift()!;
    if (pages.some((p) => p.url === link)) continue;
    try {
      const h = await fetchHtml(link);
      const text = htmlToText(h);
      // a linked page on another host that never mentions the professor is someone else's page;
      // a page reached from inside the professor's own lab site is trusted
      if (depth === 1 && new URL(link).host !== new URL(url).host && who && !text.toLowerCase().includes(who)) continue;
      pages.push({ url: link, text: focus(text) });
      // a lab site on another host gets one more hop, for its join or contact page
      if (depth === 1 && new URL(link).host !== new URL(url).host)
        queue.unshift(...candidateLinks(h, link).filter((l) => /prospective|join|opening|recruit|hiring|contact|apply/i.test(l)).slice(0, 2).map((l) => ({ link: l, depth: 2 })));
    } catch { /* skip dead links */ }
  }
  return { name, pages };
}
