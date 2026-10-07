//! Raccourcis clavier globaux (fonctionnent même quand Charles est caché).
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::windows::{toggle_quick_window, toggle_widget_window};

/// (Ré)enregistre les raccourcis globaux. Renvoie ceux qui n'ont pas pu l'être
/// (déjà utilisés par une autre application ou syntaxe invalide).
#[tauri::command]
pub fn set_shortcuts(app: AppHandle, quick_add: String, toggle_widget: String) -> Vec<String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut failed = Vec::new();
    for (accel, action) in [(quick_add, "quick"), (toggle_widget, "widget")] {
        if accel.trim().is_empty() {
            continue;
        }
        match accel.parse::<Shortcut>() {
            Ok(sc) => {
                let res = gs.on_shortcut(sc, move |app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if action == "quick" {
                            toggle_quick_window(app);
                        } else {
                            toggle_widget_window(app);
                        }
                    }
                });
                if res.is_err() {
                    failed.push(accel);
                }
            }
            Err(_) => failed.push(accel),
        }
    }
    failed
}
