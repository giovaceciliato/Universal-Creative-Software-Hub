//! Explicit GitHub release discovery and download only.
//! GitHub projects never grant authority to run or install their assets.
use reqwest::blocking::{Client, Response};
use reqwest::redirect::Policy;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const MAX_RELEASE_JSON: u64 = 1_048_576;
const MAX_REPOSITORY_JSON: u64 = 256_000;
const MAX_DOWNLOAD_BYTES: u64 = 2_147_483_648;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseAsset {
    pub id: u64,
    pub name: String,
    pub size_bytes: u64,
    pub sha256_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub tag: String,
    pub published_at: Option<String>,
    pub url: String,
    pub assets: Vec<ReleaseAsset>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogDownloadOffer {
    repo: String,
    version: String,
    asset: ReleaseAsset,
}

// Conservative matching: require an explicit platform/CPU suffix, a digest and
// one unique candidate at the preferred format. Never guess between two builds.
fn select_catalog_asset<'a>(assets: &'a [ReleaseAsset], os: &str, arch: &str, fedora: bool) -> Option<&'a ReleaseAsset> {
    let suffixes: Vec<String> = match (os, arch) {
        ("linux", "x86_64" | "aarch64") => {
            let mut formats = Vec::new();
            if fedora { formats.push(format!("-linux-{arch}.rpm")); }
            formats.push(format!("-linux-{arch}.appimage"));
            formats
        }
        ("windows", "x86_64") => vec!["-windows-x64.msi".into(), "-windows-x64.exe".into()],
        ("windows", "aarch64") => vec!["-windows-arm64.msi".into()],
        ("macos", "x86_64" | "aarch64") => vec!["-macos-universal.dmg".into()],
        _ => return None,
    };
    for suffix in suffixes {
        let candidates: Vec<_> = assets.iter().filter(|a| {
            let name = a.name.to_ascii_lowercase();
            let tokens: Vec<_> = name.split(['-', '_', '.']).collect();
            name.ends_with(&suffix)
                && !tokens.iter().any(|t| matches!(*t, "cli" | "debug" | "symbols" | "source" | "server" | "headless"))
        }).collect();
        if candidates.len() == 1 { return candidates[0].sha256_available.then_some(candidates[0]); }
        if candidates.len() > 1 { return None; }
    }
    None
}

pub async fn resolve_catalog_download(repo: String) -> Result<Option<CatalogDownloadOffer>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = normalize_repo(&repo)?;
        let Some(raw) = fetch_latest(&api_client()?, &repo)? else { return Ok(None) };
        // Do not decide uniqueness from a truncated list.
        if raw.assets.len() > 100 { return Ok(None); }
        let release = info_from_release(&repo, raw);
        let fedora = std::fs::read_to_string("/etc/os-release").unwrap_or_default()
            .lines().any(|line| matches!(line.trim(), "ID=fedora" | "ID=\"fedora\""));
        Ok(select_catalog_asset(&release.assets, std::env::consts::OS, std::env::consts::ARCH, fedora)
            .map(|asset| CatalogDownloadOffer { repo, version: release.tag.clone(), asset: asset.clone() }))
    }).await.map_err(|e| format!("Release resolution failed: {e}"))?
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub repo: String,
    pub name: String,
    pub description: String,
    pub url: String,
    pub latest: Option<ReleaseInfo>,
}

