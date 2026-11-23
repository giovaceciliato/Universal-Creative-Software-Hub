/** GitHub release tracking is metadata. It cannot authorize OS installation. */
export interface GitHubAsset {
  id: number;
  name: string;
  sizeBytes: number;
  sha256Available: boolean;
}
export interface GitHubRelease {
  tag: string;
  publishedAt?: string | null;
  url: string;
  assets: GitHubAsset[];
}
export interface GitHubProjectInfo {
  repo: string;
  name: string;
  description: string;
  url: string;
  latest: GitHubRelease | null;
}
export interface WatchedGitHubProject extends GitHubProjectInfo {
  /** Last release whose asset the user downloaded through Creative Hub. */
  downloadedTag?: string;
  /** Version explicitly entered by the user. Never inferred from a file download. */
  installedTag?: string;
  checkedAt?: number;
  checkError?: string;
}

const isRepo = (value: unknown): value is string =>
  typeof value === "string" && value.length < 205 &&
  /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) &&
  !value.includes("..");
const isRelease = (value: unknown): value is GitHubRelease => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.tag === "string" && item.tag.length <= 120 &&
    typeof item.url === "string" && item.url.startsWith("https://github.com/") &&
    Array.isArray(item.assets) && item.assets.length <= 100 &&
    item.assets.every(asset =>
      asset !== null && typeof asset === "object" &&
      typeof asset.id === "number" && Number.isSafeInteger(asset.id) &&
      typeof asset.name === "string" && asset.name.length <= 120 &&
      typeof asset.sizeBytes === "number" && Number.isFinite(asset.sizeBytes) &&
      typeof asset.sha256Available === "boolean");
};

export function loadGithubProjects(): WatchedGitHubProject[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem("ucsh:github-projects:v1") ?? "[]");
    if (!Array.isArray(stored)) return [];
    const seen = new Set<string>();
    return stored.filter((item: unknown): item is WatchedGitHubProject => {
      if (!item || typeof item !== "object") return false;
      const value = item as Record<string, unknown>;
      if (!isRepo(value.repo) || seen.has(value.repo.toLowerCase())) return false;
      if (typeof value.name !== "string" || typeof value.description !== "string" ||
        typeof value.url !== "string" || !value.url.startsWith("https://github.com/") ||
        !(value.latest == null || isRelease(value.latest))) return false;
      seen.add(value.repo.toLowerCase());
      return true;
    }).slice(0, 25);
  } catch { return []; }
}

export function saveGithubProjects(projects: WatchedGitHubProject[]): void {
  try { localStorage.setItem("ucsh:github-projects:v1", JSON.stringify(projects.slice(0, 25))); }
  catch { /* Storage may be disabled. */ }
}

/** Comparison is *release difference*, NOT a claim that an installed app is outdated. */
export function githubReleaseStatus(project: WatchedGitHubProject):
  "not-checked" | "no-release" | "new-since-download" | "different-from-recorded" | "same" {
  if (!project.latest) return project.checkedAt ? "no-release" : "not-checked";
  if (project.downloadedTag && project.latest.tag !== project.downloadedTag)
    return "new-since-download";
  if (project.installedTag && project.latest.tag !== project.installedTag)
    return "different-from-recorded";
  if (!project.downloadedTag && !project.installedTag) return "not-checked";
  return "same";
}
