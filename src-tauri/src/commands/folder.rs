// Folder commands - unified folder tree implementation with encrypted metadata

use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::storage::{StorageState, foldersDir, isValidUuidDir, trashNotesDir, trashTasksDir, trashPasswordsDir};
use crate::encrypted_storage;
use crate::models::{Folder, FolderFrontmatter, TaskStatus};
use super::common::newId;

#[derive(serde::Serialize)]
pub struct FolderInfo {
    pub id: String,
    pub name: String,
    pub rank: u32,
    pub pinned: bool,
    pub favorite: bool,
    pub color: String,
    pub icon: String,
    pub path: String,
    pub parentPath: Option<String>,
    pub children: Vec<FolderInfo>,
}

impl From<&Folder> for FolderInfo {
    fn from(f: &Folder) -> Self {
        Self {
            id: f.frontmatter.id.clone(),
            name: f.frontmatter.name.clone(),
            rank: f.frontmatter.rank,
            pinned: f.frontmatter.pinned,
            favorite: f.frontmatter.favorite,
            color: f.frontmatter.color.clone(),
            icon: f.frontmatter.icon.clone(),
            path: f.path.to_string_lossy().to_string(),
            parentPath: f.parentPath.as_ref().map(|p| p.to_string_lossy().to_string()),
            children: f.children.iter().map(FolderInfo::from).collect(),
        }
    }
}

