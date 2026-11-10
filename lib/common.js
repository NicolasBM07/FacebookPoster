const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const { chromium } = require("playwright");
const CONFIG = require("../config");

const ROOT = path.join(__dirname, "..");
const INV = path.join(ROOT, "Inventory");
const PATHS = {
  root: ROOT,
  inventory: INV,
  current: path.join(INV, "Current.json"),
  previous: path.join(INV, "previous.json"),
  posting: path.join(INV, "posting.json"),
  postingLog: path.join(INV, "posting_log.json"),
  partialFlag: path.join(INV, ".partial_scrape"),
  debug: path.join(INV, "debug"),
  pictures: path.join(ROOT, "pictures"),
  fbProfile: path.join(ROOT, ".fb-profile"),
};

const log = (m) => console.log(`${chalk.gray(`[${new Date().toLocaleTimeString()}]`)} ${m}`);
const ok = (m) => log(chalk.green(m));
const warn = (m) => log(chalk.yellow(`⚠️  ${m}`));
const fail = (m) => log(chalk.red(`❌ ${m}`));
const section = (t) => console.log(chalk.cyan(`\n${"=".repeat(60)}\n  ${t}\n${"=".repeat(60)}`));

function sleep(min, max) {
  const ms = max ? Math.floor(Math.random() * (max - min + 1)) + min : min;
  return new Promise((r) => setTimeout(r, ms));
}

/** Read a JSON array. Missing/empty file => []. Corrupt file => throws (never silently treated as empty). */
function readJson(file) {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf-8").trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${path.basename(file)} is not valid JSON: ${e.message}`);
  }
}
function writeJson(file, data) {
  fs.ensureDirSync(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/** Unique ID: stock number, falling back to VIN */
function vehicleKey(v) {
  return String(v.stockNumber || v.vin || "").trim().toUpperCase();
}
function folderName(v) {
  return vehicleKey(v).replace(/[^A-Z0-9_-]/g, "_");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const name = argv[i].slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) { args.values[name] = next; i++; }
    else args.flags.add(name);
  }
  return args;
}

async function launchBrowser({ headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent: CONFIG.USER_AGENT,
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  return { browser, context, page };
}

function waitForEnter(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt || "\n  >>> Press ENTER to continue... ");
    if (!process.stdin.isTTY) { console.log("(no TTY, continuing)"); return resolve(); }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (d) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      console.log("");
      if (d[0] === 3) process.exit(130); // Ctrl+C
      resolve();
    });
  });
}

module.exports = {
  CONFIG, PATHS, log, ok, warn, fail, section, sleep, readJson, writeJson,
  vehicleKey, folderName, parseArgs, launchBrowser, waitForEnter, chalk, fs, path,
};
