// Trash commands - list and manage trashed items

use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::storage::{
    StorageState, trashNotesDir, trashTasksDir, trashPasswordsDir,
    trashDir, parseUuidFilename,
};
use crate::encrypted_storage;
use crate::models::{NoteFrontmatter, TaskFrontmatter, PasswordFrontmatter, TaskStatus};

// ============================================
// TRASH NOTE INFO
// ============================================

#[derive(serde::Serialize)]
pub struct TrashNoteInfo {
    pub id: String,
    pub title: String,
    pub color: String,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub created: i64,
    pub updated: i64,
    pub path: String,
}

fn scanTrashNotes(trashNotesPath: &PathBuf, masterPassword: Option<&str>) -> Vec<TrashNoteInfo> {
    let mut notes = Vec::new();

    if !trashNotesPath.exists() {
        return notes;
    }

    let entries = match fs::read_dir(trashNotesPath) {
        Ok(e) => e,
        Err(_) => return notes,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || path.extension().map_or(true, |e| e != "md") {
            continue;
        }

        // Must be UUID filename
        if parseUuidFilename(path.file_name().unwrap().to_str().unwrap()).is_none() {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Parse encrypted frontmatter
        if encrypted_storage::isEncryptedFormat(&content) {
            if let Some(password) = masterPassword {
                if let Ok(encrypted) = encrypted_storage::parseEncryptedFile(&content) {
                    if let Ok(yamlContent) = encrypted_storage::decryptMetadata(&encrypted.metadata, password) {
                        if let Ok(fm) = serde_yaml::from_str::<NoteFrontmatter>(&yamlContent) {
                            notes.push(TrashNoteInfo {
                                id: fm.id,
                                title: fm.title,
                                color: fm.color,
                                pinned: fm.pinned,
                                tags: fm.tags,
                                created: fm.created,
                                updated: fm.updated,
                                path: path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    notes
}

// ============================================
// TRASH TASK INFO
// ============================================

#[derive(serde::Serialize)]
pub struct TrashTaskInfo {
    pub id: String,
    pub title: String,
    pub status: TaskStatus,
    pub color: String,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub due: Option<i64>,
    pub created: i64,
    pub updated: i64,
    pub path: String,
}

fn scanTrashTasks(trashTasksPath: &PathBuf, masterPassword: Option<&str>) -> Vec<TrashTaskInfo> {
    let mut tasks = Vec::new();

    if !trashTasksPath.exists() {
        return tasks;
    }

    // Scan each status folder
    for status in [TaskStatus::Todo, TaskStatus::Doing, TaskStatus::Done] {
        let statusPath = trashTasksPath.join(status.folderName());
        if !statusPath.exists() {
            continue;
        }

        let entries = match fs::read_dir(&statusPath) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() || path.extension().map_or(true, |e| e != "md") {
                continue;
            }

            if parseUuidFilename(path.file_name().unwrap().to_str().unwrap()).is_none() {
                continue;
            }

            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            if encrypted_storage::isEncryptedFormat(&content) {
                if let Some(password) = masterPassword {
                    if let Ok(encrypted) = encrypted_storage::parseEncryptedFile(&content) {
                        if let Ok(yamlContent) = encrypted_storage::decryptMetadata(&encrypted.metadata, password) {
                            if let Ok(fm) = serde_yaml::from_str::<TaskFrontmatter>(&yamlContent) {
                                tasks.push(TrashTaskInfo {
                                    id: fm.id,
                                    title: fm.title,
                                    status,
                                    color: fm.color,
                                    pinned: fm.pinned,
                                    tags: fm.tags,
                                    due: fm.due,
                                    created: fm.created,
                                    updated: fm.updated,
                                    path: path.to_string_lossy().to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    tasks
}

// ============================================
// TRASH PASSWORD INFO
// ============================================

#[derive(serde::Serialize)]
pub struct TrashPasswordInfo {
    pub id: String,
    pub title: String,
    pub color: String,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub created: i64,
    pub updated: i64,
    pub path: String,
}

fn scanTrashPasswords(trashPasswordsPath: &PathBuf, masterPassword: Option<&str>) -> Vec<TrashPasswordInfo> {
    let mut passwords = Vec::new();

    if !trashPasswordsPath.exists() {
        return passwords;
    }

    let entries = match fs::read_dir(trashPasswordsPath) {
        Ok(e) => e,
        Err(_) => return passwords,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || path.extension().map_or(true, |e| e != "md") {
            continue;
        }

        if parseUuidFilename(path.file_name().unwrap().to_str().unwrap()).is_none() {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if encrypted_storage::isEncryptedFormat(&content) {
            if let Some(password) = masterPassword {
                if let Ok(encrypted) = encrypted_storage::parseEncryptedFile(&content) {
                    if let Ok(yamlContent) = encrypted_storage::decryptMetadata(&encrypted.metadata, password) {
                        if let Ok(fm) = serde_yaml::from_str::<PasswordFrontmatter>(&yamlContent) {
                            passwords.push(TrashPasswordInfo {
                                id: fm.id,
                                title: fm.title,
                                color: fm.color,
                                pinned: fm.pinned,
                                tags: fm.tags,
                                created: fm.created,
                                updated: fm.updated,
                                path: path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    passwords
}

// ============================================
// TAURI COMMANDS
// ============================================

#[tauri::command]
pub fn listTrashNotes(storage: State<'_, StorageState>) -> Result<Vec<TrashNoteInfo>, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let trashPath = trashNotesDir(&wsPath);

    Ok(scanTrashNotes(&trashPath, masterPassword.as_deref()))
}

#[tauri::command]
pub fn listTrashTasks(storage: State<'_, StorageState>) -> Result<Vec<TrashTaskInfo>, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let trashPath = trashTasksDir(&wsPath);

    Ok(scanTrashTasks(&trashPath, masterPassword.as_deref()))
}

#[tauri::command]
pub fn listTrashPasswords(storage: State<'_, StorageState>) -> Result<Vec<TrashPasswordInfo>, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let trashPath = trashPasswordsDir(&wsPath);

    Ok(scanTrashPasswords(&trashPath, masterPassword.as_deref()))
}

#[derive(serde::Serialize)]
pub struct TrashCounts {
    pub notes: usize,
    pub tasks: usize,
    pub passwords: usize,
    pub total: usize,
}

#[tauri::command]
pub fn getTrashCounts(storage: State<'_, StorageState>) -> Result<TrashCounts, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let notes = scanTrashNotes(&trashNotesDir(&wsPath), passwordRef).len();
    let tasks = scanTrashTasks(&trashTasksDir(&wsPath), passwordRef).len();
    let passwords = scanTrashPasswords(&trashPasswordsDir(&wsPath), passwordRef).len();

    Ok(TrashCounts {
        notes,
        tasks,
        passwords,
        total: notes + tasks + passwords,
    })
}

#[tauri::command]
pub fn emptyTrash(storage: State<'_, StorageState>) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    let trash = trashDir(&wsPath);
    if trash.exists() {
        fs::remove_dir_all(&trash).map_err(|e| e.to_string())?;
    }

    storage.updateActivity();
    Ok(())
}

#[tauri::command]
pub fn restoreAllFromTrash(storage: State<'_, StorageState>) -> Result<(), String> {
    use crate::storage::{notesDir, tasksDir, passwordsDir};

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    // Restore notes
    let trashNotesPath = trashNotesDir(&wsPath);
    if trashNotesPath.exists() {
        let targetDir = notesDir(&wsPath, "");
        fs::create_dir_all(&targetDir).map_err(|e| e.to_string())?;

        if let Ok(entries) = fs::read_dir(&trashNotesPath) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |e| e == "md") {
                    let filename = path.file_name().ok_or("Invalid filename")?;
                    let targetPath = targetDir.join(filename);
                    fs::rename(&path, &targetPath).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // Restore tasks (preserve status folders)
    let trashTasksPath = trashTasksDir(&wsPath);
    if trashTasksPath.exists() {
        for status in [TaskStatus::Todo, TaskStatus::Doing, TaskStatus::Done] {
            let statusPath = trashTasksPath.join(status.folderName());
            if statusPath.exists() {
                let targetDir = tasksDir(&wsPath, "").join(status.folderName());
                fs::create_dir_all(&targetDir).map_err(|e| e.to_string())?;

                if let Ok(entries) = fs::read_dir(&statusPath) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() && path.extension().map_or(false, |e| e == "md") {
                            let filename = path.file_name().ok_or("Invalid filename")?;
                            let targetPath = targetDir.join(filename);
                            fs::rename(&path, &targetPath).map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
        }
    }

    // Restore passwords
    let trashPasswordsPath = trashPasswordsDir(&wsPath);
    if trashPasswordsPath.exists() {
        let targetDir = passwordsDir(&wsPath, "");
        fs::create_dir_all(&targetDir).map_err(|e| e.to_string())?;

        if let Ok(entries) = fs::read_dir(&trashPasswordsPath) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |e| e == "md") {
                    let filename = path.file_name().ok_or("Invalid filename")?;
                    let targetPath = targetDir.join(filename);
                    fs::rename(&path, &targetPath).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // Clean up empty trash directories
    let trash = trashDir(&wsPath);
    if trash.exists() {
        let _ = fs::remove_dir_all(&trash);
    }

    storage.updateActivity();
    Ok(())
}
