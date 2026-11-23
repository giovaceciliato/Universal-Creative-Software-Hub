use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::IpAddr;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tempfile::{Builder, NamedTempFile};

const CRAFT_IDS: &[&str] = &[
    "photocraft", "vectorcraft", "filmcraft", "lightcraft", "pdfcraft",
    "effectcraft", "anicraft", "designcraft", "figcraft", "texturecraft",
    "materialcraft", "wordcraft", "soundcraft", "deckcraft", "cadcraft",
    "gridcraft", "craft-anything",
];
static INSTALLING: AtomicBool = AtomicBool::new(false);

struct InstallLock;
impl InstallLock {
    fn acquire() -> Result<Self, String> {
        INSTALLING
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "Another installation is already running.".to_string())?;
        Ok(Self)
    }
}
impl Drop for InstallLock {
    fn drop(&mut self) { INSTALLING.store(false, Ordering::Release); }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub app_id: String,
    pub version: String,
    pub method: String,
    pub source: String,
    pub requires_authorization: bool,
    pub manual_steps: bool,
    pub size_bytes: Option<u64>,
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    pub app_id: String,
    pub status: String,
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallProgress {
    app_id: String,
    received: u64,
    total: u64,
}

#[derive(Debug, Deserialize, Clone)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Clone)]
enum InstallStrategy {
    FedoraPackage(&'static str),
    WindowsWinget(&'static str),
    MacHomebrew(&'static str),
    CraftRelease {
        app_id: String,
        release: String,
        artifact: GitHubAsset,
        checksums: GitHubAsset,
    },
}

struct ProposedInstall {
    plan: InstallPlan,
    strategy: InstallStrategy,
}

fn valid_release_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
}

fn remote_url_is_safe(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" { return false; }
    let Some(host) = url.host_str() else { return false; };
    let host = host.to_ascii_lowercase();
    let candidate = host.trim_start_matches('[').trim_end_matches(']');
    candidate.parse::<IpAddr>().is_err()
        && host != "localhost"
        && !host.ends_with(".localhost")
        && !host.ends_with(".local")
        && !host.ends_with(".internal")
}

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("UniversalCreativeSoftwareHub/0.2")
        .connect_timeout(Duration::from_secs(25))
        .timeout(Duration::from_secs(3600))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 8 {
                attempt.error("Too many redirects")
            } else if remote_url_is_safe(attempt.url()) {
                attempt.follow()
            } else {
                attempt.error("Insecure or local redirect rejected")
            }
        }))
        .build()
        .map_err(|e| format!("Cannot create HTTP client: {e}"))
}

fn verified_asset(repo: &str, release: &str, asset: &GitHubAsset) -> bool {
    let expected_prefix = format!("https://github.com/storytold/{repo}/releases/download/{release}/");
    asset.browser_download_url == format!("{expected_prefix}{}", asset.name)
        && asset.size > 0
        && asset.size <= 2_147_483_648
        && asset.name.len() < 180
        && asset.name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
}

fn asset_suffix() -> Result<&'static str, String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => Ok("-linux-x86_64.rpm"),
        ("linux", "aarch64") => Ok("-linux-aarch64.rpm"),
        ("windows", "x86_64") => Ok("-windows-x64.msi"),
        ("windows", "aarch64") => Ok("-windows-arm64.msi"),
        ("macos", "x86_64" | "aarch64") => Ok("-macos-universal.dmg"),
        _ => Err("This OS or CPU architecture needs a manual publisher installation.".into()),
    }
}

fn is_fedora() -> bool {
    std::fs::read_to_string("/etc/os-release")
        .map(|file| file.lines().any(|line| line.trim() == "ID=fedora" || line.trim() == "ID=\"fedora\""))
        .unwrap_or(false)
}

