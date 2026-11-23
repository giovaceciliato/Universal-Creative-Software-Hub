// Metadata-only review helpers. New catalog entries never authorize installation.
export const REQUEST_MARKER = "<!-- ucsh-app-request:v1\n";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLATFORMS = new Set(["windows", "macos", "linux", "web"]);
const PRICING = new Set(["free-open-source", "freeware"]);

export function safeHttps(input) {
  if (typeof input !== "string" || input.length > 350) return false;
  try {
    const url = new URL(input);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.port && url.hostname.includes(".") &&
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase()) &&
      !/\.(localhost|local|internal)$/i.test(url.hostname);
  } catch { return false; }
}

function githubRepo(input) {
  if (!safeHttps(input)) return false;
  const url = new URL(input);
  return url.hostname === "github.com" &&
    /^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/.test(url.pathname);
}

export function validateRequest(req) {
  if (!req || typeof req !== "object") return false;
  return typeof req.name === "string" && req.name.trim().length > 0 &&
    req.name.length <= 80 && !/[<>\r\n]/.test(req.name) &&
    typeof req.publisher === "string" && req.publisher.trim().length > 0 &&
    req.publisher.length <= 100 && !/[<>\r\n]/.test(req.publisher) &&
    safeHttps(req.website) &&
    (req.repository === "" || githubRepo(req.repository)) &&
    typeof req.description === "string" &&
    req.description.trim().length >= 10 && req.description.length <= 240 &&
    !/[<>]/.test(req.description) &&
    Array.isArray(req.platforms) && req.platforms.length >= 1 &&
    req.platforms.length <= 4 && new Set(req.platforms).size === req.platforms.length &&
    req.platforms.every(platform => PLATFORMS.has(platform)) &&
    PRICING.has(req.pricingModel);
}

export function readIssueRequest(body) {
  if (typeof body !== "string") return null;
  const start = body.indexOf(REQUEST_MARKER);
  if (start < 0) return null;
  const after = start + REQUEST_MARKER.length;
  const end = body.indexOf("\n-->", after);
  if (end < 0 || end - after > 3000) return null;
  try {
    const parsed = JSON.parse(body.slice(after, end));
    return validateRequest(parsed) ? parsed : null;
  } catch { return null; }
}

export function requestSlug(name, issueNumber) {
  const slug = String(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 58).replace(/-+$/g, "");
  return SLUG.test(slug) ? slug : "app-request-" + issueNumber;
}

export function toApprovedApp(request, issueNumber) {
  if (!validateRequest(request)) throw Error("Invalid app request fields");
  const source = request.repository || undefined;
  return {
    id: requestSlug(request.name, issueNumber),
    name: request.name.trim(),
    publisher: request.publisher.trim(),
    description: request.description.trim(),
    categories: ["community"],
    platforms: request.platforms,
    pricingModel: request.pricingModel,
    links: {
      website: request.website,
      download: source ? source.replace(/\/$/, "") + "/releases/latest" : request.website,
      ...(source ? { sourceCode: source } : {}),
    },
  };
}

export function validateApprovedFeed(feed, bundledIds = new Set()) {
  if (!feed || typeof feed !== "object" || !Array.isArray(feed.apps) || feed.apps.length > 250)
    throw Error("Approved feed must contain up to 250 apps");
  const seenIds = new Set();
  const seenSites = new Set();
  const seenNames = new Set();
  for (const app of feed.apps) {
    if (!app || !SLUG.test(app.id) || app.id.length > 80 ||
        seenIds.has(app.id) || bundledIds.has(app.id))
      throw Error("Invalid or duplicate approved app ID: " + app?.id);
    seenIds.add(app.id);
    if (typeof app.name !== "string" || !app.name.trim() || app.name.length > 100 ||
        typeof app.publisher !== "string" || !app.publisher.trim() || app.publisher.length > 100 ||
        typeof app.description !== "string" || app.description.length < 10 || app.description.length > 240)
      throw Error("Invalid approved app description: " + app.id);
    if (!Array.isArray(app.categories) || app.categories.length === 0 ||
        app.categories.length > 12 || app.categories.some(v => typeof v !== "string" || !SLUG.test(v)))
      throw Error("Invalid approved categories: " + app.id);
    if (!Array.isArray(app.platforms) || app.platforms.length === 0 ||
        app.platforms.length > 4 || new Set(app.platforms).size !== app.platforms.length ||
        app.platforms.some(v => !PLATFORMS.has(v)) || !PRICING.has(app.pricingModel))
      throw Error("Invalid approved platforms/pricing: " + app.id);
    if (!app.links || !safeHttps(app.links.website) || !safeHttps(app.links.download) ||
        (app.links.sourceCode !== undefined && !githubRepo(app.links.sourceCode)))
      throw Error("Invalid approved website/download link: " + app.id);
    const website = new URL(app.links.website);
    const siteKey = website.hostname.toLowerCase() +
      website.pathname.replace(/\/$/, "").toLowerCase();
    if (seenSites.has(siteKey) || seenNames.has(app.name.trim().toLowerCase()))
      throw Error("Duplicate approved name or website: " + app.name);
    seenSites.add(siteKey);
    seenNames.add(app.name.trim().toLowerCase());
    if (app.integrations || app.icon || Object.keys(app).some(k =>
      !["id", "name", "publisher", "description", "categories", "platforms", "pricingModel", "links"].includes(k)))
      throw Error("Native integrations or unexpected fields not allowed: " + app.id);
  }
  return true;
}
