//! Reviewed public software requests. All network responses are inert metadata:
 //! no native installer, command, or executable URL is granted by this module.
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Read;
use std::net::IpAddr;
use std::time::Duration;

const REPO: &str = "giovaceciliato/Universal-Creative-Software-Hub";
const APPROVED_FEED: &str = "https://raw.githubusercontent.com/giovaceciliato/Universal-Creative-Software-Hub/main/catalog/approved-community.json";
const MAX_FEED_BYTES: u64 = 256 * 1024;
const MAX_ISSUES_PAGES: usize = 5;
const REQUEST_MARKER: &str = "<!-- ucsh-app-request:v1\n";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedLinks {
    pub website: String,
    pub download: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_code: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedApp {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub description: String,
    pub categories: Vec<String>,
    pub platforms: Vec<String>,
    pub pricing_model: String,
    pub links: ApprovedLinks,
}

#[derive(Deserialize, Serialize)]
pub struct ApprovedFeed {
    pub apps: Vec<ApprovedApp>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRequest {
    pub name: String,
    pub publisher: String,
    pub website: String,
    #[serde(default)]
    pub repository: String,
    pub description: String,
    pub platforms: Vec<String>,
    pub pricing_model: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestMatch {
    name: String,
    url: String,
    state: String,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    matches: Vec<RequestMatch>,
    checked_issues: usize,
    truncated: bool,
}

#[derive(Deserialize)]
struct Issue {
    number: u64,
    title: String,
    state: String,
    html_url: String,
    body: Option<String>,
    pull_request: Option<serde_json::Value>,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("UniversalCreativeSoftwareHub/0.3")
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(30))
        .redirect(Policy::none())
        .build()
        .map_err(|e| format!("Cannot initialize GitHub client: {e}"))
}

fn read_bounded(response: reqwest::blocking::Response, limit: u64) -> Result<Vec<u8>, String> {
    if response.content_length().is_some_and(|n| n > limit) {
        return Err("The catalog/request response is too large".into());
    }
    let mut bytes = Vec::new();
    response.take(limit + 1).read_to_end(&mut bytes)
        .map_err(|e| format!("Could not read GitHub response: {e}"))?;
    if bytes.len() as u64 > limit {
        return Err("The catalog/request response exceeded the size limit".into());
    }
    Ok(bytes)
}

fn safe_https(input: &str) -> bool {
    let Ok(url) = Url::parse(input) else { return false };
    url.scheme() == "https"
        && url.has_authority()
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str().is_some_and(|host| {
            let h = host.to_ascii_lowercase();
            h.trim_start_matches('[').trim_end_matches(']').parse::<IpAddr>().is_err()
                && h != "localhost"
                && !h.ends_with(".localhost") && !h.ends_with(".local")
                && !h.ends_with(".internal") && h.contains('.')
        })
        && input.len() <= 350
}

fn safe_slug(input: &str) -> bool {
    input.len() <= 80
        && !input.is_empty()
        && input.bytes().all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == b'-')
        && !input.starts_with('-')
        && !input.ends_with('-')
        && !input.contains("--")
}

fn valid_app(app: &ApprovedApp) -> bool {
    safe_slug(&app.id)
        && !app.name.trim().is_empty() && app.name.len() <= 100
        && !app.publisher.trim().is_empty() && app.publisher.len() <= 100
        && app.description.len() >= 10 && app.description.len() <= 240
        && !app.categories.is_empty() && app.categories.len() <= 12
        && app.categories.iter().all(|c| safe_slug(c))
        && !app.platforms.is_empty() && app.platforms.len() <= 4
        && app.platforms.iter().all(|p| matches!(p.as_str(), "windows" | "macos" | "linux" | "web"))
        && matches!(app.pricing_model.as_str(), "free-open-source" | "freeware")
        && safe_https(&app.links.website) && safe_https(&app.links.download)
        && app.links.source_code.as_deref().is_none_or(safe_https)
}

fn get_approved(client: &Client) -> Result<Vec<ApprovedApp>, String> {
    let response = client.get(APPROVED_FEED).send()
        .map_err(|e| format!("Cannot fetch the approved catalog: {e}"))?;
    if response.status().as_u16() == 404 {
        // The first release of this feature may run before the feed is merged.
        return Ok(Vec::new());
    }
    if !response.status().is_success() {
        return Err(format!("Approved catalog returned HTTP {}", response.status()));
    }
    let bytes = read_bounded(response, MAX_FEED_BYTES)?;
    let feed: ApprovedFeed = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Approved catalog is invalid JSON: {e}"))?;
    if feed.apps.len() > 250 { return Err("Approved catalog is too large".into()); }
    let mut seen = HashSet::new();
    if feed.apps.iter().any(|app| !valid_app(app) || !seen.insert(app.id.clone())) {
        return Err("Approved catalog contains invalid or duplicated entries".into());
    }
    Ok(feed.apps)
}

fn valid_request(req: &AppRequest) -> bool {
    !req.name.trim().is_empty() && req.name.len() <= 80
        && !req.name.chars().any(|ch| matches!(ch, '<' | '>' | '\n' | '\r'))
        && !req.publisher.trim().is_empty() && req.publisher.len() <= 100
        && !req.publisher.chars().any(|ch| matches!(ch, '<' | '>' | '\n' | '\r'))
        && safe_https(&req.website)
        && (req.repository.is_empty() || (safe_https(&req.repository)
            && Url::parse(&req.repository).ok().is_some_and(|url| url.host_str() == Some("github.com")
                && url.path_segments().is_some_and(|segments| {
                    let parts: Vec<_> = segments.filter(|s| !s.is_empty()).collect();
                    parts.len() == 2 && parts.iter().all(|s| !s.is_empty() && s.len() <= 100
                        && s.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.')))
                }))))
        && req.description.len() >= 10 && req.description.len() <= 240
        && !req.description.chars().any(|ch| matches!(ch, '<' | '>'))
        && !req.platforms.is_empty() && req.platforms.len() <= 4
        && req.platforms.iter().all(|p| matches!(p.as_str(), "windows" | "macos" | "linux" | "web"))
        && matches!(req.pricing_model.as_str(), "free-open-source" | "freeware")
}

fn from_issue(body: &str) -> Option<AppRequest> {
    let from = body.find(REQUEST_MARKER)? + REQUEST_MARKER.len();
    let until = body[from..].find("\n-->")? + from;
    if until - from > 3000 { return None; }
    let decoded = serde_json::from_str::<AppRequest>(&body[from..until]).ok()?;
    valid_request(&decoded).then_some(decoded)
}

fn identity(url: &str) -> String {
    if let Ok(parsed) = Url::parse(url) {
        let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
        format!("{host}{}", parsed.path().trim_end_matches('/').to_ascii_lowercase())
    } else {
        url.trim().to_ascii_lowercase()
    }
}

fn matches_request(name: &str, website: &str, repository: Option<&str>, needle: &AppRequest) -> Option<String> {
    if !needle.repository.is_empty() && repository.is_some_and(|r| identity(r) == identity(&needle.repository)) {
        return Some("Stesso repository GitHub".into());
    }
    if identity(website) == identity(&needle.website) {
        return Some("Stesso sito ufficiale".into());
    }
    if name.trim().to_lowercase() == needle.name.trim().to_lowercase() {
        return Some("Stesso nome (possibile omonimia)".into());
    }
    None
}

fn check_inner(req: AppRequest) -> Result<CheckResult, String> {
    if !valid_request(&req) {
        return Err("Controlla nome, sito HTTPS, descrizione e piattaforme della richiesta".into());
    }
    let client = client()?;
    let approved = get_approved(&client)?;
    let mut matches = Vec::new();
    for app in &approved {
        if let Some(reason) = matches_request(&app.name, &app.links.website, app.links.source_code.as_deref(), &req) {
            matches.push(RequestMatch {
                name: app.name.clone(),
                url: app.links.website.clone(),
                state: "approved".into(),
                reason,
            });
        }
    }

    let mut checked_issues = 0_usize;
    let mut truncated = false;
    for page in 1..=MAX_ISSUES_PAGES {
        let url = format!("https://api.github.com/repos/{REPO}/issues?state=all&per_page=100&page={page}");
        let response = client.get(url)
            .header("Accept", "application/vnd.github+json")
            .send().map_err(|e| format!("Impossibile controllare le richieste GitHub: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("GitHub non ha completato il controllo richieste: HTTP {} (verifica i limiti API)", response.status()));
        }
        let bytes = read_bounded(response, 1_500_000)?;
        let issues: Vec<Issue> = serde_json::from_slice(&bytes)
            .map_err(|e| format!("Invalid GitHub issue list: {e}"))?;
        let count = issues.len();
        for issue in issues.into_iter().filter(|item| item.pull_request.is_none()) {
            checked_issues += 1;
            if !issue.title.starts_with("[App Request]") { continue; }
            if let Some(other) = issue.body.as_deref().and_then(from_issue) {
                if let Some(reason) = matches_request(&other.name, &other.website, (!other.repository.is_empty()).then_some(other.repository.as_str()), &req) {
                    matches.push(RequestMatch {
                        name: format!("{} · #{}", other.name, issue.number),
                        url: issue.html_url,
                        state: issue.state,
                        reason,
                    });
                }
            }
        }
        if count < 100 { break; }
        if page == MAX_ISSUES_PAGES { truncated = true; }
    }
    Ok(CheckResult { matches, checked_issues, truncated })
}

pub async fn check_app_request(req: AppRequest) -> Result<CheckResult, String> {
    tauri::async_runtime::spawn_blocking(move || check_inner(req))
        .await.map_err(|e| format!("Check worker failed: {e}"))?
}

pub async fn refresh_approved_apps() -> Result<Vec<ApprovedApp>, String> {
    tauri::async_runtime::spawn_blocking(|| get_approved(&client()?))
        .await.map_err(|e| format!("Approved catalog worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn example() -> AppRequest {
        AppRequest {
            name: "Example Art Tool".into(),
            publisher: "Example Team".into(),
            website: "https://example.org".into(),
            repository: "https://github.com/example/example".into(),
            description: "A free creative application for illustration.".into(),
            platforms: vec!["linux".into(), "windows".into()],
            pricing_model: "free-open-source".into(),
        }
    }
    #[test]
    fn validates_request_and_parses_marker() {
        let req = example();
        assert!(valid_request(&req));
        let marker = format!("Start\n{REQUEST_MARKER}{}\n-->\nEnd", serde_json::to_string(&req).unwrap());
        assert_eq!(from_issue(&marker).unwrap().name, req.name);
        assert!(from_issue("Unrelated issue").is_none());
    }
    #[test]
    fn detects_duplicates_without_name_only_false_negative() {
        let req = example();
        assert!(matches_request("Other name", "https://different.org", Some("https://github.com/example/example"), &req).is_some());
        assert!(matches_request("Other name", "https://example.org/", None, &req).is_some());
        assert!(matches_request("Unrelated", "https://other.org", None, &req).is_none());
    }
    #[test]
    fn rejects_untrusted_links() {
        let mut req = example();
        req.website = "http://localhost:8080/app".into();
        assert!(!valid_request(&req));
        req.website = "https://example.org".into();
        req.repository = "https://github.com.evil.test/a/b".into();
        assert!(!valid_request(&req));
    }
}
