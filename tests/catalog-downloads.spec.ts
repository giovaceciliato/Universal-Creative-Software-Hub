import { expect, test, type Page } from "@playwright/test";
import { catalogDownloadRepo, canOfferCatalogInstall } from "../src/catalogDownloads";
import type { CatalogApp } from "../src/types";

async function mockDesktop(page: Page, mode: "download" | "missing" | "offline" | "failure" = "download", installable = true) {
  await page.addInitScript(({ mode, installable }) => {
    const w = window as any;
    w.isTauri = true;
    w.calls = [];
    const callbacks = new Map();
    const listeners = new Map();
    let id = 0;
    localStorage.setItem("ucsh:shortcuts:v1", JSON.stringify([
      { id: "private-test", name: "My private tool", kind: "url", target: "https://example.org/private" },
    ]));
    w.__TAURI_INTERNALS__ = {
      transformCallback: (fn: Function) => { callbacks.set(++id, fn); return id; },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: async (command: string, args: any) => {
        w.calls.push({ command, args });
        if (command === "plugin:event|listen") { listeners.set(args.event, args.handler); return ++id; }
        if (command === "plugin:event|unlisten") return;
        if (command === "installable_app_ids") return installable ? ["blender", "bimcraft"] : ["blender"];
        if (command === "available_downloads") return [];
        if (command === "refresh_approved_apps" || command === "refresh_artcraft_catalog") throw new Error("Offline feed");
        if (command === "resolve_catalog_download") {
          if (mode === "offline") throw new Error("HTTP 403 / rate limit");
          if (mode === "missing") return null;
          return { repo: "IPedrax/BIMCraft", version: "v0.12.0", asset: { id: 123, name: "bimcraft-0.12.0-linux-x86_64.rpm", sizeBytes: 1000, sha256Available: true } };
        }
        if (command === "download_github_asset") {
          return new Promise((resolve, reject) => {
            w.finishDownload = () => mode === "failure" ? reject(new Error("SHA-256 mismatch")) : resolve({
              fileName: "bimcraft.rpm", savedPath: "/Downloads/bimcraft.rpm", checksumVerified: true,
            });
            w.emitProgress = () => callbacks.get(listeners.get("github-download-progress"))?.({
              payload: { repo: "IPedrax/BIMCraft", received: 500, total: 1000 },
            });
          });
        }
        if (command === "preview_install") return {
          appId: "bimcraft", version: "v0.12.0", method: "Fedora DNF (RPM)",
          source: "https://github.com/IPedrax/BIMCraft/releases/tag/v0.12.0",
          requiresAuthorization: true, manualSteps: false, message: "PolicyKit authorization required",
        };
        if (command === "install_app") return { appId: "bimcraft", status: "installed", message: "Command completed" };
        if (command === "scan_installed_apps") return { platform: "linux", matches: [], checkedSources: [], warnings: [] };
        if (command.startsWith("plugin:opener|")) return;
        throw new Error(`Unexpected command: ${command}`);
      },
    };
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  }, { mode, installable });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Search software" }).fill("BIMCraft");
}

test("approved snapshot survives offline feed; tracks progress and waits for Install confirmation", async ({ page }) => {
  await mockDesktop(page);
  await expect(page.getByRole("button", { name: "Download BIMCraft", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Download BIMCraft", exact: true }).click();
  await expect(page.getByText("v0.12.0", { exact: true })).toBeVisible();
  await page.waitForFunction(() => (window as any).emitProgress);
  await page.evaluate(() => (window as any).emitProgress());
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  await page.evaluate(() => (window as any).finishDownload());
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => (window as any).calls.some((c: any) => c.command === "install_app"))).toBe(false);
  await page.getByRole("button", { name: "Installa con autorizzazione OS" }).click();
  await expect(page.getByText("PolicyKit authorization required")).toBeVisible();
  expect(await page.evaluate(() => (window as any).calls.some((c: any) => c.command === "install_app"))).toBe(false);
  await page.getByRole("button", { name: "Confirm & install" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).calls.filter((c: any) => c.command === "install_app").length)).toBe(1);
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem("ucsh:transfers:v1")!));
  expect(history.find((t: any) => t.kind === "download").appId).toBe("bimcraft");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ucsh:shortcuts:v1")!)[0].name)).toBe("My private tool");
  expect(await page.evaluate(() => localStorage.getItem("ucsh:github-projects:v1"))).toBe("[]");
});

for (const mode of ["missing", "offline"] as const) {
  test(`${mode} release uses official source without claiming a tracked download`, async ({ page }) => {
    await mockDesktop(page, mode, false);
    await expect(page.getByRole("button", { name: "Install BIMCraft", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Download BIMCraft", exact: true }).click();
    await expect(page.getByText("Manual action required", { exact: true })).toBeVisible();
    await expect(page.getByText(/External progress and completion cannot be tracked/)).toBeVisible();
    const calls = await page.evaluate(() => (window as any).calls);
    expect(calls.some((c: any) => c.command === "download_github_asset" || c.command === "install_app")).toBe(false);
    expect(calls.find((c: any) => c.command === "plugin:opener|open_url").args.url).toBe("https://github.com/IPedrax/BIMCraft/releases/latest");
  });
}

test("failed integrity verification never offers post-download installation", async ({ page }) => {
  await mockDesktop(page, "failure");
  await page.getByRole("button", { name: "Download BIMCraft", exact: true }).click();
  await page.waitForFunction(() => (window as any).finishDownload);
  await page.evaluate(() => (window as any).finishDownload());
  await expect(page.getByText(/SHA-256 mismatch/)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).calls.some((c: any) => c.command === "install_app"))).toBe(false);
});

test("download without a curated installer stays manual", async ({ page }) => {
  await mockDesktop(page, "download", false);
  await page.getByRole("button", { name: "Download BIMCraft", exact: true }).click();
  await page.waitForFunction(() => (window as any).finishDownload);
  await page.evaluate(() => (window as any).finishDownload());
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Installa con autorizzazione OS" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Istruzioni ufficiali" })).toBeVisible();
  await page.getByRole("button", { name: "Non ora" }).click();
  expect(await page.evaluate(() => (window as any).calls.some((c: any) => c.command === "install_app"))).toBe(false);
});

test("download URL parsing and private GitHub identity cannot grant install authority", () => {
  const app = (download: string) => ({ links: { download } }) as CatalogApp;
  expect(catalogDownloadRepo(app("https://github.com/IPedrax/BIMCraft/releases/latest"))).toBe("IPedrax/BIMCraft");
  for (const url of [
    "http://github.com/IPedrax/BIMCraft/releases/latest",
    "https://github.com.evil.test/IPedrax/BIMCraft/releases/latest",
    "https://user@github.com/IPedrax/BIMCraft/releases/latest",
    "https://github.com/IPedrax/BIMCraft/releases/latest?token=bad",
    "https://github.com/IPedrax/BIMCraft/releases/download/v0.12.0/evil.exe",
    "javascript:alert(1)",
  ]) expect(catalogDownloadRepo(app(url))).toBeNull();
  expect(canOfferCatalogInstall("bimcraft", new Set(["bimcraft"]))).toBe(true);
  expect(canOfferCatalogInstall("unreviewed", new Set(["bimcraft"]))).toBe(false);
  expect(canOfferCatalogInstall("github:IPedrax/BIMCraft", new Set(["github:IPedrax/BIMCraft"]))).toBe(false);
});

test("browser catalog includes existing apps and approved Download without native privileges", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Download BIMCraft", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Blender", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Krita", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Install BIMCraft", exact: true })).toHaveCount(0);
});
