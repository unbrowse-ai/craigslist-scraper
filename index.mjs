#!/usr/bin/env node
// Craigslist Scraper: search results for any Craigslist city and category as structured JSON.
// Searches go through the public Unbrowse tool for Craigslist's own search API, sent from this machine;
// without a key, or when the tool is unavailable, that API is called directly.
import { fileURLToPath } from "node:url";
import { cli, readPage } from "./lib/read-page.mjs";
import { API, FIRST_PAGE, decodeSearch, localFilter, parseSearchUrl, resolveSite, toItem, toolInput } from "./parse.mjs";

const CAPABILITY = "public.sapi_craigslist_org.get_search_full";
const HOSTS = ["sapi.craigslist.org"];
// The request the tool stands for: Craigslist's own search API, called directly when the tool cannot run.
const JSON_HEADERS = { accept: "application/json", origin: "https://www.craigslist.org", referer: "https://www.craigslist.org/" };
const directUrl = ({ batch, searchPath, query }) => `${API}/full?${new URLSearchParams({ batch, cc: "US", lang: "en", searchPath, ...(query ? { query } : {}) })}`;

/** One search → { posts, total } straight from Craigslist's search API (first 360 results, newest first by default). */
async function search({ site, searchPath, query, sort }) {
  const input = toolInput({ areaId: site.areaId, searchPath, query, sort });
  const page = await readPage(CAPABILITY, input, { hosts: HOSTS, minBytes: 50, direct: { url: directUrl(input), headers: JSON_HEADERS } });
  let data;
  try {
    data = JSON.parse(page.body)?.data;
  } catch {
    data = null;
  }
  const posts = decodeSearch(data);
  if (!posts) throw new Error(`Craigslist did not return search results for ${site.hostname}/${searchPath}`);
  return { posts, data, total: data.totalResultCount ?? posts.length };
}

/**
 * Search one Craigslist site. `where` is a city ("austin", "SF bay area", "sfbay/sfc") or a craigslist.org search URL.
 * Options: category (default "sss" = all for sale), query, sort (date|priceasc|pricedsc|rel|dist), max (≤360),
 * minPrice, maxPrice, hasImage, postedToday (applied to the results).
 */
export async function scrape(where, { category = "sss", query = "", sort = "date", max = 100, log = () => {}, ...filters } = {}) {
  let src;
  if (/^https?:\/\//.test(where)) {
    const p = parseSearchUrl(where);
    src = { site: p.site, searchPath: p.searchPath, query: p.params.query ?? query, sort: p.params.sort ?? sort };
    filters = { minPrice: p.params.min_price, maxPrice: p.params.max_price, hasImage: p.params.hasPic === "1", postedToday: p.params.postedToday === "1", ...filters };
  } else {
    const site = resolveSite(where);
    if (!site) throw new Error(`"${where}" is not a Craigslist site. Use its subdomain (austin, sfbay, newyork) or name.`);
    const cat = String(category || "sss").trim().toLowerCase();
    src = { site, searchPath: site.subarea ? `${site.subarea}/${cat}` : cat, query, sort };
  }
  const { posts, data, total } = await search(src);
  const keep = localFilter(filters);
  const now = new Date().toISOString();
  const label = `${src.site.hostname}/${src.searchPath}${src.query ? ` "${src.query}"` : ""}`;
  const items = posts
    .map((p) => toItem(p, data))
    .filter(keep)
    .slice(0, Math.max(1, Math.min(Number(max) || 100, FIRST_PAGE)))
    .map((it) => ({ ...it, searchQuery: src.query || null, search: label, totalResults: total, scrapedAt: now }));
  log(`${label}: ${total} results on Craigslist, ${items.length} kept`);
  return items;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli(
    async (pos, f) => {
      const out = [];
      for (const q of pos) {
        out.push(
          ...(await scrape(q, {
            category: f.category,
            query: f.query,
            sort: f.sort,
            max: f.max,
            minPrice: f["min-price"],
            maxPrice: f["max-price"],
            hasImage: !!f["has-image"],
            postedToday: !!f.today,
            log: (m) => process.stderr.write(`${m}\n`),
          })),
        );
      }
      return out;
    },
    `
Usage: node index.mjs <city | craigslist search URL>... [options]

  austin   "SF bay area"   sfbay/sfc   https://seattle.craigslist.org/search/bia?query=trek
  --category CODE    apa (apartments), cta (cars+trucks), jjj (jobs), bia (bikes), sss (all for sale, default)
  --query TEXT       keyword
  --sort ORDER       date (default), priceasc, pricedsc, rel, dist
  --max N            posts per search (default 100, up to 360)
  --min-price N --max-price N --has-image --today

Uses UNBROWSE_API_KEY when set (free at https://unbrowse.ai); without it, requests go straight to the site.`,
  );
}
