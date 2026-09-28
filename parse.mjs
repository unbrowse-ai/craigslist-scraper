// Craigslist parsing: pure functions, no I/O.
// Search goes through Craigslist's own JSON search API (the one its web app uses).
import { AREAS, CATEGORIES } from "./areas.mjs";

export const API = "https://sapi.craigslist.org/web/v8/postings/search";
export const FIRST_PAGE = 360; // full details for the first 360 results; the API accepts only 360 or 0 here
export const SORTS = { date: 1, dateoldest: 2, dist: 3, priceasc: 4, pricedsc: 5, rel: 6, upcoming: 7 };

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function site(hostname, subarea = null) {
  const a = AREAS[hostname];
  if (!a) return null;
  return { areaId: a[0], hostname, name: a[1], region: a[2] || null, country: a[3], subarea: subarea || null };
}

/**
 * A Craigslist site from what a user types: "austin", "austin.craigslist.org", "Austin", "SF bay area",
 * "sfbay/sfc" (with a subarea). Returns null when unknown.
 */
export function resolveSite(input) {
  let s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/\.craigslist\.[a-z.]+.*$/, "");
  let sub = null;
  const m = s.match(/^([a-z0-9-]+)\s*\/\s*([a-z]{3})$/);
  if (m) [, s, sub] = m;
  if (AREAS[s]) return site(s, sub);
  const n = norm(s.replace(/,.*$/, ""));
  const hosts = Object.keys(AREAS);
  const hit =
    hosts.find((h) => norm(AREAS[h][1]) === n) ??
    hosts.find((h) => norm(h) === n) ??
    hosts.find((h) => AREAS[h][3] === "US" && norm(AREAS[h][1]).startsWith(n)) ??
    hosts.find((h) => norm(AREAS[h][1]).startsWith(n));
  return hit ? site(hit, sub) : null;
}

/**
 * A Craigslist search page URL (any site) → { site, searchPath, params }. Accepts
 * https://austin.craigslist.org/search/apa?query=x, .../search/sfc/apa and www.craigslist.org/search/area/austin?cat=apa.
 */
export function parseSearchUrl(raw) {
  const u = new URL(String(raw).trim());
  if (!/(^|\.)craigslist\.[a-z.]+$/.test(u.hostname)) throw new Error("Use a Craigslist search URL (e.g. https://austin.craigslist.org/search/apa).");
  const params = {};
  for (const [k, v] of u.searchParams) if (v !== "" && k !== "cat" && k !== "lang" && k !== "cc") params[k] = v;
  // Hash-state searches (#search=1~list~0...) carry nothing we need beyond the path and query.
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] !== "search") throw new Error("Not a search results URL: expected /search/<category>.");
  const host = u.hostname.split(".")[0];
  let s;
  let path;
  if (host === "www") {
    if (parts[1] === "area" && AREAS[parts[2]]) s = site(parts[2]);
    else if (parts[1] === "subarea") {
      const h = Object.keys(AREAS).find((k) => AREAS[k][4].split(",").includes(parts[2]));
      if (h) s = site(h, parts[2]);
    }
    path = u.searchParams.get("cat") || "sss";
  } else {
    s = site(host);
    const rest = parts.slice(1);
    if (s && rest.length > 1) s.subarea = rest[0];
    path = rest[rest.length - 1] || "sss";
  }
  if (!s) throw new Error(`Unknown Craigslist site in ${u.hostname}${u.pathname}.`);
  return { site: s, searchPath: s.subarea ? `${s.subarea}/${path}` : path, params };
}

/**
 * Input for the public search tool: one call returns up to 360 posts with list details.
 * `batch` is Craigslist's own "<areaId>-<start>-<count>-<sort>-<bundleDups>" key; sort ∈ SORTS (default newest first).
 */
export function toolInput({ areaId, searchPath, query = "", sort = "date" }) {
  const sortId = SORTS[sort] ?? 0;
  return { batch: `${areaId}-0-${FIRST_PAGE}-${sortId}-0`, searchPath, query: String(query ?? "").trim() };
}

/** Filters the public tool does not take, applied to the decoded posts instead. */
export function localFilter({ minPrice, maxPrice, hasImage, postedToday, now = Date.now() } = {}) {
  const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
  const lo = num(minPrice);
  const hi = num(maxPrice);
  return (it) => {
    if (lo != null && !(it.price != null && it.price >= lo)) return false;
    if (hi != null && !(it.price != null && it.price <= hi)) return false;
    if (hasImage && !it.images?.length) return false;
    if (postedToday && !(Date.parse(it.postedAt) >= now - 864e5)) return false;
    return true;
  };
}

export const imageUrl = (id, size = "600x450") => `https://images.craigslist.org/${String(id).replace(/^\d+:/, "")}_${size}.jpg`;

