import { strict as assert } from "node:assert";
import {
  REQUEST_MARKER, readIssueRequest, requestSlug, toApprovedApp, validateApprovedFeed,
} from "./community-requests.mjs";
const sample = {
  name: "Test Creative Tool", publisher: "Test Foundation",
  website: "https://example.org/editor",
  repository: "https://github.com/example-org/test-creative-tool",
  description: "A free creative tool for visual artists and designers.",
  platforms: ["windows", "linux"], pricingModel: "free-open-source",
};
const issue = REQUEST_MARKER + JSON.stringify(sample) + "\n-->\n\nPlease review this application";
assert.equal(readIssueRequest(issue).name, sample.name);
assert.equal(readIssueRequest("Unrelated GitHub issue"), null);
assert.equal(requestSlug("Test Creative Tool", 42), "test-creative-tool");
const app = toApprovedApp(sample, 42);
assert.equal(app.links.download, "https://github.com/example-org/test-creative-tool/releases/latest");
assert.equal(validateApprovedFeed({apps:[app]}), true);
assert.throws(() => validateApprovedFeed({apps:[app, app]}), /duplicate/i);
assert.throws(() => validateApprovedFeed({apps:[app]}, new Set([app.id])), /duplicate/i);
assert.equal(readIssueRequest(REQUEST_MARKER + JSON.stringify({...sample, website:"http://localhost"}) + "\n-->"), null);
assert.equal(readIssueRequest(REQUEST_MARKER + JSON.stringify({...sample, repository:"https://github.com.evil.test/owner/repo"}) + "\n-->"), null);
assert.throws(() => validateApprovedFeed({apps:[{...app, integrations:{linux:{rpmNames:["shell-script"]}}}]}), /integrations/i);
console.log("App request validation tests passed.");
