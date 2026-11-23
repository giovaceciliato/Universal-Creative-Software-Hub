import type { CatalogApp, PackageManager, Platform } from "../types";

/**
 * Native adapters live in Rust or tightly scoped native plugins.
 * This module is *contracts only*: importing it never scans or updates a device.
 */
export type DetectionSource =
  | "winget" | "homebrew" | "dnf" | "flatpak"
  | "windows-registry" | "macos-bundle" | "linux-desktop-entry" | "executable-path";

export type DetectionConfidence = "exact-package-id" | "exact-bundle-id" | "name-only" | "user-confirmed";

export interface InstalledMatch {
  appId: string;
  platform: Platform;
  source: DetectionSource;
  confidence: DetectionConfidence;
  sourceId: string;
  installedVersion?: string;
  launchTarget?: string;
  managedBy?: PackageManager;
}

export type UpdateState =
  | "not-checked" | "current" | "available" | "unknown"
  | "manual" | "unsupported" | "error";

export interface UpdateAssessment {
  appId: string;
  sourceId: string;
  state: UpdateState;
  installedVersion?: string;
  availableVersion?: string;
  provider?: PackageManager | "publisher";
  note?: string;
}

export interface UpdateRequest {
  appId: string;
  sourceId: string;
  manager: PackageManager;
  /** The user must explicitly authorize this particular verified update action. */
  confirmedByUser: true;
}

export interface ScanAdapter {
  readonly platform: Platform;
  /** Read-only discovery, with no app installation, update or code execution. */
  scan(catalog: readonly CatalogApp[]): Promise<readonly InstalledMatch[]>;
}

export interface UpdateAdapter {
  readonly manager: PackageManager;
  /** Returns "unknown" instead of inventing a version or claiming "up to date". */
  assess(match: InstalledMatch): Promise<UpdateAssessment>;
  /** Must verify manager, source ID, and approval against native allowlisted operations. */
  installUpdate(request: UpdateRequest): Promise<void>;
}
