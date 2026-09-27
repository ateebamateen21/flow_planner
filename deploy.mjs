import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const SRC = process.cwd();
const DIST = path.join(SRC, "dist");
const PLUGIN_ID = "flow-planner"; // must match manifest.json "id"
const FILES = ["main.js", "styles.css", "manifest.json"];

// Required files for deployment (MUST BE THERE LMAO!!! This made me pull hair for 2hours because I missed styles.css once)
const SOURCE_FILES = new Set(["manifest.json", "styles.css"]);

function expandTilde(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Path can come from argv[2]; otherwise prompt.
let vaultArg = process.argv[2];

if (!vaultArg) {
  const rl = readline.createInterface({ input, output });
  vaultArg = (await rl.question("Path to your Obsidian vault root: ")).trim();
  rl.close();
}

if (!vaultArg) {
  console.error("[deploy] No path given. Aborting.");
  process.exit(1);
}

const VAULT = path.resolve(expandTilde(vaultArg.replace(/^["']|["']$/g, "")));

if (!fs.existsSync(VAULT)) {
  console.error(`[deploy] Vault folder does not exist: ${VAULT}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(VAULT, ".obsidian"))) {
  console.error(
    `[deploy] No .obsidian folder inside: ${VAULT}\n` +
      `[deploy] That doesn't look like an Obsidian vault root.`,
  );
  process.exit(1);
}

const DEST = path.join(VAULT, ".obsidian", "plugins", PLUGIN_ID);

if (!fs.existsSync(DEST)) {
  console.log(`[deploy] Creating plugin folder: ${DEST}`);
  fs.mkdirSync(DEST, { recursive: true });
}

console.log(`[deploy] Vault:  ${VAULT}`);
console.log(`[deploy] Plugin: ${DEST}`);
console.log("");

for (const f of FILES) {
  const from = SOURCE_FILES.has(f) ? path.join(SRC, f) : path.join(DIST, f);

  if (!fs.existsSync(from)) {
    console.warn(`[deploy] Skipping missing file: ${from}`);
    continue;
  }

  const to = path.join(DEST, f);
  fs.copyFileSync(from, to);
  console.log(`[deploy] ${f} → ${to}`);
}
for (const f of FILES) {
  const from = SOURCE_FILES.has(f) ? path.join(SRC, f) : path.join(DIST, f);

  if (!fs.existsSync(from)) {
    console.warn(`[deploy] Skipping missing file: ${from}`);
    continue;
  }

  const to = path.join(DEST, f);
  fs.copyFileSync(from, to);
  console.log(`[deploy] ${f} → ${to}`);
}

console.log("");
console.log("[deploy] Done. Reload the plugin in Obsidian (Ctrl+R).");