const isoDay = (minDate, days) => new Date(minDate * 1000 + 864e5 * days).toISOString().slice(0, 10);

/** Apply one compressed tag ([code, ...values]) to an item, as the site's own app does. */
function applyTag(it, tag, minDate) {
  const [code, ...v] = tag;
  switch (code) {
    case 1: it.eventDates = [isoDay(minDate, v[0]), isoDay(minDate, v[1])]; break;
    case 2: it.openHouseDates = v.map((d) => isoDay(minDate, d)); break;
    case 3: it.eventDates = v.map((d) => isoDay(minDate, d)); break;
    case 4: it.imageIds = v; break;
    case 5: it.bedrooms = v[0] ?? null; it.sqft = v[1] || null; break;
    case 6: it.seo = v[0]; break;
    case 7: it.compensation = v[0]; break;
    case 8: it.company = v[0]; break;
    case 9: it.odometer = v[0]; break;
    case 10: it.priceText = v[0]; break;
    case 11: it.monthlyPayment = v[0]; break;
    case 12: it.jobTitle = v[0]; break;
    case 13: it.uuid = v[0]; break;
    default: break;
  }
}

/** Decode a search API response (`data`) into raw posts keyed in result order. Returns null when it is not one. */
export function decodeSearch(data) {
  if (!data || !Array.isArray(data.items) || !data.decode) return null;
  const d = data.decode;
  const locs = (d.locations ?? []).map((l) => (Array.isArray(l) ? { areaId: l[0], hostname: l[1], subarea: l[2] ?? null } : null));
  const base = d.version === 1 ? 5 : 6;
  return data.items.map((e) => {
    const [pidOff, dateOff, categoryId, price, loc] = e;
    const [where, lat, lng] = String(loc ?? "").split("~");
    const idx = where.split(":").map(Number);
    const it = {
      pid: d.minPostingId + pidOff,
      postedTs: d.minPostedDate + dateOff,
      categoryId,
      price: price === -1 ? null : price,
      location: locs[idx[0]] ?? null,
      locationDescription: d.locationDescriptions?.[idx[1]] || null,
      neighborhood: idx.length > 2 ? d.neighborhoods?.[idx[2]] || null : null,
      latitude: lat ? Number(lat) : null,
      longitude: lng ? Number(lng) : null,
    };
    for (const x of e.slice(base)) {
      if (typeof x === "string") it.title = x;
      else if (Array.isArray(x)) applyTag(it, x, d.minDate);
      else if (typeof x === "number" && x < 0) it.dedupeKey = x;
    }
    return it;
  });
}

/** Public post URL. */
export function postUrl(p, fallbackHost) {
  const host = p.location?.hostname ?? fallbackHost;
  const cat = CATEGORIES[p.categoryId]?.[0] ?? "sss";
  const sub = p.location?.subarea ? `${p.location.subarea}/` : "";
  return p.seo ? `https://${host}.craigslist.org/${sub}${cat}/d/${p.seo}/${p.pid}.html` : `https://${host}.craigslist.org/${sub}${cat}/${p.pid}.html`;
}

/** A decoded post → the dataset item (list fields). */
export function toItem(p, data) {
  const host = p.location?.hostname ?? data?.location?.url?.split(".")[0];
  const area = AREAS[host];
  const areaMeta = data?.areas?.[p.location?.areaId ?? area?.[0]];
  const cat = CATEGORIES[p.categoryId];
  const images = (p.imageIds ?? []).map((i) => imageUrl(i));
  return {
    id: String(p.pid),
    url: postUrl(p, host),
    title: p.title ?? null,
    price: p.price ?? null,
    priceText: p.priceText ?? (p.price != null ? `$${p.price.toLocaleString("en-US")}` : null),
    currency: areaMeta?.currency ?? (area?.[3] === "US" ? "USD" : null),
    category: cat?.[0] ?? null,
    categoryName: cat?.[1] ?? null,
    site: host ?? null,
    city: area?.[1] ?? null,
    region: area?.[2] || null,
    subarea: p.location?.subarea ?? null,
    location: p.locationDescription ?? null,
    neighborhood: p.neighborhood ?? null,
    latitude: p.latitude,
    longitude: p.longitude,
    postedAt: new Date(p.postedTs * 1000).toISOString(),
    imageUrl: images[0] ?? null,
    images,
    bedrooms: p.bedrooms ?? null,
    sqft: p.sqft ?? null,
    compensation: p.compensation ?? null,
    company: p.company ?? null,
    jobTitle: p.jobTitle ?? null,
    odometer: p.odometer ?? null,
    monthlyPayment: p.monthlyPayment ?? null,
    eventDates: p.eventDates ?? null,
    openHouseDates: p.openHouseDates ?? null,
  };
}
