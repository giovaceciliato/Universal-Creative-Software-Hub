import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../catalog/apps/", import.meta.url));
const allowedPlatforms = new Set(["windows", "macos", "linux"]);
const allowedPricing = new Set(["free-open-source", "freeware"]);
const ids = new Set();
const files = readdirSync(directory).filter((name) => name.endsWith(".json"));
if (files.length === 0) throw new Error("The catalog cannot be empty.");

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

for (const file of files) {
  const app = JSON.parse(readFileSync(join(directory, file), "utf8"));
  assert(typeof app.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.id), `${file}: invalid id`);
  assert(basename(file, ".json") === app.id, `${file}: filename must equal id`);
  assert(!ids.has(app.id), `${file}: duplicate id`);
  ids.add(app.id);
  for (const field of ["name", "publisher", "description"]) {
    assert(typeof app[field] === "string" && app[field].trim(), `${file}: missing ${field}`);
  }
  assert(Array.isArray(app.categories) && app.categories.length > 0 && app.categories.every((category) => typeof category === "string"), `${file}: invalid categories`);
  assert(Array.isArray(app.platforms) && app.platforms.length > 0 && app.platforms.every((platform) => allowedPlatforms.has(platform)), `${file}: invalid platforms`);
  assert(allowedPricing.has(app.pricingModel), `${file}: unknown pricing model`);
  for (const field of ["website", "download", "sourceCode"]) {
    if (field === "sourceCode" && !app.links?.[field]) continue;
    const url = app.links?.[field];
    assert(typeof url === "string" && new URL(url).protocol === "https:", `${file}: ${field} must be HTTPS`);
  }
}
console.log(`Validated ${files.length} catalog entries.`);
