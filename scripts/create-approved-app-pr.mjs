// GitHub Actions entrypoint; requests create a review PR but are NEVER merged automatically.
import { readIssueRequest, toApprovedApp, validateApprovedFeed } from "./community-requests.mjs";
async function main() {
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
    if (!r.ok) {
      const error = Error("GitHub " + method + " " + path + " returned " + r.status + ": " + content.slice(0, 600));
      error.status = r.status;
      throw error;
    }
    return content ? JSON.parse(content) : null;
  }

  const base = "/repos/" + repo;
  const permissions = await api("GET", base + "/collaborators/" + encodeURIComponent(approver) + "/permission");
  if (!["admin", "write", "maintain"].includes(permissions.permission))
    throw Error("Only maintainers with write permissions may approve application requests");

  const branch = "app-requests/issue-" + issueNumber;
  const pullsPath = base + "/pulls?state=all&head=" + encodeURIComponent(repo.split("/")[0] + ":" + branch) + "&base=main&per_page=100";
  async function findReview() {
    const pulls = await api("GET", pullsPath);
    return pulls.find(pr => pr.state === "open") || pulls[0];
  }
  let pr = await findReview();
  // A completed or declined review must never be recreated by a retry.
  if (pr && pr.state !== "open") {
    console.log("Review PR already closed: " + pr.html_url);
    return;
  }

  const issue = await api("GET", base + "/issues/" + issueNumber);
  if (issue.pull_request || issue.state !== "open" || !issue.title.startsWith("[App Request]"))
    throw Error("Approval requires an open application-request issue");
  const request = readIssueRequest(issue.body);
  if (!request) throw Error("Issue does not contain a valid structured application request");
  const app = toApprovedApp(request, issueNumber);

  if (!pr) {
    const existingBranch = await api("GET", base + "/git/ref/heads/" + branch, undefined, true);
    if (!existingBranch) {
      const approvedFile = await api("GET", base + "/contents/catalog/approved-community.json?ref=main");
      const approved = JSON.parse(Buffer.from(approvedFile.content.replace(/\s/g, ""), "base64").toString("utf8"));
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
      try {
        await api("POST", base + "/git/refs", {ref: "refs/heads/" + branch, sha: nextCommit.sha});
      } catch (error) {
        // Another run may have created the ref. Never overwrite its work.
        if (error.status !== 422 || !await api("GET", base + "/git/ref/heads/" + branch, undefined, true)) throw error;
      }
    }
    try {
      pr = await api("POST", base + "/pulls", {
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
    } catch (error) {
      if (error.status === 422) pr = await findReview();
      if (!pr) {
        if (error.status === 403) error.message +=
          " Review branch preserved: " + branch +
          ". Enable Settings > Actions > General > Allow GitHub Actions to create and approve pull requests, then retry.";
        throw error;
      }
    }
  }
  if (pr.state !== "open") {
    console.log("Review PR already closed: " + pr.html_url);
    return;
  }
  const reviewHead = await api("GET", base + "/git/ref/heads/" + branch);
  // Dispatch CI explicitly; bot-created PRs do not always trigger standard PR events.
  const dispatchWarnings = [];
  for (const workflowFile of ["frontend-check.yml", "native-build.yml"]) {
    try {
      const workflowPath = base + "/actions/workflows/" + workflowFile;
      const runs = await api("GET", workflowPath + "/runs?branch=" + encodeURIComponent(branch) + "&head_sha=" + reviewHead.object.sha + "&per_page=100");
      // Resume missing dispatches, without duplicating queued, running or finished CI.
      if (!runs.workflow_runs.some(run => run.head_sha === reviewHead.object.sha))
        await api("POST", workflowPath + "/dispatches", {ref: branch});
    } catch (error) {
      dispatchWarnings.push(workflowFile + ": " + String(error));
    }
  }
  const commentsPath = base + "/issues/" + issueNumber + "/comments";
  let notified = false;
  for (let page = 1; ; page++) {
    const comments = await api("GET", commentsPath + "?per_page=100&page=" + page);
    notified ||= comments.some(comment => comment.body?.includes("Request accepted for code review: " + pr.html_url));
    if (notified || comments.length < 100) break;
  }
  if (!notified) await api("POST", commentsPath, {
    body: "Request accepted for code review: " + pr.html_url +
      "\n\nThe app will appear in Discover only after the PR has been reviewed, the checks pass and it is merged into main. Native installation is reviewed separately." +
      (dispatchWarnings.length ? "\n\nCI dispatch warnings: " + dispatchWarnings.join("; ") : ""),
  });
  for (const warning of dispatchWarnings) console.warn("CI dispatch warning: " + warning);
  console.log("Review PR ready: " + pr.html_url);
}

await main();

