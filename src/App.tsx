import { useEffect, useMemo, useState, type FormEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as chooseFile } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowDownToLine, ArrowUpRight, Check, CheckCircle2, Compass, ExternalLink,
  FolderOpen, Heart, Info, Library, Link2, Package, Plus, RefreshCw,
  Search, Settings2, Trash2, X,
} from "lucide-react";
import { catalog, categories, categoryLabel, localPlatform, validWebUrl } from "./catalog";
import type { CatalogApp, CustomShortcut, Platform } from "./types";
import type { InstalledMatch } from "./integrations/contracts";

type View = "discover" | "library" | "installed" | "updates";
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
interface DownloadProgress { appId: string; received: number; total: number; }

const native = isTauri();
const devicePlatform = localPlatform();
const platforms: Record<Platform, string> = {
  windows: "Windows", macos: "macOS", linux: "Fedora / Linux",
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
  { key: "installed", label: "Installed", icon: CheckCircle2 },
  { key: "updates", label: "Updates", icon: RefreshCw },
];

export default function App() {
  const [view, setView] = useState<View>("discover");
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
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<Record<string, number>>({});
  const [completedDownloads, setCompletedDownloads] = useState<Record<string, DownloadResult>>({});

  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void invoke<DownloadOffer[]>("available_downloads")
      .then(offers => { if (!disposed) setDownloadOffers(offers); })
      .catch(() => { if (!disposed) setDownloadOffers([]); });
    void listen<DownloadProgress>("catalog-download-progress", event => {
      if (!disposed && event.payload.total > 0) {
        setDownloadPercent(current => ({
          ...current,
          [event.payload.appId]: Math.min(100, Math.floor(100 * event.payload.received / event.payload.total)),
        }));
      }
    }).then(remove => {
      if (disposed) remove();
      else unlisten = remove;
    }).catch(() => {});
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const saved = catalog.filter(app => favorites.includes(app.id));
  const filtered = useMemo(() => catalog.filter(app => {
    const q = query.trim().toLowerCase();
    return (category === "all" || app.categories.includes(category)) &&
      (platform === "all" || app.platforms.includes(platform)) &&
      (!q || [app.name, app.publisher, app.description, ...app.categories]
        .some(value => value.toLowerCase().includes(q)));
  }), [query, category, platform]);

  const favorite = (id: string) => setFavorites(current =>
    current.includes(id) ? current.filter(x => x !== id) : [...current, id]);

  async function openWebsite(url: string) {
    if (!validWebUrl(url)) { setNotification("Only HTTP(S) links are supported."); return; }
    try {
      if (native) await openUrl(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) { setNotification(`Could not open link: ${String(error)}`); }
  }

  async function scanComputer() {
    setView("installed");
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

  async function directDownload(app: CatalogApp) {
    const offer = downloadOffers.find(item => item.appId === app.id);
    if (!native || !offer) {
      await openWebsite(app.links.download);
      return;
    }
    if (downloading) return;
    setDownloading(app.id);
    setDownloadPercent(current => ({...current, [app.id]: 0}));
    setNotification("");
    try {
      const result = await invoke<DownloadResult>("download_app", { appId: app.id });
      setCompletedDownloads(current => ({...current, [app.id]: result}));
      setNotification(`${app.name} downloaded to ${result.savedPath}. ${result.checksumVerified ? "SHA-256 verified." : "Checksum not verified; review the publisher signature before running."} The installer was not executed.`);
    } catch (error) {
      setNotification(`Download failed: ${String(error)}. Use the official publisher page if needed.`);
    } finally {
      setDownloading(null);
    }
  }

  function DownloadButton({ app, small = false }: { app: CatalogApp; small?: boolean }) {
    const offer = downloadOffers.find(item => item.appId === app.id);
    const active = downloading === app.id;
    const done = completedDownloads[app.id];
    const label = active ? `Downloading ${downloadPercent[app.id] ?? 0}%`
      : done ? "Downloaded"
      : offer ? `Download ${small ? "" : offer.version}`.trim()
      : "Official page";
    return <button
      type="button"
      className="outline-button"
      disabled={Boolean(downloading) || Boolean(done)}
      aria-label={`${label} ${app.name}`}
      title={offer ? `Save ${offer.fileName} to your Downloads folder (${Math.round(offer.sizeBytes / 1024 / 1024)} MiB)` : "Open official publisher downloads"}
      onClick={() => { void directDownload(app); }}
    >
      {label} {offer ? <ArrowDownToLine size={small ? 15 : 16} /> : <ArrowUpRight size={small ? 15 : 16} />}
    </button>;
  }

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
    setView("library");
  }

  const count = shortcuts.length + saved.length;
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
            </button>
          ))}
        </nav>
        <button type="button" className="sidebar-add" onClick={() => { setAdding(true); setView("library"); }}>
          <Plus size={17} /> Add custom app
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
            <div className="toolbar-actions">
              <button className="outline-button" type="button" onClick={() => { void scanComputer(); }} disabled={scanning}>
                <RefreshCw size={16} className={scanning ? "spin" : ""} />
                {scanning ? "Scanning..." : "Scan computer"}
              </button>
            </div>
            <div className="controls">
              <label className="search"><Search size={19} aria-hidden="true"/><input aria-label="Search software" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search software, categories, publishers" /></label>
              <label className="platform-filter"><Settings2 size={17}/><select aria-label="Operating system" value={platform} onChange={e => setPlatform(e.target.value as Platform | "all")}>
                <option value="all">All platforms</option>
                <option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Fedora / Linux</option>
              </select></label>
            </div>
            <div className="category-tabs" role="group" aria-label="Categories">
              <button type="button" className={category === "all" ? "category-tab active" : "category-tab"} onClick={() => setCategory("all")}>All software</button>
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
                    <DownloadButton app={app} />
                  </div>
                </article>
              ))}
              {filtered.length === 0 && <div className="empty"><Search size={26}/><h3>Nothing found</h3><p>Try another search or choose a different category.</p><button type="button" className="outline-button" onClick={() => {setQuery("");setCategory("all");setPlatform("all");}}>Reset filters</button></div>}
            </div>
            <div className="footnote"><Info size={15}/><span>Native downloads save publisher files to Downloads without running them. Software installation and updates are not automated.</span></div>
          </>
        )}

        {view === "library" && (
          <>
            <header className="page-header page-header-inline"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>My Library.</h1><p className="subheading">Saved software and shortcuts, all in one place.</p></div><button className="black-button" type="button" onClick={() => setAdding(true)}><Plus size={17}/> Add shortcut</button></header>
            {count === 0 && <div className="empty large"><FolderOpen size={33}/><h3>Your library is empty</h3><p>Save an app from Discover, or add a local executable or web link.</p><button type="button" className="black-button" onClick={() => setView("discover")}>Explore software <ArrowUpRight size={16}/></button></div>}
            {saved.length > 0 && <section className="library-section"><div className="list-heading"><h2>Saved from Discover</h2><span>{saved.length}</span></div><div className="software-list">
              {saved.map(app => <article className="compact-row" key={app.id}><AppIcon app={app}/><div className="compact-info"><strong>{app.name}</strong><small>{app.publisher} · Saved from catalog</small></div><DownloadButton app={app} small /><button type="button" className="icon-action" title="Remove from library" aria-label={`Remove ${app.name}`} onClick={() => favorite(app.id)}><Trash2 size={17}/></button></article>)}
            </div></section>}
            {shortcuts.length > 0 && <section className="library-section"><div className="list-heading"><h2>Custom shortcuts</h2><span>{shortcuts.length}</span></div><div className="software-list">
              {shortcuts.map(item => <article className="compact-row" key={item.id}><span className="shortcut-icon">{item.kind === "url" ? <Link2 size={23}/> : <FolderOpen size={23}/>}</span><div className="compact-info"><strong>{item.name}</strong><small title={item.target}>{item.target}</small></div><button type="button" className="outline-button" onClick={() => openShortcut(item)}>{item.kind === "url" ? "Open link" : "Open file"} <ExternalLink size={15}/></button><button type="button" className="icon-action" title="Remove shortcut" aria-label={`Remove ${item.name}`} onClick={() => setShortcuts(xs => xs.filter(x => x.id !== item.id))}><Trash2 size={17}/></button></article>)}
            </div></section>}
            <div className="footnote"><Info size={15}/><span>Saved library entries are not a confirmed list of installed applications. Data stays on this device.</span></div>
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
              <p>The scan checks local package managers, known application paths and desktop entries for Blender and Krita. It is read-only, stays on this device, and does not contact a server.</p>
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
                {scanReport.matches.length === 0 && <div className="empty"><Search size={27}/><h3>No catalog apps detected</h3><p>This scan currently recognizes Blender and Krita through supported sources. Portable apps outside known paths may not appear.</p></div>}
              </div>
              {scanReport.warnings.length > 0 && <div className="scan-warning">{scanReport.warnings.map(x => <p key={x}>{x}</p>)}</div>}
              <div className="footnote"><Info size={15}/><span>A file or shortcut match does not guarantee that an app works. Updates are not yet managed here. Results are not uploaded.</span></div>
            </>}
          </>
        )}

        {view === "updates" && (
          <>
            <header className="page-header"><p className="eyebrow">MAINTENANCE</p><h1>Software updates.</h1><p className="subheading">Keep the tools you use up to date, safely.</p></header>
            <div className="feature-empty"><div className="feature-symbol"><RefreshCw size={31} strokeWidth={1.3}/></div><p className="eyebrow">UPDATE ADAPTERS / NEXT MILESTONE</p><h2>Update management is not active yet.</h2><p>Future integrations will use verified package managers and publisher-supported update channels. The hub will not execute commands supplied by an app catalog entry.</p><span className="line-chip">WinGet · Homebrew · DNF · Flatpak</span></div>
          </>
        )}
      </main>

      {adding && <div className="modal-backdrop" role="presentation" onMouseDown={e => {if(e.currentTarget === e.target) setAdding(false);}}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <header><div><p className="eyebrow">MY LIBRARY</p><h2 id="modal-title">Add shortcut</h2></div><button type="button" className="icon-action" aria-label="Close" onClick={() => {setAdding(false);setFormError("");}}><X size={20}/></button></header>
          <form onSubmit={saveShortcut}>
            <label className="form-label">Name<input autoFocus maxLength={80} placeholder="My creative app" value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})}/></label>
            <div className="form-label">Type<div className="segmented"><button className={draft.kind === "url" ? "chosen" : ""} type="button" onClick={() => {setDraft({...draft,kind:"url",target:""});setFormError("");}}><Link2 size={16}/> Website</button><button className={draft.kind === "path" ? "chosen" : ""} type="button" onClick={() => {setDraft({...draft,kind:"path",target:""});setFormError("");}}><FolderOpen size={16}/> Local file</button></div></div>
            <label className="form-label">Target<div className="form-input-row"><input value={draft.target} onChange={e => setDraft({...draft,target:e.target.value})} placeholder={draft.kind === "url" ? "https://example.org" : "Path to your application"}/>{draft.kind === "path" && <button type="button" className="browse-button" onClick={browsePath}>Browse</button>}</div></label>
            <p className="form-help">Shortcuts are saved locally. Opening local paths requires the desktop application.</p>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setAdding(false)}>Cancel</button><button type="submit" className="black-button"><Check size={16}/> Save shortcut</button></div>
          </form>
        </div>
      </div>}
    </div>
  );
}
