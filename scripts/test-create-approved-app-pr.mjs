import { test } from "node:test";
import assert from "node:assert/strict";
import { toApprovedApp } from "./community-requests.mjs";

const request = { name: "BIMCraft", publisher: "IPedrax", website: "https://getcadcraft.com/apps/bimcraft", repository: "https://github.com/IPedrax/BIMCraft", description: "BIM program", platforms: ["linux"], pricingModel: "free-open-source" };
let invocation = 0;

function fixture(options = {}) {
  const state = { branch: false, pr: null, comments: [], runs: new Set(), writes: [], ...options };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
  state.fetch = async (url, init) => {
    const path = new URL(url).pathname.replace("/repos/giovaceciliato/Universal-Creative-Software-Hub", "");
    const body = init.body && JSON.parse(init.body);
    const method = init.method;
    if (method !== "GET") state.writes.push({ method, path, body });
    if (path.endsWith("/permission")) return reply({ permission: state.permission || "write" });
    if (path === "/pulls" && method === "GET") return reply(state.pr ? [state.pr] : []);
    if (path === "/issues/12") return reply({ state: "open", title: "[App Request] BIMCraft", body: "<!-- ucsh-app-request:v1\n" + JSON.stringify(request) + "\n-->" });
    if (path === "/git/ref/heads/app-requests/issue-12") return state.branch ? reply({ object: { sha: "review-sha" } }) : reply({}, 404);
    if (path === "/contents/catalog/approved-community.json") return reply({ content: Buffer.from(JSON.stringify({ apps: state.duplicate ? [toApprovedApp(request, 12)] : [] })).toString("base64") });
    if (path === "/contents/catalog/apps/bimcraft.json") return reply({}, 404);
    if (path === "/git/ref/heads/main") return reply({ object: { sha: "main-sha" } });
    if (path === "/git/commits/main-sha") return reply({ tree: { sha: "tree-sha" } });
    if (["/git/blobs", "/git/trees", "/git/commits"].includes(path)) return reply({ sha: "new-sha" });
    if (path === "/git/refs") { state.branch = true; return reply({}, state.refRace ? 422 : 201); }
    if (path === "/pulls" && method === "POST") {
      if (state.denyPR) return reply({ message: "Forbidden" }, 403);
      state.pr = { state: "open", html_url: "https://github.com/example/repo/pull/13" };
      return reply(state.pr, state.prRace ? 422 : 201);
    }
    const workflow = path.match(/^\/actions\/workflows\/([^/]+)\/(runs|dispatches)$/);
    if (workflow) {
      if (workflow[2] === "runs") return reply({ workflow_runs: state.runs.has(workflow[1]) ? [{ head_sha: "review-sha" }] : [] });
      if (state.denyCI === workflow[1]) return reply({}, 403);
      state.runs.add(workflow[1]); return reply({});
    }
    if (path === "/issues/12/comments") {
      if (method === "GET") return reply(state.comments);
      state.comments.push(body); return reply(body, 201);
    }
    throw Error("Unexpected API request: " + method + " " + path);
  };
  return state;
}

async function run(state) {
  const previousFetch = globalThis.fetch;
  const testEnv = { GITHUB_REPOSITORY: "giovaceciliato/Universal-Creative-Software-Hub", ISSUE_NUMBER: "12", APPROVER: "maintainer", GITHUB_TOKEN: "test-token" };
  const previousEnv = Object.fromEntries(Object.keys(testEnv).map(key => [key, process.env[key]]));
  Object.assign(process.env, testEnv);
  globalThis.fetch = state.fetch;
  try { await import("./create-approved-app-pr.mjs?test=" + ++invocation); }
  finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("fresh approval and repeated retry create one branch, PR, comment and CI run per workflow", async () => {
  const state = fixture(); await run(state);
  const count = state.writes.length; await run(state);
  assert.equal(state.writes.length, count);
  assert.equal(state.writes.filter(x => x.path === "/git/refs").length, 1);
  assert.equal(state.writes.filter(x => x.path === "/pulls").length, 1);
  assert.equal(state.comments.length, 1); assert.equal(state.runs.size, 2);
});
test("403 after branch creation is recoverable without rewriting the branch", async () => {
  const state = fixture({ denyPR: true });
  await assert.rejects(run(state), /Review branch preserved/);
  assert.equal(state.branch, true);
  const before = state.writes.filter(x => x.path.startsWith("/git/")).length;
  state.denyPR = false; await run(state);
  assert.equal(state.writes.filter(x => x.path.startsWith("/git/")).length, before);
  assert.equal(state.pr.state, "open");
});
test("existing branch is reused even when main already contains a duplicate", async () => {
  const state = fixture({ branch: true, duplicate: true }); await run(state);
  assert.equal(state.writes.some(x => x.path.startsWith("/git/")), false);
});
test("closed or merged review is a successful no-op", async () => {
  for (const merged_at of [null, "2026-11-23"]) {
    const state = fixture({ pr: { state: "closed", merged_at, html_url: "closed-pr" } });
    await run(state); assert.deepEqual(state.writes, []);
  }
});
test("missing CI dispatch is retried without duplicate successful dispatches or comments", async () => {
  const state = fixture({ denyCI: "native-build.yml" }); await run(state);
  state.denyCI = null; await run(state);
  assert.equal(state.runs.size, 2); assert.equal(state.comments.length, 1);
  assert.equal(state.writes.filter(x => x.path.endsWith("frontend-check.yml/dispatches")).length, 1);
});
test("concurrent ref and PR creation are recovered after 422", async () => {
  const state = fixture({ refRace: true, prRace: true }); await run(state);
  assert.equal(state.pr.state, "open");
  assert.equal(state.writes.some(x => x.method === "PATCH" || x.method === "DELETE"), false);
});
test("new duplicate and unauthorized approvals still fail before mutation", async () => {
  for (const options of [{ duplicate: true }, { permission: "read" }]) {
    const state = fixture(options); await assert.rejects(run(state)); assert.deepEqual(state.writes, []);
  }
});