#[derive(Deserialize)]
struct RepoApi {
    full_name: String,
    name: String,
    description: Option<String>,
    html_url: String,
    archived: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct AssetApi {
    id: u64,
    name: String,
    size: u64,
    browser_download_url: String,
    digest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ReleaseApi {
    tag_name: String,
    html_url: String,
    published_at: Option<String>,
    assets: Vec<AssetApi>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    repo: String,
    received: u64,
    total: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub file_name: String,
    pub saved_path: String,
    pub sha256: String,
    pub checksum_verified: bool,
}

fn good_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && !value.ends_with(".git")
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
        && !value.starts_with('.')
        && !value.contains("..")
}

fn normalize_repo(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.starts_with("https://") {
        let url = Url::parse(value).map_err(|_| "Invalid GitHub URL")?;
        if url.scheme() != "https" || url.host_str() != Some("github.com")
            || url.port().is_some() || !url.username().is_empty()
            || url.password().is_some() || url.query().is_some()
        {
            return Err("Provide a standard https://github.com/owner/repo URL".into());
        }
        let segments: Vec<_> = url.path_segments()
            .ok_or("Invalid GitHub path")?.filter(|s| !s.is_empty()).collect();
        if segments.len() != 2
            && !(segments.len() == 3 && segments[2] == "releases")
            && !(segments.len() == 4 && segments[2] == "releases" && segments[3] == "latest")
        {
            return Err("Use a GitHub repository page or its latest Releases page".into());
        }
        let repo = segments[1].strip_suffix(".git").unwrap_or(segments[1]);
        if !good_segment(segments[0]) || !good_segment(repo) {
            return Err("Invalid GitHub owner or repository name".into());
        }
        return Ok(format!("{}/{}", segments[0], repo));
    }
    let Some((owner, name)) = value.split_once('/') else {
        return Err("Expected a GitHub repository URL or owner/repo".into());
    };
    if good_segment(owner) && good_segment(name) {
        Ok(format!("{owner}/{name}"))
    } else {
        Err("Invalid GitHub repository identifier".into())
    }
}

fn allowed_redirect(url: &Url) -> bool {
    if url.scheme() != "https" { return false; }
    let Some(domain) = url.host_str() else { return false; };
    let domain = domain.to_ascii_lowercase();
    domain == "github.com"
        || domain.ends_with(".githubusercontent.com")
        || domain.ends_with(".amazonaws.com")
        || domain.ends_with(".githubassets.com")
}

fn api_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("UniversalCreativeSoftwareHub/0.3")
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(30))
        .redirect(Policy::none())
        .build().map_err(|e| format!("GitHub HTTP client setup failed: {e}"))
}

fn artifact_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("UniversalCreativeSoftwareHub/0.3")
        .connect_timeout(Duration::from_secs(25))
        .timeout(Duration::from_secs(3600))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 8 {
                attempt.error("Too many redirects")
            } else if allowed_redirect(attempt.url()) {
                attempt.follow()
            } else {
                attempt.error("Download redirect to a non-GitHub host was blocked")
            }
        }))
        .build().map_err(|e| format!("Download client setup failed: {e}"))
}

fn bounded_read(response: Response, max_bytes: u64) -> Result<Vec<u8>, String> {
    if response.content_length().is_some_and(|len| len > max_bytes) {
        return Err("GitHub API response exceeded size limit".into());
    }
    let mut result = Vec::new();
    response.take(max_bytes + 1).read_to_end(&mut result)
        .map_err(|e| format!("GitHub API response could not be read: {e}"))?;
    if result.len() as u64 > max_bytes {
        return Err("GitHub API response exceeded size limit".into());
    }
    Ok(result)
}

fn fetch_latest(client: &Client, repo: &str) -> Result<Option<ReleaseApi>, String> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let response = client.get(url).header("Accept", "application/vnd.github+json")
        .send().map_err(|e| format!("GitHub release lookup failed: {e}"))?;
    if response.status().as_u16() == 404 { return Ok(None); }
    if !response.status().is_success() {
        return Err(format!("GitHub release lookup returned HTTP {}. Check API rate limits.", response.status()));
    }
    let bytes = bounded_read(response, MAX_RELEASE_JSON)?;
    let data: ReleaseApi = serde_json::from_slice(&bytes)
        .map_err(|e| format!("GitHub release metadata was invalid: {e}"))?;
    if data.tag_name.is_empty() || data.tag_name.len() > 120 {
        return Err("Invalid GitHub release tag".into());
    }
    Ok(Some(data))
}

fn safe_asset_filename(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    const EXTENSIONS: &[&str] = &[
        ".rpm", ".deb", ".msi", ".exe", ".dmg", ".pkg", ".appimage",
        ".zip", ".7z", ".tar.gz", ".tar.xz", ".tgz", ".tar.bz2",
    ];
    !value.is_empty()
        && value.len() <= 120
        && !value.starts_with('.')
        && !value.contains("..")
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_' | b'+' | b'(' | b')'))
        && EXTENSIONS.iter().any(|ext| normalized.ends_with(ext))
}