fn plan_for(app_id: &str) -> Result<ProposedInstall, String> {
    let (version, method, source, requires_authorization, manual_steps, size_bytes, message, strategy) =
        if app_id == "blender" || app_id == "krita" {
            let (rpm_name, winget_id, cask) = if app_id == "blender" {
                ("blender", "BlenderFoundation.Blender", "blender")
            } else {
                ("krita", "KDE.Krita", "krita")
            };
            match std::env::consts::OS {
                "linux" if is_fedora() =>
                    ("repository".to_string(), "Fedora DNF".to_string(), "Fedora official repositories".to_string(), true, false, None,
                     "Fedora will request administrator authorization through PolicyKit if required.".to_string(), InstallStrategy::FedoraPackage(rpm_name)),
                "windows" =>
                    ("repository".to_string(), "Windows WinGet".to_string(), format!("WinGet package {winget_id}"), true, false, None,
                     "Windows Installer or UAC may request authorization; WinGet handles the publisher's installer.".to_string(), InstallStrategy::WindowsWinget(winget_id)),
                "macos" =>
                    ("repository".to_string(), "Homebrew Cask".to_string(), format!("Homebrew cask {cask}"), false, false, None,
                     "Homebrew must be installed. It may request system authorization when the application is copied.".to_string(), InstallStrategy::MacHomebrew(cask)),
                _ => return Err("Direct installation for this operating system is unavailable. Use the publisher download instead.".into()),
            }
        } else if CRAFT_IDS.contains(&app_id) {
            if std::env::consts::OS == "linux" && !is_fedora() {
                return Err("This RPM installer currently supports Fedora. Use the official release page elsewhere.".into());
            }
            let suffix = asset_suffix()?;
            let http = client()?;
            let request = format!("https://api.github.com/repos/storytold/{app_id}/releases/latest");
            let release: GitHubRelease = http.get(&request).send()
                .and_then(|r| r.error_for_status())
                .map_err(|e| format!("Could not look up the ArtCraft release: {e}"))?
                .json()
                .map_err(|e| format!("Invalid release metadata: {e}"))?;
            if !valid_release_token(&release.tag_name) {
                return Err("Publisher returned an unexpected release identifier.".into());
            }
            let artifact = release.assets.iter().find(|a| {
                a.name.starts_with(&format!("{app_id}-"))
                    && a.name.ends_with(suffix)
                    && verified_asset(app_id, &release.tag_name, a)
            }).cloned().ok_or_else(|| format!("No official {suffix} package was found for this app."))?;
            let checksums = release.assets.iter().find(|a| a.name == "SHA256SUMS.txt"
                && verified_asset(app_id, &release.tag_name, a))
                .cloned().ok_or("Release does not provide a trusted checksum manifest.")?;
            let method = match std::env::consts::OS {
                "linux" => "Fedora DNF (RPM)",
                "windows" => "Windows Installer (MSI)",
                "macos" => "macOS disk image (DMG)",
                _ => unreachable!(),
            };
            let manual = std::env::consts::OS == "macos";
            let message = if manual {
                "The verified DMG will open in Finder. Move the .app into Applications to finish.".to_string()
            } else if std::env::consts::OS == "linux" {
                "The RPM will be checksum-verified before Fedora requests your administrator password.".to_string()
            } else {
                "The MSI will be checksum-verified and opened in Windows Installer. UAC may request permission.".to_string()
            };
            (
                release.tag_name.clone(),
                method.into(),
                format!("https://github.com/storytold/{app_id}/releases/tag/{}", release.tag_name),
                !manual,
                manual,
                Some(artifact.size),
                message,
                InstallStrategy::CraftRelease {
                    app_id: app_id.to_string(), release: release.tag_name,
                    artifact, checksums,
                },
            )
        } else {
            return Err("Only curated apps can be installed by this launcher.".into());
        };

    Ok(ProposedInstall {
        plan: InstallPlan {
            app_id: app_id.to_string(), version, method, source,
            requires_authorization, manual_steps, size_bytes, message,
        },
        strategy,
    })
}

