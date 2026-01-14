// Folder commands - unified folder tree implementation

use std::fs;
use std::path::PathBuf;
use tauri::State;


use crate::storage::{StorageState, foldersDir, parseFilename, toFilename, slugify, parseFrontmatter, toMarkdown};
use crate::models::{Folder, FolderFrontmatter};
use super::common::newId;

#[derive(serde::Serialize)]
pub struct FolderInfo {
    pub id: String,
    pub name: String,
    pub rank: u32,
    pub slug: String,
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
            id: f.id(),
            name: f.name(),
            rank: f.rank,
            slug: f.slug.clone(),
            pinned: f.frontmatter.as_ref().map(|fm| fm.pinned).unwrap_or(false),
            favorite: f.frontmatter.as_ref().map(|fm| fm.favorite).unwrap_or(false),
            color: f.frontmatter.as_ref().map(|fm| fm.color.clone()).unwrap_or_else(|| "#6B7280".to_string()),
            icon: f.frontmatter.as_ref().map(|fm| fm.icon.clone()).unwrap_or_default(),
            path: f.path.to_string_lossy().to_string(),
            parentPath: f.parentPath.as_ref().map(|p| p.to_string_lossy().to_string()),
            children: f.children.iter().map(FolderInfo::from).collect(),
        }
    }
}

/// Scan folders recursively from a directory
pub(crate) fn scanFolders(baseDir: &PathBuf, parentPath: Option<PathBuf>) -> Vec<Folder> {
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
        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        
        // Skip hidden folders, status folders, and notes/tasks subdirs
        if filename.starts_with('.') || 
           ["todo", "doing", "done", "archived", "notes", "tasks"].contains(&filename.to_lowercase().as_str()) {
            continue;
        }

        if let Some((rank, slug)) = parseFilename(filename) {
            // Try to load .folder.md for metadata
            let folderMdPath = path.join(".folder.md");
            let frontmatter = if folderMdPath.exists() {
                fs::read_to_string(&folderMdPath)
                    .ok()
                    .and_then(|content| parseFrontmatter::<FolderFrontmatter>(&content).map(|(fm, _)| fm))
            } else {
                None
            };

            let children = scanFolders(&path, Some(path.clone()));

            folders.push(Folder {
                rank,
                slug,
                path: path.clone(),
                parentPath: parentPath.clone(),
                frontmatter,
                children,
            });
        }
    }

    // Sort by rank
    folders.sort_by_key(|f| f.rank);
    folders
}

#[derive(serde::Deserialize)]
pub struct GetFoldersInput {
    // Deprecated: context is no longer used, folders are unified
}

