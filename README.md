# Craigslist Scraper (Node.js): search results for any city and category as JSON

Scrape Craigslist search results into structured JSON: title, price, currency, category, city, subarea, neighbourhood, latitude and longitude, posted date, every photo URL, and the list fields Craigslist keeps per category: bedrooms and square feet for housing, odometer for cars, company, job title and compensation for jobs, event dates for events. Works for all 700+ Craigslist sites (US, Canada, Europe, Asia) and every category: apartments, cars and trucks, jobs, bikes, furniture, gigs, services.

The scraper uses the same JSON search API Craigslist's own web app calls, through a public [Unbrowse](https://unbrowse.ai) tool. The request is sent from your machine and decoded locally, so one call returns up to 360 posts with coordinates and photos, no HTML scraping and no pagination.

## Quick start

```bash
git clone https://github.com/unbrowse-ai/craigslist-scraper && cd craigslist-scraper && npm install
export UNBROWSE_API_KEY=ub_live_...        # free key: https://unbrowse.ai

node index.mjs austin --category apa --max 200 > austin-apartments.json
node index.mjs seattle --category bia --query trek --max-price 800 > bikes.json
node index.mjs "https://newyork.craigslist.org/search/cta?query=honda" > cars.json
node index.mjs sfbay/sfc --category apa --sort priceasc > sf-cheapest.json
```

| Option | Default | Meaning |
|---|---|---|
| `<city or URL>...` | | Subdomain (`austin`), site name (`"SF bay area"`), `site/subarea` (`sfbay/sfc`), or a craigslist.org search URL |
| `--category` | sss | `apa` apartments, `cta` cars and trucks, `jjj` jobs, `bia` bikes, `fua` furniture, `sss` all for sale... |
| `--query` | | Keyword |
| `--sort` | date | `date`, `priceasc`, `pricedsc`, `rel`, `dist` |
| `--max N` | 100 | Posts per search, up to 360 |
| `--min-price`, `--max-price`, `--has-image`, `--today` | | Applied to the results |

From code:

```js
import { scrape } from "./index.mjs";
const posts = await scrape("denver", { category: "cta", query: "tacoma", maxPrice: 20000, max: 200 });
```

## Output

```json
{
  "id": "7961080698",
  "url": "https://austin.craigslist.org/apa/d/austin-food-truck-park-picnic-area-with/7961080698.html",
  "title": "Food Truck Park, Picnic Area with BBQ Grills, 1/bd 1/ba",
  "price": 925, "priceText": "$925", "currency": "USD",
  "category": "apa", "categoryName": "apartments / housing for rent",
  "site": "austin", "city": "austin, TX", "region": "TX",
  "location": "9220 N Interstate Hwy 35, Austin, TX",
  "latitude": 30.3579, "longitude": -97.6898,
  "postedAt": "2026-09-28T06:02:00.000Z",
  "imageUrl": "https://images.craigslist.org/00a0a_651OXZWAstq_0q70hq_600x450.jpg",
  "images": ["..."],
  "bedrooms": 1, "sqft": 485,
  "search": "austin/apa", "totalResults": 6070
}
```

## Fields

| Field | Notes |
|---|---|
| `id`, `url`, `title` | Craigslist post id and page |
| `price`, `priceText`, `currency` | `price` is a number; null when the post has none |
| `category`, `categoryName` | Category code and name |
| `site`, `city`, `region`, `subarea`, `location`, `neighborhood` | Where the post is listed |
| `latitude`, `longitude` | Approximate, as Craigslist shows on its map |
| `postedAt` | ISO 8601 |
| `imageUrl`, `images[]` | 600x450 photo URLs |
| `bedrooms`, `sqft` | Housing |
| `odometer`, `monthlyPayment` | Cars |
| `company`, `jobTitle`, `compensation` | Jobs and gigs |
| `eventDates`, `openHouseDates` | Events, open houses |
| `searchQuery`, `search`, `totalResults`, `scrapedAt` | Context: `totalResults` is Craigslist's own match count |

## FAQ

**Why at most 360 posts?** That is what one call of Craigslist's search API returns with full details. Narrow the search (a subarea, a keyword, a price band) or sort differently to reach other posts.

**Why a key?** The search is sent through Unbrowse's public Craigslist tool, which tells your machine which request to make. The key is free; the request leaves from your IP.

**Post descriptions and contact details?** Not included: the scraper reads search results only, and it never collects phone numbers or emails.

---

Part of [open-scrapers](https://github.com/unbrowse-ai/open-scrapers): more scrapers and a catalog of 2,400+ websites callable as APIs or MCP servers.
