// ═══════════════════════════════════════════════════════════════
// Melody Hub — Application bootstrap
// ═══════════════════════════════════════════════════════════════
// Startup sequence (single source of truth for wiring settings
// into the proxy runtime):
//   1. Create the proxy AppState (empty sub-states).
//   2. Load (or initialize) persisted settings — this also heals
//      a missing auth token so it stays stable across restarts.
//   3. Initialize the metrics store (loads recent JSONL history
//      so the dashboard survives restarts).
//   4. Build the shared reqwest client.
//   5. Project settings into AppState (auth + runtime limits).
//   6. Load providers + aggregations from disk into routing state.
//   7. If autoStart, launch the proxy on the configured port.
//   8. Set up system tray icon and autostart based on settings.
// ═══════════════════════════════════════════════════════════════

mod commands;
mod crypto;
mod paths;
mod proxy;
mod storage;
mod types;

use commands::settings;
use commands::updater::PendingUpdate;
use proxy::SharedAppState;
use tauri::{Emitter, Manager};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state: SharedAppState = proxy::AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_state.clone())
        .manage(PendingUpdate::default())
        .setup({
            let state = app_state.clone();
            move |app| {
                let handle = app.handle().clone();

                #[cfg(desktop)]
                {
                    use tauri_plugin_autostart::MacosLauncher;
                    let _ = handle.plugin(tauri_plugin_autostart::init(
                        MacosLauncher::LaunchAgent,
                        None::<Vec<&str>>,
                    ));
                    init_tray(&handle);
                }

                bootstrap(&handle, &state);
                Ok(())
            }
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.app_handle().save_window_state(StateFlags::all());
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Provider / Aggregation
            commands::providers::save_providers,
            commands::providers::load_providers,
            commands::providers::save_aggregations,
            commands::providers::load_aggregations,
            // Provider profiles + connection test
            commands::providers::list_provider_profiles,
            commands::providers::test_provider_connection,
            commands::providers::fetch_provider_models,
            // Proxy control
            commands::providers::start_proxy,
            commands::providers::stop_proxy,
            commands::providers::get_proxy_status,
            commands::providers::exit_app,
            commands::providers::get_provider_health,
            // Stats
            commands::stats::get_stats,
            commands::stats::get_recent_requests,
            commands::stats::get_daily_usage,
            commands::stats::reset_stats,
            // Settings (single source of truth)
            commands::settings::save_settings,
            commands::settings::load_settings,
            commands::settings::apply_settings,
            // Settings — granular mutators (backwards compat)
            commands::settings::get_proxy_auth,
            commands::settings::update_proxy_auth,
            commands::settings::get_proxy_runtime_config,
            commands::settings::update_proxy_runtime_config,
            // Logs
            commands::logs::export_logs,
            commands::logs::open_log_dir,
            commands::logs::init_log_dir,
            // Updater
            commands::updater::check_for_updates,
            commands::updater::download_and_install_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let _ = app_handle.save_window_state(StateFlags::all());
                let state = app_handle.state::<SharedAppState>();
                tauri::async_runtime::block_on(async move {
                    let flushed = proxy::flush_metrics(state.inner()).await;
                    if flushed > 0 {
                        println!("[metrics] Flushed {} records on exit", flushed);
                    }
                });
            }
        });
}

/// Synchronous-ish bootstrap: performs async setup on the Tauri
/// runtime. Errors are logged but do not abort startup so the UI
/// still comes up (the user can fix config from Settings).
fn bootstrap(app_handle: &tauri::AppHandle, state: &SharedAppState) {
    let handle = app_handle.clone();
    let state = state.clone();
    tauri::async_runtime::block_on(async move {
        // 1. Load (or initialize) settings — heals missing token.
        let s = match settings::load_or_init(&handle) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[bootstrap] Failed to load settings: {}", e);
                return;
            }
        };

        // 1b. Inject the AppHandle so the proxy can emit
        // `request-completed` events to the frontend.
        state.set_app_handle(handle.clone()).await;

        // 2. Initialize metrics store (loads JSONL history).
        let log_dir = paths::logs_dir(&handle);
        if let Err(e) = proxy::init_metrics(&state, log_dir).await {
            eprintln!("[bootstrap] Failed to init metrics: {}", e);
        }

        // 3. Project settings into AppState (auth + runtime + HTTP client).
        if let Err(e) = settings::apply_settings_to_state(&state, &s).await {
            eprintln!("[bootstrap] Failed to apply settings: {}", e);
        }

        // 4. Load providers + aggregations into routing state.
        let providers = storage::load_providers(&handle).unwrap_or_default();
        let aggregations = storage::load_aggregations(&handle).unwrap_or_default();
        proxy::update_routing_config(&state, providers, aggregations).await;

        // 5. Auto-start the proxy if configured.
        if s.auto_start {
            if let Err(e) = proxy::start(state.clone(), s.host.clone(), s.port).await {
                eprintln!("[bootstrap] Failed to auto-start proxy: {}", e);
            } else {
                println!("[bootstrap] Proxy auto-started on {}:{}", s.host, s.port);
            }
        }

        // 6. Apply launch-at-login setting.
        #[cfg(desktop)]
        set_autostart_enabled(&handle, s.launch_at_login);

        // 7. Show main window unless start-minimized.
        if !s.start_minimized {
            if let Some(w) = handle.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }

        // 8. Auto-check for updates (notification-only — never auto-installs).
        // The frontend listens for the `update-available` event and shows
        // a toast with a "查看" button that opens the About page where the
        // user can confirm and install.
        if s.check_updates_on_start {
            let handle_for_update = handle.clone();
            tauri::async_runtime::spawn(async move {
                check_update_on_startup(&handle_for_update).await;
            });
        }
    });
}

