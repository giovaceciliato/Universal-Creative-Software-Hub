import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as chooseFile } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowDownToLine, ArrowUpRight, Check, CheckCircle2, Compass, ExternalLink,
  FolderOpen, Heart, Info, Library, Link2, Package, Plus, RefreshCw,
  Search, Settings2, Trash2, X,
} from "lucide-react";
import { catalog as bundledCatalog, categoryLabel, localPlatform, validWebUrl } from "./catalog";
import approvedSnapshot from "../catalog/approved-community.json";
import { catalogDownloadRepo, canOfferCatalogInstall } from "./catalogDownloads";
import featured50 from "../catalog/collections/creative-top-50.json";
import { loadTransferHistory, saveTransferHistory, formatBytes, transferCounts, type TransferTask } from "./downloadActivity";
import { loadGithubProjects, saveGithubProjects, githubReleaseStatus, type GitHubProjectInfo, type GitHubRelease, type GitHubAsset, type WatchedGitHubProject } from "./githubTracking";
import { emptyAppRequest, validateAppRequest, localRequestMatches, issueCreationUrl, type AppRequestDraft, type RequestCheckResult, type AppRequestMatch } from "./appRequests";
import type { CatalogApp, CustomShortcut, Platform } from "./types";
import type { InstalledMatch } from "./integrations/contracts";

type View = "discover" | "library" | "private" | "installed" | "updates" | "downloads";
interface SignedCraftApp { id: string; name: string; tagline: string; publisher: string; repo: string; kind: "official" | "community"; }
interface SignedCraftCatalog { apps: SignedCraftApp[]; rejected: number; source: string; }
type ShortcutDraft = { name: string; kind: "url" | "path"; target: string };
const emptyDraft: ShortcutDraft = { name: "", kind: "url", target: "" };
interface ScanReport {
  platform: string;
  matches: InstalledMatch[];
  checkedSources: string[];
  warnings: string[];
}
interface DownloadOffer {
  appId: string;
  version: string;
  fileName: string;
  sizeBytes: number;
  checksumAvailable: boolean;
}
interface DownloadResult {
  fileName: string;
  savedPath: string;
  sha256: string;
  checksumVerified: boolean;
}
interface PostDownloadPrompt {
  task: TransferTask;
  fileName: string;
  savedPath: string;
  checksumVerified: boolean;
}
interface DownloadProgress { appId: string; received: number; total: number; }
interface InstallPlan {
  appId: string;
  version: string;
  method: string;
  source: string;
  requiresAuthorization: boolean;
  manualSteps: boolean;
  sizeBytes?: number;
  message: string;
}
interface InstallOutcome { appId: string; status: "installed" | "manual-step"; message: string; }
interface InstallProgress { appId: string; received: number; total: number; }

const native = isTauri();
const featuredSoftwareIds = new Set<string>(featured50.ids);
const nativeInstallIds = new Set(
  bundledCatalog.filter(app =>
    app.id === "blender" || app.id === "krita" || app.publisher === "ArtCraft Team",
  ).map(app => app.id),
);
const devicePlatform = localPlatform();
const platforms: Record<Platform, string> = {
  windows: "Windows", macos: "macOS", linux: "Fedora / Linux", web: "Web",
};

function useStored<T>(key: string, initial: T, guard: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      const decoded: unknown = raw ? JSON.parse(raw) : initial;
      return guard(decoded) ? decoded : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage unavailable. */ }
  }, [value, key]);
  return [value, setValue] as const;
}

const stringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(x => typeof x === "string");

const shortcutList = (v: unknown): v is CustomShortcut[] =>
  Array.isArray(v) && v.every(x => {
    if (!x || typeof x !== "object") return false;
    const s = x as Record<string, unknown>;
    return typeof s.id === "string" && typeof s.name === "string" &&
      typeof s.target === "string" && (s.kind === "url" || s.kind === "path");
  });

function AppIcon({ app, size = "md" }: { app: CatalogApp; size?: "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`app-icon app-icon-${size}`} aria-hidden="true">
      {app.icon && !failed ?
        <img src={app.icon.path} alt="" loading="lazy" onError={() => setFailed(true)} /> :
        <Package size={size === "lg" ? 32 : 23} strokeWidth={1.5} />}
    </div>
  );
}

const nav: { key: View; label: string; icon: typeof Compass }[] = [
  { key: "discover", label: "Discover", icon: Compass },
  { key: "library", label: "My Library", icon: Library },
  { key: "private", label: "Libreria privata", icon: FolderOpen },
  { key: "installed", label: "Installed", icon: CheckCircle2 },
  { key: "downloads", label: "Downloads", icon: ArrowDownToLine },
  { key: "updates", label: "Updates", icon: RefreshCw },
];

