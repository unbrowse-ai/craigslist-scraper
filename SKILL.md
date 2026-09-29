---
name: craigslist-scraper
description: Search Craigslist in any city and category (apartments, cars, jobs, bikes, for sale) and get posts as JSON with title, price, location, coordinates, photos and posted date. Use when the user asks what is listed on Craigslist, wants listings compared or exported, or is hunting for a deal in a specific city.
---

# Craigslist scraper

## When to use
- "1-bed apartments in Austin under $1,200 on Craigslist", "used Hondas in New York", "Trek bikes in Seattle", "export this Craigslist search".
- Any of the 700+ Craigslist sites; search results only (no post bodies or contact details).

## Run
Uses `UNBROWSE_API_KEY` when set (free at https://unbrowse.ai); without it, requests go straight to the site. From the repo root:

```bash
node index.mjs austin --category apa --max-price 1200 > out.json
node index.mjs newyork --category cta --query honda --max 200 > out.json
node index.mjs "https://seattle.craigslist.org/search/bia?query=trek" > out.json
```

Options: `--category` (apa, cta, jjj, bia, sss...), `--query`, `--sort date|priceasc|pricedsc|rel|dist`, `--max N` (≤360), `--min-price`, `--max-price`, `--has-image`, `--today`.
Progress goes to stderr, the JSON array to stdout. Exit 1 on error, 2 on zero results.

## Output
Array of posts: `id, url, title, price, priceText, currency, category, categoryName, site, city, region, subarea, location, neighborhood, latitude, longitude, postedAt, imageUrl, images[], bedrooms, sqft, compensation, company, jobTitle, odometer, monthlyPayment, eventDates, openHouseDates, searchQuery, search, totalResults, scrapedAt`.

## Notes
- Price filters are applied after the search, so `totalResults` is Craigslist's count before them.
- Unknown city: use the craigslist subdomain (e.g. `sfbay`, `newyork`, `losangeles`).
