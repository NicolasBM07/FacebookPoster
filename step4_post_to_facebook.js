/**
 * STEP 4 — Post vehicles from Inventory/posting.json to Facebook Marketplace
 *
 *   node step4_post_to_facebook.js [--post-limit N] [--allow-placeholder]
 *
 * Photos come from pictures/<STOCK or VIN>/ (1.jpg, 2.jpg, ... max CONFIG.MAX_PHOTOS).
 * Results are written to Inventory/posting_log.json (read by step 5).
 */
const { chromium } = require("playwright");
const C = require("./lib/common");
const { CONFIG, PATHS, fs, path, sleep, waitForEnter } = C;

function log(msg) { C.log(msg); }
function logSection(t) { C.section(t); }

async function scrollDown(page, px = 400) {
  await page.evaluate((px) => window.scrollBy(0, px), px);
  await sleep(400, 700);
}

async function selectDropdown(page, labelText, optionText) {
  try {
    await page.evaluate(({ labelText }) => {
      const span = Array.from(document.querySelectorAll('span'))
        .find(s => s.textContent.trim() === labelText);
      if (!span) return;
      const combo = span.closest('[role="combobox"]') || span.closest('label');
      if (combo) combo.click();
    }, { labelText });
    await sleep(700, 1200);
    const options = await page.$$('[role="option"]');
    for (const opt of options) {
      const text = await opt.textContent();
      if (text && text.trim().toLowerCase().includes(optionText.toLowerCase())) {
        await opt.evaluate(el => el.click());
        await sleep(300, 700);
        log(`  ✓ ${labelText}: ${text.trim()}`);
        return true;
      }
    }
    log(`  ⚠️  "${optionText}" not found in ${labelText}`);
    await page.keyboard.press("Escape");
    return false;
  } catch (e) {
    log(`  ⚠️  Dropdown ${labelText}: ${e.message.split('\n')[0]}`);
    return false;
  }
}

async function fillMake(page, make) {
  try {
    await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll('span'))
        .find(s => s.textContent.trim() === 'Make');
      if (!span) return;
      const combo = span.closest('[role="combobox"]') || span.closest('label');
      if (combo) combo.click();
    });
    await sleep(700, 1200);
    const options = await page.$$('[role="option"]');
    for (const opt of options) {
      const text = await opt.textContent();
      if (text && text.trim().toLowerCase() === make.toLowerCase()) {
        await opt.evaluate(el => el.click());
        await sleep(300, 700);
        log(`  ✓ Make: ${make}`);
        return true;
      }
    }
    for (const opt of options) {
      const text = await opt.textContent();
      if (text && text.trim().toLowerCase().includes(make.toLowerCase())) {
        await opt.evaluate(el => el.click());
        await sleep(300, 700);
        log(`  ✓ Make (partial): ${text.trim()}`);
        return true;
      }
    }
    log(`  ⚠️  Make "${make}" not in dropdown`);
    await page.keyboard.press("Escape");
    return false;
  } catch (e) {
    log(`  ⚠️  Make: ${e.message.split('\n')[0]}`);
    return false;
  }
}