#[tauri::command]
pub fn getFolders(storage: State<'_, StorageState>) -> Vec<FolderInfo> {
    println!("[getFolders] Called");

    let wsPath = match storage.getWorkspacePath() {
        Some(p) => {
            println!("[getFolders] Workspace path: {}", p);
            p
        },
        None => {
            println!("[getFolders] No workspace path, returning empty");
            return Vec::new();
        }
    };

    let baseDir = foldersDir(&wsPath);
    println!("[getFolders] Scanning directory: {:?}", baseDir);

    let folders = scanFolders(&baseDir, None);
    println!("[getFolders] Found {} folders", folders.len());

    let result: Vec<FolderInfo> = folders.iter().map(FolderInfo::from).collect();
    for f in &result {
        println!("[getFolders]   - {} (path: {})", f.name, f.path);
    }
    result
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
    println!("[createFolder] Workspace path: {}", wsPath);

    let baseDir = foldersDir(&wsPath);
    println!("[createFolder] Base directory: {:?}", baseDir);

    // Determine parent directory
    let parentDir = input.parentPath
        .map(PathBuf::from)
        .unwrap_or(baseDir.clone());
    println!("[createFolder] Parent directory: {:?}", parentDir);

    // Find next rank
    let existingFolders = scanFolders(&parentDir, None);
    let nextRank = existingFolders.iter().map(|f| f.rank).max().unwrap_or(0) + 1;
    println!("[createFolder] Next rank: {}", nextRank);

    let slug = slugify(&input.name);
    let folderName = toFilename(nextRank, &slug, true);
    let folderPath = parentDir.join(&folderName);
    println!("[createFolder] Creating folder at: {:?}", folderPath);

    // Create folder
    fs::create_dir_all(&folderPath).map_err(|e| {
        println!("[createFolder] ERROR creating directory: {}", e);
        e.to_string()
    })?;
    println!("[createFolder] Directory created successfully");

    // Create .folder.md with metadata
    let id = newId();
    let fm = FolderFrontmatter::new(id.clone(), input.name.clone());
    let content = toMarkdown(&fm, "")?;
    fs::write(folderPath.join(".folder.md"), content).map_err(|e| {
        println!("[createFolder] ERROR writing .folder.md: {}", e);
        e.to_string()
    })?;
    println!("[createFolder] .folder.md created with id: {}", id);

    // Create notes/ and tasks/ subdirectories inside the folder
    fs::create_dir_all(folderPath.join("notes")).map_err(|e| e.to_string())?;
    fs::create_dir_all(folderPath.join("tasks")).map_err(|e| e.to_string())?;
    // Create task status folders
    for status in ["todo", "doing", "done", "archived"] {
        fs::create_dir_all(folderPath.join("tasks").join(status)).map_err(|e| e.to_string())?;
    }

    let folder = Folder {
        rank: nextRank,
        slug,
        path: folderPath.clone(),
        parentPath: Some(parentDir),
        frontmatter: Some(fm),
        children: Vec::new(),
    };

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
pub fn updateFolder(_storage: State<'_, StorageState>, input: UpdateFolderInput) -> Result<(), String> {
    println!("[updateFolder] Called with path: {}", input.path);
    println!("[updateFolder] Updates - name: {:?}, pinned: {:?}, color: {:?}",
             input.name, input.pinned, input.color);

    let folderPath = PathBuf::from(&input.path);
    let folderMdPath = folderPath.join(".folder.md");
    println!("[updateFolder] Looking for .folder.md at: {:?}", folderMdPath);

    // Load existing frontmatter or create new
    let mut fm = if folderMdPath.exists() {
        println!("[updateFolder] Found existing .folder.md");
        fs::read_to_string(&folderMdPath)
            .ok()
            .and_then(|content| parseFrontmatter::<FolderFrontmatter>(&content).map(|(fm, _)| fm))
            .unwrap_or_else(|| {
                println!("[updateFolder] Failed to parse frontmatter, creating new");
                FolderFrontmatter::new(newId(), "".to_string())
            })
    } else {
        println!("[updateFolder] No .folder.md found, creating new");
        FolderFrontmatter::new(newId(), "".to_string())
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

    // Save
    let content = toMarkdown(&fm, "")?;
    fs::write(&folderMdPath, content).map_err(|e| {
        println!("[updateFolder] ERROR writing file: {}", e);
        e.to_string()
    })?;

    println!("[updateFolder] SUCCESS");
    Ok(())
}

#[tauri::command]
pub fn deleteFolder(_storage: State<'_, StorageState>, path: String) -> Result<(), String> {
    println!("[deleteFolder] Called with path: {}", path);

    let folderPath = PathBuf::from(&path);
    if folderPath.exists() {
        println!("[deleteFolder] Folder exists, deleting...");
        fs::remove_dir_all(&folderPath).map_err(|e| {
            println!("[deleteFolder] ERROR: {}", e);
            e.to_string()
        })?;
        println!("[deleteFolder] SUCCESS - folder deleted");
    } else {
        println!("[deleteFolder] Folder does not exist at path");
    }
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct ReorderFoldersInput {
    pub parentPath: Option<String>,
    pub folderPaths: Vec<String>,
}

#[tauri::command]
pub fn reorderFolders(_storage: State<'_, StorageState>, input: ReorderFoldersInput) -> Result<(), String> {
    println!("[reorderFolders] Called with parentPath: {:?}", input.parentPath);
    println!("[reorderFolders] Folder paths to reorder: {:?}", input.folderPaths);

    // Reorder by renaming with new rank prefixes
    for (index, oldPath) in input.folderPaths.iter().enumerate() {
        let oldPathBuf = PathBuf::from(oldPath);
        let parent = oldPathBuf.parent().ok_or("No parent")?;

        // Get current slug from filename
        let filename = oldPathBuf.file_name().and_then(|n| n.to_str()).ok_or("No filename")?;
        let (_, slug) = parseFilename(filename).ok_or("Invalid filename")?;

        let newRank = (index + 1) as u32;
        let newName = toFilename(newRank, &slug, true);
        let newPath = parent.join(&newName);

        if oldPathBuf != newPath {
            println!("[reorderFolders] Renaming {} -> {}", oldPath, newPath.display());
            fs::rename(&oldPathBuf, &newPath).map_err(|e| {
                println!("[reorderFolders] ERROR: {}", e);
                e.to_string()
            })?;
        }
    }
    println!("[reorderFolders] SUCCESS");
    Ok(())
}


