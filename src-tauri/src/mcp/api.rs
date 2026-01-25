use std::fs;
use std::path::PathBuf;

use crate::storage::{StorageState, foldersDir, notesDir, tasksDir, uuidFilename, validateFolderPath};
use crate::encrypted_storage;
// Note: notesDir and tasksDir are used for root-level paths
use crate::models::{Note, NoteFrontmatter, Task, TaskFrontmatter, TaskStatus, Folder, FolderFrontmatter, FloatWindow};
use crate::commands::common::newId;
use crate::commands::note::{NoteInfo, scanNotesInFolder, scanAllNotes};
use crate::commands::task::{TaskInfo, scanTasksInFolder, scanAllTasks, scanTasksInStatus};
use crate::commands::folder::{FolderInfo, scanFolders};

// ============================================
// Notes API
// ============================================

pub fn get_notes(storage: &StorageState, folder_path: Option<&str>) -> Result<Vec<NoteInfo>, String> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let notes = match folder_path {
        Some(fp) if !fp.is_empty() => {
            // Validate and scan the notes subdirectory within the specified folder
            match validateFolderPath(&wsPath, fp) {
                Ok(validatedPath) => {
                    let notesSubdir = validatedPath.join("notes");
                    scanNotesInFolder(&notesSubdir, passwordRef)
                }
                Err(_) => return Ok(Vec::new()), // Invalid path, return empty
            }
        }
        _ => {
            // Scan all notes across all folders
            scanAllNotes(&foldersDir(&wsPath), passwordRef)
        }
    };

    storage.updateActivity();
    Ok(notes.iter().map(NoteInfo::from).collect())
}

pub fn get_note_by_id(storage: &StorageState, id: &str) -> Result<Option<NoteInfo>, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let notes = scanAllNotes(&foldersDir(&wsPath), passwordRef);
    storage.updateActivity();
    Ok(notes.iter().find(|n| n.frontmatter.id == id).map(NoteInfo::from))
}

pub fn get_note_content(storage: &StorageState, id: &str) -> Result<Option<String>, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;
    let notes = scanAllNotes(&foldersDir(&wsPath), Some(&masterPassword));

    let note = match notes.iter().find(|n| n.frontmatter.id == id) {
        Some(n) => n,
        None => return Ok(None),
    };

    // Read and decrypt content from file
    let fileContent = fs::read_to_string(&note.path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let content = if encrypted_storage::isEncryptedFormat(&fileContent) {
        let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
        encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?
    } else {
        note.content.clone()
    };

    storage.updateActivity();
    Ok(Some(content))
}

pub fn create_note(
    storage: &StorageState,
    title: &str,
    content: Option<&str>,
    folder_path: Option<&str>,
    color: Option<&str>,
    tags: Option<&[String]>,
) -> Result<NoteInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace selected")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // If folder_path is provided, create notes in folder_path/notes/
    // Otherwise use the root workspace/folders/notes/
    // Validate path to prevent directory traversal attacks
    let notesSubdir = match folder_path {
        Some(p) if !p.is_empty() && p != "null" => {
            // Validate the folder path is within workspace
            let validatedPath = validateFolderPath(&wsPath, p)?;
            validatedPath.join("notes")
        }
        _ => notesDir(&wsPath, ""),
    };

    fs::create_dir_all(&notesSubdir).map_err(|e| e.to_string())?;

    // Find next rank from existing notes
    let existingNotes = scanNotesInFolder(&notesSubdir, Some(&masterPassword));
    let nextRank = existingNotes.iter().map(|n| n.frontmatter.rank).max().unwrap_or(0) + 1;

    // UUID is the filename
    let id = newId();
    let filename = uuidFilename(&id);
    let notePath = notesSubdir.join(&filename);

    let mut fm = NoteFrontmatter::new(id, title.to_string(), nextRank);
    if let Some(c) = color {
        fm.color = c.to_string();
    }
    if let Some(t) = tags {
        fm.tags = t.to_vec();
    }

    let body = content.unwrap_or_default().to_string();
    let file_content = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;
    fs::write(&notePath, file_content).map_err(|e| e.to_string())?;

    let note = Note {
        path: notePath,
        folderPath: notesSubdir,
        frontmatter: fm,
        content: body,
    };

    storage.updateActivity();
    Ok(NoteInfo::from(&note))
}

