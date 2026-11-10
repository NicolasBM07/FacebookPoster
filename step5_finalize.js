/**
 * STEP 5 — Record what was posted, then clear Current.json and posting.json
 *  - vehicles posted successfully are APPENDED to previous.json
 *  - vehicles that failed are not recorded, so they are retried next run
 *  - vehicles that failed to post are not recorded, so they are retried next run
 * (Removing sold vehicles and their pictures now happens in step 2.)
 */
const { PATHS, readJson, writeJson, vehicleKey, section, ok, warn, fail } = require("./lib/common");

try {
  section("STEP 5 — Finalize");
  const previous = readJson(PATHS.previous);
  const posting = readJson(PATHS.posting);
  const postingLog = readJson(PATHS.postingLog);

  if (posting.length && postingLog.length === 0) {
    throw new Error("posting.json has vehicles but there is no posting log, so nothing was posted. Files left untouched.");
  }

  const succeeded = new Set(postingLog.filter((r) => r.success).map((r) => r.key));
  const posted = posting.filter((v) => succeeded.has(vehicleKey(v)));
  const failed = posting.filter((v) => !succeeded.has(vehicleKey(v)));

  const known = new Set(previous.map(vehicleKey));
  const merged = previous.concat(posted.filter((v) => !known.has(vehicleKey(v))));
  writeJson(PATHS.previous, merged);
  writeJson(PATHS.current, []);
  writeJson(PATHS.posting, []);

  ok(`previous.json now has ${merged.length} vehicle(s) (+${posted.length} newly posted)`);
  if (failed.length) warn(`${failed.length} vehicle(s) failed to post and will be retried next run: ` +
    failed.map(vehicleKey).join(", "));
  ok("Current.json and posting.json cleared.");
} catch (e) { fail(e.message); process.exit(1); }