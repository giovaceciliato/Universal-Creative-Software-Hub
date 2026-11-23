import { useEffect, useMemo, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open as chooseFile } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpRight, Check, CheckCircle2, Compass, ExternalLink,
  FolderOpen, Heart, Info, Library, Link2, Package, Plus, RefreshCw,
  Search, Settings2, Trash2, X,
} from "lucide-react";
import { catalog, categories, categoryLabel, localPlatform, validWebUrl } from "./catalog";
import type { CatalogApp, CustomShortcut, Platform } from "./types";

type View = "discover" | "library" | "installed" | "updates";
type ShortcutDraft = { name: string; kind: "url" | "path"; target: string };
const emptyDraft: ShortcutDraft = { name: "", kind: "url", target: "" };
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
                    <div className="software-title"><h3>{app.name}</h3><span className="free-label">FREE</span></div>
                    <p className="publisher">{app.publisher} <span className="separator">/</span> {app.pricingModel === "free-open-source" ? "Open source" : "Freeware"}</p>
                    <p className="description">{app.description}</p>
                    <div className="software-categories">{app.categories.slice(0, 3).map(cat => <span key={cat}>{categoryLabel(cat)}</span>)}</div>
                  </div>
                  <div className="software-actions">
                    <button className="icon-action" type="button" title={favorites.includes(app.id) ? "Remove from library" : "Save to library"} aria-label={favorites.includes(app.id) ? `Remove ${app.name} from library` : `Save ${app.name} to library`} aria-pressed={favorites.includes(app.id)} onClick={() => favorite(app.id)}>
                      <Heart size={19} fill={favorites.includes(app.id) ? "currentColor" : "none"}/>
                    </button>
                    <button type="button" className="outline-button" onClick={() => openWebsite(app.links.download)}>Get app <ArrowUpRight size={16}/></button>
                  </div>
                </article>
              ))}
              {filtered.length === 0 && <div className="empty"><Search size={26}/><h3>Nothing found</h3><p>Try another search or choose a different category.</p><button type="button" className="outline-button" onClick={() => {setQuery("");setCategory("all");setPlatform("all");}}>Reset filters</button></div>}
            </div>
            <div className="footnote"><Info size={15}/><span>Official publisher download links only. Installation and update automation are not active.</span></div>
          </>
        )}

        {view === "library" && (
          <>
            <header className="page-header page-header-inline"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>My Library.</h1><p className="subheading">Saved software and shortcuts, all in one place.</p></div><button className="black-button" type="button" onClick={() => setAdding(true)}><Plus size={17}/> Add shortcut</button></header>
            {count === 0 && <div className="empty large"><FolderOpen size={33}/><h3>Your library is empty</h3><p>Save an app from Discover, or add a local executable or web link.</p><button type="button" className="black-button" onClick={() => setView("discover")}>Explore software <ArrowUpRight size={16}/></button></div>}
            {saved.length > 0 && <section className="library-section"><div className="list-heading"><h2>Saved from Discover</h2><span>{saved.length}</span></div><div className="software-list">
              {saved.map(app => <article className="compact-row" key={app.id}><AppIcon app={app}/><div className="compact-info"><strong>{app.name}</strong><small>{app.publisher} · Publisher page only</small></div><button type="button" className="outline-button" onClick={() => openWebsite(app.links.download)}>Publisher <ArrowUpRight size={15}/></button><button type="button" className="icon-action" title="Remove from library" aria-label={`Remove ${app.name}`} onClick={() => favorite(app.id)}><Trash2 size={17}/></button></article>)}
            </div></section>}
            {shortcuts.length > 0 && <section className="library-section"><div className="list-heading"><h2>Custom shortcuts</h2><span>{shortcuts.length}</span></div><div className="software-list">
              {shortcuts.map(item => <article className="compact-row" key={item.id}><span className="shortcut-icon">{item.kind === "url" ? <Link2 size={23}/> : <FolderOpen size={23}/>}</span><div className="compact-info"><strong>{item.name}</strong><small title={item.target}>{item.target}</small></div><button type="button" className="outline-button" onClick={() => openShortcut(item)}>{item.kind === "url" ? "Open link" : "Open file"} <ExternalLink size={15}/></button><button type="button" className="icon-action" title="Remove shortcut" aria-label={`Remove ${item.name}`} onClick={() => setShortcuts(xs => xs.filter(x => x.id !== item.id))}><Trash2 size={17}/></button></article>)}
            </div></section>}
            <div className="footnote"><Info size={15}/><span>Saved library entries are not a confirmed list of installed applications. Data stays on this device.</span></div>
          </>
        )}

        {view === "installed" && (
          <>
            <header className="page-header"><p className="eyebrow">YOUR COMPUTER</p><h1>Installed software.</h1><p className="subheading">One place to see the creative tools already on your machine.</p></header>
            <div className="feature-empty"><div className="feature-symbol"><Package size={32} strokeWidth={1.3}/></div><p className="eyebrow">DETECTION ENGINE / NEXT MILESTONE</p><h2>Device scanning is not active yet.</h2><p>The platform-specific detection contracts and known app identifiers are being defined. No computer scan has been performed and no installed status is inferred from saved bookmarks.</p><span className="line-chip">Windows · macOS · Fedora</span></div>
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
