import type { CatalogApp } from "./types";

/** A repository is a download source, never an installer authorization. */
export function catalogDownloadRepo(app: CatalogApp): string | null {
  try {
    const url = new URL(app.links.download);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port ||
      url.username || url.password || url.search || url.hash) return null;
    const match = url.pathname.match(/^\/([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)\/releases(?:\/latest)?\/?$/);
    if (!match || match[1].includes("..") || match[2].includes("..")) return null;
    return `${match[1]}/${match[2]}`;
  } catch { return null; }
}

export function canOfferCatalogInstall(appId: string, installableIds: ReadonlySet<string>): boolean {
  return !appId.startsWith("github:") && installableIds.has(appId);
}