pub fn update_note(
    storage: &StorageState,
    id: &str,
    title: Option<&str>,
    content: Option<&str>,
    color: Option<&str>,
    pinned: Option<bool>,
    tags: Option<&[String]>,
    float: Option<FloatWindow>,
) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;
    let notes = scanAllNotes(&foldersDir(&wsPath), Some(&masterPassword));

    let note = notes.iter()
        .find(|n| n.frontmatter.id == id)
        .ok_or("Note not found")?;

    let mut fm = note.frontmatter.clone();

    // Get existing content from file
    let fileContent = fs::read_to_string(&note.path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut body = if encrypted_storage::isEncryptedFormat(&fileContent) {
        let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
        encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?
    } else {
        note.content.clone()
    };

    if let Some(t) = title {
        fm.title = t.to_string();
    }
    if let Some(c) = content {
        body = c.to_string();
    }
    if let Some(c) = color {
        fm.color = c.to_string();
    }
    if let Some(p) = pinned {
        fm.pinned = p;
    }
    if let Some(t) = tags {
        fm.tags = t.to_vec();
    }
    if let Some(f) = float {
        fm.float = f;
    }

    fm.updated = chrono::Utc::now().timestamp_millis();

    let file_content = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;
    fs::write(&note.path, file_content).map_err(|e| e.to_string())?;

    storage.updateActivity();
    Ok(())
}

pub fn delete_note(storage: &StorageState, id: &str) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let notes = scanAllNotes(&foldersDir(&wsPath), passwordRef);

    let note = notes.iter()
        .find(|n| n.frontmatter.id == id)
        .ok_or("Note not found")?;

    fs::remove_file(&note.path).map_err(|e| e.to_string())
}

pub fn search_notes(storage: &StorageState, query: &str) -> Result<Vec<NoteInfo>, String> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let notes = scanAllNotes(&foldersDir(&wsPath), passwordRef);
    let query_lower = query.to_lowercase();

    // Note: This only searches metadata (title) since content is not decrypted during scan
    // For full-text search, would need to decrypt each file's content
    let result = notes.iter()
        .filter(|n| {
            n.frontmatter.title.to_lowercase().contains(&query_lower)
        })
        .map(NoteInfo::from)
        .collect();

    storage.updateActivity();
    Ok(result)
}

// ============================================
// Tasks API
// ============================================

pub fn get_tasks(storage: &StorageState, folder_path: Option<&str>, status_filter: Option<&str>) -> Result<Vec<TaskInfo>, String> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let tasks = match folder_path {
        Some(fp) if !fp.is_empty() => {
            // Validate and scan the tasks subdirectory within the specified folder
            match validateFolderPath(&wsPath, fp) {
                Ok(validatedPath) => {
                    let tasksSubdir = validatedPath.join("tasks");
                    scanTasksInFolder(&tasksSubdir, passwordRef)
                }
                Err(_) => return Ok(Vec::new()), // Invalid path, return empty
            }
        }
        _ => {
            // Scan all tasks across all folders
            scanAllTasks(&foldersDir(&wsPath), passwordRef)
        }
    };

    let filtered: Vec<_> = if let Some(status_str) = status_filter {
        let target_status = TaskStatus::fromFolder(status_str);
        tasks.into_iter().filter(|t| target_status.map(|s| t.status == s).unwrap_or(true)).collect()
    } else {
        tasks
    };

    storage.updateActivity();
    Ok(filtered.iter().map(TaskInfo::from).collect())
}

pub fn get_task_by_id(storage: &StorageState, id: &str) -> Result<Option<TaskInfo>, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let tasks = scanAllTasks(&foldersDir(&wsPath), passwordRef);
    storage.updateActivity();
    Ok(tasks.iter().find(|t| t.frontmatter.id == id).map(TaskInfo::from))
}

pub fn get_task_content(storage: &StorageState, id: &str) -> Result<Option<String>, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;
    let tasks = scanAllTasks(&foldersDir(&wsPath), Some(&masterPassword));

    let task = match tasks.iter().find(|t| t.frontmatter.id == id) {
        Some(t) => t,
        None => return Ok(None),
    };

    // Read and decrypt content from file
    let fileContent = fs::read_to_string(&task.path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let content = if encrypted_storage::isEncryptedFormat(&fileContent) {
        let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
        encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?
    } else {
        task.content.clone()
    };

    storage.updateActivity();
    Ok(Some(content))
}

