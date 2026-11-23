mod scanner;
mod downloads;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_installed_apps,
            available_downloads,
            download_app,
        ])
        .run(tauri::generate_context!())
        .expect("error running Universal Creative Software Hub");
}