fn safe_asset_url(repo: &str, tag: &str, asset: &AssetApi) -> bool {
    if !safe_asset_filename(&asset.name) || asset.size == 0 || asset.size > MAX_DOWNLOAD_BYTES {
        return false;
    }
    let Ok(url) = Url::parse(&asset.browser_download_url) else { return false };
    if url.host_str() != Some("github.com") || url.scheme() != "https"
        || !url.username().is_empty() || url.password().is_some() || url.port().is_some()
        || url.query().is_some() || url.fragment().is_some() { return false; }
    let Some(segments) = url.path_segments() else { return false };
    let seg: Vec<_> = segments.collect();
    let expected: Vec<_> = repo.split('/').collect();
    seg.len() == 6 && expected.len() == 2
        && seg[0] == expected[0] && seg[1] == expected[1]
        && seg[2] == "releases" && seg[3] == "download"
        && seg[4] == tag && seg[5] == asset.name
}

fn expected_sha256(digest: Option<&str>) -> Option<String> {
    let value = digest?.strip_prefix("sha256:")?;
    if value.len() == 64 && value.bytes().all(|x| x.is_ascii_hexdigit()) {
        Some(value.to_ascii_lowercase())
    } else {
        None
    }
}

fn info_from_release(repo: &str, release: ReleaseApi) -> ReleaseInfo {
    let assets = release.assets.iter()
        .filter(|a| safe_asset_url(repo, &release.tag_name, a))
        .take(100)
        .map(|a| ReleaseAsset {
            id: a.id,
            name: a.name.clone(),
            size_bytes: a.size,
            sha256_available: expected_sha256(a.digest.as_deref()).is_some(),
        }).collect();
    ReleaseInfo {
        tag: release.tag_name,
        published_at: release.published_at,
        url: format!("https://github.com/{repo}/releases/latest"),
        assets,
    }
}

fn project_info(input: &str) -> Result<ProjectInfo, String> {
    let repo = normalize_repo(input)?;
    let client = api_client()?;
    let url = format!("https://api.github.com/repos/{repo}");
    let response = client.get(url).header("Accept", "application/vnd.github+json")
        .send().map_err(|e| format!("Cannot access GitHub repository: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("GitHub repository lookup returned HTTP {}", response.status()));
    }
    let bytes = bounded_read(response, MAX_REPOSITORY_JSON)?;
    let data: RepoApi = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Invalid GitHub repository response: {e}"))?;
    let canonical = normalize_repo(&data.full_name)?;
    if data.archived {
        // Archived projects are still listable; the user can decide to track them.
    }
    Ok(ProjectInfo {
        repo: canonical.clone(),
        name: data.name.chars().take(120).collect(),
        description: data.description.unwrap_or_default().chars().take(240).collect(),
        url: data.html_url,
        latest: fetch_latest(&client, &canonical)?.map(|r| info_from_release(&canonical, r)),
    })
}

fn latest_only(input: &str) -> Result<Option<ReleaseInfo>, String> {
    let repo = normalize_repo(input)?;
    let client = api_client()?;
    Ok(fetch_latest(&client, &repo)?.map(|r| info_from_release(&repo, r)))
}

pub async fn inspect_github_project(url: String) -> Result<ProjectInfo, String> {
    tauri::async_runtime::spawn_blocking(move || project_info(&url))
        .await.map_err(|e| format!("GitHub lookup worker failed: {e}"))?
}

pub async fn check_github_release(repo: String) -> Result<Option<ReleaseInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || latest_only(&repo))
        .await.map_err(|e| format!("GitHub release check worker failed: {e}"))?
}

