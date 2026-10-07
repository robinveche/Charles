//! Gestion des 3 fenêtres : principale, command bar (ajout rapide), widget de bureau.
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition};
use tauri_plugin_opener::OpenerExt;

pub fn show_main_window(app: &AppHandle, view: Option<String>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        if let Some(v) = view {
            let _ = app.emit("charles://navigate", v);
        }
    }
}

#[tauri::command]
pub fn show_main(app: AppHandle, view: Option<String>) {
    show_main_window(&app, view);
}

/// Ouvre la command bar centrée sur l'écran où se trouve la souris (ou la referme).
pub fn toggle_quick_window(app: &AppHandle) {
    let Some(w) = app.get_webview_window("quick") else { return };
    if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    if let (Ok(cursor), Ok(monitors), Ok(size)) = (app.cursor_position(), app.available_monitors(), w.outer_size()) {
        let mon = monitors.iter().find(|m| {
            let p = m.position();
            let s = m.size();
            cursor.x >= p.x as f64
                && cursor.x < (p.x + s.width as i32) as f64
                && cursor.y >= p.y as f64
                && cursor.y < (p.y + s.height as i32) as f64
        });
        if let Some(m) = mon.or(monitors.first()) {
            let p = m.position();
            let s = m.size();
            let x = p.x + (s.width as i32 - size.width as i32) / 2;
            let y = p.y + (s.height as f64 * 0.24) as i32;
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
    } else {
        let _ = w.center();
    }
    let _ = w.show();
    let _ = w.set_always_on_top(true);
    let _ = w.set_focus();
    let _ = app.emit("charles://quick-open", ());
}

#[tauri::command]
pub fn toggle_quick(app: AppHandle) {
    toggle_quick_window(&app);
}

#[tauri::command]
pub fn hide_quick(app: AppHandle) {
    if let Some(w) = app.get_webview_window("quick") {
        let _ = w.hide();
    }
}

pub fn toggle_widget_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("widget") {
        let visible = !w.is_visible().unwrap_or(false);
        if visible {
            let _ = w.show();
        } else {
            let _ = w.hide();
        }
        let _ = app.emit("charles://widget-visible", visible);
    }
}

/// Applique les réglages du widget : visibilité, calque (bureau / normal / au-dessus), taille.
#[tauri::command]
pub fn apply_widget(app: AppHandle, visible: bool, layer: String, size: String, resize: bool) -> Result<(), String> {
    let w = app.get_webview_window("widget").ok_or("widget introuvable")?;
    if resize {
        let (width, height) = match size.as_str() {
            "mini" => (330.0, 300.0),
            "large" => (440.0, 780.0),
            _ => (390.0, 620.0),
        };
        w.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    }
    if visible {
        w.show().map_err(|e| e.to_string())?;
    } else {
        w.hide().map_err(|e| e.to_string())?;
    }
    let _ = w.set_always_on_top(layer == "top");
    let _ = w.set_always_on_bottom(layer == "desktop");
    Ok(())
}

fn backup_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Crée le dossier de sauvegarde et ne garde que les 14 copies les plus récentes.
#[tauri::command]
pub fn prepare_backup_dir(app: AppHandle) -> Result<String, String> {
    let dir = backup_dir(&app)?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        let mut files: Vec<_> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with("charles-") && n.ends_with(".db")).unwrap_or(false))
            .collect();
        files.sort();
        if files.len() > 14 {
            for old in &files[..files.len() - 14] {
                let _ = std::fs::remove_file(old);
            }
        }
    }
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_backups(app: AppHandle) -> Result<(), String> {
    let dir = backup_dir(&app)?;
    app.opener().open_path(dir.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