pub async fn preview_install(app_id: String) -> Result<InstallPlan, String> {
    tauri::async_runtime::spawn_blocking(move || plan_for(&app_id).map(|p| p.plan))
        .await.map_err(|e| format!("Install preview worker failed: {e}"))?
}

fn parse_checksum(contents: &str, name: &str) -> Option<String> {
    contents.lines().find_map(|line| {
        let mut pieces = line.split_whitespace();
        let checksum = pieces.next()?;
        let file = pieces.next()?.trim_start_matches('*');
        if file == name && checksum.len() == 64 && checksum.bytes().all(|b| b.is_ascii_hexdigit()) {
            Some(checksum.to_ascii_lowercase())
        } else {
            None
        }
    })
}

fn stage_craft_package(
    app_id: &str, release: &str, artifact: &GitHubAsset, checksums: &GitHubAsset,
    app: &AppHandle,
) -> Result<NamedTempFile, String> {
    if !verified_asset(app_id, release, artifact)
        || !verified_asset(app_id, release, checksums)
    {
        return Err("Package URL does not match its verified publisher release.".into());
    }
    let client = client()?;
    let checksums_body = client.get(&checksums.browser_download_url).send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Could not obtain publisher checksums: {e}"))?
        .text().map_err(|e| format!("Invalid checksums response: {e}"))?;
    if checksums_body.len() > 512_000 { return Err("Checksum manifest exceeded permitted size.".into()); }
    let expected = parse_checksum(&checksums_body, &artifact.name)
        .ok_or("Publisher checksum for this installer was not found.")?;
    let temp_dir = std::env::temp_dir();
    let extension = if artifact.name.ends_with(".rpm") { ".rpm" }
        else if artifact.name.ends_with(".msi") { ".msi" }
        else { ".dmg" };
    let mut staged = Builder::new()
        .prefix("ucsh-installer-")
        .suffix(extension)
        .tempfile_in(temp_dir)
        .map_err(|e| format!("Cannot create temporary installer file: {e}"))?;

    let mut response = client.get(&artifact.browser_download_url).send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Publisher installer download failed: {e}"))?;
    if let Some(size) = response.content_length() {
        if size != artifact.size {
            return Err("Publisher package size differs from GitHub release metadata.".into());
        }
    }
    let mut hasher = Sha256::new();
    let mut total = 0_u64;
    let mut emitted = 0_u64;
    let mut buffer = [0_u8; 128 * 1024];
    loop {
        let n = response.read(&mut buffer).map_err(|e| format!("Download interrupted: {e}"))?;
        if n == 0 { break; }
        total += n as u64;
        if total > artifact.size { return Err("Installer exceeds expected size.".into()); }
        staged.write_all(&buffer[..n]).map_err(|e| format!("Could not save installer: {e}"))?;
        hasher.update(&buffer[..n]);
        if total - emitted >= 2 * 1024 * 1024 {
            let _ = app.emit("creative-install-progress", InstallProgress {
                app_id: app_id.into(), received: total, total: artifact.size,
            });
            emitted = total;
        }
    }
    staged.flush().map_err(|e| format!("Could not finish installer download: {e}"))?;
    if total != artifact.size { return Err("Installer download was incomplete.".into()); }
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected { return Err("Installer SHA-256 did not match publisher checksum. Installation stopped.".into()); }
    let _ = app.emit("creative-install-progress", InstallProgress {
        app_id: app_id.into(), received: total, total: artifact.size,
    });
    Ok(staged)
}

fn command_status(mut cmd: Command, description: &str) -> Result<(), String> {
    let status = cmd.status().map_err(|e| format!("{description} could not start: {e}"))?;
    if !status.success() {
        return Err(format!("{description} exited with status {status}. No installation success is claimed."));
    }
    Ok(())
}