fn download_asset_inner(repo: &str, id: u64, tag: &str, app: AppHandle)
    -> Result<DownloadResult, String>
{
    let repo = normalize_repo(repo)?;
    let client = api_client()?;
    let release = fetch_latest(&client, &repo)?
        .ok_or("No published stable release was found for this repository")?;
    if release.tag_name != tag {
        return Err("The latest GitHub release changed; check for updates and select an asset again.".into());
    }
    let asset = release.assets.iter().find(|a| a.id == id)
        .ok_or("Asset is no longer part of the latest release")?;
    if !safe_asset_url(&repo, &release.tag_name, asset) {
        return Err("Unsupported asset type, size or download host".into());
    }
    let downloads = dirs::download_dir().ok_or("System Downloads folder not available")?;
    if !downloads.is_dir() { return Err("Downloads folder does not exist".into()); }
    let prefix = repo.replace('/', "-");
    let file_name = format!("{prefix}-{}", asset.name);
    let destination = downloads.join(&file_name);
    let temp_path = downloads.join(format!("{file_name}.part"));
    if destination.exists() {
        return Err(format!("File already exists: {}", destination.display()));
    }
    let mut output = Some(OpenOptions::new().create_new(true).write(true)
        .open(&temp_path).map_err(|e| format!("Cannot create download file: {e}"))?);
    let result = (|| -> Result<DownloadResult, String> {
        let mut response = artifact_client()?.get(&asset.browser_download_url)
            .send().and_then(|r| r.error_for_status())
            .map_err(|e| format!("GitHub release download failed: {e}"))?;
        if response.content_length().is_some_and(|size| size != asset.size) {
            return Err("GitHub release asset size changed".into());
        }
        let mut digest = Sha256::new();
        let mut received = 0u64;
        let mut last_progress = 0u64;
        let mut buf = [0u8; 128 * 1024];
        loop {
            let bytes = response.read(&mut buf).map_err(|e| format!("Download interrupted: {e}"))?;
            if bytes == 0 { break; }
            received += bytes as u64;
            if received > asset.size || received > MAX_DOWNLOAD_BYTES {
                return Err("Download exceeded the expected size".into());
            }
            output.as_mut().expect("staged file").write_all(&buf[..bytes])
                .map_err(|e| format!("Cannot save GitHub release asset: {e}"))?;
            digest.update(&buf[..bytes]);
            if received - last_progress >= 2 * 1024 * 1024 {
                let _ = app.emit("github-download-progress", Progress {
                    repo: repo.clone(), received, total: asset.size,
                });
                last_progress = received;
            }
        }
        output.as_mut().expect("staged file").flush()
            .map_err(|e| format!("Cannot flush download: {e}"))?;
        drop(output.take());
        if received != asset.size { return Err("Downloaded file is incomplete".into()); }
        let hash = format!("{:x}", digest.finalize());
        let expected = expected_sha256(asset.digest.as_deref());
        if expected.as_ref().is_some_and(|expected| expected != &hash) {
            return Err("GitHub-published SHA-256 digest verification failed".into());
        }
        // hard_link is create-only and refuses to replace an existing download.
        fs::hard_link(&temp_path, &destination)
            .map_err(|e| format!("Cannot finalize without overwriting another file: {e}"))?;
        let _ = fs::remove_file(&temp_path);
        let _ = app.emit("github-download-progress", Progress {
            repo: repo.clone(), received, total: asset.size,
        });
        Ok(DownloadResult {
            file_name,
            saved_path: destination.to_string_lossy().into_owned(),
            sha256: hash,
            checksum_verified: expected.is_some(),
        })
    })();
    if result.is_err() {
        drop(output.take());
        let _ = fs::remove_file(&temp_path);
    }
    result
}

