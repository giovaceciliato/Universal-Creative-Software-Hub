import type { CatalogApp } from "./types";

// Vite bundles the checked-in JSON files. No remote code or installer is run.
const manifests = import.meta.glob("../catalog/apps/*.json", {
  eager: true,
  import: "default",
}) as Record<string, CatalogApp>;

export const catalog: CatalogApp[] = Object.values(manifests).sort((a, b) =>
  a.name.localeCompare(b.name),
);

export const categories = Array.from(
  new Set(catalog.flatMap((app) => app.categories)),
).sort();

export function categoryLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.toUpperCase() === "3D" ? "3D" : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function localPlatform(): "windows" | "linux" | "macos" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("macintosh") || ua.includes("mac os")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

export function validWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
