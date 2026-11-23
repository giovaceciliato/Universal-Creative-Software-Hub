mod scanner;
mod downloads;
mod installations;
mod artcraft_catalog;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_installed_apps,
            available_downloads,
            download_app,
            preview_install,
            install_app,
            refresh_artcraft_catalog,
        ])
        .run(tauri::generate_context!())
        .expect("error running Universal Creative Software Hub");
}
