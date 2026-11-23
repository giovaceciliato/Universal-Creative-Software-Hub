mod scanner;
mod downloads;
mod installations;
mod artcraft_catalog;
mod github_projects;
mod app_requests;

#[tauri::command]
fn get_downloads_directory() -> Result<String, String> {
    let path = dirs::download_dir().ok_or("Downloads folder not found")?;
    if !path.is_dir() {
        return Err("Downloads folder does not exist".into());
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn scan_installed_apps() -> Result<scanner::ScanReport, String> {
    // Keep filesystem/package discovery away from the WebView thread.
    tauri::async_runtime::spawn_blocking(scanner::scan_installed)
        .await
        .map_err(|e| format!("Scan worker failed: {e}"))?
}

#[tauri::command]
fn available_downloads() -> Vec<downloads::DownloadOffer> {
    downloads::available_downloads()
}

#[tauri::command]
async fn download_app(
    app_id: String,
    app: tauri::AppHandle,
) -> Result<downloads::DownloadResult, String> {
    downloads::download_app(app_id, app).await
}

#[tauri::command]
fn installable_app_ids() -> Vec<String> {
    installations::installable_app_ids()
}

#[tauri::command]
async fn preview_install(app_id: String) -> Result<installations::InstallPlan, String> {
    installations::preview_install(app_id).await
}

#[tauri::command]
async fn install_app(
    app_id: String,
    expected_version: String,
    app: tauri::AppHandle,
) -> Result<installations::InstallOutcome, String> {
    installations::install_app(app_id, expected_version, app).await
}

#[tauri::command]
async fn refresh_artcraft_catalog() -> Result<artcraft_catalog::SignedCatalog, String> {
    artcraft_catalog::refresh_artcraft_catalog().await
}

#[tauri::command]
async fn inspect_github_project(url: String) -> Result<github_projects::ProjectInfo, String> {
    github_projects::inspect_github_project(url).await
}

#[tauri::command]
async fn resolve_catalog_download(repo: String) -> Result<Option<github_projects::CatalogDownloadOffer>, String> {
    github_projects::resolve_catalog_download(repo).await
}

#[tauri::command]
async fn check_github_release(repo: String) -> Result<Option<github_projects::ReleaseInfo>, String> {
    github_projects::check_github_release(repo).await
}

#[tauri::command]
async fn download_github_asset(
    repo: String, asset_id: u64, expected_tag: String, app: tauri::AppHandle,
) -> Result<github_projects::DownloadResult, String> {
    github_projects::download_github_asset(repo, asset_id, expected_tag, app).await
}

#[tauri::command]
async fn check_app_request(req: app_requests::AppRequest) -> Result<app_requests::CheckResult, String> {
    app_requests::check_app_request(req).await
}

#[tauri::command]
async fn refresh_approved_apps() -> Result<Vec<app_requests::ApprovedApp>, String> {
    app_requests::refresh_approved_apps().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_downloads_directory,
            scan_installed_apps,
            available_downloads,
            download_app,
            installable_app_ids,
            preview_install,
            install_app,
            refresh_artcraft_catalog,
            inspect_github_project,
            check_github_release,
            resolve_catalog_download,
            download_github_asset,
            check_app_request,
            refresh_approved_apps,
        ])
        .run(tauri::generate_context!())
        .expect("error running Universal Creative Software Hub");
}