async function fillModel(page, model) {
  try {
    await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll('span'))
        .find(s => s.textContent.trim() === 'Model');
      if (!span) return;
      const combo = span.closest('[role="combobox"]') || span.closest('label');
      if (combo) combo.click();
    });
    await sleep(700, 1200);
    const options = await page.$$('[role="option"]');
    if (options.length > 0) {
      const firstWord = model.split(' ')[0].toLowerCase();
      for (const opt of options) {
        const text = await opt.textContent();
        if (text && text.trim().toLowerCase().includes(firstWord)) {
          await opt.evaluate(el => el.click());
          await sleep(300, 700);
          log(`  ✓ Model: ${text.trim()}`);
          return true;
        }
      }
      const firstText = await options[0].textContent();
      await options[0].evaluate(el => el.click());
      await sleep(300, 700);
      log(`  ✓ Model (first): ${firstText.trim()}`);
      return true;
    }
    const filled = await page.evaluate(({ model }) => {
      const span = Array.from(document.querySelectorAll('span'))
        .find(s => s.textContent.trim() === 'Model');
      if (!span) return false;
      const container = span.closest('label') || span.parentElement;
      const input = container?.querySelector('input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, model);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, { model });
    if (filled) { log(`  ✓ Model typed: ${model}`); return true; }
    log(`  ⚠️  Model not filled`);
    return false;
  } catch (e) {
    log(`  ⚠️  Model: ${e.message.split('\n')[0]}`);
    return false;
  }
}

async function clickButtonByText(page, text) {
  try {
    return await page.evaluate(({ text }) => {
      const span = Array.from(document.querySelectorAll('span'))
        .find(s => s.textContent.trim() === text);
      if (!span) return false;
      let el = span;
      for (let i = 0; i < 6; i++) {
        el = el.parentElement;
        if (!el) break;
        const role = el.getAttribute('role');
        if (role === 'none' || role === 'button' || el.tagName === 'BUTTON') {
          el.click();
          return true;
        }
      }
      span.click();
      return true;
    }, { text });
  } catch (e) {
    log(`  ⚠️  Button "${text}": ${e.message.split('\n')[0]}`);
    return false;
  }
}

function detectBodyStyle(vehicle) {
  const siteType = (vehicle.bodyType || "").toLowerCase();
  if (siteType.includes("truck") || siteType.includes("pickup")) return "Truck";
  if (siteType.includes("suv") || siteType.includes("crossover")) return "SUV";
  if (siteType.includes("sedan")) return "Sedan";
  if (siteType.includes("hatch")) return "Hatchback";
  if (siteType.includes("coupe")) return "Coupe";
  if (siteType.includes("van") || siteType.includes("minivan")) return "Minivan";
  if (siteType.includes("wagon")) return "Wagon";
  if (siteType.includes("convert")) return "Convertible";
  const text = `${vehicle.make} ${vehicle.model}`.toLowerCase();
  if (/santa cruz/.test(text)) return "Truck";
  if (/f-150|f150|silverado|sierra|ram\b|titan|tacoma|tundra|ranger|colorado|canyon/.test(text)) return "Truck";
  if (/odyssey|sienna|caravan|pacifica|sedona/.test(text)) return "Minivan";
  if (/sportwagen|outback/.test(text)) return "Wagon";
  if (/golf|fiesta|fit|yaris|rio|accent|impreza|crosstrek|ecosport|hr-v|hrv/.test(text)) return "Hatchback";
  if (/mustang|camaro|challenger|corvette/.test(text)) return "Coupe";
  if (/cr-v|crv|rav4|rogue|escape|explorer|pilot|equinox|terrain|outlander|sorento|tucson|santa fe|kona|venue|palisade|seltos|trax|encore|nexo|cx-5|murano|pathfinder|highlander|atlas|edge|tahoe|suburban|yukon|expedition|navigator|escalade|x1|x3|x5|gle|glc|q5|q7|xc60|xc90|tiguan|sportage|telluride|palisade|corsair|mkc|cherokee|jx35|mdx|rdx/.test(text)) return "SUV";
  return "Sedan";
}

// Photos in numeric order, capped at MAX_PHOTOS
function getPhotos(vehicle) {
  const dir = path.join(PATHS.pictures, C.folderName(vehicle));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^\d+\.(jpe?g|png|webp)$/i.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .slice(0, CONFIG.MAX_PHOTOS)
    .map((f) => path.join(dir, f));
}

async function postVehicle(page, vehicle, index, total) {
  const mileage = vehicle.kilometers ? String(Math.round(vehicle.kilometers)) : "";
  const price = vehicle.price ? String(Math.round(vehicle.price)) : "";
  const fbTitle = CONFIG.buildTitle(vehicle);
  const key = C.vehicleKey(vehicle);

  logSection(`Posting ${index + 1}/${total}: ${fbTitle}`);
  log(`  Price: $${price || "N/A"}  |  Mileage: ${mileage || "N/A"}`);

  try {
    log("Opening create listing page...");
    await page.goto("https://www.facebook.com/marketplace/create/vehicle", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await sleep(3000, 4000);

    // 1. Vehicle Type
    log("Vehicle type...");
    await selectDropdown(page, "Vehicle type", "Car");
    await sleep(1000, 2000);

    // 2. Photos
    const photos = getPhotos(vehicle);
    log(`Uploading photos (${photos.length})...`);
    try {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(photos);
        await sleep(5000, 9000);
        log(`  ✓ ${photos.length} photos uploaded`);
      } else log("  ⚠️  File input not found");
    } catch (e) { log(`  ⚠️  Photos: ${e.message.split('\n')[0]}`); }

    await scrollDown(page, 300);
    await sleep(500, 800);

    // 3. Year
    log(`Year: ${vehicle.year}`);
    await selectDropdown(page, "Year", String(vehicle.year));
    await sleep(800, 1500);

    // 4. Make
    log(`Make: ${vehicle.make}`);
    await fillMake(page, vehicle.make);
    await sleep(800, 1500);

    // 5. Model
    log(`Model: ${vehicle.model}`);
    await fillModel(page, vehicle.model);
    await sleep(800, 1200);

    // 6. Mileage + Price via Tab
    log(`Mileage (${mileage}) + Price (${price}) via Tab...`);
    try {
      await page.keyboard.press("Tab");
      await sleep(400, 600);
      if (mileage) {
        await page.keyboard.type(mileage, { delay: 50 });
        log(`  ✓ Mileage: ${mileage}`);
      }
      await sleep(400, 600);
      await page.keyboard.press("Tab");
      await sleep(400, 600);
      if (price) {
        await page.keyboard.type(price, { delay: 50 });
        log(`  ✓ Price: ${price}`);
      }
      await sleep(400, 600);
    } catch (e) { log(`  ⚠️  Tab fill: ${e.message.split('\n')[0]}`); }

    await scrollDown(page, 250);
    await sleep(400, 800);

    // 7. Body Style
    const bodyStyle = detectBodyStyle(vehicle);
    log(`Body style: ${bodyStyle}`);
    await selectDropdown(page, "Body style", bodyStyle);
    await sleep(700, 1200);

    await scrollDown(page, 250);
    await sleep(500, 900);

    // 8. Condition
    log("Condition: Excellent");
    await selectDropdown(page, "Condition", "Excellent");
    await sleep(700, 1200);

    // 9. Clean Title
    log("Clean title...");
    await page.evaluate(() => {
      const cb = document.querySelector('input[aria-label="This vehicle has a clean title."]');
      if (cb && cb.getAttribute('aria-checked') === 'false') cb.click();
    });
    await sleep(300, 500);
    log("  ✓ Clean title checked");

    await scrollDown(page, 250);
    await sleep(400, 800);

    // 10. Description
    log("Description...");
    try {
      const filled = await page.evaluate(({ desc }) => {
        const ta = document.querySelector('textarea[id*="_r_"]');
        if (!ta) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, desc);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }, { desc: CONFIG.buildDescription(vehicle) });
      log(filled ? "  ✓ Description filled" : "  ⚠️  Textarea not found");
    } catch (e) { log(`  ⚠️  Description: ${e.message.split('\n')[0]}`); }

    await sleep(800, 1500);

    // 11. Next
    log("Clicking Next...");
    const nextOk = await clickButtonByText(page, "Next");
    if (nextOk) { await sleep(3000, 5000); log("  ✓ Next clicked"); }
    else log("  ⚠️  Next not found");

    // 12. Groups (first group + next 3)
    log("Selecting groups...");
    try {
      await sleep(2000, 3000);
      const firstGroup = await page.$('i.x1d69dk1');
      if (firstGroup) {
        await firstGroup.click();
        await sleep(400, 600);
        for (let g = 0; g < 4; g++) {
          await page.keyboard.press("Tab");
          await sleep(200, 400);
          await page.keyboard.press("Space");
          await sleep(200, 400);
        }
        log("  ✓ Groups selected");
      } else {
        log("  ⚠️  No groups found");
      }
    } catch (e) { log(`  ⚠️  Groups: ${e.message.split('\n')[0]}`); }

    // 13. Publish
    log("Clicking Publish...");
    await sleep(800, 1500);
    const published = await clickButtonByText(page, "Publish");
    if (published) { await sleep(3000, 5000); log(`  ✅ Published: ${fbTitle}`); }
    else log("  ⚠️  Publish not found");

    return { success: !!published, key, stock: vehicle.stockNumber, vehicle: fbTitle };

  } catch (err) {
    log(`❌  Error: ${err.message.split('\n')[0]}`);
    return { success: false, key, stock: vehicle.stockNumber, vehicle: fbTitle, error: err.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log("\n  ABBOTSFORD HYUNDAI — FB POSTER\n  STEP 4: Post Vehicles to Facebook\n");
  const args = C.parseArgs();

  if (CONFIG.DESCRIPTION.trim().startsWith("EDIT_ME") && !args.flags.has("allow-placeholder")) {
    console.log("  ❌  config.js still has the placeholder DESCRIPTION. Edit it first (or pass --allow-placeholder to test).");
    process.exit(1);
  }

  C.writeJson(PATHS.postingLog, []); // reset so step 5 never reads a stale log
  let vehicles = C.readJson(PATHS.posting);
  if (vehicles.length === 0) { console.log("  ✅  No vehicles to post!"); return; }

  const noPhotos = vehicles.filter((v) => getPhotos(v).length === 0);
  if (noPhotos.length) {
    console.log(`  ⚠️  Skipping ${noPhotos.length} vehicle(s) with no downloaded photos: ${noPhotos.map(C.vehicleKey).join(", ")}`);
    vehicles = vehicles.filter((v) => getPhotos(v).length > 0);
  }
  if (args.values["post-limit"]) vehicles = vehicles.slice(0, Number(args.values["post-limit"]));
  if (vehicles.length === 0) { console.log("  Nothing postable."); return; }

  console.log(`  Found ${vehicles.length} vehicles to post:\n`);
  vehicles.forEach((v, i) => {
    console.log(`    ${i + 1}. ${v.year} ${v.make} ${v.model} [${C.vehicleKey(v)}]  $${v.price}  ${v.kilometers} km  (${getPhotos(v).length} photos)`);
  });

  await waitForEnter("\n  Press ENTER to open browser, or CTRL+C to cancel... ");

  // Persistent profile: Facebook login is remembered between runs
  const context = await chromium.launchPersistentContext(PATHS.fbProfile, {
    headless: false,
    args: ["--start-maximized"],
    viewport: null,
    userAgent: CONFIG.USER_AGENT,
  });
  const page = context.pages()[0] || (await context.newPage());
  const postingLog = [];

  try {
    await page.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded" });
    console.log(`
  ─────────────────────────────────────────────────────
  Log in to Facebook (if needed), then press ENTER to start posting.
  ─────────────────────────────────────────────────────`);
    await waitForEnter();

    for (let i = 0; i < vehicles.length; i++) {
      const result = await postVehicle(page, vehicles[i], i, vehicles.length);
      result.timestamp = new Date().toISOString();
      postingLog.push(result);
      C.writeJson(PATHS.postingLog, postingLog);

      if (i < vehicles.length - 1) {
        const delay = Math.floor(Math.random() * (CONFIG.DELAY_MAX_MS - CONFIG.DELAY_MIN_MS + 1)) + CONFIG.DELAY_MIN_MS;
        log(`\nWaiting ${(delay / 1000).toFixed(1)}s before next listing...`);
        await sleep(delay);
      }
    }

    const succeeded = postingLog.filter((r) => r.success).length;
    console.log(`\n  POSTING COMPLETE — posted: ${succeeded}, failed: ${postingLog.length - succeeded}`);
    postingLog.filter((r) => !r.success).forEach((r) => console.log(`    ✗ ${r.vehicle}`));
    await sleep(8000);
  } catch (err) {
    console.error("\n❌  Fatal:", err.message);
    C.writeJson(PATHS.postingLog, postingLog);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

main();