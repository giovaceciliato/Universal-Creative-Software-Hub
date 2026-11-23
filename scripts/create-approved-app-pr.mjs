// GitHub Actions entrypoint; requests create a review PR but are NEVER merged automatically.
import { readIssueRequest, toApprovedApp, validateApprovedFeed } from "./community-requests.mjs";
const repo = process.env.GITHUB_REPOSITORY;
const issueNumber = Number(process.env.ISSUE_NUMBER);
const approver = process.env.APPROVER;
const token = process.env.GITHUB_TOKEN;
if (repo !== "giovaceciliato/Universal-Creative-Software-Hub" ||
    !Number.isSafeInteger(issueNumber) || issueNumber < 1 ||
    !/^[a-zA-Z0-9-]+$/.test(approver ?? "") || !token)
  throw Error("Missing or invalid workflow inputs");

async function api(method, path, body, allow404 = false) {
  const r = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CreativeHub-AppReview",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
  });
  if (allow404 && r.status === 404) return null;
  const content = await r.text();
  if (!r.ok) throw Error("GitHub " + method + " " + path + " returned " + r.status + ": " + content.slice(0, 600));
  return content ? JSON.parse(content) : null;
}

const base = "/repos/" + repo;
const permissions = await api("GET", base + "/collaborators/" + encodeURIComponent(approver) + "/permission");
if (!["admin", "write", "maintain"].includes(permissions.permission))
  throw Error("Only maintainers with write permissions may approve application requests");

const issue = await api("GET", base + "/issues/" + issueNumber);
if (issue.pull_request || issue.state !== "open" || !issue.title.startsWith("[App Request]"))
  throw Error("Approval requires an open application-request issue");
const request = readIssueRequest(issue.body);
if (!request) throw Error("Issue does not contain a valid structured application request");

const approvedFile = await api("GET", base + "/contents/catalog/approved-community.json?ref=main");
const approved = JSON.parse(Buffer.from(approvedFile.content.replace(/\s/g, ""), "base64").toString("utf8"));
const app = toApprovedApp(request, issueNumber);
const bundledFile = await api("GET", base + "/contents/catalog/apps/" + app.id + ".json?ref=main", undefined, true);
if (bundledFile) throw Error("The app ID already exists in the bundled catalog: " + app.id);
const same = approved.apps.some(existing =>
  existing.id === app.id ||
  existing.name.trim().toLowerCase() === app.name.trim().toLowerCase() ||
  existing.links.website.replace(/\/$/, "").toLowerCase() === app.links.website.replace(/\/$/, "").toLowerCase() ||
  (app.links.sourceCode && existing.links.sourceCode &&
    app.links.sourceCode.toLowerCase() === existing.links.sourceCode.toLowerCase()));
if (same) throw Error("This application has already been approved");
approved.apps.push(app);
validateApprovedFeed(approved);

const branch = "app-requests/issue-" + issueNumber;
const existingBranch = await api("GET", base + "/git/ref/heads/" + branch, undefined, true);
if (existingBranch) throw Error("Review branch " + branch + " already exists; update its PR instead");
const head = await api("GET", base + "/git/ref/heads/main");
const commit = await api("GET", base + "/git/commits/" + head.object.sha);
const blob = await api("POST", base + "/git/blobs", {
  content: JSON.stringify(approved, null, 2) + "\n", encoding: "utf-8",
});
const tree = await api("POST", base + "/git/trees", {
  base_tree: commit.tree.sha,
  tree: [{path: "catalog/approved-community.json", mode: "100644", type: "blob", sha: blob.sha}],
});
const nextCommit = await api("POST", base + "/git/commits", {
  message: "catalog: propose " + app.name + " (issue #" + issueNumber + ")",
  tree: tree.sha, parents: [head.object.sha],
});
await api("POST", base + "/git/refs", {ref: "refs/heads/" + branch, sha: nextCommit.sha});
const pr = await api("POST", base + "/pulls", {
  title: "Catalog: add " + app.name + " (#" + issueNumber + ")",
  head: branch,
  base: "main",
  body: [
    "Proposed from #" + issueNumber + ".",
    "",
    "Publisher: " + app.publisher,
    "Homepage: " + app.links.website,
    "Pricing: " + app.pricingModel,
    "Platforms: " + app.platforms.join(", "),
    "",
    "### Maintainer review",
    "- [ ] Verify the publisher, license and official URLs",
    "- [ ] Review supported operating systems and distribution",
    "- [ ] Confirm no duplicate already exists in the bundled catalog or other open PRs",
    "- [ ] Confirm metadata-only integration (no installer privileges)",
    "",
    "Closes #" + issueNumber,
  ].join("\n"),
});
// Dispatch CI explicitly; bot-created PRs do not always trigger standard PR events.
const dispatchWarnings = [];
for (const workflowFile of ["frontend-check.yml", "native-build.yml"]) {
  try {
    await api("POST", base + "/actions/workflows/" + workflowFile + "/dispatches", {ref: branch});
  } catch (error) {
    dispatchWarnings.push(workflowFile + ": " + String(error));
  }
}
await api("POST", base + "/issues/" + issueNumber + "/comments", {
  body: "Request accepted for code review: " + pr.html_url +
    "\n\nThe app will appear in Discover only after the PR has been reviewed, the checks pass and it is merged into main. Native installation is reviewed separately." +
    (dispatchWarnings.length ? "\n\nCI dispatch warnings: " + dispatchWarnings.join("; ") : ""),
});
console.log("Created review PR " + pr.html_url);
