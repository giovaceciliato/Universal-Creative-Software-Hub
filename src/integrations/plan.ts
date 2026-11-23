import type { CatalogApp, Platform, PlatformIntegration } from "../types";
import type { DetectionSource } from "./contracts";

/**
 * Declarative hints for future native scanners. No OS calls or execution.
 * A hint can propose a candidate but cannot assert an installed application.
 */
export interface DetectionHint {
  appId: string;
  source: DetectionSource;
  identifier: string;
}

const byPlatform: Record<Platform, readonly (readonly [keyof PlatformIntegration, DetectionSource])[]> = {
  windows: [
    ["executableNames", "executable-path"],
    ["wingetIds", "winget"],
  ],
  macos: [
    ["bundleNames", "macos-bundle"],
    ["homebrewCasks", "homebrew"],
  ],
  linux: [
    ["executableNames", "executable-path"],
    ["desktopIds", "linux-desktop-entry"],
    ["flatpakIds", "flatpak"],
    ["rpmNames", "dnf"],
  ],
};

export function detectionHints(app: CatalogApp, platform: Platform): DetectionHint[] {
  const info = app.integrations?.[platform];
  if (!info) return [];
  const hints: DetectionHint[] = [];
  for (const [key, source] of byPlatform[platform]) {
    for (const identifier of info[key] ?? []) {
      hints.push({ appId: app.id, source, identifier });
    }
  }
  return hints;
}