pub fn create_task(
    storage: &StorageState,
    title: &str,
    content: Option<&str>,
    status: Option<&str>,
    folder_path: Option<&str>,
    color: Option<&str>,
    due: Option<i64>,
) -> Result<TaskInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace selected")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // If folder_path is provided, create tasks in folder_path/tasks/
    // Otherwise use the root workspace/folders/tasks/
    // Validate path to prevent directory traversal attacks
    let tasksSubdir = match folder_path {
        Some(p) if !p.is_empty() && p != "null" => {
            // Validate the folder path is within workspace
            let validatedPath = validateFolderPath(&wsPath, p)?;
            validatedPath.join("tasks")
        }
        _ => tasksDir(&wsPath, ""),
    };

    let task_status = status
        .and_then(|s| TaskStatus::fromFolder(s))
        .unwrap_or(TaskStatus::Todo);

    let statusPath = tasksSubdir.join(task_status.folderName());
    fs::create_dir_all(&statusPath).map_err(|e| e.to_string())?;

    // Find next rank from existing tasks
    let existingTasks = scanTasksInStatus(&statusPath, &tasksSubdir, task_status, Some(&masterPassword));
    let nextRank = existingTasks.iter().map(|t| t.frontmatter.rank).max().unwrap_or(0) + 1;

    // UUID is the filename
    let id = newId();
    let filename = uuidFilename(&id);
    let taskPath = statusPath.join(&filename);

    let mut fm = TaskFrontmatter::new(id, title.to_string(), nextRank);
    if let Some(c) = color {
        fm.color = c.to_string();
    }
    if let Some(d) = due {
        fm.due = Some(d);
    }

    let body = content.unwrap_or_default().to_string();
    let file_content = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;
    fs::write(&taskPath, file_content).map_err(|e| e.to_string())?;

    let task = Task {
        path: taskPath,
        folderPath: tasksSubdir,
        status: task_status,
        frontmatter: fm,
        content: body,
    };

    storage.updateActivity();
    Ok(TaskInfo::from(&task))
}

#[allow(clippy::too_many_arguments)]
pub fn update_task(
    storage: &StorageState,
    id: &str,
    title: Option<&str>,
    content: Option<&str>,
    status: Option<&str>,
    color: Option<&str>,
    pinned: Option<bool>,
    tags: Option<&[String]>,
    due: Option<i64>,
    float: Option<FloatWindow>,
) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;
    let tasks = scanAllTasks(&foldersDir(&wsPath), Some(&masterPassword));

    let task = tasks.iter()
        .find(|t| t.frontmatter.id == id)
        .ok_or("Task not found")?;

    let mut fm = task.frontmatter.clone();
    let mut newPath = task.path.clone();

    // Get existing content from file
    let fileContent = fs::read_to_string(&task.path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut body = if encrypted_storage::isEncryptedFormat(&fileContent) {
        let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
        encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?
    } else {
        task.content.clone()
    };

    if let Some(t) = title {
        fm.title = t.to_string();
    }
    if let Some(c) = content {
        body = c.to_string();
    }
    if let Some(c) = color {
        fm.color = c.to_string();
    }
    if let Some(p) = pinned {
        fm.pinned = p;
    }
    if let Some(t) = tags {
        fm.tags = t.to_vec();
    }
    if let Some(d) = due {
        fm.due = Some(d);
    }
    if let Some(f) = float {
        fm.float = f;
    }

    if let Some(new_status_str) = status {
        if let Some(new_status) = TaskStatus::fromFolder(new_status_str) {
            if new_status != task.status {
                let newStatusPath = task.folderPath.join(new_status.folderName());
                fs::create_dir_all(&newStatusPath).map_err(|e| e.to_string())?;

                let filename = task.path.file_name().ok_or("No filename")?;
                newPath = newStatusPath.join(filename);
            }
        }
    }

    fm.updated = chrono::Utc::now().timestamp_millis();

    let file_content = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;

    if newPath != task.path {
        fs::remove_file(&task.path).map_err(|e| e.to_string())?;
    }
    fs::write(&newPath, file_content).map_err(|e| e.to_string())?;

    storage.updateActivity();
    Ok(())
}

pub fn delete_task(storage: &StorageState, id: &str) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let tasks = scanAllTasks(&foldersDir(&wsPath), passwordRef);

    let task = tasks.iter()
        .find(|t| t.frontmatter.id == id)
        .ok_or("Task not found")?;

    fs::remove_file(&task.path).map_err(|e| e.to_string())
}

// ============================================
// Folders API
// ============================================

pub fn get_folders(storage: &StorageState) -> Result<Vec<FolderInfo>, String> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let baseDir = foldersDir(&wsPath);
    let folders = scanFolders(&baseDir, None, passwordRef);

    storage.updateActivity();
    Ok(folders.iter().map(FolderInfo::from).collect())
}