/// Scan folders recursively from a directory using encrypted format
pub(crate) fn scanFolders(baseDir: &PathBuf, parentPath: Option<PathBuf>, masterPassword: Option<&str>) -> Vec<Folder> {
    let mut folders = Vec::new();

    if !baseDir.exists() {
        return folders;
    }

    let entries: Vec<_> = fs::read_dir(baseDir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .collect();

    for entry in entries {
        let path = entry.path();
        let dirname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        // Skip hidden folders, status folders, and special subdirs
        if dirname.starts_with('.') ||
           ["todo", "doing", "done", "notes", "tasks", "passwords"].contains(&dirname.to_lowercase().as_str()) {
            continue;
        }

        // Validate directory name is a UUID
        if isValidUuidDir(dirname) {
            // Require .folder.md to exist - folders without metadata are skipped
            let folderMdPath = path.join(".folder.md");
            if folderMdPath.exists() {
                if let Ok(content) = fs::read_to_string(&folderMdPath) {
                    // Check if file is encrypted
                    let frontmatter = if encrypted_storage::isEncryptedFormat(&content) {
                        // Need master password to decrypt
                        if let Some(password) = masterPassword {
                            encrypted_storage::parseEncryptedFile(&content)
                                .ok()
                                .and_then(|encrypted| {
                                    encrypted_storage::decryptMetadata(&encrypted.metadata, password)
                                        .ok()
                                        .and_then(|yaml| serde_yaml::from_str::<FolderFrontmatter>(&yaml).ok())
                                })
                        } else {
                            None
                        }
                    } else {
                        None // Skip unencrypted files - we no longer support legacy format
                    };

                    if let Some(fm) = frontmatter {
                        let children = scanFolders(&path, Some(path.clone()), masterPassword);

                        folders.push(Folder {
                            path: path.clone(),
                            parentPath: parentPath.clone(),
                            frontmatter: fm,
                            children,
                        });
                    }
                }
            }
        }
    }

    // Sort by rank stored in frontmatter
    folders.sort_by_key(|f| f.frontmatter.rank);
    folders
}

#[tauri::command]
pub fn getFolders(storage: State<'_, StorageState>) -> Result<Vec<FolderInfo>, String> {
    println!("[getFolders] Called");

    let wsPath = match storage.getWorkspacePath() {
        Some(p) => {
            println!("[getFolders] Workspace path: {}", p);
            p
        },
        None => {
            println!("[getFolders] No workspace path, returning empty");
            return Ok(Vec::new());
        }
    };

    // Check if vault is unlocked
    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let baseDir = foldersDir(&wsPath);
    println!("[getFolders] Scanning directory: {:?}", baseDir);

    let folders = scanFolders(&baseDir, None, passwordRef);
    println!("[getFolders] Found {} folders", folders.len());

    storage.updateActivity();

    let result: Vec<FolderInfo> = folders.iter().map(FolderInfo::from).collect();
    for f in &result {
        println!("[getFolders]   - {} (path: {})", f.name, f.path);
    }
    Ok(result)
}

#[derive(serde::Deserialize)]
pub struct CreateFolderInput {
    pub name: String,
    pub parentPath: Option<String>,
}

#[tauri::command]
pub fn createFolder(storage: State<'_, StorageState>, input: CreateFolderInput) -> Result<FolderInfo, String> {
    println!("[createFolder] Called with name: {}, parentPath: {:?}",
             input.name, input.parentPath);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    println!("[createFolder] Workspace path: {}", wsPath);

    let baseDir = foldersDir(&wsPath);
    println!("[createFolder] Base directory: {:?}", baseDir);

    // Determine parent directory
    let parentDir = input.parentPath
        .map(PathBuf::from)
        .unwrap_or(baseDir.clone());
    println!("[createFolder] Parent directory: {:?}", parentDir);

    // Find next rank from existing folders
    let existingFolders = scanFolders(&parentDir, None, Some(&masterPassword));
    let nextRank = existingFolders.iter().map(|f| f.frontmatter.rank).max().unwrap_or(0) + 1;
    println!("[createFolder] Next rank: {}", nextRank);

    // UUID is the directory name (no extension for directories)
    let id = newId();
    let folderPath = parentDir.join(&id);
    println!("[createFolder] Creating folder at: {:?}", folderPath);

    // Create folder
    fs::create_dir_all(&folderPath).map_err(|e| {
        println!("[createFolder] ERROR creating directory: {}", e);
        e.to_string()
    })?;
    println!("[createFolder] Directory created successfully");

    // Create .folder.md with encrypted metadata (folders have no body content)
    let fm = FolderFrontmatter::new(id.clone(), input.name.clone(), nextRank);
    let fileContent = encrypted_storage::createEncryptedFile(
        &serde_yaml::to_string(&fm).map_err(|e| e.to_string())?,
        "", // Folders have no body content
        &masterPassword,
    )?;

    fs::write(folderPath.join(".folder.md"), fileContent).map_err(|e| {
        println!("[createFolder] ERROR writing .folder.md: {}", e);
        e.to_string()
    })?;
    println!("[createFolder] .folder.md created with id: {}", id);

    // Create notes/, tasks/, and passwords/ subdirectories inside the folder
    fs::create_dir_all(folderPath.join("notes")).map_err(|e| e.to_string())?;
    fs::create_dir_all(folderPath.join("tasks")).map_err(|e| e.to_string())?;
    fs::create_dir_all(folderPath.join("passwords")).map_err(|e| e.to_string())?;
    // Create task status folders
    for status in ["todo", "doing", "done"] {
        fs::create_dir_all(folderPath.join("tasks").join(status)).map_err(|e| e.to_string())?;
    }

    let folder = Folder {
        path: folderPath.clone(),
        parentPath: Some(parentDir),
        frontmatter: fm,
        children: Vec::new(),
    };

    storage.updateActivity();

    let result = FolderInfo::from(&folder);
    println!("[createFolder] SUCCESS - created folder id: {}, path: {}", result.id, result.path);
    Ok(result)
}

#[derive(serde::Deserialize)]
pub struct UpdateFolderInput {
    pub path: String,
    pub name: Option<String>,
    pub pinned: Option<bool>,
    pub favorite: Option<bool>,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[tauri::command]
pub fn updateFolder(storage: State<'_, StorageState>, input: UpdateFolderInput) -> Result<(), String> {
    println!("[updateFolder] Called with path: {}", input.path);
    println!("[updateFolder] Updates - name: {:?}, pinned: {:?}, color: {:?}",
             input.name, input.pinned, input.color);

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    let folderPath = PathBuf::from(&input.path);
    let folderMdPath = folderPath.join(".folder.md");
    println!("[updateFolder] Looking for .folder.md at: {:?}", folderMdPath);

    if !folderMdPath.exists() {
        return Err("Folder metadata (.folder.md) not found".to_string());
    }

    // Load and decrypt existing frontmatter
    let content = fs::read_to_string(&folderMdPath).map_err(|e| e.to_string())?;

    let mut fm = if encrypted_storage::isEncryptedFormat(&content) {
        let encrypted = encrypted_storage::parseEncryptedFile(&content)?;
        let yamlContent = encrypted_storage::decryptMetadata(&encrypted.metadata, &masterPassword)?;
        serde_yaml::from_str::<FolderFrontmatter>(&yamlContent)
            .map_err(|e| format!("Failed to parse folder metadata: {}", e))?
    } else {
        return Err("Folder metadata is not encrypted".to_string());
    };

    // Update fields
    if let Some(name) = input.name {
        println!("[updateFolder] Updating name to: {}", name);
        fm.name = name;
    }
    if let Some(pinned) = input.pinned {
        println!("[updateFolder] Updating pinned to: {}", pinned);
        fm.pinned = pinned;
    }
    if let Some(favorite) = input.favorite {
        println!("[updateFolder] Updating favorite to: {}", favorite);
        fm.favorite = favorite;
    }
    if let Some(color) = input.color {
        println!("[updateFolder] Updating color to: {}", color);
        fm.color = color;
    }
    if let Some(icon) = input.icon {
        println!("[updateFolder] Updating icon to: {}", icon);
        fm.icon = icon;
    }

    // Save with encryption
    let fileContent = encrypted_storage::createEncryptedFile(
        &serde_yaml::to_string(&fm).map_err(|e| e.to_string())?,
        "", // Folders have no body content
        &masterPassword,
    )?;

    fs::write(&folderMdPath, fileContent).map_err(|e| {
        println!("[updateFolder] ERROR writing file: {}", e);
        e.to_string()
    })?;

    storage.updateActivity();
    println!("[updateFolder] SUCCESS");
    Ok(())
}

/// Recursively move all items (notes, tasks, passwords) from a folder to trash
fn moveAllItemsToTrash(folderPath: &PathBuf, wsPath: &str) -> Result<(), String> {
    // Move notes from this folder's notes/ directory
    let notesPath = folderPath.join("notes");
    if notesPath.exists() {
        let trashNotes = trashNotesDir(wsPath);
        fs::create_dir_all(&trashNotes).map_err(|e| e.to_string())?;

        if let Ok(entries) = fs::read_dir(&notesPath) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |e| e == "md") {
                    if let Some(filename) = path.file_name() {
                        let trashPath = trashNotes.join(filename);
                        let _ = fs::rename(&path, &trashPath);
                    }
                }
            }
        }
    }

    // Move tasks from this folder's tasks/{status}/ directories
    let tasksPath = folderPath.join("tasks");
    if tasksPath.exists() {
        let trashTasks = trashTasksDir(wsPath);

        for status in [TaskStatus::Todo, TaskStatus::Doing, TaskStatus::Done] {
            let statusPath = tasksPath.join(status.folderName());
            if statusPath.exists() {
                let trashStatusPath = trashTasks.join(status.folderName());
                fs::create_dir_all(&trashStatusPath).map_err(|e| e.to_string())?;

                if let Ok(entries) = fs::read_dir(&statusPath) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() && path.extension().map_or(false, |e| e == "md") {
                            if let Some(filename) = path.file_name() {
                                let trashPath = trashStatusPath.join(filename);
                                let _ = fs::rename(&path, &trashPath);
                            }
                        }
                    }
                }
            }
        }
    }

    // Move passwords from this folder's passwords/ directory
    let passwordsPath = folderPath.join("passwords");
    if passwordsPath.exists() {
        let trashPasswords = trashPasswordsDir(wsPath);
        fs::create_dir_all(&trashPasswords).map_err(|e| e.to_string())?;

        if let Ok(entries) = fs::read_dir(&passwordsPath) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |e| e == "md") {
                    if let Some(filename) = path.file_name() {
                        let trashPath = trashPasswords.join(filename);
                        let _ = fs::rename(&path, &trashPath);
                    }
                }
            }
        }
    }

    // Recursively process subfolders (UUID directories with .folder.md)
    if let Ok(entries) = fs::read_dir(folderPath) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let dirname = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");

                // Check if it's a subfolder (has .folder.md)
                if isValidUuidDir(dirname) && path.join(".folder.md").exists() {
                    moveAllItemsToTrash(&path, wsPath)?;
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn deleteFolder(storage: State<'_, StorageState>, path: String, permanent: Option<bool>) -> Result<(), String> {
    println!("[deleteFolder] Called with path: {}, permanent: {:?}", path, permanent);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    let folderPath = PathBuf::from(&path);
    if !folderPath.exists() {
        println!("[deleteFolder] Folder does not exist at path");
        return Ok(());
    }

    if !permanent.unwrap_or(false) {
        // Soft delete: move all items to trash first
        println!("[deleteFolder] Moving all items to trash...");
        moveAllItemsToTrash(&folderPath, &wsPath)?;
        println!("[deleteFolder] All items moved to trash");
    }

    // Always delete the folder structure itself (it's now empty or we want permanent delete)
    println!("[deleteFolder] Deleting folder structure...");
    fs::remove_dir_all(&folderPath).map_err(|e| {
        println!("[deleteFolder] ERROR: {}", e);
        e.to_string()
    })?;
    println!("[deleteFolder] SUCCESS - folder deleted");

    Ok(())
}

#[derive(serde::Deserialize)]
pub struct ReorderFoldersInput {
    pub parentPath: Option<String>,
    pub folderPaths: Vec<String>,
}

#[tauri::command]
pub fn reorderFolders(storage: State<'_, StorageState>, input: ReorderFoldersInput) -> Result<(), String> {
    println!("[reorderFolders] Called with parentPath: {:?}", input.parentPath);
    println!("[reorderFolders] Folder paths to reorder: {:?}", input.folderPaths);

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Update rank in .folder.md
    for (index, folderPath) in input.folderPaths.iter().enumerate() {
        let pathBuf = PathBuf::from(folderPath);
        let folderMdPath = pathBuf.join(".folder.md");

        if !folderMdPath.exists() {
            println!("[reorderFolders] WARNING: .folder.md not found for {}", folderPath);
            continue;
        }

        // Load and decrypt frontmatter
        let content = fs::read_to_string(&folderMdPath).map_err(|e| e.to_string())?;

        let mut fm = if encrypted_storage::isEncryptedFormat(&content) {
            let encrypted = encrypted_storage::parseEncryptedFile(&content)?;
            let yamlContent = encrypted_storage::decryptMetadata(&encrypted.metadata, &masterPassword)?;
            serde_yaml::from_str::<FolderFrontmatter>(&yamlContent)
                .map_err(|e| format!("Failed to parse folder metadata: {}", e))?
        } else {
            continue; // Skip unencrypted files
        };

        let newRank = (index + 1) as u32;

        // Only update if rank changed
        if fm.rank != newRank {
            println!("[reorderFolders] Updating rank for {} from {} to {}", folderPath, fm.rank, newRank);
            fm.rank = newRank;

            let fileContent = encrypted_storage::createEncryptedFile(
                &serde_yaml::to_string(&fm).map_err(|e| e.to_string())?,
                "",
                &masterPassword,
            )?;

            fs::write(&folderMdPath, fileContent).map_err(|e| {
                println!("[reorderFolders] ERROR: {}", e);
                e.to_string()
            })?;
        }
    }

    storage.updateActivity();
    println!("[reorderFolders] SUCCESS");
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct MoveFolderInput {
    pub folderPath: String,
    pub newParentPath: Option<String>, // None means move to root
}

#[tauri::command]
pub fn moveFolder(storage: State<'_, StorageState>, input: MoveFolderInput) -> Result<FolderInfo, String> {
    println!("[moveFolder] Called with folderPath: {}, newParentPath: {:?}",
             input.folderPath, input.newParentPath);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    let baseDir = foldersDir(&wsPath);

    let oldPath = PathBuf::from(&input.folderPath);
    if !oldPath.exists() {
        return Err("Folder does not exist".to_string());
    }

    // Determine new parent directory
    let newParentDir = input.newParentPath
        .as_ref()
        .map(|p| PathBuf::from(p))
        .unwrap_or(baseDir.clone());

    // Prevent moving folder into itself or its children
    if newParentDir.starts_with(&oldPath) {
        return Err("Cannot move folder into itself".to_string());
    }

    // Get folder UUID (directory name)
    let dirname = oldPath.file_name().and_then(|n| n.to_str()).ok_or("No directory name")?;
    if !isValidUuidDir(dirname) {
        return Err("Invalid folder: directory name is not a valid UUID".to_string());
    }

    // Check if already in the target parent (same parent, no move needed)
    let currentParent = oldPath.parent().ok_or("No parent")?;
    let isSameParent = currentParent == newParentDir;

    if isSameParent {
        // Same parent - just return current folder info without moving
        println!("[moveFolder] Folder already in target location, returning current state");
        let folderMdPath = oldPath.join(".folder.md");

        let content = fs::read_to_string(&folderMdPath).map_err(|e| e.to_string())?;
        let fm = if encrypted_storage::isEncryptedFormat(&content) {
            let encrypted = encrypted_storage::parseEncryptedFile(&content)?;
            let yamlContent = encrypted_storage::decryptMetadata(&encrypted.metadata, &masterPassword)?;
            serde_yaml::from_str::<FolderFrontmatter>(&yamlContent)
                .map_err(|e| format!("Failed to parse folder metadata: {}", e))?
        } else {
            return Err("Folder metadata is not encrypted".to_string());
        };

        let children = scanFolders(&oldPath, Some(oldPath.clone()), Some(&masterPassword));
        let folder = Folder {
            path: oldPath,
            parentPath: Some(newParentDir),
            frontmatter: fm,
            children,
        };
        return Ok(FolderInfo::from(&folder));
    }

    // Find next rank in new parent
    let existingFolders = scanFolders(&newParentDir, None, Some(&masterPassword));
    let nextRank = existingFolders.iter().map(|f| f.frontmatter.rank).max().unwrap_or(0) + 1;

    // Same UUID directory name, new parent location
    let newPath = newParentDir.join(dirname);

    println!("[moveFolder] Moving from {:?} to {:?}", oldPath, newPath);

    // Move the folder
    fs::rename(&oldPath, &newPath).map_err(|e| {
        println!("[moveFolder] ERROR: {}", e);
        e.to_string()
    })?;

    // Update rank in .folder.md
    let folderMdPath = newPath.join(".folder.md");
    let content = fs::read_to_string(&folderMdPath).map_err(|e| e.to_string())?;

    let mut fm = if encrypted_storage::isEncryptedFormat(&content) {
        let encrypted = encrypted_storage::parseEncryptedFile(&content)?;
        let yamlContent = encrypted_storage::decryptMetadata(&encrypted.metadata, &masterPassword)?;
        serde_yaml::from_str::<FolderFrontmatter>(&yamlContent)
            .map_err(|e| format!("Failed to parse folder metadata: {}", e))?
    } else {
        return Err("Folder metadata is not encrypted".to_string());
    };

    fm.rank = nextRank;

    let fileContent = encrypted_storage::createEncryptedFile(
        &serde_yaml::to_string(&fm).map_err(|e| e.to_string())?,
        "",
        &masterPassword,
    )?;

    fs::write(&folderMdPath, fileContent).map_err(|e| e.to_string())?;

    let children = scanFolders(&newPath, Some(newPath.clone()), Some(&masterPassword));

    let folder = Folder {
        path: newPath,
        parentPath: Some(newParentDir),
        frontmatter: fm,
        children,
    };

    storage.updateActivity();
    println!("[moveFolder] SUCCESS");
    Ok(FolderInfo::from(&folder))
}
