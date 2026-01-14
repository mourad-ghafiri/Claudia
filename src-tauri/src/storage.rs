// Filesystem-based storage layer for Claudia
// Replaces JSON-based storage with Markdown files + YAML frontmatter

use parking_lot::RwLock;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use crate::models::{
    Settings, SettingsOverride, WorkspaceEntry,
    Folder,
    Note,
    Password,
    Task,
};

// ============================================
// PATH HELPERS
// ============================================

/// Global config directory (~/.claudia/)
pub fn globalConfigDir() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".claudia")
}

/// Global config file path
pub fn globalConfigPath() -> PathBuf {
    globalConfigDir().join("config.md")
}

/// Workspace folders directory (unified folder tree)
pub fn foldersDir(workspacePath: &str) -> PathBuf {
    PathBuf::from(workspacePath).join("folders")
}

/// Notes directory inside a specific folder
/// folderPath is relative path within folders/ (empty string for root)
pub fn notesDir(workspacePath: &str, folderPath: &str) -> PathBuf {
    let base = foldersDir(workspacePath);
    if folderPath.is_empty() {
        base.join("notes")
    } else {
        base.join(folderPath).join("notes")
    }
}

/// Tasks directory inside a specific folder
/// folderPath is relative path within folders/ (empty string for root)
pub fn tasksDir(workspacePath: &str, folderPath: &str) -> PathBuf {
    let base = foldersDir(workspacePath);
    if folderPath.is_empty() {
        base.join("tasks")
    } else {
        base.join(folderPath).join("tasks")
    }
}

/// Passwords directory inside a specific folder
/// folderPath is relative path within folders/ (empty string for root)
pub fn passwordsDir(workspacePath: &str, folderPath: &str) -> PathBuf {
    let base = foldersDir(workspacePath);
    if folderPath.is_empty() {
        base.join("passwords")
    } else {
        base.join(folderPath).join("passwords")
    }
}

/// Workspace config override file
pub fn workspaceConfigPath(workspacePath: &str) -> PathBuf {
    PathBuf::from(workspacePath).join("config.md")
}

// ============================================
// FRONTMATTER PARSING
// ============================================

/// Parse YAML frontmatter from markdown content
pub fn parseFrontmatter<T: serde::de::DeserializeOwned>(content: &str) -> Option<(T, String)> {
    let content = content.trim();
    if !content.starts_with("---") {
        return None;
    }
    
    let rest = &content[3..];
    let end = rest.find("\n---")?;
    let yaml = &rest[..end].trim();
    let body = rest[end + 4..].trim().to_string();
    
    let frontmatter: T = serde_yaml::from_str(yaml).ok()?;
    Some((frontmatter, body))
}

/// Serialize frontmatter + body to markdown
pub fn toMarkdown<T: serde::Serialize>(frontmatter: &T, body: &str) -> Result<String, String> {
    let yaml = serde_yaml::to_string(frontmatter)
        .map_err(|e| format!("YAML error: {}", e))?;
    Ok(format!("---\n{}---\n\n{}", yaml, body))
}

// ============================================
// FILENAME PARSING
// ============================================

/// Parse rank and slug from filename (e.g., "000001-my-note.md" -> (1, "my-note"))
pub fn parseFilename(filename: &str) -> Option<(u32, String)> {
    let name = filename.strip_suffix(".md").unwrap_or(filename);
    let parts: Vec<&str> = name.splitn(2, '-').collect();
    if parts.len() != 2 {
        return None;
    }
    let rank: u32 = parts[0].parse().ok()?;
    let slug = parts[1].to_string();
    Some((rank, slug))
}

/// Create filename from rank and slug
pub fn toFilename(rank: u32, slug: &str, isDir: bool) -> String {
    if isDir {
        format!("{:06}-{}", rank, slug)
    } else {
        format!("{:06}-{}.md", rank, slug)
    }
}

/// Generate slug from title
pub fn slugify(title: &str) -> String {
    slug::slugify(title)
}

// ============================================
// STORAGE STATE
// ============================================

/// In-memory cache of workspace data
#[derive(Debug, Default)]
pub struct WorkspaceData {
    pub folders: Vec<Folder>,
    pub notes: Vec<Note>,
    pub tasks: Vec<Task>,
}

/// Main storage manager
pub struct Storage {
    pub workspacePath: RwLock<Option<String>>,
    pub globalSettings: RwLock<Settings>,
    pub workspaceOverride: RwLock<SettingsOverride>,
    pub workspaces: RwLock<Vec<WorkspaceEntry>>,
    pub data: RwLock<WorkspaceData>,
}