pub fn create_folder(
    storage: &StorageState,
    name: &str,
    parent_path: Option<&str>,
) -> Result<FolderInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    let baseDir = foldersDir(&wsPath);

    let parentDir = parent_path
        .map(PathBuf::from)
        .unwrap_or(baseDir.clone());

    // Find next rank from existing folders
    let existingFolders = scanFolders(&parentDir, None, Some(&masterPassword));
    let nextRank = existingFolders.iter().map(|f| f.frontmatter.rank).max().unwrap_or(0) + 1;

    // UUID is the directory name (no extension for directories)
    let id = newId();
    let folderPath = parentDir.join(&id);

    fs::create_dir_all(&folderPath).map_err(|e| e.to_string())?;

    // Create .folder.md with encrypted metadata (folders have no body content)
    let fm = FolderFrontmatter::new(id.clone(), name.to_string(), nextRank);
    let fileContent = encrypted_storage::createEncryptedFile(
        &serde_yaml::to_string(&fm).map_err(|e| e.to_string())?,
        "", // Folders have no body content
        &masterPassword,
    )?;
    fs::write(folderPath.join(".folder.md"), fileContent).map_err(|e| e.to_string())?;

    // Create notes/, tasks/, and passwords/ subdirectories
    fs::create_dir_all(folderPath.join("notes")).map_err(|e| e.to_string())?;
    fs::create_dir_all(folderPath.join("tasks")).map_err(|e| e.to_string())?;
    fs::create_dir_all(folderPath.join("passwords")).map_err(|e| e.to_string())?;
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
    Ok(FolderInfo::from(&folder))
}

pub fn delete_folder(_storage: &StorageState, path: &str) -> Result<(), String> {
    let folderPath = PathBuf::from(path);
    if folderPath.exists() {
        fs::remove_dir_all(&folderPath).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn move_note_to_folder(storage: &StorageState, id: &str, target_folder_path: &str) -> Result<NoteInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;
    let notes = scanAllNotes(&foldersDir(&wsPath), Some(&masterPassword));

    let note = notes.iter()
        .find(|n| n.frontmatter.id == id)
        .ok_or("Note not found")?;

    // Target is the notes subdirectory within the folder
    let targetNotesDir = PathBuf::from(target_folder_path).join("notes");
    fs::create_dir_all(&targetNotesDir).map_err(|e| e.to_string())?;

    // Find next rank in target folder
    let existingNotes = scanNotesInFolder(&targetNotesDir, Some(&masterPassword));
    let nextRank = existingNotes.iter().map(|n| n.frontmatter.rank).max().unwrap_or(0) + 1;

    // Same UUID filename, new location
    let newPath = targetNotesDir.join(uuidFilename(&note.frontmatter.id));

    // Update frontmatter with new rank
    let mut fm = note.frontmatter.clone();
    fm.rank = nextRank;

    // Get content from file
    let fileContent = fs::read_to_string(&note.path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let body = if encrypted_storage::isEncryptedFormat(&fileContent) {
        let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
        encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?
    } else {
        note.content.clone()
    };

    // Encrypt and write to new location
    let content = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;
    fs::write(&newPath, &content).map_err(|e| e.to_string())?;

    // Remove old file
    fs::remove_file(&note.path).map_err(|e| e.to_string())?;

    let movedNote = Note {
        path: newPath,
        folderPath: targetNotesDir,
        frontmatter: fm,
        content: body,
    };

    storage.updateActivity();
    Ok(NoteInfo::from(&movedNote))
}

pub fn move_task_to_folder(storage: &StorageState, id: &str, target_folder_path: &str) -> Result<TaskInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;
    let tasks = scanAllTasks(&foldersDir(&wsPath), Some(&masterPassword));

    let task = tasks.iter()
        .find(|t| t.frontmatter.id == id)
        .ok_or("Task not found")?;

    // Target is the tasks subdirectory within the folder
    let targetTasksDir = PathBuf::from(target_folder_path).join("tasks");
    let statusPath = targetTasksDir.join(task.status.folderName());
    fs::create_dir_all(&statusPath).map_err(|e| e.to_string())?;

    // Find next rank in target folder
    let existingTasks = scanTasksInStatus(&statusPath, &targetTasksDir, task.status, Some(&masterPassword));
    let nextRank = existingTasks.iter().map(|t| t.frontmatter.rank).max().unwrap_or(0) + 1;

    // Same UUID filename, new location
    let newPath = statusPath.join(uuidFilename(&task.frontmatter.id));

    // Update frontmatter with new rank
    let mut fm = task.frontmatter.clone();
    fm.rank = nextRank;

    // Get content from file
    let fileContent = fs::read_to_string(&task.path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let body = if encrypted_storage::isEncryptedFormat(&fileContent) {
        let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
        encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?
    } else {
        task.content.clone()
    };

    // Encrypt and write to new location
    let content = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;
    fs::write(&newPath, &content).map_err(|e| e.to_string())?;

    // Remove old file
    fs::remove_file(&task.path).map_err(|e| e.to_string())?;

    let movedTask = Task {
        path: newPath,
        folderPath: targetTasksDir,
        status: task.status,
        frontmatter: fm,
        content: body,
    };

    storage.updateActivity();
    Ok(TaskInfo::from(&movedTask))
}
