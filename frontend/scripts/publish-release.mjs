// Points the update prompt at a new APK.
//
//   npm run release:publish -- <apk-url> [--required]
//
// Sets APP_LATEST_VERSION (from app.json) and APP_DOWNLOAD_URL in render.yaml.
// With --required, APP_MIN_VERSION is raised too, so older installs can't skip it.
// Commit and push afterwards so Render redeploys with the new values.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const url = args.find((arg) => !arg.startsWith("--"));
const required = args.includes("--required");

if (!url || !/^https:\/\//.test(url)) {
  console.error("Usage: npm run release:publish -- <https apk url> [--required]");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(resolve(here, "../app.json"), "utf8")).expo;
const renderPath = resolve(here, "../../render.yaml");
let yaml = readFileSync(renderPath, "utf8");

function setVar(key, value) {
  const pattern = new RegExp(`(- key: ${key}\\n\\s+value: )"[^"]*"`);
  if (!pattern.test(yaml)) throw new Error(`${key} not found in render.yaml`);
  yaml = yaml.replace(pattern, `$1"${value}"`);
}

setVar("APP_LATEST_VERSION", version);
setVar("APP_DOWNLOAD_URL", url);
if (required) setVar("APP_MIN_VERSION", version);
writeFileSync(renderPath, yaml);

console.log(`render.yaml: latest ${version}${required ? " (required)" : ""} -> ${url}`);
