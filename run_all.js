/**
 * Runs steps 1-5 in order.
 *   npm run all
 *   npm run all -- --show --post-limit 2
 * Extra flags are passed to every step.
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { PATHS, readJson, fail, ok, log } = require("./lib/common");

const extra = process.argv.slice(2);
const steps = [
  "step1_scrape.js",
  "step2_compare.js",
  "step3_download_images.js",
  "step4_post_to_facebook.js",
  "step5_finalize.js",
];

for (const s of steps) {
  if ((s.startsWith("step3") || s.startsWith("step4")) && readJson(PATHS.posting).length === 0) {
    log(`No new vehicles, skipping ${s}`);
    continue;
  }
  const r = spawnSync(process.execPath, [path.join(__dirname, s), ...extra], { stdio: "inherit", cwd: __dirname });
  if (r.status !== 0) { fail(`${s} failed (exit ${r.status}). Stopping.`); process.exit(r.status || 1); }
}
ok("All steps complete.");
