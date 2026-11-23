import { useEffect, useMemo, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open as pickLocalFile } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowRight, ArrowUpRight, BookOpen, Check, Compass, ExternalLink,
  FolderOpen, Heart, Info, LayoutGrid, Link2, Monitor, Plus,
  RefreshCw, Search, Sparkles, Trash2, X,
} from "lucide-react";
import { catalog, categories, categoryLabel, localPlatform, validWebUrl } from "./catalog";
import type { CatalogApp, CustomShortcut, Platform } from "./types";

type Section = "discover" | "library" | "updates";
type ShortcutKind = "url" | "path";
type Draft = { name: string; kind: ShortcutKind; target: string };

const defaultDraft: Draft = { name: "", kind: "url", target: "" };
const platformLabels: Record<Platform, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};
const availableOn = localPlatform();
const runningInTauri = isTauri();

function readStored<T>(key: string, fallback: T, guard: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return guard(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isShortcutArray(value: unknown): value is CustomShortcut[] {
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const entry = item as Record<string, unknown>;
    return (
      typeof entry.id === "string" &&
      typeof entry.name === "string" &&
      typeof entry.target === "string" &&
      (entry.kind === "url" || entry.kind === "path")
    );
  });
}

function useStored<T>(key: string, fallback: T, guard: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, guard));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage may be unavailable or full; the current session still works.
    }
  }, [key, value]);
  return [value, setValue] as const;
}

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "brand-mark brand-mark-small" : "brand-mark"} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

