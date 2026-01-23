// Floating window commands - complete implementation

use tauri::{Manager, WebviewWindowBuilder, WebviewUrl};
use urlencoding::encode;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[derive(serde::Deserialize)]
pub struct FloatingWindowConfig {
    pub note_id: String,  // Item ID (note or task)
    pub item_type: String,
    pub title: String,
    #[allow(dead_code)] // Reserved for future use (window border color)
    pub color: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub opacity: f64,
    pub theme: String,  // 'light', 'dark', or 'system'
}

#[tauri::command]
pub fn createFloatingWindow(app: tauri::AppHandle, config: FloatingWindowConfig) -> Result<(), String> {
    println!("[createFloatingWindow] Called with:");
    println!("  - note_id: {}", config.note_id);
    println!("  - item_type: {}", config.item_type);
    println!("  - title: {}", config.title);
    println!("  - position: ({}, {})", config.x, config.y);
    println!("  - size: {}x{}", config.width, config.height);

    // Validate item_type - must be "task" or "note"
    if config.item_type != "task" && config.item_type != "note" {
        return Err("Invalid item_type: must be 'task' or 'note'".to_string());
    }

    // Validate note_id - must be alphanumeric with dashes (UUID format)
    if !config.note_id.chars().all(|c| c.is_alphanumeric() || c == '-') {
        return Err("Invalid note_id format".to_string());
    }

    // Validate theme - must be "light", "dark", or "system"
    if config.theme != "light" && config.theme != "dark" && config.theme != "system" {
        return Err("Invalid theme: must be 'light', 'dark', or 'system'".to_string());
    }

    // Validate opacity - must be between 0 and 1
    let opacity = config.opacity.clamp(0.0, 1.0);

    let label = format!("float_{}_{}", config.item_type, config.note_id.replace("-", "_"));
    println!("[createFloatingWindow] Window label: {}", label);

    // Check if window already exists
    if let Some(window) = app.get_webview_window(&label) {
        println!("[createFloatingWindow] Window already exists, showing it");
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // URL-encode all parameters to prevent injection
    let url = format!(
        "/floating?type={}&id={}&opacity={}&theme={}",
        encode(&config.item_type),
        encode(&config.note_id),
        encode(&opacity.to_string()),
        encode(&config.theme)
    );
    println!("[createFloatingWindow] Creating new window with URL: {}", url);
    println!("[createFloatingWindow] Opacity: {}, Theme: {}", opacity, config.theme);

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("")
        .inner_size(config.width, config.height)
        .position(config.x, config.y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(true)
        .shadow(false)
        .build()
        .map_err(|e| {
            println!("[createFloatingWindow] ERROR building window: {}", e);
            e.to_string()
        })?;

    // Apply vibrancy with rounded corners on macOS only when opacity is 1.0 (fully opaque)
    // Otherwise, let CSS handle the transparency with backdrop-filter
    #[cfg(target_os = "macos")]
    {
        if opacity >= 0.99 {
            // Use HudWindow for a subtle frosted glass effect with 16px corner radius
            if let Err(e) = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, Some(16.0)) {
                println!("[createFloatingWindow] Warning: Could not apply vibrancy: {}", e);
            } else {
                println!("[createFloatingWindow] Applied vibrancy with rounded corners (opacity = {})", opacity);
            }
        } else {
            println!("[createFloatingWindow] Skipping vibrancy (opacity = {}), using CSS transparency", opacity);
        }
    }

    println!("[createFloatingWindow] SUCCESS - window created");
    Ok(())
}

#[tauri::command]
pub fn showFloatingWindow(app: tauri::AppHandle, note_id: String) -> Result<(), String> {
    println!("[showFloatingWindow] Called with note_id: {}", note_id);

    // Find any floating window with this ID
    let windows = app.webview_windows();
    println!("[showFloatingWindow] Total windows: {}", windows.len());

    for (label, window) in windows {
        println!("[showFloatingWindow] Checking window: {}", label);
        if label.contains(&note_id.replace("-", "_")) {
            println!("[showFloatingWindow] Found matching window, showing it");
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    println!("[showFloatingWindow] ERROR - Window not found");
    Err("Window not found".to_string())
}

#[tauri::command]
pub fn hideFloatingWindow(app: tauri::AppHandle, note_id: String) -> Result<(), String> {
    println!("[hideFloatingWindow] Called with note_id: {}", note_id);

    let windows = app.webview_windows();
    for (label, window) in windows {
        if label.contains(&note_id.replace("-", "_")) {
            println!("[hideFloatingWindow] Found window {}, hiding", label);
            window.hide().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    println!("[hideFloatingWindow] No matching window found");
    Ok(())
}

#[tauri::command]
pub fn closeFloatingWindow(app: tauri::AppHandle, note_id: String) -> Result<(), String> {
    println!("[closeFloatingWindow] Called with note_id: {}", note_id);

    let windows = app.webview_windows();
    for (label, window) in windows {
        if label.contains(&note_id.replace("-", "_")) {
            println!("[closeFloatingWindow] Found window {}, closing", label);
            window.close().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    println!("[closeFloatingWindow] No matching window found");
    Ok(())
}

#[tauri::command]
pub fn closeAllFloatingWindows(app: tauri::AppHandle) -> Result<(), String> {
    println!("[closeAllFloatingWindows] Called");

    let windows = app.webview_windows();
    let mut count = 0;
    for (label, window) in windows {
        if label.starts_with("float_") {
            println!("[closeAllFloatingWindows] Closing window: {}", label);
            let _ = window.close();
            count += 1;
        }
    }
    println!("[closeAllFloatingWindows] Closed {} windows", count);
    Ok(())
}

#[tauri::command]
pub fn toggleAllFloatingWindows(app: tauri::AppHandle) -> Result<(), String> {
    println!("[toggleAllFloatingWindows] Called");

    let windows = app.webview_windows();
    let floatingWindows: Vec<_> = windows.iter()
        .filter(|(label, _)| label.starts_with("float_"))
        .collect();

    println!("[toggleAllFloatingWindows] Found {} floating windows", floatingWindows.len());

    if floatingWindows.is_empty() {
        println!("[toggleAllFloatingWindows] No floating windows to toggle");
        return Ok(());
    }

    // Check if any are visible
    let anyVisible = floatingWindows.iter().any(|(_, w)| w.is_visible().unwrap_or(false));
    println!("[toggleAllFloatingWindows] Any visible: {}, will {}", anyVisible, if anyVisible { "hide all" } else { "show all" });

    for (label, window) in floatingWindows {
        if anyVisible {
            println!("[toggleAllFloatingWindows] Hiding {}", label);
            let _ = window.hide();
        } else {
            println!("[toggleAllFloatingWindows] Showing {}", label);
            let _ = window.show();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn updateFloatingWindowPosition(app: tauri::AppHandle, note_id: String, x: f64, y: f64) -> Result<(), String> {
    println!("[updateFloatingWindowPosition] note_id: {}, x: {}, y: {}", note_id, x, y);

    let windows = app.webview_windows();
    for (label, window) in windows {
        if label.contains(&note_id.replace("-", "_")) {
            println!("[updateFloatingWindowPosition] Found window {}, updating position", label);
            window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)))
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    println!("[updateFloatingWindowPosition] No matching window found");
    Ok(())
}

#[tauri::command]
pub fn updateFloatingWindowSize(app: tauri::AppHandle, note_id: String, width: f64, height: f64) -> Result<(), String> {
    println!("[updateFloatingWindowSize] note_id: {}, width: {}, height: {}", note_id, width, height);

    let windows = app.webview_windows();
    for (label, window) in windows {
        if label.contains(&note_id.replace("-", "_")) {
            println!("[updateFloatingWindowSize] Found window {}, updating size", label);
            window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)))
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    println!("[updateFloatingWindowSize] No matching window found");
    Ok(())
}

#[tauri::command]
pub fn getFloatingWindowPosition(app: tauri::AppHandle, note_id: String) -> Option<(f64, f64)> {
    println!("[getFloatingWindowPosition] note_id: {}", note_id);

    let windows = app.webview_windows();
    for (label, window) in windows {
        if label.contains(&note_id.replace("-", "_")) {
            let pos = window.outer_position().ok().map(|pos| (pos.x as f64, pos.y as f64));
            println!("[getFloatingWindowPosition] Found window {}, position: {:?}", label, pos);
            return pos;
        }
    }
    println!("[getFloatingWindowPosition] No matching window found");
    None
}

#[tauri::command]
pub fn getFloatingWindowSize(app: tauri::AppHandle, note_id: String) -> Option<(f64, f64)> {
    println!("[getFloatingWindowSize] note_id: {}", note_id);

    let windows = app.webview_windows();
    for (label, window) in windows {
        if label.contains(&note_id.replace("-", "_")) {
            let size = window.outer_size().ok().map(|size| (size.width as f64, size.height as f64));
            println!("[getFloatingWindowSize] Found window {}, size: {:?}", label, size);
            return size;
        }
    }
    println!("[getFloatingWindowSize] No matching window found");
    None
}
