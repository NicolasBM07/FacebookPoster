/**
 * STEP 3 — Download photos for each vehicle in posting.json
 *
 *  - pictures/<STOCK or VIN>/1.jpg, 2.jpg, ... in website order (max CONFIG.MAX_PHOTOS)
 *  - the watermark strip is cropped off (see CROP in config.js)
 *  - vehicles that already have a finished picture folder are skipped
 *
 *   node step3_download_images.js [--show] [--redownload]
 */
const sharp = require("sharp");
const C = require("./lib/common");
const S = require("./lib/scrape");
const { CONFIG, PATHS, log, ok, warn, fail, section, sleep, fs, path } = C;

const DONE_MARKER = ".done";
const hasPhotos = (dir) =>
  fs.existsSync(path.join(dir, DONE_MARKER)) &&
  fs.readdirSync(dir).some((f) => /^\d+\.(jpe?g|png|webp)$/i.test(f));
const countPhotos = (dir) => fs.readdirSync(dir).filter((f) => /^\d+\.(jpe?g|png|webp)$/i.test(f)).length;

/** Cut the watermark strip: top X% and left/right Y% (proportional, so any photo size works) */
async function processImage(buffer) {
  const { enabled, topPct, sidePct } = CONFIG.CROP;
  const img = sharp(buffer);
  if (!enabled) return img.jpeg({ quality: 95 }).toBuffer();
  const { width, height } = await img.metadata();
  const top = Math.round(height * topPct);
  const side = Math.round(width * sidePct);
  return img
    .extract({ left: side, top, width: width - 2 * side, height: height - top })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function downloadOne(context, url, referer, dest) {
  const res = await context.request.get(url, { headers: { Referer: referer }, timeout: 45000 });
  if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
  fs.writeFileSync(dest, await processImage(await res.body()));
}

async function main() {
  section("STEP 3 — Download images");
  const args = C.parseArgs();
  const vehicles = C.readJson(PATHS.posting);
  if (vehicles.length === 0) { ok("posting.json is empty, nothing to download."); return; }
  fs.ensureDirSync(PATHS.pictures);

  const todo = vehicles.filter((v) => {
    const dir = path.join(PATHS.pictures, C.folderName(v));
    if (!args.flags.has("redownload") && fs.existsSync(dir) && hasPhotos(dir)) {
      log(`  ${C.vehicleKey(v)}: already have ${countPhotos(dir)} photo(s), skipping`);
      return false;
    }
    return true;
  });
  log(`${vehicles.length - todo.length} vehicle(s) already have pictures, ${todo.length} to download`);
  if (todo.length === 0) { ok("No downloads needed."); return; }

  const { browser, context, page } = await C.launchBrowser({ headless: !args.flags.has("show") });
  try {
    for (let i = 0; i < todo.length; i++) {
      const v = todo[i];
      const dir = path.join(PATHS.pictures, C.folderName(v));
      fs.emptyDirSync(dir);

      let urls = [];
      try {
        await S.loadDetailPage(page, v.url);
        urls = (await S.extractDetail(page)).images;
      } catch (e) { warn(`  page load failed: ${e.message.split("\n")[0]}`); }
      if (urls.length === 0) urls = v.images || [];
      // New website template: photo 1, then the last photo back to photo 2 -> restore website order
      // (done on the full list, before the photo limit is applied)
      if (CONFIG.FIX_GALLERY_ORDER && urls.length > 2) urls = [urls[0], ...urls.slice(1).reverse()];
      urls = urls.slice(0, CONFIG.MAX_PHOTOS);

      let n = 0;
      for (const u of urls) {
        try {
          await downloadOne(context, u, v.url, path.join(dir, `${n + 1}.jpg`));
          n++; // advance only on success so numbering has no gaps
        } catch (e) { warn(`  image failed (${u}): ${e.message}`); }
      }
      if (n > 0) fs.writeFileSync(path.join(dir, DONE_MARKER), String(n));
      (n ? log : warn)(`${i + 1}/${todo.length} ${C.vehicleKey(v)}: ${n} photo(s) -> pictures/${path.basename(dir)}/`);
      await sleep(400, 900);
    }
    ok("Image download finished.");
  } finally {
    await browser.close();
  }
}

main().catch((e) => { fail(e.message); process.exit(1); });