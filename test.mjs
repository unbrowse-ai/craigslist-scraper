import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decodeSearch, imageUrl, localFilter, parseSearchUrl, resolveSite, toItem, toolInput } from "./parse.mjs";

// Fixtures: real responses of Craigslist's search API (sapi.craigslist.org/web/v8/postings/search/full), 2026-09-28.
const api = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/search-${n}.json`, import.meta.url), "utf8")).data;

test("craigslist: housing posts with core fields", () => {
  const d = api("apa");
  const items = decodeSearch(d).map((p) => toItem(p, d));
  assert.equal(items.length, 25);
  for (const it of items) {
    assert.match(it.id, /^\d{10}$/);
    assert.ok(it.url.startsWith("https://sfbay.craigslist.org/") && it.url.endsWith(`/${it.id}.html`), it.url);
    assert.ok(it.title && it.postedAt && it.city === "SF bay area" && it.currency === "USD" && it.category === "apa", it.id);
    assert.ok(Number.isFinite(it.latitude) && Number.isFinite(it.longitude), it.id);
  }
  const first = items[0];
  assert.deepEqual([first.id, first.price, first.priceText, first.subarea, first.location, first.bedrooms, first.sqft], ["7971797574", 3489, "$3,489", "sby", "milpitas", 1, 702]);
  assert.equal(first.url, "https://sfbay.craigslist.org/sby/apa/d/milpitas-just-what-you-need-washer/7971797574.html");
  assert.equal(first.images.length, 23);
  assert.equal(first.imageUrl, "https://images.craigslist.org/00k0k_ewBlHI7BooQ_0jm0cU_600x450.jpg");
});

test("craigslist: jobs and cars carry their own list fields", () => {
  const j = api("jjj");
  const job = toItem(decodeSearch(j)[0], j);
  assert.deepEqual([job.category, job.price, job.compensation, job.company, job.jobTitle], ["fbh", null, "Competitive wages", "XTC CABARET", "MANAGERS"]);
  const c = api("cta");
  const car = toItem(decodeSearch(c)[0], c);
  assert.deepEqual([car.category, car.price, car.odometer, car.location, car.city], ["cto", 2200, 121000, "Coupland", "austin, TX"]);
  assert.equal(decodeSearch({ nope: 1 }), null);
});

test("craigslist: sites, URLs, tool input and local filters", () => {
  assert.equal(resolveSite("austin").areaId, 15);
  assert.equal(resolveSite("SF bay area").hostname, "sfbay");
  assert.deepEqual([resolveSite("sfbay/sfc").hostname, resolveSite("sfbay/sfc").subarea], ["sfbay", "sfc"]);
  assert.equal(resolveSite("new york").hostname, "newyork");
  assert.equal(resolveSite("nowhere-land"), null);
  assert.deepEqual(toolInput({ areaId: 15, searchPath: "sss", query: " bike ", sort: "priceasc" }), { batch: "15-0-360-4-0", searchPath: "sss", query: "bike" });
  assert.deepEqual(toolInput({ areaId: 3, searchPath: "cta" }), { batch: "3-0-360-1-0", searchPath: "cta", query: "" });
  const s = parseSearchUrl("https://sfbay.craigslist.org/search/sfc/apa?query=loft&min_price=1000#search=1~list~0");
  assert.deepEqual([s.site.areaId, s.searchPath, s.params.query, s.params.min_price], [1, "sfc/apa", "loft", "1000"]);
  assert.throws(() => parseSearchUrl("https://example.com/search/apa"));
  const now = Date.parse("2026-09-28T12:00:00Z");
  const items = [
    { price: 500, images: ["a"], postedAt: "2026-09-28T08:00:00Z" },
    { price: 1500, images: [], postedAt: "2026-09-20T08:00:00Z" },
    { price: null, images: ["b"], postedAt: "2026-09-28T09:00:00Z" },
  ];
  assert.equal(items.filter(localFilter({ minPrice: 1000 })).length, 1);
  assert.equal(items.filter(localFilter({ maxPrice: "600" })).length, 1);
  assert.equal(items.filter(localFilter({ hasImage: true, postedToday: true, now })).length, 2);
  assert.equal(items.filter(localFilter({})).length, 3);
  assert.equal(imageUrl("3:00k0k_ewBlHI7BooQ_0jm0cU"), "https://images.craigslist.org/00k0k_ewBlHI7BooQ_0jm0cU_600x450.jpg");
});
