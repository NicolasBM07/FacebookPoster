/**
 * STEP 1 — Scrape the used inventory into Inventory/Current.json
 *
 *   node step1_scrape.js [--show] [--debug] [--scrape-limit N]
 *
 *   --show           watch the browser
 *   --debug          save each detail page's HTML + raw extraction to Inventory/debug/
 *   --scrape-limit   only scrape the first N vehicles (for testing selectors)
 */
const C = require("./lib/common");
const S = require("./lib/scrape");
const { PATHS, log, ok, warn, fail, section, sleep, fs, path } = C;

async function main() {
  section("STEP 1 — Scrape used inventory");
  const args = C.parseArgs();
  const debug = args.flags.has("debug");
  const limit = args.values["scrape-limit"] ? Number(args.values["scrape-limit"]) : null;

  const { browser, page } = await C.launchBrowser({ headless: !args.flags.has("show") });
  try {
    const { urls, reportedTotal } = await S.collectVehicleUrls(page, log);
    if (urls.length === 0) throw new Error("No vehicle links found on the inventory page. Re-run with --show --debug.");
    if (reportedTotal && urls.length < reportedTotal) warn(`Found ${urls.length} of ${reportedTotal} vehicles the site reports`);

    const todo = limit ? urls.slice(0, limit) : urls;
    if (limit) warn(`--scrape-limit ${limit}: partial scrape (step 5 will not prune previous.json)`);
    if (debug) fs.ensureDirSync(PATHS.debug);

    const vehicles = [];
    const seen = new Set();
    for (let i = 0; i < todo.length; i++) {
      const url = todo[i];
      let v = null;
      for (let attempt = 1; attempt <= 3 && !v; attempt++) {
        try {
          await S.loadDetailPage(page, url);
          const raw = await S.extractDetail(page);
          if (debug) {
            const base = path.join(PATHS.debug, `${i + 1}`);
            fs.writeFileSync(`${base}.html`, await page.content());
            fs.writeFileSync(`${base}.json`, JSON.stringify(raw, null, 2));
          }
          v = S.normalizeVehicle(raw, url);
        } catch (e) {
          warn(`  attempt ${attempt} failed for ${url}: ${e.message.split("\n")[0]}`);
          await sleep(1500, 3000);
        }
      }
      if (!v) { fail(`Skipping ${url}`); continue; }

      const key = C.vehicleKey(v);
      if (!key) { warn(`No stock number or VIN found, skipping ${url}`); continue; }
      if (seen.has(key)) continue;
      seen.add(key);

      const missing = ["year", "make", "model", "kilometers", "price", "transmission", "exteriorColour", "fuelType"]
        .filter((f) => v[f] === "" || v[f] === null);
      if (v.images.length === 0) missing.push("images");
      log(`${i + 1}/${todo.length} ${v.year} ${v.make} ${v.model} [${key}] ` +
        `${v.images.length} img${missing.length ? C.chalk.yellow("  missing: " + missing.join(", ")) : ""}`);
      vehicles.push(v);
      await sleep(400, 900);
    }

    if (vehicles.length === 0) throw new Error("Scraped 0 vehicles; Current.json left untouched.");
    C.writeJson(PATHS.current, vehicles);
    if (limit) fs.writeFileSync(PATHS.partialFlag, "partial"); else fs.removeSync(PATHS.partialFlag);
    ok(`Saved ${vehicles.length} vehicles to Inventory/Current.json`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { fail(e.message); process.exit(1); });
