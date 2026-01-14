// Configuration models for Claudia
// Global config and workspace config overrides

use serde::{Deserialize, Serialize};

/// All settings (stored in global config.md, can be overridden by workspace)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,
    pub defaultMode: String,
    pub defaultColor: String,
    pub notificationsEnabled: bool,
    pub notificationSound: bool,
    pub notificationMinutesBefore: i32,
    pub floatingOpacity: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currentWorkspace: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            defaultMode: "notes".to_string(),
            defaultColor: "#3B82F6".to_string(),
            notificationsEnabled: true,
            notificationSound: true,
            notificationMinutesBefore: 15,
            floatingOpacity: 0.95,
            currentWorkspace: None,
        }
    }
}

/// Workspace entry in global config body
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceEntry {
    pub path: String,
    pub name: String,
    pub lastOpened: i64,
}

/// Partial settings for workspace overrides (all fields optional)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SettingsOverride {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defaultMode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defaultColor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notificationsEnabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notificationSound: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notificationMinutesBefore: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub floatingOpacity: Option<f64>,
}

impl Settings {
    /// Merge with workspace override
    pub fn withOverride(&self, over: &SettingsOverride) -> Self {
        Self {
            theme: over.theme.clone().unwrap_or_else(|| self.theme.clone()),
            defaultMode: over.defaultMode.clone().unwrap_or_else(|| self.defaultMode.clone()),
            defaultColor: over.defaultColor.clone().unwrap_or_else(|| self.defaultColor.clone()),
            notificationsEnabled: over.notificationsEnabled.unwrap_or(self.notificationsEnabled),
            notificationSound: over.notificationSound.unwrap_or(self.notificationSound),
            notificationMinutesBefore: over.notificationMinutesBefore.unwrap_or(self.notificationMinutesBefore),
            floatingOpacity: over.floatingOpacity.unwrap_or(self.floatingOpacity),
            currentWorkspace: self.currentWorkspace.clone(),
        }
    }
}
