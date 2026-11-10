/**
 * STEP 2 — Sync with the website, then find the new vehicles
 *
 *  1. Vehicles in previous.json that are no longer on the website are removed from it.
 *  2. Picture folders of vehicles no longer on the website are deleted.
 *  3. Current vehicles not in previous.json go to posting.json.
 *     (previous.json empty => every current vehicle goes to posting.json)
 *
 *   node step2_compare.js [--force-prune]
 */
const C = require("./lib/common");
const { PATHS, readJson, writeJson, vehicleKey, folderName, section, log, ok, warn, fail, fs, path } = C;

try {
  section("STEP 2 — Sync with website & find new vehicles");
  const args = C.parseArgs();
  const current = readJson(PATHS.current);
  let previous = readJson(PATHS.previous);
  if (current.length === 0) throw new Error("Current.json is empty. Run step 1 first.");

  if (fs.existsSync(PATHS.partialFlag)) {
    warn("Last scrape was partial (--scrape-limit): skipping removal of sold vehicles and their pictures.");
  } else {
    // Safety net: a bad scrape must never wipe out your history
    if (previous.length >= 10 && current.length < previous.length * 0.5 && !args.flags.has("force-prune")) {
      throw new Error(
        `Current.json has ${current.length} vehicles but previous.json has ${previous.length}. ` +
        `That looks like a bad scrape. Nothing was changed. Re-run step 1, or use --force-prune if it is correct.`);
    }
    const liveKeys = new Set(current.map(vehicleKey));
    const liveFolders = new Set(current.map(folderName));

    const kept = previous.filter((v) => liveKeys.has(vehicleKey(v)));
    if (kept.length !== previous.length) {
      log(`Removed ${previous.length - kept.length} sold vehicle(s) from previous.json`);
      previous = kept;
      writeJson(PATHS.previous, previous);
    }

    let removedFolders = 0;
    if (fs.existsSync(PATHS.pictures)) {
      for (const name of fs.readdirSync(PATHS.pictures)) {
        const p = path.join(PATHS.pictures, name);
        if (name.startsWith(".") || !fs.statSync(p).isDirectory()) continue;
        if (!liveFolders.has(name)) { fs.removeSync(p); removedFolders++; }
      }
    }
    if (removedFolders) log(`Deleted ${removedFolders} picture folder(s) of vehicles no longer on the website`);
  }

  let posting;
  if (previous.length === 0) {
    log("previous.json is empty: all current vehicles will be posted.");
    posting = current;
  } else {
    const seen = new Set(previous.map(vehicleKey));
    posting = current.filter((v) => !seen.has(vehicleKey(v)));
  }
  writeJson(PATHS.posting, posting);
  ok(`${posting.length} vehicle(s) to post -> Inventory/posting.json (website ${current.length}, already posted ${previous.length})`);
  posting.forEach((v) => log(`  + ${v.year} ${v.make} ${v.model} [${vehicleKey(v)}]`));
} catch (e) { fail(e.message); process.exit(1); }