pub async fn download_github_asset(
    repo: String, asset_id: u64, expected_tag: String, app: AppHandle,
) -> Result<DownloadResult, String> {
    if expected_tag.len() > 120 { return Err("Invalid release identifier".into()); }
    tauri::async_runtime::spawn_blocking(move ||
        download_asset_inner(&repo, asset_id, &expected_tag, app))
        .await.map_err(|e| format!("GitHub download worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn catalog_asset(id: u64, name: &str) -> ReleaseAsset {
        ReleaseAsset { id, name: name.into(), size_bytes: 100, sha256_available: true }
    }
    #[test]
    fn catalog_selects_correct_os_arch_and_format() {
        let assets = vec![
            catalog_asset(1, "bimcraft-0.12.0-linux-x86_64.rpm"),
            catalog_asset(2, "bimcraft-0.12.0-linux-aarch64.rpm"),
            catalog_asset(3, "bimcraft-0.12.0-windows-x64.msi"),
            catalog_asset(4, "bimcraft-0.12.0-macos-universal.dmg"),
            catalog_asset(5, "bimcraft-0.12.0-linux-x86_64.AppImage"),
            catalog_asset(6, "bimcraft-cli-0.12.0-macos-universal.dmg"),
        ];
        assert_eq!(select_catalog_asset(&assets, "linux", "x86_64", true).unwrap().id, 1);
        assert_eq!(select_catalog_asset(&assets, "linux", "aarch64", true).unwrap().id, 2);
        assert_eq!(select_catalog_asset(&assets, "windows", "x86_64", false).unwrap().id, 3);
        assert_eq!(select_catalog_asset(&assets, "macos", "aarch64", false).unwrap().id, 4);
        assert_eq!(select_catalog_asset(&assets, "linux", "x86_64", false).unwrap().id, 5);
        assert!(select_catalog_asset(&assets, "windows", "aarch64", false).is_none());
        assert!(select_catalog_asset(&assets, "linux", "riscv64", true).is_none());
    }
    #[test]
    fn ambiguous_missing_or_unverified_assets_require_official_page() {
        let mut assets = vec![catalog_asset(1, "app-linux-x86_64.rpm")];
        assets[0].sha256_available = false;
        assert!(select_catalog_asset(&assets, "linux", "x86_64", true).is_none());
        assets.push(catalog_asset(2, "other-linux-x86_64.rpm"));
        assert!(select_catalog_asset(&assets, "linux", "x86_64", true).is_none());
        assert!(select_catalog_asset(&[], "linux", "x86_64", true).is_none());
        assert!(select_catalog_asset(&[catalog_asset(1, "setup.exe")], "windows", "x86_64", false).is_none());
    }
    #[test]
    fn catalog_metadata_cannot_redirect_download_to_another_repo() {
        let mut asset = AssetApi { id: 1, name: "bimcraft-0.12.0-linux-x86_64.rpm".into(), size: 100,
            browser_download_url: "https://github.com/IPedrax/BIMCraft/releases/download/v0.12.0/bimcraft-0.12.0-linux-x86_64.rpm".into(),
            digest: Some(format!("sha256:{}", "a".repeat(64))) };
        assert!(safe_asset_url("IPedrax/BIMCraft", "v0.12.0", &asset));
        assert!(!safe_asset_url("attacker/BIMCraft", "v0.12.0", &asset));
        assert!(!safe_asset_url("IPedrax/BIMCraft", "v0.13.0", &asset));
        asset.name = "../installer.rpm".into();
        assert!(!safe_asset_url("IPedrax/BIMCraft", "v0.12.0", &asset));
        assert!(expected_sha256(Some("sha256:bad")).is_none());
    }
    #[test]
    fn github_url_is_strict() {
        assert_eq!(normalize_repo("https://github.com/godotengine/godot").unwrap(), "godotengine/godot");
        assert_eq!(normalize_repo("https://github.com/godotengine/godot/releases/latest").unwrap(), "godotengine/godot");
        assert!(normalize_repo("http://github.com/example/test").is_err());
        assert!(normalize_repo("https://github.com.evil.com/owner/repo").is_err());
        assert!(normalize_repo("https://github.com/a/repo/tree/main").is_err());
        assert!(normalize_repo("a/b/../../bad").is_err());
    }
    #[test]
    fn assets_do_not_escape_downloads() {
        assert!(safe_asset_filename("editor-1.0.0-x86_64.AppImage"));
        assert!(!safe_asset_filename("../evil.exe"));
        assert!(!safe_asset_filename("tool.sh"));
        assert!(!safe_asset_filename(".hidden.zip"));
        assert!(expected_sha256(Some(&format!("sha256:{}", "a".repeat(64)))).is_some());
    }
    #[test]
    fn no_external_redirects() {
        assert!(allowed_redirect(&Url::parse("https://release-assets.githubusercontent.com/a").unwrap()));
        assert!(!allowed_redirect(&Url::parse("https://127.0.0.1/a").unwrap()));
        assert!(!allowed_redirect(&Url::parse("https://example.com/a").unwrap()));
    }
}