function AppSymbol({ app }: { app: CatalogApp }) {
  const isBlender = app.id === "blender";
  return (
    <div className={`app-symbol ${isBlender ? "app-symbol-orange" : "app-symbol-purple"}`} aria-hidden="true">
      <span>{app.name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

function CatalogCard({
  app, saved, onSave, onOpen,
}: {
  app: CatalogApp;
  saved: boolean;
  onSave: (id: string) => void;
  onOpen: (url: string) => void;
}) {
  return (
    <article className="app-card">
      <div className="card-top">
        <AppSymbol app={app} />
        <button
          className={`icon-button save-button ${saved ? "is-saved" : ""}`}
          type="button"
          title={saved ? "Remove from library" : "Save to library"}
          aria-label={saved ? `Remove ${app.name} from library` : `Save ${app.name} to library`}
          aria-pressed={saved}
          onClick={() => onSave(app.id)}
        >
          <Heart size={18} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="card-content">
        <h3>{app.name}</h3>
        <p className="publisher">by {app.publisher}</p>
        <p className="card-description">{app.description}</p>
      </div>
      <div className="card-tags">
        {app.categories.slice(0, 2).map((category) => (
          <span className="tag" key={category}>{categoryLabel(category)}</span>
        ))}
      </div>
      <div className="card-foot">
        <span className="license-label">{app.pricingModel === "free-open-source" ? "Free · Open source" : "Freeware"}</span>
        <button className="text-action" type="button" onClick={() => onOpen(app.links.download)}>
          Download page <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="platform-strip">
        Available for: {app.platforms.map((platform) => platformLabels[platform]).join(" · ")}
      </div>
    </article>
  );
}

export default function App() {
  const [section, setSection] = useState<Section>("discover");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [favorites, setFavorites] = useStored<string[]>("ucsh:favorites:v1", [], isStringArray);
  const [shortcuts, setShortcuts] = useStored<CustomShortcut[]>("ucsh:shortcuts:v1", [], isShortcutArray);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const savedApps = catalog.filter((app) => favorites.includes(app.id));
  const filtered = useMemo(() => catalog.filter((app) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [
      app.name, app.publisher, app.description, ...app.categories,
    ].some((text) => text.toLowerCase().includes(needle));
    const matchesCategory = category === "all" || app.categories.includes(category);
    const matchesPlatform = platform === "all" || app.platforms.includes(platform);
    return matchesSearch && matchesCategory && matchesPlatform;
  }), [search, category, platform]);

  function toggleFavorite(id: string) {
    setFavorites((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function showError(error: unknown, action: string) {
    setNotice(`${action}: ${error instanceof Error ? error.message : String(error)}`);
  }

  async function openWebsite(url: string) {
    if (!validWebUrl(url)) {
      setNotice("Only HTTP and HTTPS links can be opened.");
      return;
    }
    try {
      if (runningInTauri) await openUrl(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      showError(error, "Could not open website");
    }
  }

  async function launchShortcut(shortcut: CustomShortcut) {
    if (shortcut.kind === "url") {
      await openWebsite(shortcut.target);
      return;
    }
    if (!runningInTauri) {
      setNotice("Launching local programs requires the desktop app. The browser preview can only open websites.");
      return;
    }
    try {
      // Only user-saved local paths can be opened, by explicit click.
      await openPath(shortcut.target);
    } catch (error) {
      showError(error, "Could not open local shortcut");
    }
  }

  async function browseForPath() {
    if (!runningInTauri) {
      setFormError("File selection requires the desktop app. You can still type a path for later.");
      return;
    }
    try {
      const chosen = await pickLocalFile({ multiple: false, directory: false });
      if (typeof chosen === "string") {
        setDraft((current) => ({ ...current, target: chosen }));
        setFormError("");
      }
    } catch (error) {
      showError(error, "Could not select file");
    }
  }

  function submitShortcut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    const target = draft.target.trim();
    if (!name || !target) {
      setFormError("Enter a name and a website or local file path.");
      return;
    }
    if (name.length > 80) {
      setFormError("Name must be 80 characters or fewer.");
      return;
    }
    if (draft.kind === "url" && !validWebUrl(target)) {
      setFormError("Enter an HTTP or HTTPS website URL.");
      return;
    }
    if (draft.kind === "path" && /[\r\n\0]/.test(target)) {
      setFormError("File paths cannot contain control characters.");
      return;
    }
    const item: CustomShortcut = {
      id: crypto.randomUUID(),
      name,
      target,
      kind: draft.kind,
    };
    setShortcuts((current) => [...current, item]);
    setShowAdd(false);
    setDraft(defaultDraft);
    setFormError("");
    setSection("library");
  }

  function removeShortcut(id: string) {
    setShortcuts((current) => current.filter((item) => item.id !== id));
  }

  const libraryCount = savedApps.length + shortcuts.length;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand-row">
          <BrandMark />
          <div>
            <div className="brand-title">CREATIVE<span>HUB</span></div>
            <div className="brand-caption">Universal software launcher</div>
          </div>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="navigation" aria-label="Main navigation">
          <button className={section === "discover" ? "nav-item active" : "nav-item"} type="button" onClick={() => setSection("discover")}>
            <Compass size={19} /><span>Discover</span><ArrowRight size={16} className="nav-arrow" />
          </button>
          <button className={section === "library" ? "nav-item active" : "nav-item"} type="button" onClick={() => setSection("library")}>
            <LayoutGrid size={19} /><span>My Library</span><span className="nav-count">{libraryCount}</span>
          </button>
          <button className={section === "updates" ? "nav-item active" : "nav-item"} type="button" onClick={() => setSection("updates")}>
            <RefreshCw size={19} /><span>Updates</span><span className="soon-dot" title="Planned feature" />
          </button>
        </nav>
        <div className="sidebar-label side-secondary">QUICK ACCESS</div>
        <button type="button" className="quick-add" onClick={() => { setSection("library"); setShowAdd(true); }}>
          <Plus size={18} /> Add your own app
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-info">
            <div className="sidebar-info-icon"><Sparkles size={19} /></div>
            <strong>Made for creators</strong>
            <p>Discover free tools from independent developers and established creative projects.</p>
          </div>
          <div className="sidebar-version">
            <BrandMark small />
            <div><strong>Early preview · v0.1</strong><span>Windows · macOS · Fedora</span></div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><ArrowRight size={13} /><strong>{section === "discover" ? "Discover" : section === "library" ? "My Library" : "Updates"}</strong></div>
          <div className="topbar-right">
            <span className="platform-pill"><Monitor size={14} /> {availableOn === "unknown" ? "Desktop" : platformLabels[availableOn]}</span>
            <span className="stage-pill">ALPHA</span>
          </div>
        </header>

        {notice && <div role="alert" className="notice"><Info size={17} /><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16}/></button></div>}

        {section === "discover" && (
          <>
            <div className="section-heading">
              <div><p className="eyebrow">EXPLORE THE POSSIBILITIES</p><h1>Discover creative tools<span className="heading-dot">.</span></h1><p className="section-subtitle">Everything you need to create, all in one place.</p></div>
              <span className="app-count">{catalog.length} curated apps</span>
            </div>
            <div className="hero">
              <div className="hero-text">
                <div className="hero-kicker"><Sparkles size={15}/> YOUR CREATIVE SPACE</div>
                <h2>One home for every<br/><em>creative idea.</em></h2>
                <p>Find free creative software, support independent developers, and build a personal library of your favorite tools.</p>
                <button type="button" className="hero-button" onClick={() => { setSection("library"); setShowAdd(true); }}>
                  Customize your library <ArrowUpRight size={17}/>
                </button>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orb orb-main"><BrandMark /></div>
                <span className="satellite sat-a" /><span className="satellite sat-b" /><span className="satellite sat-c" />
              </div>
            </div>
            <div className="catalog-heading">
              <div><h2>Explore the catalog</h2><p>Curated picks to get you started</p></div>
            </div>
            <div className="filters">
              <label className="search-field"><Search size={18}/><input aria-label="Search applications" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search apps, categories, publishers..." /></label>
              <label className="select-field"><span>Category</span><select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">All categories</option>{categories.map((item) => <option value={item} key={item}>{categoryLabel(item)}</option>)}
              </select></label>
              <label className="select-field"><span>Platform</span><select aria-label="Filter by operating system" value={platform} onChange={(e) => setPlatform(e.target.value as Platform | "all")}>
                <option value="all">All platforms</option><option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Linux (Fedora)</option>
              </select></label>
            </div>
            <div className="result-count">{filtered.length} {filtered.length === 1 ? "application" : "applications"} found</div>
            {filtered.length ? (
              <div className="cards-grid">{filtered.map((app) =>
                <CatalogCard key={app.id} app={app} saved={favorites.includes(app.id)} onSave={toggleFavorite} onOpen={openWebsite}/>,
              )}</div>
            ) : (
              <div className="empty-state"><Search size={28}/><h3>No matches found</h3><p>Try a different keyword or category.</p><button type="button" onClick={() => {setSearch("");setCategory("all");setPlatform("all");}}>Clear filters</button></div>
            )}
            <p className="catalog-disclaimer"><Info size={15}/> All downloads point to official publisher pages. No installers are hosted or run by the hub.</p>
          </>
        )}

        {section === "library" && (
          <>
            <div className="section-heading"><div><p className="eyebrow">YOUR PERSONAL WORKSPACE</p><h1>My Library<span className="heading-dot">.</span></h1><p className="section-subtitle">Your favorite tools and custom shortcuts, together.</p></div>
              <button type="button" className="primary-button" onClick={() => setShowAdd(true)}><Plus size={17}/> Add shortcut</button>
            </div>
            {libraryCount === 0 ? (
              <div className="library-empty"><div className="empty-art"><FolderOpen size={38}/></div><h2>Build your creative toolkit</h2><p>Save apps from Discover or add an installed program or website to your library.</p>
                <div className="empty-actions"><button className="primary-button" type="button" onClick={() => setShowAdd(true)}><Plus size={17}/> Add a shortcut</button><button className="secondary-button" type="button" onClick={() => setSection("discover")}>Browse catalog <ArrowRight size={16}/></button></div>
              </div>
            ) : (
              <div className="library-sections">
                {savedApps.length > 0 && <section><div className="library-heading"><h2>Saved software <span>{savedApps.length}</span></h2><p>Publisher download pages, not installed program detection.</p></div><div className="library-list">
                  {savedApps.map((app) => <article className="library-row" key={app.id}><AppSymbol app={app}/><div className="library-row-info"><strong>{app.name}</strong><span>{app.publisher} · {app.pricingModel === "free-open-source" ? "Open source" : "Freeware"}</span></div>
                    <button className="secondary-button" type="button" onClick={() => openWebsite(app.links.download)}>Publisher page <ExternalLink size={16}/></button>
                    <button className="icon-button" type="button" aria-label={`Remove ${app.name}`} title="Remove from library" onClick={() => toggleFavorite(app.id)}><Trash2 size={17}/></button></article>)}
                </div></section>}
                {shortcuts.length > 0 && <section><div className="library-heading"><h2>Your shortcuts <span>{shortcuts.length}</span></h2><p>Locally saved links and user-selected files.</p></div><div className="library-list">
                  {shortcuts.map((item) => <article className="library-row" key={item.id}><div className="shortcut-symbol">{item.kind === "url" ? <Link2 size={22}/> : <FolderOpen size={22}/>}</div>
                    <div className="library-row-info"><strong>{item.name}</strong><span title={item.target}>{item.kind === "url" ? "Website" : "Local path"} · {item.target}</span></div>
                    <button className="secondary-button" type="button" onClick={() => launchShortcut(item)}>{item.kind === "url" ? "Open website" : "Open file"} <ExternalLink size={16}/></button>
                    <button className="icon-button" type="button" aria-label={`Remove ${item.name}`} title="Remove shortcut" onClick={() => removeShortcut(item.id)}><Trash2 size={17}/></button>
                  </article>)}
                </div></section>}
              </div>
            )}
            <p className="catalog-disclaimer"><Info size={15}/> Library data is stored locally on this device; cloud sync and installed-app detection are not yet available.</p>
          </>
        )}

        {section === "updates" && (
          <>
            <div className="section-heading"><div><p className="eyebrow">COMING IN A FUTURE RELEASE</p><h1>Updates<span className="heading-dot">.</span></h1><p className="section-subtitle">A single place to keep your creative software current.</p></div></div>
            <div className="updates-panel"><div className="updates-symbol"><RefreshCw size={32}/></div><span className="future-label">ON THE ROADMAP</span><h2>Update management is not available yet</h2><p>We plan to check official software release sources, show updates by platform, and offer installation only where trusted integration is possible. For now, please update apps through their publishers or existing package managers.</p>
              <button className="secondary-button" type="button" onClick={() => setSection("discover")}>Browse apps <ArrowRight size={16}/></button>
              <div className="updates-foot"><BookOpen size={16}/> Independent app launchers and automatic updates will be reviewed separately for each platform.</div>
            </div>
          </>
        )}
      </main>

      {showAdd && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="add-shortcut-heading" className="modal">
          <div className="modal-head"><div><p className="eyebrow">MAKE IT YOURS</p><h2 id="add-shortcut-heading">Add a shortcut</h2></div><button type="button" className="icon-button" onClick={() => {setShowAdd(false);setFormError("");}} aria-label="Close"><X size={20}/></button></div>
          <form onSubmit={submitShortcut}>
            <label className="form-label">Shortcut name<input autoFocus maxLength={80} value={draft.name} onChange={(e) => setDraft({...draft,name:e.target.value})} placeholder="e.g. My drawing app" /></label>
            <div className="form-label">Shortcut type<div className="segmented-control"><button type="button" className={draft.kind === "url" ? "selected" : ""} onClick={() => {setDraft({...draft,kind:"url",target:""});setFormError("");}}><Link2 size={17}/> Website</button><button type="button" className={draft.kind === "path" ? "selected" : ""} onClick={() => {setDraft({...draft,kind:"path",target:""});setFormError("");}}><FolderOpen size={17}/> Local file</button></div></div>
            <label className="form-label">{draft.kind === "url" ? "Website URL" : "Executable, app, or file path"}<div className="input-with-action"><input value={draft.target} onChange={(e) => setDraft({...draft,target:e.target.value})} placeholder={draft.kind === "url" ? "https://example.org" : "/path/to/your/app"} />{draft.kind === "path" && <button type="button" className="browse-button" onClick={browseForPath}>Browse</button>}</div></label>
            <p className="form-help">{draft.kind === "url" ? "Only HTTP(S) websites can be opened." : "Local shortcuts open using your operating system's default handler; some app bundles or executable types may need additional support."}</p>
            {formError && <p role="alert" className="form-error">{formError}</p>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowAdd(false)}>Cancel</button><button className="primary-button" type="submit"><Check size={17}/> Save shortcut</button></div>
          </form>
        </div>
      </div>}
    </div>
  );
}
