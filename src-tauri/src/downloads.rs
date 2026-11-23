use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::IpAddr;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Copy)]
struct DownloadSpec {
    app_id: &'static str,
    version: &'static str,
    filename: &'static str,
    url: &'static str,
    size: u64,
    sha256: Option<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOffer {
    app_id: String,
    version: String,
    file_name: String,
    size_bytes: u64,
    checksum_available: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    app_id: String,
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

fn get_spec(app_id: &str) -> Option<DownloadSpec> {
    // Explicit allowlist: the renderer cannot supply URLs, paths or filenames.
    // Releases are version-pinned; update these entries only after verifying publisher sources.
    match (app_id, std::env::consts::OS, std::env::consts::ARCH) {
        ("blender", "linux", "x86_64") => Some(DownloadSpec {
            app_id: "blender",
            version: "5.3.0",
            filename: "blender-5.3.0-linux-x64.tar.xz",
            url: "https://download.blender.org/release/Blender5.3/blender-5.3.0-linux-x64.tar.xz",
            size: 406_944_100,
            sha256: Some("dacb8264197a3f7fda6001285a5a506fc97ee943881261c2c3bd63c882f22e05"),
        }),
        ("blender", "windows", "x86_64") => Some(DownloadSpec {
            app_id: "blender",
            version: "5.3.0",
            filename: "blender-5.3.0-windows-x64.msi",
            url: "https://download.blender.org/release/Blender5.3/blender-5.3.0-windows-x64.msi",
            size: 383_557_632,
            sha256: Some("3ff4ec8a488be1148aa2bdb2cb229be21b8050e75931da617934cac254dd726c"),
        }),
        ("blender", "macos", "aarch64") => Some(DownloadSpec {
            app_id: "blender",
            version: "5.3.0",
            filename: "blender-5.3.0-macos-arm64.dmg",
            url: "https://download.blender.org/release/Blender5.3/blender-5.3.0-macos-arm64.dmg",
            size: 359_893_873,
            sha256: Some("2d802b54766741e612cead50b03ebbc8eb64dadc71eda932573d256b8a784720"),
        }),
        ("krita", "linux", "x86_64") => Some(DownloadSpec {
            app_id: "krita",
            version: "5.3.4.1",
            filename: "krita-5.3.4.1-x86_64.AppImage",
            url: "https://download.kde.org/stable/krita/5.3.4.1/krita-5.3.4.1-x86_64.AppImage",
            size: 381_635_064,
            // KDE publishes a detached signature; signature verification is not implemented.
            // We must NOT label the download as verified solely from HTTPS/size.
            sha256: None,
        }),
        ("krita", "windows", "x86_64") => Some(DownloadSpec {
            app_id: "krita",
            version: "5.3.4.1",
            filename: "krita-x64-5.3.4.1-setup.exe",
            url: "https://download.kde.org/stable/krita/5.3.4.1/krita-x64-5.3.4.1-setup.exe",
            size: 165_471_576,
            sha256: Some("025523cf1751ff209faf7ecfe1cff851f2cdab64acb8c555b307b349ad56ce8f"),
        }),
        ("krita", "macos", "aarch64") => Some(DownloadSpec {
            app_id: "krita",
            version: "5.3.4.1",
            filename: "krita-5.3.4.1-signed.dmg",
            url: "https://download.kde.org/stable/krita/5.3.4.1/krita-5.3.4.1-signed.dmg",
            size: 392_023_759,
            sha256: Some("531e261da1fd8d5c468cfcd4eebd16e9edf6ab320e89406d2875f2e43c1148de"),
        }),
        _ => None,
    }
}

pub fn available_downloads() -> Vec<DownloadOffer> {
    ["blender", "krita"]
        .iter()
        .filter_map(|id| get_spec(id))
        .map(|spec| DownloadOffer {
            app_id: spec.app_id.into(),
            version: spec.version.into(),
            file_name: spec.filename.into(),
            size_bytes: spec.size,
            checksum_available: spec.sha256.is_some(),
        })
        .collect()
}

fn downloads_directory() -> Result<PathBuf, String> {
    let path = dirs::download_dir().ok_or("Downloads folder is unavailable.")?;
    if !path.is_dir() {
        return Err("Downloads folder does not exist.".into());
    }
    Ok(path)
}

fn redirect_is_safe(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let Some(domain) = url.host_str() else { return false };
    let domain = domain.to_ascii_lowercase();
    if domain == "localhost"
        || domain.ends_with(".localhost")
        || domain.ends_with(".local")
        || domain.ends_with(".internal")
        || domain.parse::<IpAddr>().is_ok()
    {
        return false;
    }
    true
}

fn download_inner(spec: DownloadSpec, app: AppHandle) -> Result<DownloadResult, String> {
    let downloads = downloads_directory()?;
    let destination = downloads.join(spec.filename);
    if destination.exists() {
        return Err(format!("File already exists: {}. Move or rename it before downloading again.", destination.display()));
    }
    let part = downloads.join(format!("{}.part", spec.filename));

    let mut output = Some(OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&part)
        .map_err(|e| format!("Cannot create partial download: {e}"))?);

    let result = (|| -> Result<DownloadResult, String> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(3600))
            .user_agent("UniversalCreativeSoftwareHub/0.1")
            .redirect(Policy::custom(|attempt| {
                if attempt.previous().len() >= 8 {
                    attempt.error("Too many redirects")
                } else if redirect_is_safe(attempt.url()) {
                    attempt.follow()
                } else {
                    attempt.error("Insecure or local redirect blocked")
                }
            }))
            .build()
            .map_err(|e| format!("HTTP client error: {e}"))?;

        let mut response = client.get(spec.url).send()
            .map_err(|e| format!("Download connection failed: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("Publisher responded with HTTP {}", response.status()));
        }
        if let Some(size) = response.content_length() {
            if size != spec.size {
                return Err("Publisher file size differs from the pinned release. Download cancelled.".into());
            }
        }

        let mut digest = Sha256::new();
        let mut transferred = 0_u64;
        let mut last_emitted = 0_u64;
        let mut buffer = [0_u8; 128 * 1024];
        loop {
            let bytes = response.read(&mut buffer)
                .map_err(|e| format!("Download interrupted: {e}"))?;
            if bytes == 0 { break }
            transferred += bytes as u64;
            if transferred > spec.size {
                return Err("Download exceeded the expected release size.".into());
            }
            output.as_mut().expect("partial file opened").write_all(&buffer[..bytes])
                .map_err(|e| format!("Could not write download: {e}"))?;
            digest.update(&buffer[..bytes]);
            if transferred - last_emitted >= 2 * 1024 * 1024 {
                let _ = app.emit("catalog-download-progress", DownloadProgress {
                    app_id: spec.app_id.into(),
                    received: transferred,
                    total: spec.size,
                });
                last_emitted = transferred;
            }
        }
        output.as_mut().expect("partial file opened").flush()
            .map_err(|e| format!("Could not flush downloaded file: {e}"))?;
        // Windows cannot reliably rename a file while its output handle is open.
        drop(output.take());
        if transferred != spec.size {
            return Err("Incomplete download: size does not match official release.".into());
        }
        let actual_hash = format!("{:x}", digest.finalize());
        if let Some(expected) = spec.sha256 {
            if actual_hash != expected {
                return Err("SHA-256 verification failed. File has been discarded.".into());
            }
        }
        // Never overwrite existing files; the same app cannot accidentally replace a download.
        if destination.exists() {
            return Err("A file with this name appeared during download; nothing was overwritten.".into());
        }
        fs::rename(&part, &destination).map_err(|e| format!("Could not finalize download: {e}"))?;
        let _ = app.emit("catalog-download-progress", DownloadProgress {
            app_id: spec.app_id.into(),
            received: transferred,
            total: spec.size,
        });
        Ok(DownloadResult {
            file_name: spec.filename.into(),
            saved_path: destination.to_string_lossy().into_owned(),
            sha256: actual_hash,
            checksum_verified: spec.sha256.is_some(),
        })
    })();

    if result.is_err() {
        drop(output.take());
        let _ = fs::remove_file(&part);
    }
    result
}

pub async fn download_app(app_id: String, app: AppHandle) -> Result<DownloadResult, String> {
    let spec = get_spec(&app_id)
        .ok_or_else(|| "No verified publisher file is configured for this app, OS and architecture.".to_string())?;
    tauri::async_runtime::spawn_blocking(move || download_inner(spec, app))
        .await
        .map_err(|e| format!("Download worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unsupported_apps_cannot_request_a_url() {
        assert!(get_spec("unknown").is_none());
        assert!(get_spec("https://attacker.invalid/script").is_none());
    }
    #[test]
    fn insecure_redirects_are_rejected() {
        assert!(!redirect_is_safe(&"http://example.com/".parse().unwrap()));
        assert!(!redirect_is_safe(&"https://127.0.0.1/test".parse().unwrap()));
        assert!(redirect_is_safe(&"https://download.blender.org/release/".parse().unwrap()));
    }
}