fn execute_install(app_id: &str, expected_version: &str, app: AppHandle) -> Result<InstallOutcome, String> {
    let _lock = InstallLock::acquire()?;
    let proposed = plan_for(app_id)?;
    if proposed.plan.version != expected_version {
        return Err("A newer release became available; please review the install details again.".into());
    }
    let status = match proposed.strategy {
        InstallStrategy::FedoraPackage(package) => {
            if !Path::new("/usr/bin/dnf").is_file() {
                return Err("Fedora DNF was not found at /usr/bin/dnf.".into());
            }
            let mut cmd = Command::new("/usr/bin/pkexec");
            cmd.arg("/usr/bin/dnf").args(["install", "-y", package]);
            command_status(cmd, "Fedora DNF/PolicyKit")?;
            "installed"
        }
        InstallStrategy::WindowsWinget(package) => {
            let mut cmd = Command::new("winget");
            cmd.args(["install", "--id", package, "--exact", "--source", "winget",
                "--accept-package-agreements", "--accept-source-agreements"]);
            command_status(cmd, "Windows WinGet installer")?;
            "installed"
        }
        InstallStrategy::MacHomebrew(cask) => {
            let brew = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]
                .iter().find(|p| Path::new(p).is_file())
                .ok_or("Homebrew is not installed. Use the publisher download page instead.")?;
            let mut cmd = Command::new(brew);
            cmd.args(["install", "--cask", cask]);
            command_status(cmd, "Homebrew Cask installer")?;
            "installed"
        }
        InstallStrategy::CraftRelease { app_id, release, artifact, checksums } => {
            let staged = stage_craft_package(&app_id, &release, &artifact, &checksums, &app)?;
            match std::env::consts::OS {
                "linux" => {
                    let mut cmd = Command::new("/usr/bin/pkexec");
                    cmd.arg("/usr/bin/dnf").args(["install", "-y"]).arg(staged.path());
                    command_status(cmd, "Fedora RPM installation")?;
                    "installed"
                }
                "windows" => {
                    let mut cmd = Command::new("msiexec.exe");
                    cmd.arg("/i").arg(staged.path());
                    command_status(cmd, "Windows Installer")?;
                    "installed"
                }
                "macos" => {
                    let mut cmd = Command::new("open");
                    cmd.arg(staged.path());
                    command_status(cmd, "macOS disk image opener")?;
                    // Keep the temporary disk image around after Finder opens it.
                    // The OS may still be reading it asynchronously.
                    let (_, path) = staged.keep().map_err(|e| format!("Could not retain opened installer: {e}"))?;
                    let _ = path;
                    "manual-step"
                }
                _ => return Err("Unsupported system installer.".into()),
            }
        }
    };
    let description = if status == "installed" {
        "Installation command completed successfully. Scan your computer to verify the app is present.".to_string()
    } else {
        "Verified installer opened. Complete the app installation in Finder.".to_string()
    };
    Ok(InstallOutcome { app_id: app_id.into(), status: status.into(), message: description })
}

pub async fn install_app(
    app_id: String, expected_version: String, app: AppHandle,
) -> Result<InstallOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || execute_install(&app_id, &expected_version, app))
        .await.map_err(|e| format!("Install worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_curated_apps_can_be_installed() {
        assert!(CRAFT_IDS.contains(&"photocraft"));
        assert!(!CRAFT_IDS.contains(&"evil-tool"));
        assert!(plan_for("evil-tool").is_err());
    }
    #[test]
    fn checksums_are_exactly_matched() {
        let entry = format!("{}  photo-1.rpm\n", "a".repeat(64));
        assert_eq!(parse_checksum(&entry, "photo-1.rpm"), Some("a".repeat(64)));
        assert_eq!(parse_checksum(&entry, "photo-2.rpm"), None);
        assert_eq!(parse_checksum("bad content", "photo-1.rpm"), None);
    }
    #[test]
    fn reject_external_asset_urls() {
        let asset = GitHubAsset {
            name: "photocraft-0.1.0-linux-x86_64.rpm".into(),
            browser_download_url: "https://evil.example/installer.rpm".into(),
            size: 100,
        };
        assert!(!verified_asset("photocraft", "v0.1.0", &asset));
    }
}
