// Workspace commands - complete implementation

use std::fs;
use std::path::PathBuf;
use tauri::State;
use rfd::FileDialog;

use crate::storage::{StorageState, saveGlobalConfig, foldersDir, notesDir, tasksDir, workspaceConfigPath, parseFrontmatter};
use crate::models::{WorkspaceEntry, SettingsOverride};
use super::common::now;

#[derive(serde::Serialize)]
pub struct WorkspaceInfo {
    pub path: String,
    pub name: String,
    pub lastOpened: i64,
    pub isCurrent: bool,
}

#[tauri::command]
pub fn getWorkspaces(storage: State<'_, StorageState>) -> Vec<WorkspaceInfo> {
    println!("[getWorkspaces] Called");

    let workspaces = storage.workspaces.read();
    let current = storage.getWorkspacePath();
    println!("[getWorkspaces] Found {} workspaces, current: {:?}", workspaces.len(), current);

    let result: Vec<WorkspaceInfo> = workspaces.iter().map(|ws| {
        let is_current = current.as_ref() == Some(&ws.path);
        println!("[getWorkspaces]   - {} (path: {}, isCurrent: {})", ws.name, ws.path, is_current);
        WorkspaceInfo {
            path: ws.path.clone(),
            name: ws.name.clone(),
            lastOpened: ws.lastOpened,
            isCurrent: is_current,
        }
    }).collect();
    result
}

#[tauri::command]
pub fn getCurrentWorkspace(storage: State<'_, StorageState>) -> Option<WorkspaceInfo> {
    println!("[getCurrentWorkspace] Called");

    let current = storage.getWorkspacePath()?;
    println!("[getCurrentWorkspace] Current workspace path: {}", current);

    let workspaces = storage.workspaces.read();

    let result = workspaces.iter().find(|ws| ws.path == current).map(|ws| {
        println!("[getCurrentWorkspace] Found workspace: {}", ws.name);
        WorkspaceInfo {
            path: ws.path.clone(),
            name: ws.name.clone(),
            lastOpened: ws.lastOpened,
            isCurrent: true,
        }
    });

    if result.is_none() {
        println!("[getCurrentWorkspace] Workspace not found in list");
    }
    result
}

#[tauri::command]
pub fn createWorkspace(storage: State<'_, StorageState>, path: String) -> Result<WorkspaceInfo, String> {
    println!("[createWorkspace] Called with path: {}", path);

    let pathBuf = PathBuf::from(&path);

    // Create unified workspace structure: folders/ with notes/ and tasks/ inside
    let folders = foldersDir(&path);
    println!("[createWorkspace] Creating folders directory: {:?}", folders);
    fs::create_dir_all(&folders).map_err(|e| e.to_string())?;
    
    // Create root notes and tasks directories
    let notes = notesDir(&path, "");
    println!("[createWorkspace] Creating notes directory: {:?}", notes);
    fs::create_dir_all(&notes).map_err(|e| e.to_string())?;
    
    let tasks = tasksDir(&path, "");
    println!("[createWorkspace] Creating tasks directory: {:?}", tasks);
    fs::create_dir_all(&tasks).map_err(|e| e.to_string())?;

    let name = pathBuf.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Workspace")
        .to_string();
    println!("[createWorkspace] Workspace name: {}", name);

    let entry = WorkspaceEntry {
        path: path.clone(),
        name: name.clone(),
        lastOpened: now(),
    };

    // Add to workspaces list
    {
        let mut workspaces = storage.workspaces.write();
        if !workspaces.iter().any(|ws| ws.path == path) {
            println!("[createWorkspace] Adding to workspaces list");
            workspaces.push(entry.clone());
        } else {
            println!("[createWorkspace] Workspace already in list");
        }
    }

    // Set as current workspace
    {
        let mut settings = storage.globalSettings.write();
        settings.currentWorkspace = Some(path.clone());
    }
    *storage.workspacePath.write() = Some(path.clone());
    println!("[createWorkspace] Set as current workspace");

    // Load workspace config override if exists
    let configPath = workspaceConfigPath(&path);
    if configPath.exists() {
        println!("[createWorkspace] Loading workspace config override from {:?}", configPath);
        if let Ok(content) = fs::read_to_string(&configPath) {
            if let Some((over, _)) = parseFrontmatter::<SettingsOverride>(&content) {
                *storage.workspaceOverride.write() = over;
            }
        }
    }

    saveGlobalConfig(&storage)?;
    println!("[createWorkspace] SUCCESS");

    Ok(WorkspaceInfo {
        path,
        name,
        lastOpened: entry.lastOpened,
        isCurrent: true,
    })
}

