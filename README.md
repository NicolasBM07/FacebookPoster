# Abbotsford Hyundai → Facebook Marketplace poster

Setup (Mac):  `npm install` then `npx playwright install chromium`
Edit `config.js` → DESCRIPTION (step 4 refuses to run until you do).

Run everything:      `npm run all`
Or one step at a time: `npm run step1` … `npm run step5`

Useful flags (also work with `npm run all -- <flags>`):
- `--show`              watch the scraping browser (steps 1, 3)
- `--debug`             step 1 saves page HTML + raw extraction to Inventory/debug/
- `--scrape-limit 3`    step 1 scrapes only 3 vehicles (selector testing)
- `--post-limit 2`      step 4 posts only 2 vehicles

First run: try `npm run step1 -- --scrape-limit 3 --debug`, open Inventory/Current.json and check the fields and image counts before continuing.
