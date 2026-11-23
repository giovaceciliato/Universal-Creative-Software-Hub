export type TransferStatus =
  | "queued" | "downloading" | "installing"
  | "completed" | "manual" | "failed" | "interrupted";

export interface TransferTask {
  id: string;
  appId: string;
  appName: string;
  kind: "download" | "installation";
  targetVersion: string;
  installedVersion?: string;
  status: TransferStatus;
  received: number;
  total: number;
  createdAt: number;
  filePath?: string;
  /** GitHub release downloads are non-executable, user-selected release assets. */
  githubRepo?: string;
  githubAssetId?: number;
  message?: string;
}

const validStatuses = new Set<TransferStatus>([
  "queued", "downloading", "installing", "completed", "manual", "failed", "interrupted",
]);

function isTask(value: unknown): value is TransferTask {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string"
    && typeof v.appId === "string"
    && typeof v.appName === "string"
    && (v.kind === "download" || v.kind === "installation")
    && typeof v.targetVersion === "string"
    && typeof v.status === "string"
    && validStatuses.has(v.status as TransferStatus)
    && typeof v.received === "number"
    && Number.isFinite(v.received)
    && typeof v.total === "number"
    && Number.isFinite(v.total)
    && (v.githubRepo === undefined || (typeof v.githubRepo === "string" && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(v.githubRepo)))
    && (v.githubAssetId === undefined || (typeof v.githubAssetId === "number" && Number.isSafeInteger(v.githubAssetId)))
    && typeof v.createdAt === "number"
    && Number.isFinite(v.createdAt);
}

export function loadTransferHistory(): TransferTask[] {
  try {
    const raw = localStorage.getItem("ucsh:transfers:v1");
    if (!raw) return [];
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) return [];
    return stored.filter(isTask).slice(0, 100).map(task => (
      task.status === "queued" || task.status === "downloading" || task.status === "installing"
        ? { ...task, status: "interrupted" as const, message: "The previous session ended. Check the file or installed application before retrying." }
        : task
    ));
  } catch {
    return [];
  }
}

export function saveTransferHistory(tasks: TransferTask[]): void {
  try {
    localStorage.setItem("ucsh:transfers:v1", JSON.stringify(tasks.slice(0, 100)));
  } catch {
    // The current session keeps working if local storage is unavailable.
  }
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

export function transferCounts(tasks: readonly TransferTask[]) {
  return {
    active: tasks.filter(t => t.status === "downloading" || t.status === "installing").length,
    queued: tasks.filter(t => t.status === "queued").length,
    completed: tasks.filter(t => t.status === "completed" || t.status === "manual").length,
    failed: tasks.filter(t => t.status === "failed" || t.status === "interrupted").length,
    versionChanges: tasks.filter(t =>
      t.installedVersion && t.targetVersion !== "repository" &&
      t.installedVersion !== t.targetVersion &&
      (t.status === "queued" || t.status === "downloading" || t.status === "installing")
    ).length,
  };
}
