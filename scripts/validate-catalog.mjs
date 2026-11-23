import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../catalog/apps/", import.meta.url));
const allowedPlatforms = new Set(["windows", "macos", "linux", "web"]);
const allowedPricing = new Set(["free-open-source", "freeware"]);
const platforms = new Set(["windows", "macos", "linux"]);
const identifiers = new Set(["executableNames", "bundleNames", "desktopIds", "wingetIds", "homebrewCasks", "flatpakIds", "rpmNames"]);
const identifierPattern = /^[a-zA-Z0-9_.+-]+$/;
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
  if (app.icon !== undefined) {
    const icon = app.icon;
    assert(icon && typeof icon === "object" && !Array.isArray(icon), `${file}: invalid icon object`);
    assert(Object.keys(icon).every((key) => ["path", "source", "license"].includes(key)), `${file}: icon includes unsupported fields`);
    assert(typeof icon.path === "string" && /^\/icons\/[a-z0-9-]+\.(svg|png)$/.test(icon.path), `${file}: icon path must point to a local SVG or PNG`);
    assert(typeof icon.source === "string" && icon.source.trim(), `${file}: missing icon source`);
    assert(typeof icon.license === "string" && icon.license.trim(), `${file}: missing icon license`);
    assert(existsSync(new URL(`../public${icon.path}`, import.meta.url)), `${file}: icon asset does not exist`);
  }
  if (app.integrations !== undefined) {
    assert(app.integrations && typeof app.integrations === "object" && !Array.isArray(app.integrations), `${file}: integrations must be an object`);
    for (const [os, hintSet] of Object.entries(app.integrations)) {
      assert(platforms.has(os) && app.platforms.includes(os), `${file}: invalid integration platform ${os}`);
      assert(hintSet && typeof hintSet === "object" && !Array.isArray(hintSet), `${file}: invalid identifiers for ${os}`);
      for (const [key, values] of Object.entries(hintSet)) {
        assert(identifiers.has(key), `${file}: unsupported integration key ${key}`);
        assert(Array.isArray(values) && values.length > 0 && values.every(value => typeof value === "string" && identifierPattern.test(value)), `${file}: invalid identifier in ${key}`);
        assert(new Set(values).size === values.length, `${file}: duplicate identifier in ${key}`);
      }
    }
  }
  for (const field of ["website", "download", "sourceCode"]) {
    if (field === "sourceCode" && !app.links?.[field]) continue;
    const url = app.links?.[field];
    assert(typeof url === "string" && new URL(url).protocol === "https:", `${file}: ${field} must be HTTPS`);
  }
}
console.log(`Validated ${files.length} catalog entries.`);

const featured = JSON.parse(readFileSync(new URL("../catalog/collections/creative-top-50.json", import.meta.url), "utf8"));
assert(featured.id === "creative-top-50", "Featured collection id must remain stable");
assert(Array.isArray(featured.ids) && featured.ids.length === 50, "Creative Top 50 must contain exactly 50 apps");
assert(new Set(featured.ids).size === 50, "Creative Top 50 must not include duplicates");
for (const id of featured.ids) assert(ids.has(id), `Creative Top 50 references missing catalog app ${id}`);

import { validateApprovedFeed } from "./community-requests.mjs";
const reviewed = JSON.parse(readFileSync(new URL("../catalog/approved-community.json", import.meta.url), "utf8"));
validateApprovedFeed(reviewed, ids);
console.log("Approved community catalog validated: " + reviewed.apps.length + " apps.");
