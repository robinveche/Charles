//! CHARLES — cœur natif (Tauri 2).
//! Le Rust reste volontairement fin : fenêtres, barre système, raccourcis globaux,
//! démarrage automatique. Toute la logique métier vit dans le front (TypeScript).
mod db;
mod shortcuts;
mod windows;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::StateFlags;

use windows::{show_main_window, toggle_quick_window, toggle_widget_window};

pub fn run() {
    tauri::Builder::default()
        // Une seule instance : relancer Charles ré-affiche simplement la fenêtre.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app, None);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED)
                .with_denylist(&["quick"])
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            windows::show_main,
            windows::toggle_quick,
            windows::hide_quick,
            windows::apply_widget,
            windows::prepare_backup_dir,
            windows::open_backups,
            windows::path_exists,
            windows::quit_app,
            shortcuts::set_shortcuts,
        ])
        .setup(|app| {
            // ── Barre système ──
            let open = MenuItem::with_id(app, "open", "Ouvrir Charles", true, None::<&str>)?;
            let quick = MenuItem::with_id(app, "quick", "Ajout rapide…", true, None::<&str>)?;
            let widget = MenuItem::with_id(app, "widget", "Afficher / masquer le widget", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter Charles", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quick, &widget, &sep, &quit])?;

            let mut tray = TrayIconBuilder::with_id("charles")
                .tooltip("Charles")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app, None),
                    "quick" => toggle_quick_window(app),
                    "widget" => toggle_widget_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main_window(tray.app_handle(), None);
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // Lancé au démarrage de Windows (--hidden) : discret, seul le widget apparaît.
            let hidden = std::env::args().any(|a| a == "--hidden");
            if !hidden {
                show_main_window(app.handle(), None);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Fermer = cacher. Charles continue de tourner (rappels, raccourcis) dans la barre système.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Charles");
}
