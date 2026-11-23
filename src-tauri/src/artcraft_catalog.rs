//! Read-only ArtCraft catalog sync. Only signed upstream metadata is accepted.
//! New catalog entries never become executable installation instructions.
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::time::Duration;

const CATALOG_URL: &str = "https://getartcraft.com/launcher-catalog.toml";
const SIGNATURE_URL: &str = "https://getartcraft.com/launcher-catalog.toml.sig";
const KEY_PEM: &str = include_str!("../assets/artcraft-launcher-catalog-key.pem");
const MAX_CATALOG: usize = 1_048_576;
const MAX_SIGNATURE: usize = 128;
const MAX_APPS: usize = 64;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedCatalog {
    pub apps: Vec<SignedApp>,
    pub rejected: usize,
    pub source: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedApp {
    pub id: String,
    pub name: String,
    pub tagline: String,
    pub publisher: String,
    pub repo: String,
    pub kind: String,
}

#[derive(Deserialize)]
struct Document {
    apps: Vec<toml::Value>,
}

#[derive(Deserialize)]
struct AppRecord {
    id: String,
    name: String,
    tagline: String,
    publisher: String,
    repo: String,
    kind: String,
}

fn public_key() -> Result<VerifyingKey, String> {
    let encoded: String = KEY_PEM.lines()
        .filter(|line| !line.starts_with("-----"))
        .collect();
    let data = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Invalid bundled signing key: {e}"))?;
    const SPKI_HEADER: [u8; 12] = [
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ];
    if data.len() != 44 || !data.starts_with(&SPKI_HEADER) {
        return Err("Invalid ArtCraft Ed25519 public key format".into());
    }
    let bytes: [u8; 32] = data[12..44].try_into()
        .map_err(|_| "Invalid Ed25519 public key length")?;
    VerifyingKey::from_bytes(&bytes)
        .map_err(|e| format!("Invalid ArtCraft public key: {e}"))
}

fn verify_catalog(document: &[u8], signature: &[u8]) -> Result<(), String> {
    if document.is_empty() || document.len() > MAX_CATALOG {
        return Err("ArtCraft catalog exceeds size limit".into());
    }
    if signature.len() > MAX_SIGNATURE {
        return Err("ArtCraft signature exceeds size limit".into());
    }
    let encoded = std::str::from_utf8(signature).map_err(|_| "Signature is not UTF-8")?.trim();
    let raw = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid ArtCraft catalog signature encoding")?;
    let sig = Signature::from_slice(&raw)
        .map_err(|_| "Invalid ArtCraft signature length")?;
    public_key()?.verify(document, &sig)
        .map_err(|_| "ArtCraft catalog signature verification failed".into())
}

fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 48
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !id.starts_with('-')
        && !id.ends_with('-')
        && !id.contains("--")
}

fn safe_repo(repo: &str) -> bool {
    let Some((owner, name)) = repo.split_once('/') else { return false };
    !owner.is_empty()
        && owner.len() <= 64
        && !name.is_empty()
        && name.len() <= 80
        && !name.contains('/')
        && owner.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
        && name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_' || c == b'.')
}

fn parse_verified(document: &[u8], signature: &[u8]) -> Result<SignedCatalog, String> {
    verify_catalog(document, signature)?;
    let content = std::str::from_utf8(document).map_err(|_| "Catalog must be UTF-8")?;
    let document: Document = toml::from_str(content)
        .map_err(|e| format!("Invalid signed ArtCraft catalog: {e}"))?;
    if document.apps.is_empty() || document.apps.len() > MAX_APPS {
        return Err("ArtCraft catalog contains an invalid number of apps".into());
    }

    let mut apps = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut rejected = 0;
    for item in document.apps {
        let Ok(row) = item.try_into::<AppRecord>() else { rejected += 1; continue; };
        let official = row.kind == "official" && row.publisher == "ArtCraft"
            && row.repo == format!("storytold/{}", row.id);
        let community = row.kind == "community" && safe_repo(&row.repo);
        if !safe_id(&row.id)
            || row.name.trim().is_empty()
            || row.name.len() > 100
            || row.tagline.len() > 220
            || row.publisher.trim().is_empty()
            || row.publisher.len() > 100
            || !(official || community)
            || !seen.insert(row.id.clone())
        {
            rejected += 1;
            continue;
        }
        apps.push(SignedApp {
            id: row.id,
            name: row.name,
            tagline: row.tagline,
            publisher: row.publisher,
            repo: row.repo,
            kind: row.kind,
        });
    }
    if apps.is_empty() { return Err("The signed catalog has no safe entries".into()); }
    Ok(SignedCatalog { apps, rejected, source: CATALOG_URL })
}

fn bounded_get(client: &Client, url: &str, limit: usize) -> Result<Vec<u8>, String> {
    let response = client.get(url).send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("ArtCraft catalog request failed: {e}"))?;
    if response.content_length().is_some_and(|size| size > limit as u64) {
        return Err("ArtCraft catalog response is too large".into());
    }
    let mut bytes = Vec::new();
    response.take((limit + 1) as u64).read_to_end(&mut bytes)
        .map_err(|e| format!("ArtCraft catalog transfer failed: {e}"))?;
    if bytes.len() > limit { return Err("ArtCraft catalog exceeded size limit".into()); }
    Ok(bytes)
}

fn fetch_signed_catalog() -> Result<SignedCatalog, String> {
    let client = Client::builder()
        .user_agent("UniversalCreativeSoftwareHub/0.2")
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .redirect(Policy::none())
        .build()
        .map_err(|e| format!("HTTP setup failed: {e}"))?;
    let document = bounded_get(&client, CATALOG_URL, MAX_CATALOG)?;
    let sig = bounded_get(&client, SIGNATURE_URL, MAX_SIGNATURE)?;
    parse_verified(&document, &sig)
}

pub async fn refresh_artcraft_catalog() -> Result<SignedCatalog, String> {
    tauri::async_runtime::spawn_blocking(fetch_signed_catalog)
        .await
        .map_err(|e| format!("ArtCraft catalog worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pinned_public_key_parses() { assert!(public_key().is_ok()); }
    #[test]
    fn unsigned_data_is_rejected() {
        assert!(parse_verified(b"[[apps]]\nid='fake'", b"invalid").is_err());
    }
    #[test]
    fn accepted_sources_are_constrained() {
        assert!(safe_repo("tangency-labs/solidcraft"));
        assert!(!safe_repo("github.com/anything"));
        assert!(!safe_id("../cmd"));
        assert!(safe_id("solidcraft"));
    }
}
