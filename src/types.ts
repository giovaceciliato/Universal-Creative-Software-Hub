export type Platform = "windows" | "macos" | "linux";
export type PricingModel = "free-open-source" | "freeware";
export type PackageManager = "winget" | "homebrew" | "dnf" | "flatpak";

/**
 * All identifiers are inert metadata. Never interpret a catalog value as a shell command.
 * A native scanner must independently verify every match before reporting "installed".
 */
export interface PlatformIntegration {
  executableNames?: string[];
  bundleNames?: string[];
  desktopIds?: string[];
  wingetIds?: string[];
  homebrewCasks?: string[];
  flatpakIds?: string[];
  rpmNames?: string[];
}

export interface CatalogApp {
  id: string;
  name: string;
  publisher: string;
  description: string;
  categories: string[];
  platforms: Platform[];
  pricingModel: PricingModel;
  icon?: { path: string; source: string; license: string };
  integrations?: Partial<Record<Platform, PlatformIntegration>>;
  links: {
    website: string;
    download: string;
    sourceCode?: string;
  };
}

export interface CustomShortcut {
  id: string;
  name: string;
  target: string;
  kind: "url" | "path";
}