export default function App() {
  const [view, setView] = useState<View>("discover");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState<AppRequestDraft>(emptyAppRequest);
  const [requestErrors, setRequestErrors] = useState("");
  const [requestChecking, setRequestChecking] = useState(false);
  const [requestCheck, setRequestCheck] = useState<{ signature: string; matches: AppRequestMatch[]; truncated: boolean } | null>(null);
  const [approvedApps, setApprovedApps] = useState<CatalogApp[]>(approvedSnapshot.apps as CatalogApp[]);
  const [approvedStatus, setApprovedStatus] = useState<"loading" | "verified" | "offline">("offline");
  const [approvedError, setApprovedError] = useState("");
  const approvedRefreshStarted = useRef(false);
  const [githubProjects, setGithubProjects] = useState<WatchedGitHubProject[]>(loadGithubProjects);
  const [addingGithub, setAddingGithub] = useState(false);
  const [githubDraftUrl, setGithubDraftUrl] = useState("");
  const [githubError, setGithubError] = useState("");
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubRefreshing, setGithubRefreshing] = useState(false);
  const [selectedGithubAssets, setSelectedGithubAssets] = useState<Record<string, number>>({});
  const githubRefreshStarted = useRef(false);
  const [installableIds, setInstallableIds] = useState<Set<string>>(nativeInstallIds);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [favorites, setFavorites] = useStored<string[]>("ucsh:favorites:v1", [], stringList);
  const [shortcuts, setShortcuts] = useStored<CustomShortcut[]>("ucsh:shortcuts:v1", [], shortcutList);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ShortcutDraft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [notification, setNotification] = useState("");
  const [scanReport, setScanReport] = useState<ScanReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [downloadOffers, setDownloadOffers] = useState<DownloadOffer[]>([]);
  const resolvingDownloads = useRef(new Set<string>());
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [completedDownloads, setCompletedDownloads] = useState<Record<string, DownloadResult>>({});
  const [transfers, setTransfers] = useState<TransferTask[]>(loadTransferHistory);
  const [postDownloadPrompts, setPostDownloadPrompts] = useState<PostDownloadPrompt[]>([]);
  const downloadWorker = useRef(false);
  const activeDownloadId = useRef<string | null>(null);
  const activeInstallId = useRef<string | null>(null);
  const catalogRefreshStarted = useRef(false);
  const [signedApps, setSignedApps] = useState<SignedCraftApp[] | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "verified" | "offline">("offline");
  const [catalogError, setCatalogError] = useState("");
  const [installPlan, setInstallPlan] = useState<InstallPlan | null>(null);
  const [checkingInstall, setCheckingInstall] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<number | null>(null);
  const [installError, setInstallError] = useState("");

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    void invoke<string[]>("installable_app_ids")
      .then(ids => { if (!cancelled) setInstallableIds(new Set(ids)); })
      .catch(() => { /* Keep the built-in allowlist if this command is unavailable. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let unlistenInstall: (() => void) | undefined;
    let unlistenGithub: (() => void) | undefined;
    void invoke<DownloadOffer[]>("available_downloads")
      .then(offers => { if (!disposed) setDownloadOffers(offers); })
      .catch(() => { if (!disposed) setDownloadOffers([]); });
    void listen<DownloadProgress>("catalog-download-progress", event => {
      const taskId = activeDownloadId.current;
      if (taskId && !disposed) {
        setTransfers(xs => xs.map(x => x.id === taskId ? {
          ...x, received: event.payload.received, total: event.payload.total,
          status: "downloading" as const,
        } : x));
      }
    }).then(remove => {
      if (disposed) remove();
      else unlisten = remove;
    }).catch(() => {});
    void listen<{repo: string; received: number; total: number}>("github-download-progress", event => {
      const id = activeDownloadId.current;
      if (id && !disposed) setTransfers(xs => xs.map(x => x.id === id && x.githubRepo === event.payload.repo ? {
        ...x, received: event.payload.received, total: event.payload.total,
        status: "downloading" as const,
      } : x));
    }).then(remove => {
      if (disposed) remove(); else unlistenGithub = remove;
    }).catch(() => {});
    void listen<InstallProgress>("creative-install-progress", event => {
      const taskId = activeInstallId.current;
      if (taskId && !disposed) {
        setTransfers(xs => xs.map(x => x.id === taskId ? {
          ...x, received: event.payload.received, total: event.payload.total,
          status: "installing" as const,
        } : x));
      }
      if (!disposed && event.payload.total > 0) {
        setInstallProgress(Math.min(100, Math.round(100 * event.payload.received / event.payload.total)));
      }
    }).then(remove => {
      if (disposed) remove();
      else unlistenInstall = remove;
    }).catch(() => {});
    return () => { disposed = true; unlisten?.(); unlistenInstall?.(); unlistenGithub?.(); };
  }, []);

  useEffect(() => { saveTransferHistory(transfers); }, [transfers]);
  useEffect(() => { saveGithubProjects(githubProjects); }, [githubProjects]);

  const catalog = useMemo<CatalogApp[]>(() => {
    const merged = new Map<string, CatalogApp>(bundledCatalog.map(app => [app.id, app]));
    if (signedApps) for (const item of signedApps) {
      const existing = merged.get(item.id);
      if (existing) {
        if (existing.links.sourceCode === `https://github.com/${item.repo}`) {
          merged.set(item.id, { ...existing, description: item.tagline || existing.description });
        }
        continue;
      }
      merged.set(item.id, {
        id: item.id, name: item.name, publisher: item.publisher,
        description: item.tagline || "ArtCraft Launcher catalog application",
        categories: ["creative-tools"],
        platforms: ["windows", "macos", "linux"],
        pricingModel: "free-open-source",
        links: {
          website: item.kind === "official"
            ? `https://getartcraft.com/apps/${item.id}`
            : `https://github.com/${item.repo}`,
          download: `https://github.com/${item.repo}/releases/latest`,
          sourceCode: `https://github.com/${item.repo}`,
        },
      });
    }
    // Only the maintainer-reviewed file on the repository's main branch is used.
    // Neither approved entries nor user requests can create native install commands.
    for (const item of approvedApps) if (!merged.has(item.id)) merged.set(item.id, item);
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [signedApps, approvedApps]);
  const categories = useMemo(() => [...new Set(catalog.flatMap(app => app.categories))].sort(), [catalog]);
  const activeTransfers = transferCounts(transfers.map(t => ({
    ...t,
    installedVersion: t.installedVersion ?? scanReport?.matches.find(m =>
      m.appId === t.appId && m.installedVersion,
    )?.installedVersion,
  })));
  const artcraftIds = useMemo(() => new Set([
    ...bundledCatalog.filter(app => app.publisher === "ArtCraft Team" || app.id === "solidcraft" || app.id === "mailcraft").map(app => app.id),
    ...(signedApps?.map(app => app.id) ?? []),
  ]), [signedApps]);
  const watchedReleaseCount = githubProjects.filter(p => !p.checkError &&
    (githubReleaseStatus(p) === "new-since-download" ||
     githubReleaseStatus(p) === "different-from-recorded")).length;
  const saved = catalog.filter(app => favorites.includes(app.id));
  const filtered = useMemo(() => catalog.filter(app => {
    const q = query.trim().toLowerCase();
    return (category === "all" || (category === "top-50" ? featuredSoftwareIds.has(app.id) :
      category === "artcraft-suite" ? artcraftIds.has(app.id) : app.categories.includes(category))) &&
      (platform === "all" || app.platforms.includes(platform)) &&
      (!q || [app.name, app.publisher, app.description, ...app.categories]
        .some(value => value.toLowerCase().includes(q)));
  }), [query, category, platform, catalog, artcraftIds]);

  async function refreshArtcraft() {
    if (!native) { setCatalogStatus("offline"); return; }
    setCatalogStatus("loading");
    setCatalogError("");
    try {
      const result = await invoke<SignedCraftCatalog>("refresh_artcraft_catalog");
      setSignedApps(result.apps);
      setCatalogStatus("verified");
    } catch (error) {
      setCatalogStatus("offline");
      setCatalogError(String(error));
    }
  }

  useEffect(() => {
    if (!native || catalogRefreshStarted.current) return;
    catalogRefreshStarted.current = true;
    void refreshArtcraft();
  }, []);

  async function refreshApproved() {
    if (!native) { setApprovedStatus("offline"); return; }
    setApprovedStatus("loading");
    setApprovedError("");
    try {
      const result = await invoke<CatalogApp[]>("refresh_approved_apps");
      setApprovedApps(result);
      setApprovedStatus("verified");
    } catch (error) {
      setApprovedStatus("offline");
      setApprovedError(String(error));
    }
  }

  useEffect(() => {
    if (!native || approvedRefreshStarted.current) return;
    approvedRefreshStarted.current = true;
    void refreshApproved();
  }, []);

  const changeRequestDraft = (next: AppRequestDraft) => {
    setRequestDraft(next);
    setRequestCheck(null);
    setRequestErrors("");
  };

  async function verifyRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestChecking) return;
    const problem = validateAppRequest(requestDraft);
    if (problem) { setRequestErrors(problem); return; }
    if (!native) {
      setRequestErrors("Il controllo completo delle richieste GitHub richiede l'applicazione desktop.");
      return;
    }
    setRequestChecking(true);
    setRequestErrors("");
    setRequestCheck(null);
    try {
      // The backend cross-checks approved entries and open/closed GitHub issues.
      const checked = await invoke<RequestCheckResult>("check_app_request", { req: requestDraft });
      const matches = [
        ...localRequestMatches(requestDraft, catalog),
        ...checked.matches,
      ];
      const seen = new Set<string>();
      const distinct = matches.filter(match => {
        const key = match.state + ":" + match.url.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setRequestCheck({ signature: JSON.stringify(requestDraft), matches: distinct, truncated: checked.truncated });
    } catch (error) {
      setRequestErrors("Impossibile completare il controllo delle richieste: " + String(error));
    } finally {
      setRequestChecking(false);
    }
  }

  async function submitAppRequest() {
    if (!requestCheck || requestCheck.signature !== JSON.stringify(requestDraft) ||
        requestCheck.matches.length || requestCheck.truncated || requestChecking) return;
    try {
      await openUrl(issueCreationUrl(requestDraft));
      setRequestOpen(false);
      setNotification("GitHub ha aperto la richiesta precompilata. Devi confermare la pubblicazione dell'issue su GitHub.");
      setRequestCheck(null);
    } catch (error) {
      setRequestErrors(String(error));
    }
  }

  const favorite = (id: string) => setFavorites(current =>
    current.includes(id) ? current.filter(x => x !== id) : [...current, id]);

  async function addGithubProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (githubBusy) return;
    if (!native) { setGithubError("Use the native desktop app to verify GitHub repositories."); return; }
    if (githubProjects.length >= 25) {
      setGithubError("A maximum of 25 GitHub projects can be tracked to respect API rate limits.");
      return;
    }
    const url = githubDraftUrl.trim();
    setGithubError("");
    setGithubBusy(true);
    try {
      const info = await invoke<GitHubProjectInfo>("inspect_github_project", { url });
      const existing = githubProjects.find(p => p.repo.toLowerCase() === info.repo.toLowerCase());
      if (existing) {
        setGithubError("This repository is already in your tracked projects.");
        return;
      }
      setGithubProjects(current => [{
        ...info, checkedAt: Date.now(),
      }, ...current].slice(0, 25));
      setAddingGithub(false);
      setGithubDraftUrl("");
      setView("updates");
      githubRefreshStarted.current = true; // The new project's first release was just checked.
    } catch (error) {
      setGithubError(String(error));
    } finally { setGithubBusy(false); }
  }

  async function refreshGithubProjects() {
    if (!native || githubRefreshing || githubProjects.length === 0) return;
    setGithubRefreshing(true);
    for (const project of githubProjects) {
      try {
        const latest = await invoke<GitHubRelease | null>("check_github_release", { repo: project.repo });
        setGithubProjects(current => current.map(item => item.repo === project.repo
          ? { ...item, latest, checkedAt: Date.now(), checkError: undefined }
          : item));
      } catch (error) {
        setGithubProjects(current => current.map(item => item.repo === project.repo
          ? { ...item, checkError: String(error) }
          : item));
      }
    }
    setGithubRefreshing(false);
  }

  useEffect(() => {
    if (view !== "updates" || !native || githubProjects.length === 0 || githubRefreshStarted.current) return;
    githubRefreshStarted.current = true;
    void refreshGithubProjects();
  }, [view, githubProjects.length]);

  function queueGithubAsset(project: WatchedGitHubProject, asset: GitHubAsset) {
    if (!native || !project.latest) return;
    const tag = project.latest.tag;
    if (transfers.some(t => t.githubRepo === project.repo && t.kind === "download" &&
      (t.status === "queued" || t.status === "downloading"))) {
      setView("downloads");
      return;
    }
    setTransfers(current => [{
      id: crypto.randomUUID(), appId: `github:${project.repo}`,
      appName: project.name, kind: "download" as const,
      githubRepo: project.repo, githubAssetId: asset.id,
      targetVersion: tag, installedVersion: project.installedTag || undefined,
      status: "queued" as const, received: 0, total: asset.sizeBytes,
      createdAt: Date.now(),
    }, ...current].slice(0, 100));
    setView("downloads");
  }

  async function openWebsite(url: string) {
    if (!validWebUrl(url)) { setNotification("Only HTTP(S) links are supported."); return; }
    try {
      if (native) await openUrl(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) { setNotification(`Could not open link: ${String(error)}`); }
  }

  async function scanComputer(stayOnPage = false) {
    if (!stayOnPage) setView("installed");
    if (!native) {
      setNotification("A computer scan requires the native desktop application.");
      return;
    }
    if (scanning) return;
    setScanning(true);
    setNotification("");
    try {
      const report = await invoke<ScanReport>("scan_installed_apps");
      setScanReport(report);
    } catch (error) {
      setNotification(`Scan failed: ${String(error)}`);
    } finally {
      setScanning(false);
    }
  }

  async function requestInstallation(app: CatalogApp) {
    if (!native) {
      await openWebsite(app.links.download);
      return;
    }
    if (installing || checkingInstall) return;
    setInstallError("");
    setCheckingInstall(app.id);
    try {
      const plan = await invoke<InstallPlan>("preview_install", { appId: app.id });
      setInstallPlan(plan);
      setInstallProgress(null);
    } catch (error) {
      setNotification(`No native installation is configured for ${app.name}: ${String(error)}. Use its official download page instead.`);
    } finally {
      setCheckingInstall(null);
    }
  }

  async function confirmInstallation() {
    if (!installPlan || installing) return;
    if (downloadWorker.current) {
      setInstallError("Finish the current download before starting an OS installation.");
      return;
    }
    const plan = installPlan;
    const taskId = crypto.randomUUID();
    const task: TransferTask = {
      id: taskId, appId: plan.appId,
      appName: catalog.find(a => a.id === plan.appId)?.name ?? plan.appId,
      kind: "installation", targetVersion: plan.version,
      installedVersion: scanReport?.matches.find(m => m.appId === plan.appId && m.installedVersion)?.installedVersion,
      status: "installing", received: 0, total: plan.sizeBytes ?? 0,
      createdAt: Date.now(),
    };
    setTransfers(xs => [task, ...xs].slice(0, 100));
    activeInstallId.current = taskId;
    setInstalling(true);
    setInstallError("");
    setInstallProgress(null);
    try {
      const result = await invoke<InstallOutcome>("install_app", {
        appId: plan.appId,
        expectedVersion: plan.version,
      });
      setTransfers(xs => xs.map(x => x.id === taskId ? {
        ...x, status: result.status === "installed" ? "completed" as const : "manual" as const,
        received: x.total, message: result.message,
      } : x));
      setNotification(`${task.appName}: ${result.message}`);
      setInstallPlan(null);
      if (result.status === "installed") {
        try {
          const report = await invoke<ScanReport>("scan_installed_apps");
          setScanReport(report);
        } catch {
          // The command succeeded, but installation detection remains unconfirmed.
        }
      }
    } catch (error) {
      setTransfers(xs => xs.map(x => x.id === taskId ? {
        ...x, status: "failed" as const, message: String(error),
      } : x));
      setInstallError(String(error));
    } finally {
      activeInstallId.current = null;
      setInstalling(false);
    }
  }

  function InstallButton({ app, small = false }: { app: CatalogApp; small?: boolean }) {
    if (!installableIds.has(app.id)) return null;
    const installed = scanReport?.matches.some(match =>
      match.appId === app.id && match.confidence === "exact-package-id",
    ) ?? false;
    return <button
      type="button"
      className="black-button"
      disabled={installing || Boolean(checkingInstall) || installed}
      aria-label={installed ? `${app.name} already installed` : `Install ${app.name}`}
      onClick={() => { void requestInstallation(app); }}
    >
      {checkingInstall === app.id ? "Checking..." : installed ? "Installed" : small ? "Install" : "Install app"}
      {installed ? <CheckCircle2 size={16}/> : <ArrowDownToLine size={16}/>}
    </button>;
  }

  async function directDownload(app: CatalogApp) {
    if (resolvingDownloads.current.has(app.id)) return;
    if (transfers.some(t => t.appId === app.id && t.kind === "download" &&
      (t.status === "queued" || t.status === "downloading"))) {
      setView("downloads");
      return;
    }
    resolvingDownloads.current.add(app.id);
    setResolvingIds(new Set(resolvingDownloads.current));
    try {
      const offer = downloadOffers.find(item => item.appId === app.id);
      let release: { repo: string; version: string; asset: GitHubAsset } | null = null;
      let reason = "No unambiguous compatible release asset with SHA-256 is available.";
      const repo = catalogDownloadRepo(app);
      if (native && !offer && repo) {
        try {
          release = await invoke("resolve_catalog_download", { repo });
        } catch (error) {
          reason = `Release lookup unavailable: ${String(error)}`;
        }
      }
      if (!native || (!offer && !release)) {
        await openWebsite(app.links.download);
        setTransfers(xs => [{
          id: crypto.randomUUID(), appId: app.id, appName: app.name, kind: "download" as const,
          targetVersion: "Not determined", status: "manual" as const,
          received: 0, total: 0, createdAt: Date.now(),
          message: `${native ? reason : "Browser download."} Official source: ${app.links.download}. Download and install manually following the publisher's instructions. External progress and completion cannot be tracked.`,
        }, ...xs].slice(0, 100));
        setView("downloads");
        return;
      }
      setTransfers(xs => [{
        id: crypto.randomUUID(), appId: app.id, appName: app.name,
        kind: "download" as const, targetVersion: release?.version ?? offer!.version,
        githubRepo: release?.repo, githubAssetId: release?.asset.id,
        installedVersion: scanReport?.matches.find(m => m.appId === app.id && m.installedVersion)?.installedVersion,
        status: "queued" as const, received: 0, total: release?.asset.sizeBytes ?? offer!.sizeBytes, createdAt: Date.now(),
      }, ...xs].slice(0, 100));
      setView("downloads");
    } finally {
      resolvingDownloads.current.delete(app.id);
      setResolvingIds(new Set(resolvingDownloads.current));
    }
  }

  function DownloadButton({ app, small = false }: { app: CatalogApp; small?: boolean }) {
    const offer = downloadOffers.find(item => item.appId === app.id);
    const job = transfers.find(t => t.appId === app.id && t.kind === "download" &&
      (t.status === "queued" || t.status === "downloading"));
    const done = completedDownloads[app.id];
    const label = resolvingIds.has(app.id) ? "Checking release..." : job?.status === "downloading"
      ? `Downloading ${Math.min(100, Math.round(100 * job.received / Math.max(1, job.total)))}%`
      : job?.status === "queued" ? "Queued"
      : done ? "Downloaded"
      : offer ? `Download ${small ? "" : offer.version}`.trim()
      : "Download";
    return <button
      type="button"
      className="outline-button"
      disabled={Boolean(job) || resolvingIds.has(app.id)}
      aria-label={`${label} ${app.name}`}
      title={offer ? `Save ${offer.fileName} to your Downloads folder (${Math.round(offer.sizeBytes / 1024 / 1024)} MiB)` : "Open official publisher downloads"}
      onClick={() => { void directDownload(app); }}
    >
      {label} {offer ? <ArrowDownToLine size={small ? 15 : 16} /> : <ArrowUpRight size={small ? 15 : 16} />}
    </button>;
  }

  useEffect(() => {
    if (!native || downloadWorker.current || installing) return;
    const next = transfers.find(t => t.kind === "download" && t.status === "queued");
    if (!next) return;
    downloadWorker.current = true;
    activeDownloadId.current = next.id;
    setTransfers(xs => xs.map(x => x.id === next.id ? { ...x, status: "downloading" as const } : x));
    const promise = next.githubRepo && next.githubAssetId !== undefined
      ? invoke<DownloadResult>("download_github_asset", {
          repo: next.githubRepo, assetId: next.githubAssetId, expectedTag: next.targetVersion,
        })
      : invoke<DownloadResult>("download_app", { appId: next.appId });
    void promise.then(result => {
        if (!next.appId.startsWith("github:")) setCompletedDownloads(xs => ({ ...xs, [next.appId]: result }));
        if (next.appId.startsWith("github:")) setGithubProjects(xs => xs.map(p => p.repo === next.githubRepo
          ? { ...p, downloadedTag: next.targetVersion } : p));
        setPostDownloadPrompts(prompts => [...prompts, {
          task: next, fileName: result.fileName, savedPath: result.savedPath,
          checksumVerified: result.checksumVerified,
        }]);
        setTransfers(xs => xs.map(x => x.id === next.id ? {
          ...x, status: "completed" as const, received: x.total,
          filePath: result.savedPath, checksumVerified: result.checksumVerified,
          message: result.checksumVerified
            ? "SHA-256 matched the publisher's release metadata. Downloaded, not installed."
            : "Downloaded only; no trusted SHA-256 digest was supplied. Verify provenance before opening.",
        } : x));
      })
      .catch(error => {
        setTransfers(xs => xs.map(x => x.id === next.id ? {
          ...x, status: "failed" as const, message: String(error),
        } : x));
      })
      .finally(() => {
        activeDownloadId.current = null;
        downloadWorker.current = false;
      });
  }, [transfers, installing]);

  async function openShortcut(shortcut: CustomShortcut) {
    if (shortcut.kind === "url") { await openWebsite(shortcut.target); return; }
    if (!native) {
      setNotification("Launching local programs requires the desktop build, not the browser preview.");
      return;
    }
    try { await openPath(shortcut.target); }
    catch (error) { setNotification(`Could not open local path: ${String(error)}`); }
  }

  async function browsePath() {
    if (!native) {
      setFormError("File selection is available in the desktop build.");
      return;
    }
    try {
      const chosen = await chooseFile({ multiple: false, directory: false });
      if (typeof chosen === "string") {
        setDraft(x => ({ ...x, target: chosen }));
        setFormError("");
      }
    } catch (error) { setFormError(String(error)); }
  }

  function saveShortcut(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = draft.name.trim();
    const target = draft.target.trim();
    if (!name || !target) { setFormError("Name and target are required."); return; }
    if (shortcuts.length >= 100) { setFormError("Il limite è di 100 shortcut. Rimuovine uno prima di aggiungerne altri."); return; }
    if (name.length > 80 || target.length > 2048) { setFormError("Shortcut name or target is too long."); return; }
    if (draft.kind === "url" && !validWebUrl(target)) {
      setFormError("Use an HTTP(S) website URL."); return;
    }
    if (draft.kind === "path" && /[\r\n\0]/.test(target)) {
      setFormError("Invalid file path."); return;
    }
    setShortcuts(current => [...current, { id: crypto.randomUUID(), name, target, kind: draft.kind }]);
    setAdding(false);
    setDraft(emptyDraft);
    setFormError("");
    setView("private");
  }

  const count = saved.length + githubProjects.length;
  const currentPostDownload = postDownloadPrompts[0];
  const advancePostDownload = () => setPostDownloadPrompts(current => current.slice(1));
  async function openDownloadsDirectory() {
    if (!native) return;
    try {
      const directory = await invoke<string>("get_downloads_directory");
      await openPath(directory);
    } catch (error) {
      setNotification(`Could not open the Downloads folder: ${String(error)}`);
    }
  }
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-square">C.</span>
          <div><strong>Creative Hub</strong><small>SOFTWARE LIBRARY</small></div>
        </div>
        <div className="sidebar-group-title">WORKSPACE</div>
        <nav aria-label="Navigation" className="nav">
          {nav.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" className={view === key ? "nav-link selected" : "nav-link"} onClick={() => setView(key)}>
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
              {key === "library" && count > 0 && <span className="nav-count">{count}</span>}
              {key === "private" && shortcuts.length > 0 && <span className="nav-count">{shortcuts.length}</span>}
              {key === "updates" && watchedReleaseCount > 0 && <span className="nav-count">{watchedReleaseCount}</span>}
              {key === "downloads" && (activeTransfers.active + activeTransfers.queued) > 0 &&
                <span className="nav-count">{activeTransfers.active + activeTransfers.queued}</span>}
            </button>
          ))}
        </nav>
        <button type="button" className="sidebar-add" disabled={shortcuts.length >= 100}
          title={shortcuts.length >= 100 ? "100 shortcut limit reached" : "Add to Libreria privata"}
          onClick={() => { setAdding(true); setView("private"); }}>
          <Plus size={17} /> Add private shortcut
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-line" />
          <div className="sidebar-meta"><span>Open-source project</span><span>v0.1 alpha</span></div>
          <div className="sidebar-meta secondary"><span>Windows · macOS · Fedora</span></div>
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <span>UNIVERSAL CREATIVE SOFTWARE HUB</span>
          <div className="topbar-right">
            <span>{devicePlatform === "unknown" ? "DESKTOP" : platforms[devicePlatform].toUpperCase()}</span>
            <span className="alpha">ALPHA</span>
          </div>
        </div>

        {notification && <div className="notice" role="alert"><Info size={16}/><span>{notification}</span><button type="button" onClick={() => setNotification("")} aria-label="Dismiss"><X size={16}/></button></div>}

        {view === "discover" && (
          <>
            <header className="page-header">
              <p className="eyebrow">THE SOFTWARE DIRECTORY</p>
              <h1>Tools for making things.</h1>
              <p className="subheading">A curated collection of free creative software. No noise, just tools.</p>
            </header>
            <div className="catalog-sync-strip">
              <div>
                <strong>ArtCraft suite</strong>
                <span>{catalogStatus === "verified"
                  ? `Signed catalog verified · ${signedApps?.length ?? 0} entries`
                  : catalogStatus === "loading" ? "Checking the official signed catalog..."
                  : "Bundled catalog · 19 ArtCraft entries"}</span>
                {catalogError && <small title={catalogError}>Online catalog unavailable; using local entries.</small>}
              </div>
              <button type="button" className="outline-button" disabled={!native || catalogStatus === "loading"}
                onClick={() => { void refreshArtcraft(); }}>
                <RefreshCw size={15} className={catalogStatus === "loading" ? "spin" : ""}/> Refresh ArtCraft
              </button>
            </div>
            <div className="catalog-sync-strip">
              <div>
                <strong>Community catalog</strong>
                <span>{approvedStatus === "verified"
                  ? `${approvedApps.length} app approvate · sincronizzato con GitHub main`
                  : approvedStatus === "loading" ? "Controllo approvazioni..."
                  : "Catalogo integrato disponibile"}
                </span>
                {approvedError && <small>Catalogo approvato online non disponibile: rimane disponibile il catalogo incluso nell’app.</small>}
              </div>
              <button className="outline-button" type="button"
                disabled={!native || approvedStatus === "loading"} onClick={() => { void refreshApproved(); }}>
                <RefreshCw size={15} className={approvedStatus === "loading" ? "spin" : ""}/> Aggiorna approvate
              </button>
            </div>
            <div className="toolbar-actions">
              <button className="black-button" type="button" onClick={() => {
                setRequestOpen(true); setRequestErrors(""); setRequestCheck(null);
              }}><Plus size={16}/> Richiedi un'app</button>
              <button className="outline-button" type="button" onClick={() => { void scanComputer(); }} disabled={scanning}>
                <RefreshCw size={16} className={scanning ? "spin" : ""} />
                {scanning ? "Scanning..." : "Scan computer"}
              </button>
            </div>
            <div className="controls">
              <label className="search"><Search size={19} aria-hidden="true"/><input aria-label="Search software" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search software, categories, publishers" /></label>
              <label className="platform-filter"><Settings2 size={17}/><select aria-label="Operating system" value={platform} onChange={e => setPlatform(e.target.value as Platform | "all")}>
                <option value="all">All platforms</option>
                <option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Fedora / Linux</option><option value="web">Web apps</option>
              </select></label>
            </div>
            <div className="category-tabs" role="group" aria-label="Categories">
              <button type="button" className={category === "all" ? "category-tab active" : "category-tab"} onClick={() => setCategory("all")}>All software</button>
              <button type="button" className={category === "top-50" ? "category-tab active" : "category-tab"} onClick={() => setCategory("top-50")}>Creative Top 50</button>
              <button type="button" className={category === "artcraft-suite" ? "category-tab active" : "category-tab"} onClick={() => setCategory("artcraft-suite")}>ArtCraft Suite ({artcraftIds.size})</button>
              {categories.map(item => <button key={item} type="button" className={category === item ? "category-tab active" : "category-tab"} onClick={() => setCategory(item)}>{categoryLabel(item)}</button>)}
            </div>
            <div className="list-heading"><h2>Explore</h2><span>{filtered.length} {filtered.length === 1 ? "app" : "apps"}</span></div>
            <div className="software-list">
              {filtered.map(app => (
                <article className="software-row" key={app.id}>
                  <AppIcon app={app} size="lg" />
                  <div className="software-info">
                    <div className="software-title"><h3>{app.name}</h3><span className="free-label">FREE</span>{scanReport?.matches.some(match => match.appId === app.id) && <span className="detected-label">DETECTED</span>}</div>
                    <p className="publisher">{app.publisher} <span className="separator">/</span> {app.pricingModel === "free-open-source" ? "Open source" : "Freeware"}</p>
                    <p className="description">{app.description}</p>
                    <div className="software-categories">{app.categories.slice(0, 3).map(cat => <span key={cat}>{categoryLabel(cat)}</span>)}</div>
                  </div>
                  <div className="software-actions">
                    <button className="icon-action" type="button" title={favorites.includes(app.id) ? "Remove from library" : "Save to library"} aria-label={favorites.includes(app.id) ? `Remove ${app.name} from library` : `Save ${app.name} to library`} aria-pressed={favorites.includes(app.id)} onClick={() => favorite(app.id)}>
                      <Heart size={19} fill={favorites.includes(app.id) ? "currentColor" : "none"}/>
                    </button>
                    <InstallButton app={app} />
                    <DownloadButton app={app} small />
                  </div>
                </article>
              ))}
              {filtered.length === 0 && <div className="empty"><Search size={26}/><h3>Nothing found</h3><p>Try another search or choose a different category.</p><button type="button" className="outline-button" onClick={() => {setQuery("");setCategory("all");setPlatform("all");}}>Reset filters</button></div>}
            </div>
            <div className="footnote"><Info size={15}/><span>System installations require explicit confirmation and OS authorization where needed. Downloads and installations are visible in the Downloads section.</span></div>
          </>
        )}

        {view === "library" && (
          <>
            <header className="page-header page-header-inline"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>My Library.</h1><p className="subheading">Saved catalog software and GitHub projects.</p></div>
              <div className="github-header-actions">
                <button className="outline-button" type="button" onClick={() => setView("private")}><FolderOpen size={17}/> Libreria privata</button>
                <button className="black-button" type="button" onClick={() => setAddingGithub(true)}><Plus size={17}/> Add GitHub project</button>
              </div></header>
            {count === 0 && <div className="empty large"><FolderOpen size={33}/><h3>Your library is empty</h3><p>Save an app from Discover or add a GitHub repository. Personal shortcuts are in Libreria privata.</p><button type="button" className="black-button" onClick={() => setView("discover")}>Explore software <ArrowUpRight size={16}/></button></div>}
            {saved.length > 0 && <section className="library-section"><div className="list-heading"><h2>Saved from Discover</h2><span>{saved.length}</span></div><div className="software-list">
              {saved.map(app => <article className="compact-row" key={app.id}><AppIcon app={app}/><div className="compact-info"><strong>{app.name}</strong><small>{app.publisher} · Saved from catalog</small></div><InstallButton app={app} small /><DownloadButton app={app} small /><button type="button" className="icon-action" title="Remove from library" aria-label={`Remove ${app.name}`} onClick={() => favorite(app.id)}><Trash2 size={17}/></button></article>)}
            </div></section>}
            {githubProjects.length > 0 && <section className="library-section">
              <div className="list-heading"><h2>GitHub projects</h2><span>{githubProjects.length} tracked</span></div>
              <div className="software-list">
                {githubProjects.map(project => <article className="compact-row" key={project.repo}>
                  <span className="shortcut-icon"><Link2 size={23}/></span>
                  <div className="compact-info"><strong>{project.name}</strong>
                    <small>{project.repo} · Latest: {project.latest?.tag ?? "No stable release"}</small></div>
                  <button type="button" className="outline-button" onClick={() => setView("updates")}>Releases <RefreshCw size={15}/></button>
                  <button type="button" className="icon-action" title="Stop tracking" aria-label={`Stop tracking ${project.name}`}
                    onClick={() => setGithubProjects(xs => xs.filter(p => p.repo !== project.repo))}><Trash2 size={17}/></button>
                </article>)}
              </div>
            </section>}
            <div className="footnote"><Info size={15}/><span>Saved library entries are not a confirmed list of installed applications. Data stays on this device.</span></div>
          </>
        )}

        {view === "private" && (
          <>
            <header className="page-header page-header-inline">
              <div><p className="eyebrow">PERSONAL WORKSPACE</p><h1>Libreria privata.</h1>
                <p className="subheading">I tuoi shortcut personali, separati dal catalogo pubblico.</p></div>
              <button type="button" className="black-button" disabled={shortcuts.length >= 100}
                onClick={() => { setFormError(""); setAdding(true); }}>
                <Plus size={17}/> Aggiungi shortcut
              </button>
            </header>
            <div className="private-library-summary">
              <span><FolderOpen size={16}/> Shortcut salvati localmente</span>
              <strong>{shortcuts.length} / 100</strong>
            </div>
            {shortcuts.length > 100 && <p className="scan-warning">Hai più di 100 shortcut salvati prima del limite. Sono tutti conservati: per aggiungerne altri devi scendere sotto 100.</p>}
            {shortcuts.length === 0 && <div className="feature-empty">
              <div className="feature-symbol"><FolderOpen size={31}/></div>
              <h2>La libreria privata è vuota</h2>
              <p>Aggiungi link ai tuoi siti e percorsi locali. Tutto resta in questo profilo sul dispositivo.</p>
              <button type="button" className="outline-button" onClick={() => setAdding(true)}>
                <Plus size={16}/> Aggiungi il primo shortcut
              </button>
            </div>}
            {shortcuts.length > 0 && <section className="library-section"><div className="list-heading"><h2>Custom shortcuts</h2><span>{shortcuts.length}</span></div><div className="software-list">
              {shortcuts.map(item => <article className="compact-row" key={item.id}><span className="shortcut-icon">{item.kind === "url" ? <Link2 size={23}/> : <FolderOpen size={23}/>}</span><div className="compact-info"><strong>{item.name}</strong><small title={item.target}>{item.target}</small></div><button type="button" className="outline-button" onClick={() => openShortcut(item)}>{item.kind === "url" ? "Open link" : "Open file"} <ExternalLink size={15}/></button><button type="button" className="icon-action" title="Remove shortcut" aria-label={`Remove ${item.name}`} onClick={() => setShortcuts(xs => xs.filter(x => x.id !== item.id))}><Trash2 size={17}/></button></article>)}
            </div></section>}

            <div className="footnote"><Info size={15}/><span>Privata significa salvata localmente nel profilo di questa applicazione: non è una cartella cifrata o protetta da password. Gli shortcut preesistenti sono mantenuti.</span></div>
          </>
        )}

        {view === "installed" && (
          <>
            <header className="page-header page-header-inline">
              <div><p className="eyebrow">YOUR COMPUTER</p><h1>Installed software.</h1><p className="subheading">Check this device for apps supported by the catalog.</p></div>
              <button className="black-button" type="button" disabled={scanning} onClick={() => { void scanComputer(); }}>
                <RefreshCw size={16} className={scanning ? "spin" : ""} />{scanning ? "Scanning..." : "Scan computer"}
              </button>
            </header>
            {!native && <div className="feature-empty"><div className="feature-symbol"><Package size={32} strokeWidth={1.3}/></div><h2>Desktop app required</h2><p>Scanning installed programs is not available in the browser preview. Open the app with Tauri on Windows, macOS, or Fedora.</p></div>}
            {native && !scanReport && !scanning && <div className="feature-empty">
              <div className="feature-symbol"><Package size={32} strokeWidth={1.3}/></div>
              <h2>Ready to scan</h2>
              <p>The read-only scan checks local package managers, known app paths and desktop entries for supported catalog apps, including Blender, Krita and the ArtCraft suite. No information is uploaded.</p>
              <button className="outline-button scan-center-button" type="button" onClick={() => { void scanComputer(); }}>Scan computer <RefreshCw size={16}/></button>
            </div>}
            {native && scanning && <div className="feature-empty" role="status"><RefreshCw size={32} className="spin"/><h2>Checking installed applications...</h2><p>Reading local app locations and available package managers. Nothing is changed.</p></div>}
            {native && scanReport && !scanning && <>
              <div className="scan-summary"><CheckCircle2 size={17}/><span>Scan complete · {new Set(scanReport.matches.map(match => match.appId)).size} catalog apps detected · {scanReport.matches.length} installation sources</span></div>
              <div className="list-heading"><h2>Detected apps</h2><span>{scanReport.checkedSources.join(" · ")}</span></div>
              <div className="software-list">
                {catalog.filter(app => scanReport.matches.some(m => m.appId === app.id)).map(app => (
                  <article className="compact-row" key={app.id}>
                    <AppIcon app={app}/>
                    <div className="compact-info">
                      <strong>{app.name}</strong>
                      {scanReport.matches.filter(m => m.appId === app.id).map(match =>
                        <small key={match.source + match.sourceId}>
                          {match.source} · {match.installedVersion ? `version ${match.installedVersion}` : "version unknown"}
                          {match.confidence === "name-only" ? " · filename match (not verified)" : " · exact package match"}
                        </small>)}
                    </div>
                    <DownloadButton app={app} small />
                  </article>
                ))}
                {scanReport.matches.length === 0 && <div className="empty"><Search size={27}/><h3>No catalog apps detected</h3><p>This scan recognizes catalog apps through supported package managers and known paths. Portable apps outside those locations may not appear.</p></div>}
              </div>
              {scanReport.warnings.length > 0 && <div className="scan-warning">{scanReport.warnings.map(x => <p key={x}>{x}</p>)}</div>}
              <div className="footnote"><Info size={15}/><span>A file or shortcut match does not guarantee that an app works. Updates are not yet managed here. Results are not uploaded.</span></div>
            </>}
          </>
        )}

        {view === "downloads" && (
          <>
            <header className="page-header page-header-inline">
              <div>
                <p className="eyebrow">TRANSFER ACTIVITY</p>
                <h1>Downloads.</h1>
                <p className="subheading">Queued packages, active transfers and installation history.</p>
              </div>
              <div className="downloads-head-actions">
                <button type="button" className="outline-button" disabled={!native || scanning}
                  onClick={() => { void scanComputer(true); }}>
                  <RefreshCw size={15} className={scanning ? "spin" : ""}/>
                  {scanning ? "Scanning..." : "Scan installed versions"}
                </button>
                <button type="button" className="outline-button"
                  disabled={!transfers.some(t => ["completed", "manual", "failed", "interrupted"].includes(t.status))}
                  onClick={() => setTransfers(xs => xs.filter(t =>
                    !["completed", "manual", "failed", "interrupted"].includes(t.status)))}>
                  <Trash2 size={16}/> Clear finished
                </button>
              </div>
            </header>
            <div className="transfer-summary" aria-label="Download counts">
              <div><strong>{activeTransfers.active}</strong><span>Active</span></div>
              <div><strong>{activeTransfers.queued}</strong><span>Queued</span></div>
              <div><strong>{activeTransfers.completed}</strong><span>Finished</span></div>
              <div><strong>{activeTransfers.versionChanges}</strong><span>Different-version tasks</span></div>
            </div>
            <div className="transfer-explanation"><Info size={16}/>
              <span>Versions are taken from the selected package and, if you have scanned this computer, the detected installed package. Different versions do not necessarily mean an upgrade. Software update checks are not implemented yet.</span>
            </div>
            {transfers.length === 0 ? (
              <div className="feature-empty">
                <div className="feature-symbol"><ArrowDownToLine size={30}/></div>
                <h2>No downloads yet</h2>
                <p>Choose Download or Install from Discover. Active progress and completed activity will appear here.</p>
                <button type="button" className="outline-button scan-center-button" onClick={() => setView("discover")}>Browse software <ArrowUpRight size={15}/></button>
              </div>
            ) : (
              <div className="transfer-list">
                {transfers.map(task => {
                  const app = catalog.find(item => item.id === task.appId);
                  const hasProgress = task.total > 0;
                  const percent = hasProgress ? Math.min(100, Math.round(100 * task.received / task.total)) : 0;
                  const active = task.status === "downloading" || task.status === "installing";
                  const statusLabel: Record<TransferTask["status"], string> = {
                    queued: "Waiting in queue", downloading: "Downloading",
                    installing: hasProgress && percent >= 100 ? "Waiting for OS installer" : "Installing / downloading",
                    completed: task.kind === "download" ? "Downloaded" : "Install command completed",
                    manual: "Manual action required", failed: "Failed", interrupted: "Previous session interrupted",
                  };
                  return <article className="transfer-row" key={task.id}>
                    {app ? <AppIcon app={app} /> : <div className="shortcut-icon"><Package size={23}/></div>}
                    <div className="transfer-body">
                      <div className="transfer-row-head">
                        <div><strong>{task.appName}</strong><span>{task.kind === "installation" ? "Install package" : "Download package"}</span></div>
                        <span className="transfer-status">{statusLabel[task.status]}</span>
                      </div>
                      <div className="transfer-versions">
                        <span>Installed: <strong>{task.installedVersion ?? scanReport?.matches.find(m =>
                          m.appId === task.appId && m.installedVersion,
                        )?.installedVersion ?? "Unknown / not scanned"}</strong></span>
                        <span>Selected: <strong>{task.targetVersion === "repository" ? "System repository" : task.targetVersion}</strong></span>
                      </div>
                      {hasProgress && (active || task.status === "queued") &&
                        <div className="transfer-meter">
                          <div className="transfer-meter-track" role="progressbar"
                            aria-label={`${task.appName} transfer progress`} aria-valuemin={0} aria-valuemax={100}
                            aria-valuenow={percent}>
                            <span style={{width: `${percent}%`}}/>
                          </div>
                          <small>{formatBytes(task.received)} / {formatBytes(task.total)} · {percent}%</small>
                        </div>}
                      {active && !hasProgress && <div className="transfer-indeterminate" role="status">System package manager is running. An administrator prompt may appear.</div>}
                      {task.filePath && <p className="transfer-detail" title={task.filePath}>Saved to: {task.filePath}</p>}
                      {task.status === "completed" && task.kind === "download" && task.filePath &&
                        <button type="button" className="outline-button transfer-retry" onClick={() =>
                          setPostDownloadPrompts(prompts => [...prompts, {
                            task, fileName: task.filePath!.split(/[\\/]/).pop() ?? task.appName,
                            savedPath: task.filePath!, checksumVerified: task.checksumVerified === true,
                          }])}>
                          <Package size={15}/> Installa / Apri file
                        </button>}
                      {task.message && <p className="transfer-detail">{task.message}</p>}
                      {task.status === "manual" && app && <button type="button" className="outline-button transfer-retry"
                        onClick={() => { void openWebsite(app.links.download); }}>
                        Official download / instructions <ExternalLink size={14}/>
                      </button>}
                      {task.status === "failed" && app && <button type="button" className="outline-button transfer-retry"
                        onClick={() => { void (task.kind === "download" ? directDownload(app) : requestInstallation(app)); }}>
                        Retry <RefreshCw size={14}/>
                      </button>}
                    </div>
                  </article>;
                })}
              </div>
            )}
            <p className="footnote"><Info size={15}/> Finished tasks remain in local history until cleared. Active transfers do not continue after the launcher is closed.</p>
          </>
        )}

        {view === "updates" && (
          <>
            <header className="page-header page-header-inline">
              <div><p className="eyebrow">RELEASE TRACKER</p><h1>Updates.</h1>
                <p className="subheading">Track the latest published GitHub releases for projects you follow.</p>
              </div>
              <div className="github-header-actions">
                <button type="button" className="outline-button" disabled={!native || githubRefreshing || githubProjects.length === 0}
                  onClick={() => { void refreshGithubProjects(); }}>
                  <RefreshCw size={16} className={githubRefreshing ? "spin" : ""}/> {githubRefreshing ? "Checking..." : "Check releases"}
                </button>
                <button type="button" className="black-button" onClick={() => setAddingGithub(true)}>
                  <Plus size={16}/> Add GitHub project
                </button>
              </div>
            </header>
            <div className="github-update-summary">
              <div><strong>{githubProjects.length}</strong><span>Tracked projects</span></div>
              <div><strong>{watchedReleaseCount}</strong><span>Release differences</span></div>
              <div><strong>{githubProjects.filter(p => Boolean(p.checkError)).length}</strong><span>Check errors</span></div>
            </div>
            <div className="transfer-explanation"><Info size={16}/>
              <span>A new GitHub release means a package is available to inspect. It does not prove the software on your computer is outdated.
                The installed version is recorded only when you enter it. Downloads never install or execute files.</span>
            </div>
            {githubProjects.length === 0 && <div className="feature-empty">
              <div className="feature-symbol"><Link2 size={31} strokeWidth={1.3}/></div>
              <h2>Follow a GitHub project</h2>
              <p>Paste a public repository URL to see stable releases, download the publisher's assets and check when a newer release is published.</p>
              <button type="button" className="outline-button scan-center-button" onClick={() => setAddingGithub(true)}>
                Add GitHub project <Plus size={15}/>
              </button>
            </div>}
            {githubProjects.length > 0 && <div className="github-project-list">
              {githubProjects.map(project => {
                const release = project.latest;
                const status = githubReleaseStatus(project);
                const assetId = selectedGithubAssets[project.repo] ?? release?.assets[0]?.id;
                const selectedAsset = release?.assets.find(a => a.id === assetId);
                const downloadingAsset = transfers.some(t => t.githubRepo === project.repo &&
                  (t.status === "queued" || t.status === "downloading"));
                const statusText = project.checkError ? "Check failed" :
                  status === "new-since-download" ? "New release since download" :
                  status === "different-from-recorded" ? "Different from recorded version" :
                  status === "same" ? "Release matches recorded version" :
                  status === "no-release" ? "No stable release" : "Version not yet recorded";
                return <article className="github-project-card" key={project.repo}>
                  <div className="github-project-head">
                    <div>
                      <div className="github-project-name"><h2>{project.name}</h2><span className="github-status">{statusText}</span></div>
                      <p className="github-repo-name">{project.repo}</p>
                      {project.description && <p className="github-project-description">{project.description}</p>}
                    </div>
                    <button type="button" className="icon-action" aria-label={`Stop tracking ${project.name}`}
                      title="Stop tracking" onClick={() => setGithubProjects(xs => xs.filter(p => p.repo !== project.repo))}>
                      <Trash2 size={17}/>
                    </button>
                  </div>
                  <div className="github-versions">
                    <div><span>Latest stable GitHub release</span><strong>{release?.tag ?? "Not available"}</strong></div>
                    <div><span>Last downloaded here</span><strong>{project.downloadedTag ?? "No download"}</strong></div>
                    <div><label htmlFor={`github-installed-${project.repo.replace(/[^A-Za-z0-9]/g, "-")}`}>Installed version (manual)</label>
                      <input id={`github-installed-${project.repo.replace(/[^A-Za-z0-9]/g, "-")}`} maxLength={100}
                        value={project.installedTag ?? ""} placeholder="e.g. v1.2.3"
                        onChange={e => { const version = e.target.value;
                          setGithubProjects(xs => xs.map(p => p.repo === project.repo ? {...p, installedTag: version} : p));
                        }}/>
                    </div>
                  </div>
                  {project.checkError && <p className="github-error" role="alert">{project.checkError}. Previous release data may be stale.</p>}
                  {release && <div className="github-assets">
                    <label htmlFor={`github-asset-${project.repo.replace(/[^A-Za-z0-9]/g, "-")}`}>Release package</label>
                    {release.assets.length > 0 ? <div className="github-asset-controls">
                      <select id={`github-asset-${project.repo.replace(/[^A-Za-z0-9]/g, "-")}`}
                        value={assetId} onChange={e => setSelectedGithubAssets(v => ({ ...v, [project.repo]: Number(e.target.value) }))}>
                        {release.assets.map(asset => <option value={asset.id} key={asset.id}>
                          {asset.name} · {formatBytes(asset.sizeBytes)}{asset.sha256Available ? " · SHA-256" : ""}
                        </option>)}
                      </select>
                      <button type="button" className="black-button" disabled={!native || !selectedAsset || downloadingAsset || Boolean(project.checkError)}
                        onClick={() => selectedAsset && queueGithubAsset(project, selectedAsset)}>
                        <ArrowDownToLine size={16}/>{downloadingAsset ? "Queued" : "Download file"}
                      </button>
                    </div> : <p className="github-project-description">No supported binary or archive files found in this release. See the publisher's release page.</p>}
                    <small>Package download only; no automatic installation. A publisher checksum is checked only when provided by GitHub.</small>
                  </div>}
                  <div className="github-project-footer">
                    <button type="button" className="outline-button" onClick={() => { void openWebsite(project.url); }}>Repository <ExternalLink size={14}/></button>
                    {release && <button type="button" className="outline-button" onClick={() => { void openWebsite(release.url); }}>Release notes <ArrowUpRight size={14}/></button>}
                    {project.checkedAt && <span>Checked {new Date(project.checkedAt).toLocaleString()}</span>}
                  </div>
                </article>;
              })}
            </div>}
            <div className="footnote"><Info size={15}/><span>GitHub release tracking is available now. Automatic updates for software installed through DNF, WinGet, Homebrew or other package managers still require dedicated integration.</span></div>
          </>
        )}
      </main>

      {currentPostDownload && <div className="modal-backdrop" role="presentation">
        <div className="modal install-modal" role="dialog" aria-modal="true" aria-labelledby="after-download-title">
          <header>
            <div><p className="eyebrow">DOWNLOAD COMPLETATO</p>
              <h2 id="after-download-title">Installare {currentPostDownload.task.appName}?</h2>
            </div>
            <button type="button" className="icon-action" aria-label="Chiudi" onClick={advancePostDownload}><X size={19}/></button>
          </header>
          <div className="install-details">
            <div><span>File</span><strong>{currentPostDownload.fileName}</strong></div>
            <div><span>Versione scaricata</span><strong>{currentPostDownload.task.targetVersion}</strong></div>
            <div><span>Integrità</span><strong>{currentPostDownload.checksumVerified ? "SHA-256 verificato rispetto alla fonte" : "Firma/checksum del produttore non verificati"}</strong></div>
          </div>
          <p className="install-explanation">
            Il download è terminato, ma il software non è installato.
            {currentPostDownload.task.appId.startsWith("github:")
              ? " Questo pacchetto proviene da un repository GitHub aggiunto da te. Verifica il produttore e installalo manualmente: Creative Hub non esegue questi file. L’approvazione nel catalogo non autorizza un installer."
              : canOfferCatalogInstall(currentPostDownload.task.appId, installableIds)
                ? " È disponibile un metodo di installazione verificato separatamente. Prima di procedere vedrai fonte e versione da confermare. L'installatore può scaricare di nuovo il pacchetto e richiedere la password Fedora o l'autorizzazione Windows."
                : " Apri la cartella Download e segui la procedura del produttore. Nessun file verrà eseguito automaticamente."}
            {currentPostDownload.task.appId === "bimcraft" && !installableIds.has("bimcraft") &&
              " BIMCraft: su macOS apri il DMG e trascina l’app in Applications; la release non è notarizzata. Su Linux usa il formato previsto dalla tua distribuzione. Consulta le istruzioni ufficiali prima di procedere."}
          </p>
          <div className="modal-actions">
            <button type="button" className="outline-button" onClick={advancePostDownload}>Non ora</button>
            <button type="button" className="outline-button" onClick={() => {advancePostDownload();void openDownloadsDirectory();}}>
              <FolderOpen size={16}/> Apri cartella Download
            </button>
            {catalog.find(a => a.id === currentPostDownload.task.appId) &&
              <button type="button" className="outline-button" onClick={() => {
                const app = catalog.find(a => a.id === currentPostDownload.task.appId);
                if (app) void openWebsite(app.links.download);
              }}>Istruzioni ufficiali <ExternalLink size={15}/></button>}
            {canOfferCatalogInstall(currentPostDownload.task.appId, installableIds) && catalog.some(a => a.id === currentPostDownload.task.appId) &&
              <button type="button" className="black-button" onClick={() => {
                const app = catalog.find(a => a.id === currentPostDownload.task.appId);
                advancePostDownload();
                if (app) void requestInstallation(app);
              }}>
                <Check size={16}/> Installa con autorizzazione OS
              </button>}
          </div>
        </div>
      </div>}

      {installPlan && <div className="modal-backdrop">
        <div className="modal install-modal" role="dialog" aria-modal="true" aria-labelledby="install-title">
          <header>
            <div><p className="eyebrow">SYSTEM INSTALLATION</p>
              <h2 id="install-title">Install {catalog.find(a => a.id === installPlan.appId)?.name ?? installPlan.appId}</h2>
            </div>
            <button type="button" className="icon-action" aria-label="Cancel installation" disabled={installing} onClick={() => setInstallPlan(null)}><X size={19}/></button>
          </header>
          <div className="install-details">
            <div><span>Method</span><strong>{installPlan.method}</strong></div>
            <div><span>Version</span><strong>{installPlan.version === "repository" ? "From system repository" : installPlan.version}</strong></div>
            <div><span>Source</span><strong>{installPlan.source}</strong></div>
            {installPlan.sizeBytes && <div><span>Download size</span><strong>{Math.ceil(installPlan.sizeBytes / 1024 / 1024)} MiB</strong></div>}
          </div>
          <p className="install-explanation">{installPlan.message}</p>
          <p className="install-explanation">
            {installPlan.manualSteps
              ? "The application will open the verified disk image. You must finish the installation in Finder."
              : installPlan.requiresAuthorization
                ? "Your operating system may show a password or administrator approval prompt. The hub does not bypass it."
                : "The installation uses the selected provider's normal permission flow."}
          </p>
          {installing && <div className="install-status" role="status">
            <RefreshCw size={17} className="spin"/>
            <span>{installProgress === null ? "Preparing installer or waiting for system approval..." : `Downloading installer: ${installProgress}% (system approval follows)`}</span>
          </div>}
          {installError && <div className="install-error" role="alert">{installError}</div>}
          <div className="modal-actions">
            <button type="button" className="outline-button" disabled={installing} onClick={() => setInstallPlan(null)}>Cancel</button>
            <button type="button" className="black-button" disabled={installing} onClick={() => { void confirmInstallation(); }}>
              {installing ? "Installing..." : installPlan.manualSteps ? "Open installer" : "Confirm & install"}
              <ArrowDownToLine size={16}/>
            </button>
          </div>
        </div>
      </div>}


      {requestOpen && <div className="modal-backdrop" role="presentation">
        <div className="modal request-modal" role="dialog" aria-modal="true" aria-labelledby="request-title">
          <header>
            <div><p className="eyebrow">COMMUNITY SOFTWARE</p><h2 id="request-title">Richiedi un'applicazione</h2></div>
            <button type="button" className="icon-action" aria-label="Chiudi richiesta"
              disabled={requestChecking} onClick={() => setRequestOpen(false)}><X size={19}/></button>
          </header>
          <p className="form-help">
            Il sistema controllerà se l'app è già nel catalogo o se qualcuno l'ha già richiesta.
            In caso contrario potrai inviare la proposta su GitHub. Sarà pubblicata solo dopo la revisione e il merge di una PR.
          </p>
          <form onSubmit={e => { void verifyRequest(e); }}>
            <div className="request-two-col">
              <label className="form-label">Nome applicazione
                <input autoFocus required maxLength={80} value={requestDraft.name} placeholder="Nome del software"
                  onChange={e => changeRequestDraft({...requestDraft, name:e.target.value})}/>
              </label>
              <label className="form-label">Produttore / autore
                <input required maxLength={100} value={requestDraft.publisher} placeholder="Organizzazione o autore"
                  onChange={e => changeRequestDraft({...requestDraft, publisher:e.target.value})}/>
              </label>
            </div>
            <label className="form-label">Sito ufficiale HTTPS
              <input type="url" required maxLength={350} value={requestDraft.website} placeholder="https://example.org"
                onChange={e => changeRequestDraft({...requestDraft, website:e.target.value})}/>
            </label>
            <label className="form-label">Repository GitHub (facoltativo)
              <input type="url" maxLength={350} value={requestDraft.repository}
                placeholder="https://github.com/owner/repository"
                onChange={e => changeRequestDraft({...requestDraft, repository:e.target.value})}/>
            </label>
            <label className="form-label">Descrizione (10–240 caratteri)
              <textarea rows={3} minLength={10} maxLength={240} required value={requestDraft.description}
                placeholder="Cosa fa il programma? Per quali creativi è utile?"
                onChange={e => changeRequestDraft({...requestDraft, description:e.target.value})}/>
            </label>
            <div className="request-two-col">
              <label className="form-label">Distribuzione
                <select value={requestDraft.pricingModel}
                  onChange={e => changeRequestDraft({...requestDraft, pricingModel:e.target.value as AppRequestDraft["pricingModel"]})}>
                  <option value="free-open-source">Gratis e open source</option>
                  <option value="freeware">Versione gratuita / freeware</option>
                </select>
              </label>
              <fieldset className="request-platforms">
                <legend>Piattaforme</legend>
                {(["windows","macos","linux","web"] as const).map(item =>
                  <label key={item}><input type="checkbox" checked={requestDraft.platforms.includes(item)}
                    onChange={e => changeRequestDraft({...requestDraft,
                      platforms:e.target.checked
                        ? [...requestDraft.platforms, item]
                        : requestDraft.platforms.filter(platform => platform !== item),
                    })}/>
                    {item === "linux" ? "Fedora / Linux" : item === "macos" ? "macOS" : item === "web" ? "Web" : "Windows"}
                  </label>)}
              </fieldset>
            </div>
            {requestErrors && <p className="form-error" role="alert">{requestErrors}</p>}
            {requestCheck && <div className="request-results" role="status">
              {requestCheck.truncated && <p>Controllo incompleto: troppe richieste su GitHub. Verifica manualmente prima di inviare.</p>}
              {requestCheck.matches.length ? <>
                <strong>App già presente o richiesta simile</strong>
                <div className="request-match-list">
                  {requestCheck.matches.map((match,i) => <div key={match.url + i}>
                    <span><b>{match.name}</b> · {match.state === "approved" ? "Approvata / in catalogo" : match.state === "open" ? "Richiesta aperta" : "Richiesta chiusa"} · {match.reason}</span>
                    <button type="button" className="outline-button" onClick={() => { void openWebsite(match.url); }}>
                      Vedi <ArrowUpRight size={14}/>
                    </button>
                  </div>)}
                </div>
                <p className="form-help">Evitiamo richieste duplicate: controlla quella esistente.</p>
              </> : !requestCheck.truncated && <p><CheckCircle2 size={16}/> Nessuna richiesta uguale trovata tra quelle controllate. Puoi proporre questa app.</p>}
            </div>}
            <div className="modal-actions">
              <button type="button" className="outline-button" disabled={requestChecking} onClick={() => setRequestOpen(false)}>Annulla</button>
              <button type="submit" className="outline-button" disabled={requestChecking || !native}>
                <Search size={16}/>{requestChecking ? "Verifico su GitHub..." : "Verifica duplicati"}
              </button>
              <button type="button" className="black-button"
                disabled={!native || !requestCheck || requestCheck.signature !== JSON.stringify(requestDraft) ||
                  requestCheck.matches.length > 0 || requestCheck.truncated || requestChecking}
                onClick={() => { void submitAppRequest(); }}>
                Apri richiesta su GitHub <ArrowUpRight size={16}/>
              </button>
            </div>
            <p className="form-help">Per inviare l'issue devi accedere a GitHub e confermare la pubblicazione.
              L'approvazione finale spetta ai manutentori.</p>
          </form>
        </div>
      </div>}

      {addingGithub && <div className="modal-backdrop" role="presentation"
        onMouseDown={e => { if(e.currentTarget === e.target && !githubBusy) {setAddingGithub(false);setGithubError("");} }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="github-add-title">
          <header><div><p className="eyebrow">GITHUB PROJECT</p><h2 id="github-add-title">Track a repository</h2></div>
            <button type="button" className="icon-action" disabled={githubBusy} aria-label="Close"
              onClick={() => {setAddingGithub(false);setGithubError("");}}><X size={19}/></button></header>
          <form onSubmit={e => { void addGithubProject(e); }}>
            <label className="form-label">GitHub repository URL
              <input autoFocus type="url" required value={githubDraftUrl}
                placeholder="https://github.com/owner/repository"
                onChange={e => setGithubDraftUrl(e.target.value)}/>
            </label>
            <p className="form-help">Public GitHub repositories only. Their stable releases are checked when you open Updates or press Check releases. Nothing will be installed automatically.</p>
            {!native && <p className="form-error">Use the native desktop app to read releases and download files.</p>}
            {githubError && <p className="form-error" role="alert">{githubError}</p>}
            <div className="modal-actions">
              <button type="button" className="outline-button" disabled={githubBusy}
                onClick={() => {setAddingGithub(false);setGithubError("");}}>Cancel</button>
              <button type="submit" className="black-button" disabled={!native || githubBusy || githubDraftUrl.trim().length === 0}>
                <Plus size={16}/>{githubBusy ? "Checking GitHub..." : "Add and track"}
              </button>
            </div>
          </form>
        </div>
      </div>}

      {adding && <div className="modal-backdrop" role="presentation" onMouseDown={e => {if(e.currentTarget === e.target) setAdding(false);}}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <header><div><p className="eyebrow">LIBRERIA PRIVATA</p><h2 id="modal-title">Aggiungi shortcut</h2></div><button type="button" className="icon-action" aria-label="Close" onClick={() => {setAdding(false);setFormError("");}}><X size={20}/></button></header>
          <form onSubmit={saveShortcut}>
            <label className="form-label">Name<input autoFocus maxLength={80} placeholder="My creative app" value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})}/></label>
            <div className="form-label">Type<div className="segmented"><button className={draft.kind === "url" ? "chosen" : ""} type="button" onClick={() => {setDraft({...draft,kind:"url",target:""});setFormError("");}}><Link2 size={16}/> Website</button><button className={draft.kind === "path" ? "chosen" : ""} type="button" onClick={() => {setDraft({...draft,kind:"path",target:""});setFormError("");}}><FolderOpen size={16}/> Local file</button></div></div>
            <label className="form-label">Target<div className="form-input-row"><input value={draft.target} onChange={e => setDraft({...draft,target:e.target.value})} placeholder={draft.kind === "url" ? "https://example.org" : "Path to your application"}/>{draft.kind === "path" && <button type="button" className="browse-button" onClick={browsePath}>Browse</button>}</div></label>
            <p className="form-help">Shortcut: {shortcuts.length} di 100. Gli shortcut sono locali, non cifrati. L'apertura dei file richiede l'app desktop.</p>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setAdding(false)}>Cancel</button><button type="submit" className="black-button" disabled={shortcuts.length >= 100}><Check size={16}/> Salva shortcut</button></div>
          </form>
        </div>
      </div>}
    </div>
  );
}
