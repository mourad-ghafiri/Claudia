// Settings commands - complete implementation

use std::fs;
use tauri::State;

use crate::storage::{StorageState, saveGlobalConfig, workspaceConfigPath, parseFrontmatter, toMarkdown};
use crate::models::{Settings, SettingsOverride};

#[derive(serde::Serialize)]
pub struct SettingsInfo {
    pub theme: String,
    pub defaultMode: String,
    pub defaultColor: String,
    pub notificationsEnabled: bool,
    pub notificationSound: bool,
    pub notificationMinutesBefore: i32,
    pub floatingOpacity: f64,
}

impl From<Settings> for SettingsInfo {
    fn from(s: Settings) -> Self {
        Self {
            theme: s.theme,
            defaultMode: s.defaultMode,
            defaultColor: s.defaultColor,
            notificationsEnabled: s.notificationsEnabled,
            notificationSound: s.notificationSound,
            notificationMinutesBefore: s.notificationMinutesBefore,
            floatingOpacity: s.floatingOpacity,
        }
    }
}

#[tauri::command]
pub fn getSettings(storage: State<'_, StorageState>) -> SettingsInfo {
    println!("[getSettings] Called");
    let settings = storage.effectiveSettings();
    println!("[getSettings] theme: {}, defaultMode: {}", settings.theme, settings.defaultMode);
    settings.into()
}

#[tauri::command]
pub fn getGlobalSettings(storage: State<'_, StorageState>) -> SettingsInfo {
    println!("[getGlobalSettings] Called");
    let settings = storage.globalSettings.read().clone();
    println!("[getGlobalSettings] theme: {}, defaultMode: {}", settings.theme, settings.defaultMode);
    settings.into()
}

#[derive(serde::Deserialize)]
pub struct UpdateSettingsInput {
    pub theme: Option<String>,
    pub defaultMode: Option<String>,
    pub defaultColor: Option<String>,
    pub notificationsEnabled: Option<bool>,
    pub notificationSound: Option<bool>,
    pub notificationMinutesBefore: Option<i32>,
    pub floatingOpacity: Option<f64>,
}

#[tauri::command]
pub fn updateGlobalSettings(storage: State<'_, StorageState>, input: UpdateSettingsInput) -> Result<(), String> {
    println!("[updateGlobalSettings] Called");
    println!("[updateGlobalSettings] Updates - theme: {:?}, defaultMode: {:?}, defaultColor: {:?}",
             input.theme, input.defaultMode, input.defaultColor);

    {
        let mut settings = storage.globalSettings.write();
        if let Some(theme) = input.theme {
            println!("[updateGlobalSettings] Setting theme to: {}", theme);
            settings.theme = theme;
        }
        if let Some(defaultMode) = input.defaultMode {
            println!("[updateGlobalSettings] Setting defaultMode to: {}", defaultMode);
            settings.defaultMode = defaultMode;
        }
        if let Some(defaultColor) = input.defaultColor {
            println!("[updateGlobalSettings] Setting defaultColor to: {}", defaultColor);
            settings.defaultColor = defaultColor;
        }
        if let Some(notificationsEnabled) = input.notificationsEnabled {
            println!("[updateGlobalSettings] Setting notificationsEnabled to: {}", notificationsEnabled);
            settings.notificationsEnabled = notificationsEnabled;
        }
        if let Some(notificationSound) = input.notificationSound {
            println!("[updateGlobalSettings] Setting notificationSound to: {}", notificationSound);
            settings.notificationSound = notificationSound;
        }
        if let Some(notificationMinutesBefore) = input.notificationMinutesBefore {
            println!("[updateGlobalSettings] Setting notificationMinutesBefore to: {}", notificationMinutesBefore);
            settings.notificationMinutesBefore = notificationMinutesBefore;
        }
        if let Some(floatingOpacity) = input.floatingOpacity {
            println!("[updateGlobalSettings] Setting floatingOpacity to: {}", floatingOpacity);
            settings.floatingOpacity = floatingOpacity;
        }
    }
    saveGlobalConfig(&storage)?;
    println!("[updateGlobalSettings] SUCCESS");
    Ok(())
}

#[tauri::command]
pub fn updateWorkspaceSettings(storage: State<'_, StorageState>, input: UpdateSettingsInput) -> Result<(), String> {
    println!("[updateWorkspaceSettings] Called");

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let configPath = workspaceConfigPath(&wsPath);
    println!("[updateWorkspaceSettings] Config path: {:?}", configPath);

    // Load existing override or create new
    let mut override_settings = if configPath.exists() {
        println!("[updateWorkspaceSettings] Loading existing config");
        fs::read_to_string(&configPath)
            .ok()
            .and_then(|content| parseFrontmatter::<SettingsOverride>(&content).map(|(s, _)| s))
            .unwrap_or_default()
    } else {
        println!("[updateWorkspaceSettings] No existing config, using defaults");
        SettingsOverride::default()
    };

    // Update fields
    if input.theme.is_some() {
        println!("[updateWorkspaceSettings] Setting theme: {:?}", input.theme);
        override_settings.theme = input.theme;
    }
    if input.defaultMode.is_some() {
        println!("[updateWorkspaceSettings] Setting defaultMode: {:?}", input.defaultMode);
        override_settings.defaultMode = input.defaultMode;
    }
    if input.defaultColor.is_some() {
        println!("[updateWorkspaceSettings] Setting defaultColor: {:?}", input.defaultColor);
        override_settings.defaultColor = input.defaultColor;
    }
    if input.notificationsEnabled.is_some() {
        println!("[updateWorkspaceSettings] Setting notificationsEnabled: {:?}", input.notificationsEnabled);
        override_settings.notificationsEnabled = input.notificationsEnabled;
    }
    if input.notificationSound.is_some() {
        println!("[updateWorkspaceSettings] Setting notificationSound: {:?}", input.notificationSound);
        override_settings.notificationSound = input.notificationSound;
    }
    if input.notificationMinutesBefore.is_some() {
        println!("[updateWorkspaceSettings] Setting notificationMinutesBefore: {:?}", input.notificationMinutesBefore);
        override_settings.notificationMinutesBefore = input.notificationMinutesBefore;
    }
    if input.floatingOpacity.is_some() {
        println!("[updateWorkspaceSettings] Setting floatingOpacity: {:?}", input.floatingOpacity);
        override_settings.floatingOpacity = input.floatingOpacity;
    }

    // Save to workspace config
    let content = toMarkdown(&override_settings, "")?;
    fs::write(&configPath, content).map_err(|e| {
        println!("[updateWorkspaceSettings] ERROR writing file: {}", e);
        e.to_string()
    })?;

    // Update in-memory override
    *storage.workspaceOverride.write() = override_settings;

    println!("[updateWorkspaceSettings] SUCCESS");
    Ok(())
}