#[tauri::command]
pub fn openWorkspace(storage: State<'_, StorageState>, path: String) -> Result<WorkspaceInfo, String> {
    println!("[openWorkspace] Called with path: {}", path);

    // Update lastOpened
    {
        let mut workspaces = storage.workspaces.write();
        if let Some(ws) = workspaces.iter_mut().find(|ws| ws.path == path) {
            ws.lastOpened = now();
            println!("[openWorkspace] Updated lastOpened for workspace");
        } else {
            println!("[openWorkspace] Workspace not found in list");
        }
    }

    // Set as current
    {
        let mut settings = storage.globalSettings.write();
        settings.currentWorkspace = Some(path.clone());
    }
    *storage.workspacePath.write() = Some(path.clone());
    println!("[openWorkspace] Set as current workspace");

    // Load workspace config override
    let configPath = workspaceConfigPath(&path);
    if configPath.exists() {
        println!("[openWorkspace] Loading config override from {:?}", configPath);
        if let Ok(content) = fs::read_to_string(&configPath) {
            if let Some((over, _)) = parseFrontmatter::<SettingsOverride>(&content) {
                *storage.workspaceOverride.write() = over;
            }
        }
    } else {
        println!("[openWorkspace] No config override found, using defaults");
        *storage.workspaceOverride.write() = SettingsOverride::default();
    }

    saveGlobalConfig(&storage)?;

    let workspaces = storage.workspaces.read();
    let ws = workspaces.iter().find(|ws| ws.path == path).ok_or("Workspace not found")?;
    println!("[openWorkspace] SUCCESS - opened workspace: {}", ws.name);

    Ok(WorkspaceInfo {
        path: ws.path.clone(),
        name: ws.name.clone(),
        lastOpened: ws.lastOpened,
        isCurrent: true,
    })
}

#[tauri::command]
pub fn closeWorkspace(storage: State<'_, StorageState>) -> Result<(), String> {
    println!("[closeWorkspace] Called");

    storage.globalSettings.write().currentWorkspace = None;
    *storage.workspacePath.write() = None;
    *storage.workspaceOverride.write() = SettingsOverride::default();

    saveGlobalConfig(&storage)?;
    println!("[closeWorkspace] SUCCESS - workspace closed");
    Ok(())
}

#[tauri::command]
pub fn removeWorkspace(storage: State<'_, StorageState>, path: String) -> Result<(), String> {
    println!("[removeWorkspace] Called with path: {}", path);

    {
        let mut workspaces = storage.workspaces.write();
        let before = workspaces.len();
        workspaces.retain(|ws| ws.path != path);
        println!("[removeWorkspace] Removed from list ({} -> {})", before, workspaces.len());
    }

    // If this was current workspace, clear it
    {
        let mut settings = storage.globalSettings.write();
        if settings.currentWorkspace.as_ref() == Some(&path) {
            println!("[removeWorkspace] Was current workspace, clearing");
            settings.currentWorkspace = None;
        }
    }
    if storage.getWorkspacePath().as_ref() == Some(&path) {
        *storage.workspacePath.write() = None;
    }

    saveGlobalConfig(&storage)?;
    println!("[removeWorkspace] SUCCESS");
    Ok(())
}

#[tauri::command]
pub fn openFolderDialog() -> Option<String> {
    println!("[openFolderDialog] Called");

    let result = FileDialog::new()
        .set_title("Select Workspace Folder")
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string());

    println!("[openFolderDialog] Result: {:?}", result);
    result
}