impl Storage {
    pub fn new() -> Self {
        println!("[Storage::new] Initializing storage...");

        // Load global config on construction
        let (settings, workspaces) = loadGlobalConfig();
        println!("[Storage::new] Loaded {} workspaces from config", workspaces.len());
        println!("[Storage::new] Current workspace from settings: {:?}", settings.currentWorkspace);

        // Auto-open current workspace if set and path exists
        let currentWsPath = settings.currentWorkspace.clone()
            .filter(|p| {
                let exists = PathBuf::from(p).exists();
                println!("[Storage::new] Workspace path '{}' exists: {}", p, exists);
                exists
            });
        println!("[Storage::new] Will auto-open workspace: {:?}", currentWsPath);

        // Load workspace override if we have a current workspace
        let workspaceOverride = currentWsPath.as_ref()
            .and_then(|ws_path| {
                let config_path = workspaceConfigPath(ws_path);
                println!("[Storage::new] Looking for workspace config at: {:?}", config_path);
                if config_path.exists() {
                    println!("[Storage::new] Found workspace config, loading override...");
                    fs::read_to_string(&config_path).ok()
                        .and_then(|content| parseFrontmatter::<SettingsOverride>(&content).map(|(o, _)| o))
                } else {
                    println!("[Storage::new] No workspace config found");
                    None
                }
            })
            .unwrap_or_default();

        println!("[Storage::new] Storage initialized successfully");
        Self {
            workspacePath: RwLock::new(currentWsPath),
            globalSettings: RwLock::new(settings),
            workspaceOverride: RwLock::new(workspaceOverride),
            workspaces: RwLock::new(workspaces),
            data: RwLock::new(WorkspaceData::default()),
        }
    }

    /// Get effective settings (global + workspace override)
    pub fn effectiveSettings(&self) -> Settings {
        let global = self.globalSettings.read();
        let over = self.workspaceOverride.read();
        global.withOverride(&*over)
    }

    /// Get current workspace path
    pub fn getWorkspacePath(&self) -> Option<String> {
        let path = self.workspacePath.read().clone();
        println!("[Storage::getWorkspacePath] Current workspace: {:?}", path);
        path
    }
}

pub type StorageState = Arc<Storage>;

/// Initialize storage
pub fn initStorage() -> Result<StorageState, String> {
    Ok(Arc::new(Storage::new()))
}

// ============================================
// GLOBAL CONFIG
// ============================================

fn loadGlobalConfig() -> (Settings, Vec<WorkspaceEntry>) {
    let path = globalConfigPath();
    println!("[loadGlobalConfig] Config path: {:?}", path);

    if !path.exists() {
        println!("[loadGlobalConfig] Config file does not exist, returning defaults");
        return (Settings::default(), Vec::new());
    }

    let content = fs::read_to_string(&path).unwrap_or_default();
    println!("[loadGlobalConfig] Loaded config content ({} bytes)", content.len());

    // Parse frontmatter for settings
    let (settings, body) = parseFrontmatter::<Settings>(&content)
        .unwrap_or_else(|| {
            println!("[loadGlobalConfig] Failed to parse frontmatter, using defaults");
            (Settings::default(), String::new())
        });
    println!("[loadGlobalConfig] Parsed settings, currentWorkspace: {:?}", settings.currentWorkspace);

    // Parse workspaces table from body
    let workspaces = parseWorkspacesTable(&body);
    println!("[loadGlobalConfig] Parsed {} workspaces from table", workspaces.len());

    (settings, workspaces)
}

/// Parse markdown table of workspaces from body
fn parseWorkspacesTable(body: &str) -> Vec<WorkspaceEntry> {
    let mut workspaces = Vec::new();

    for line in body.lines() {
        let line = line.trim();
        // Skip header rows and empty lines
        if line.is_empty() || line.starts_with('#') || line.starts_with("|--") || line.contains("path") {
            continue;
        }
        // Parse table row: | path | name | lastOpened |
        if line.starts_with('|') {
            let parts: Vec<&str> = line.split('|')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if parts.len() >= 3 {
                let path = parts[0].to_string();
                let name = parts[1].to_string();
                let lastOpened = parts[2].parse::<i64>().unwrap_or(0);

                // Only add if path exists on filesystem
                if PathBuf::from(&path).exists() {
                    workspaces.push(WorkspaceEntry { path, name, lastOpened });
                }
            }
        }
    }

    workspaces
}

pub fn saveGlobalConfig(storage: &Storage) -> Result<(), String> {
    let path = globalConfigPath();
    
    // Create directory if needed
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let settings = storage.globalSettings.read();
    let workspaces = storage.workspaces.read();
    
    // Build workspaces table
    let mut body = String::from("# Workspaces\n\n| path | name | lastOpened |\n|------|------|------------|\n");
    for ws in workspaces.iter() {
        body.push_str(&format!("| {} | {} | {} |\n", ws.path, ws.name, ws.lastOpened));
    }
    
    let content = toMarkdown(&*settings, &body)?;
    fs::write(&path, content).map_err(|e| e.to_string())
}