/// Background startup update check. On success and when an update is
/// available, emits `update-available` to the frontend with the
/// metadata payload. Errors are logged but never surfaced to the user
/// (the user can still trigger a manual check from Settings → About).
#[cfg(desktop)]
async fn check_update_on_startup(handle: &tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    match handle.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                use serde_json::json;
                let payload = json!({
                    "version": update.version,
                    "currentVersion": update.current_version,
                    "date": update.date.map(|d| format!("{}-{:02}-{:02}T{:02}:{:02}:{:02}Z", d.year(), d.month() as u8, d.day(), d.hour(), d.minute(), d.second())),
                    "body": update.body.clone().unwrap_or_default(),
                });
                let _ = handle.emit("update-available", payload);
                // Stash the pending update so the frontend's manual
                // "install" button (which calls download_and_install_update)
                // works without a redundant check.
                if let Some(pending) = handle.try_state::<PendingUpdate>() {
                    *pending.0.lock().unwrap() = Some(update);
                }
            }
            Ok(None) => {
                println!("[updater] App is up to date");
            }
            Err(e) => {
                eprintln!("[updater] Startup check failed: {}", e);
            }
        },
        Err(e) => {
            eprintln!("[updater] Could not build updater: {}", e);
        }
    }
}

#[cfg(desktop)]
fn init_tray(app: &tauri::AppHandle) {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show_i = match MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)
    {
        Ok(i) => i,
        Err(e) => {
            eprintln!("[tray] Failed to create show menu item: {}", e);
            return;
        }
    };
    let hide_i = match MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)
    {
        Ok(i) => i,
        Err(e) => {
            eprintln!("[tray] Failed to create hide menu item: {}", e);
            return;
        }
    };
    let sep = match PredefinedMenuItem::separator(app) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[tray] Failed to create separator: {}", e);
            return;
        }
    };
    let quit_i =
        match MenuItem::with_id(app, "quit", "退出 Melody Hub", true, None::<&str>) {
            Ok(i) => i,
            Err(e) => {
                eprintln!("[tray] Failed to create quit menu item: {}", e);
                return;
            }
        };
    let tray_menu = match Menu::with_items(app, &[&show_i, &hide_i, &sep, &quit_i]) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[tray] Failed to build tray menu: {}", e);
            return;
        }
    };

    let tray_icon_data = include_bytes!("../icons/tray-icon-template.rgba");
    let (width, height) = (
        u32::from_le_bytes([
            tray_icon_data[0],
            tray_icon_data[1],
            tray_icon_data[2],
            tray_icon_data[3],
        ]),
        u32::from_le_bytes([
            tray_icon_data[4],
            tray_icon_data[5],
            tray_icon_data[6],
            tray_icon_data[7],
        ]),
    );
    let rgba = &tray_icon_data[8..];
    let icon = tauri::image::Image::new_owned(rgba.to_vec(), width, height);

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Melody Hub")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "hide" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        show_main_window(app);
                    }
                }
            }
        })
        .build(app);
}

#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg(desktop)]
fn set_autostart_enabled(app: &tauri::AppHandle, enabled: bool) {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    if enabled {
        if let Err(e) = manager.enable() {
            eprintln!("[autostart] Failed to enable: {}", e);
        }
    } else if let Err(e) = manager.disable() {
        eprintln!("[autostart] Failed to disable: {}", e);
    }
}
