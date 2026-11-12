/**
 * Shared scraping helpers (used by step 1 and step 3).
 * Built for the Abbotsford Hyundai site layout. Details come from JSON-LD when present,
 * then label/text parsing; photos come from the page's hidden full gallery list.
 * Run step 1 with --debug to save page HTML if a field comes back empty.
 */
const { CONFIG } = require("./common");

const DETAIL_RE = /\/inventory\/\d{4}-[^/?#]+/i;

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = 600;
      const t = setInterval(() => {
        window.scrollBy(0, step);
        y += step;
        if (y >= document.body.scrollHeight + step) { clearInterval(t); res(); }
      }, 150);
    });
  });
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function grabLinks(page, set) {
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
  for (const h of hrefs) {
    if (DETAIL_RE.test(h)) set.add(h.split("#")[0].split("?")[0]);
  }
}

async function goNext(page) {
  const handle = await page.evaluateHandle(() => {
    const visible = (e) =>
      e.offsetParent !== null && !e.disabled &&
      e.getAttribute("aria-disabled") !== "true" && !/disabled/i.test(e.className || "");
    const label = (e) => ((e.innerText || "").trim() || e.getAttribute("aria-label") || "");
    return (
      [...document.querySelectorAll("a,button")].find((e) => {
        if (!visible(e)) return false;
        const l = label(e);
        const aria = e.getAttribute("aria-label") || "";
        if (/slide|image|photo|carousel|gallery/i.test(l + " " + aria)) return false;
        return (
          e.getAttribute("rel") === "next" ||
          /^(next|next page|load more|show more|view more)\b/i.test(l) ||
          /\bnext\b/i.test(aria)
        );
      }) || null
    );
  });
  const el = handle.asElement();
  if (!el) return false;
  try {
    await el.scrollIntoViewIfNeeded();
    await el.click({ timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Returns every vehicle detail-page URL on the used inventory listing. */
async function collectVehicleUrls(page, log) {
  const urls = new Set();
  await page.goto(CONFIG.INVENTORY_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const totalMatch = bodyText.match(/(\d+)\s+Vehicles?\s+For\s+Sale/i);
  const reportedTotal = totalMatch ? Number(totalMatch[1]) : null;
  if (reportedTotal) log(`Site reports ${reportedTotal} vehicles`);

  let stale = 0;
  for (let i = 0; i < 100; i++) {
    const before = urls.size;
    await autoScroll(page);
    await grabLinks(page, urls);
    stale = urls.size === before ? stale + 1 : 0;
    log(`  page ${i + 1}: ${urls.size} vehicles so far`);
    if (stale >= 2) break;
    if (reportedTotal && urls.size >= reportedTotal) break;
    if (!(await goNext(page))) break;
    await settle(page);
  }

  // Fallback: ?page=N pagination
  if (reportedTotal && urls.size < reportedTotal) {
    log(`Only ${urls.size}/${reportedTotal} found, trying ?page=N pagination...`);
    for (let n = 2; n <= 30; n++) {
      const before = urls.size;
      await page.goto(`${CONFIG.INVENTORY_URL}?page=${n}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await settle(page);
      await autoScroll(page);
      await grabLinks(page, urls);
      if (urls.size === before) break;
    }
  }
  return { urls: [...urls], reportedTotal };
}

/** Pulls raw fields + image URLs out of a vehicle detail page (already loaded). */
async function extractDetail(page) {
  return page.evaluate(
    ({ hostPattern, fullSize }) => {
      const hostRe = new RegExp(hostPattern, "i");
      const text = document.body ? document.body.innerText : "";
      const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

      const field = (labels) => {
        const re = new RegExp(
          "(?:^|\\n)[ \\t]*(?:" + labels + ")[ \\t]*[:\\t]?[ \\t]*\\n?[ \\t]*([^\\n]+)", "i");
        const m = text.match(re);
        return m ? clean(m[1]) : "";
      };

      // ---- JSON-LD
      const ld = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        try {
          const j = JSON.parse(s.textContent);
          (Array.isArray(j) ? j : j["@graph"] || [j]).forEach((o) => ld.push(o));
        } catch (e) { /* ignore */ }
      });
      const veh = ld.find((o) => o && /Vehicle|Car|Product/i.test([].concat(o["@type"] || []).join(","))) || {};
      const nameOf = (x) => (x && typeof x === "object" ? x.name : x) || "";
      const offer = [].concat(veh.offers || [])[0] || {};

      // ---- Title -> year / make / model
      const title = clean((document.querySelector("h1") || {}).innerText || document.title.split("|")[0]);
      const ym = title.match(/\b((?:19|20)\d{2})\b/);
      const year = ym ? ym[1] : String(veh.vehicleModelDate || "");
      let rest = ym ? clean(title.slice(title.indexOf(ym[1]) + 4)) : title;
      const multi = ["Land Rover", "Alfa Romeo", "Aston Martin", "Rolls-Royce", "Mercedes-Benz", "Mercedes Benz"];
      let make = "";
      const mm = multi.find((m) => rest.toLowerCase().startsWith(m.toLowerCase()));
      if (mm) { make = mm; rest = clean(rest.slice(mm.length)); }
      else { const parts = rest.split(" "); make = parts.shift() || ""; rest = parts.join(" "); }
      make = nameOf(veh.brand) || make;
      const model = nameOf(veh.model) || rest;

      // ---- VIN
      const vinRe = /\b[A-HJ-NPR-Z0-9]{17}\b/;
      let vin = String(veh.vehicleIdentificationNumber || field("VIN")).toUpperCase();
      if (!vinRe.test(vin)) {
        const fromLink = [...document.querySelectorAll("a[href]")]
          .map((a) => a.href.toUpperCase().match(vinRe)).find(Boolean);
        vin = fromLink ? fromLink[0] : (text.toUpperCase().match(vinRe) || [""])[0];
      }

      // ---- Price
      let price = offer.price || "";
      if (!price) {
        for (const el of document.querySelectorAll('[class*="price" i]')) {
          const m = (el.innerText || "").match(/\$\s*([\d,]+)/);
          if (m) { price = m[1]; break; }
        }
      }
      if (!price) { const m = text.match(/\$\s*([\d,]+)/); price = m ? m[1] : ""; }

      // ---- Kilometres
      let km = (veh.mileageFromOdometer && veh.mileageFromOdometer.value) || field("Kilomet(?:re|er)s?|Mileage|Odometer");
      if (!km) { const m = text.match(/([\d,]{3,})\s*km\b/i); km = m ? m[1] : ""; }

      // ---- Images (Abbotsford Hyundai layout only)
      // The hidden list #mg-nav-carousel holds EVERY photo once, in the true website order.
      // The visible sliders add "clone" slides that scramble the order, so they are not used.
      // That list only has small 768px versions, so swap in the full-size size code.
      const images = [];
      const seen = new Set();
      document.querySelectorAll("#mg-nav-carousel img").forEach((img) => {
        try {
          const a = new URL(img.getAttribute("data-src") || img.currentSrc || img.src, location.href);
          if (!hostRe.test(a.hostname)) return;
          const key = a.pathname.split("/").pop().replace(/\.[a-z0-9]+$/i, "");
          if (seen.has(key)) return;
          seen.add(key);
          images.push(a.href.replace(/w_\d+,h_\d+,q_\d+/, fullSize));
        } catch (e) { /* ignore */ }
      });


      return {
        title, year, make, model, vin,
        stockNumber: String(veh.sku || field("Stock\\s*(?:#|No\\.?|Number)?")),
        kilometers: String(km),
        price: String(price),
        transmission: String(veh.vehicleTransmission || field("Transmission")),
        exteriorColour: String(field("Exterior\\s*Colou?r|Ext\\.?\\s*Colou?r") || veh.color || ""),
        fuelType: String(veh.fuelType || field("Fuel\\s*Type")),
        bodyType: String(field("Body\\s*(?:Style|Type)")),
        images,
      };
    },
    { hostPattern: CONFIG.IMAGE_HOST_PATTERN, fullSize: CONFIG.FULL_SIZE_PARAMS || "w_1920,h_1440,q_75" }
  );
}

const toNum = (s) => {
  const m = String(s || "").replace(/[^0-9.]/g, "");
  return m ? Number(m) : null;
};

/** Raw page data -> the clean record stored in Current.json */
function normalizeVehicle(raw, url) {
  return {
    stockNumber: raw.stockNumber.trim(),
    vin: raw.vin.trim(),
    year: toNum(raw.year),
    make: raw.make.trim(),
    model: raw.model.trim(),
    kilometers: toNum(raw.kilometers),
    price: toNum(raw.price),
    transmission: raw.transmission.trim(),
    exteriorColour: raw.exteriorColour.trim(),
    fuelType: raw.fuelType.trim(),
    bodyType: raw.bodyType.trim(),
    url,
    images: raw.images,
  };
}

async function loadDetailPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page);
  await autoScroll(page);
}

module.exports = { collectVehicleUrls, extractDetail, normalizeVehicle, loadDetailPage, settle, autoScroll };