use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::env;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogEntry {
    id: String,
    integrations: HashMap<String, PlatformHints>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PlatformHints {
    #[serde(default)]
    executable_names: Vec<String>,
    #[serde(default)]
    bundle_names: Vec<String>,
    #[serde(default)]
    desktop_ids: Vec<String>,
    #[serde(default)]
    flatpak_ids: Vec<String>,
    #[serde(default)]
    rpm_names: Vec<String>,
    #[serde(default)]
    homebrew_casks: Vec<String>,
    #[serde(default)]
    winget_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMatch {
    pub app_id: String,
    pub platform: String,
    pub source: String,
    pub confidence: String,
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launch_target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub managed_by: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub platform: String,
    pub matches: Vec<InstalledMatch>,
    pub checked_sources: Vec<String>,
    pub warnings: Vec<String>,
}

fn run_read_only(program: &str, args: &[&str]) -> Option<String> {
    // Fixed binaries, no shell, no installer execution, no network calls.
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn entries() -> Result<Vec<CatalogEntry>, String> {
    [
        include_str!("../../catalog/apps/blender.json"),
        include_str!("../../catalog/apps/krita.json"),
        include_str!("../../catalog/apps/photocraft.json"),
        include_str!("../../catalog/apps/vectorcraft.json"),
        include_str!("../../catalog/apps/filmcraft.json"),
        include_str!("../../catalog/apps/lightcraft.json"),
        include_str!("../../catalog/apps/pdfcraft.json"),
        include_str!("../../catalog/apps/effectcraft.json"),
        include_str!("../../catalog/apps/anicraft.json"),
        include_str!("../../catalog/apps/designcraft.json"),
        include_str!("../../catalog/apps/figcraft.json"),
        include_str!("../../catalog/apps/texturecraft.json"),
        include_str!("../../catalog/apps/materialcraft.json"),
        include_str!("../../catalog/apps/wordcraft.json"),
        include_str!("../../catalog/apps/soundcraft.json"),
        include_str!("../../catalog/apps/deckcraft.json"),
        include_str!("../../catalog/apps/cadcraft.json"),
        include_str!("../../catalog/apps/gridcraft.json"),
        include_str!("../../catalog/apps/craft-anything.json"),
        include_str!("../../catalog/apps/solidcraft.json"),
        include_str!("../../catalog/apps/mailcraft.json"),
    ]
        .iter()
        .map(|data| serde_json::from_str(data).map_err(|e| format!("Invalid catalog manifest: {e}")))
        .collect()
}

fn append_match(
    matches: &mut Vec<InstalledMatch>,
    seen: &mut HashSet<(String, String, String)>,
    app: &str,
    source: &str,
    confidence: &str,
    source_id: &str,
    version: Option<String>,
    path: Option<String>,
    manager: Option<&str>,
) {
    if seen.insert((app.into(), source.into(), source_id.into())) {
        matches.push(InstalledMatch {
            app_id: app.into(),
            platform: env::consts::OS.into(),
            source: source.into(),
            confidence: confidence.into(),
            source_id: source_id.into(),
            installed_version: version,
            launch_target: path,
            managed_by: manager.map(str::to_string),
        });
    }
}

#[cfg(target_os = "linux")]
fn scan_linux(
    app: &str,
    hints: &PlatformHints,
    matches: &mut Vec<InstalledMatch>,
    seen: &mut HashSet<(String, String, String)>,
) {
    for id in &hints.flatpak_ids {
        if let Some(version) = run_read_only("flatpak", &["info", "--show-version", id]) {
            append_match(matches, seen, app, "flatpak", "exact-package-id", id, Some(version), None, Some("flatpak"));
        }
    }
    for package in &hints.rpm_names {
        if let Some(version) = run_read_only("rpm", &["-q", "--qf", "%{VERSION}", package]) {
            append_match(matches, seen, app, "dnf", "exact-package-id", package, Some(version), None, Some("dnf"));
        }
    }

    let mut app_dirs = vec![
        PathBuf::from("/usr/share/applications"),
        PathBuf::from("/usr/local/share/applications"),
        PathBuf::from("/var/lib/flatpak/exports/share/applications"),
    ];
    if let Some(home) = env::var_os("HOME") {
        let home = PathBuf::from(home);
        app_dirs.push(home.join(".local/share/applications"));
        app_dirs.push(home.join(".local/share/flatpak/exports/share/applications"));
    }
    for desktop_id in &hints.desktop_ids {
        for dir in &app_dirs {
            let path = dir.join(desktop_id);
            if path.is_file() {
                append_match(matches, seen, app, "linux-desktop-entry", "name-only", &path.to_string_lossy(), None, None, None);
            }
        }
    }
    find_on_path(app, &hints.executable_names, matches, seen);
}

fn find_on_path(
    app: &str,
    names: &[String],
    matches: &mut Vec<InstalledMatch>,
    seen: &mut HashSet<(String, String, String)>,
) {
    if let Some(path) = env::var_os("PATH") {
        for directory in env::split_paths(&path).take(64) {
            for name in names {
                let candidate = directory.join(name);
                if candidate.is_file() {
                    let label = candidate.to_string_lossy().into_owned();
                    append_match(matches, seen, app, "executable-path", "name-only", &label, None, Some(label.clone()), None);
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn scan_macos(
    app: &str,
    hints: &PlatformHints,
    matches: &mut Vec<InstalledMatch>,
    seen: &mut HashSet<(String, String, String)>,
) {
    let mut roots = vec![PathBuf::from("/Applications")];
    if let Some(home) = env::var_os("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    for bundle in &hints.bundle_names {
        for root in &roots {
            let path = root.join(bundle);
            if path.is_dir() {
                let id = path.to_string_lossy().into_owned();
                append_match(matches, seen, app, "macos-bundle", "name-only", &id, None, Some(id.clone()), None);
            }
        }
    }
    let brew = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]
        .into_iter().find(|candidate| std::path::Path::new(candidate).is_file())
        .unwrap_or("brew");
    for cask in &hints.homebrew_casks {
        if let Some(info) = run_read_only(brew, &["list", "--cask", "--versions", cask]) {
            let version = info.split_whitespace().nth(1).map(str::to_string);
            append_match(matches, seen, app, "homebrew", "exact-package-id", cask, version, None, Some("homebrew"));
        }
    }
    find_on_path(app, &hints.executable_names, matches, seen);
}

#[cfg(target_os = "windows")]
fn scan_windows(
    app: &str,
    hints: &PlatformHints,
    matches: &mut Vec<InstalledMatch>,
    seen: &mut HashSet<(String, String, String)>,
) {
    let mut roots = Vec::new();
    for key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Some(value) = env::var_os(key) {
            roots.push(PathBuf::from(value));
        }
    }
    let known_subfolders: &[&str] = match app {
        "blender" => &["Blender Foundation", "Blender", "Blender Foundation/Blender 5.3"],
        "krita" => &["Krita (x64)", "Krita", "Krita (x64)/bin", "Krita/bin"],
        "photocraft" => &["PhotoCraft", "ArtCraft/PhotoCraft"],
        "vectorcraft" => &["VectorCraft", "ArtCraft/VectorCraft"],
        "filmcraft" => &["FilmCraft", "ArtCraft/FilmCraft"],
        "lightcraft" => &["LightCraft", "ArtCraft/LightCraft"],
        "pdfcraft" => &["PdfCraft", "ArtCraft/PdfCraft"],
        "effectcraft" => &["EffectCraft", "ArtCraft/EffectCraft"],
        "anicraft" => &["AniCraft", "ArtCraft/AniCraft"],
        "designcraft" => &["DesignCraft", "ArtCraft/DesignCraft"],
        "figcraft" => &["FigCraft", "ArtCraft/FigCraft"],
        "texturecraft" => &["TextureCraft", "ArtCraft/TextureCraft"],
        "materialcraft" => &["MaterialCraft", "ArtCraft/MaterialCraft"],
        "wordcraft" => &["WordCraft", "ArtCraft/WordCraft"],
        "soundcraft" => &["SoundCraft", "ArtCraft/SoundCraft"],
        "deckcraft" => &["DeckCraft", "ArtCraft/DeckCraft"],
        "cadcraft" => &["CADCraft", "ArtCraft/CADCraft"],
        "gridcraft" => &["GridCraft", "ArtCraft/GridCraft"],
        "craft-anything" => &["Craft Anything", "CraftAnything"],
        _ => &[],
    };
    for root in roots {
        for subfolder in known_subfolders {
            let dir = root.join(subfolder);
            for exe in &hints.executable_names {
                let paths = [dir.join(exe), dir.join("bin").join(exe)];
                for path in paths {
                    if path.is_file() {
                        let id = path.to_string_lossy().into_owned();
                        append_match(matches, seen, app, "executable-path", "name-only", &id, None, Some(id.clone()), None);
                    }
                }
            }
        }
    }
    for package_id in &hints.winget_ids {
        if let Some(output) = run_read_only("winget", &["list", "--id", package_id, "--exact", "--disable-interactivity"]) {
            // The command output is localized; require an actual exact ID token
            // rather than trusting process exit status or matching an app name.
            if output.lines().any(|row| row.split_whitespace().any(|token| token == package_id)) {
                append_match(matches, seen, app, "winget", "exact-package-id", package_id, None, None, Some("winget"));
            }
        }
    }
    find_on_path(app, &hints.executable_names, matches, seen);
}

pub fn scan_installed() -> Result<ScanReport, String> {
    let platform = env::consts::OS.to_string();
    let entries = entries()?;
    let mut report = ScanReport {
        platform: platform.clone(),
        matches: Vec::new(),
        checked_sources: Vec::new(),
        warnings: Vec::new(),
    };
    let mut seen = HashSet::new();
    #[cfg(target_os = "linux")]
    {
        report.checked_sources.extend(["rpm", "flatpak", "desktop entries", "PATH"].iter().map(|s| s.to_string()));
        if Command::new("rpm").arg("--version").output().is_err() {
            report.warnings.push("RPM unavailable: RPM applications cannot be checked.".into());
        }
        if Command::new("flatpak").arg("--version").output().is_err() {
            report.warnings.push("Flatpak unavailable: Flatpak applications cannot be checked.".into());
        }
    }
    #[cfg(target_os = "macos")]
    report.checked_sources.extend(["application bundles", "Homebrew (if installed)", "PATH"].iter().map(|s| s.to_string()));
    #[cfg(target_os = "windows")]
    report.checked_sources.extend(["WinGet (if available)", "known installation directories", "PATH"].iter().map(|s| s.to_string()));

    for entry in entries {
        let Some(hints) = entry.integrations.get(&platform) else { continue };
        #[cfg(target_os = "linux")]
        scan_linux(&entry.id, hints, &mut report.matches, &mut seen);
        #[cfg(target_os = "macos")]
        scan_macos(&entry.id, hints, &mut report.matches, &mut seen);
        #[cfg(target_os = "windows")]
        scan_windows(&entry.id, hints, &mut report.matches, &mut seen);
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manifests_are_loadable() {
        let manifests = entries().unwrap();
        assert_eq!(manifests.len(), 21);
        assert!(manifests.iter().any(|app| app.id == "blender"));
        assert!(manifests.iter().any(|app| app.id == "krita"));
        assert!(manifests.iter().any(|app| app.id == "anicraft"));
        assert!(manifests.iter().any(|app| app.id == "craft-anything"));
    }
    #[test]
    fn version_missing_is_not_installed() {
        assert!(run_read_only("ucsh-command-that-does-not-exist", &[]).is_none());
    }
}
