// Password commands - encrypted password management using unified encryption format
// Both metadata and content are encrypted using CLAUDIA-ENCRYPTED-v1 format

use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::storage::{StorageState, passwordsDir, foldersDir, parseUuidFilename, uuidFilename, trashPasswordsDir};
use crate::encrypted_storage;
use crate::models::{Password, PasswordFrontmatter, PasswordContent};
use super::common::newId;

#[derive(serde::Serialize)]
pub struct PasswordInfo {
    pub id: String,
    pub title: String,
    pub rank: u32,
    pub color: String,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub created: i64,
    pub updated: i64,
    pub folderPath: String,
    pub path: String,
}

impl From<&Password> for PasswordInfo {
    fn from(p: &Password) -> Self {
        let folderPath = p.folderPath.parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        Self {
            id: p.frontmatter.id.clone(),
            title: p.frontmatter.title.clone(),
            rank: p.frontmatter.rank,
            color: p.frontmatter.color.clone(),
            pinned: p.frontmatter.pinned,
            tags: p.frontmatter.tags.clone(),
            created: p.frontmatter.created,
            updated: p.frontmatter.updated,
            folderPath,
            path: p.path.to_string_lossy().to_string(),
        }
    }
}

/// Decrypted password content returned to frontend
#[derive(serde::Serialize)]
pub struct DecryptedPasswordContent {
    pub url: String,
    pub username: String,
    pub password: String,
    pub notes: String,
}

/// Process a single password file and return Password if valid
fn processPasswordFile(path: &PathBuf, folderPath: &PathBuf, masterPassword: Option<&str>) -> Option<Password> {
    let filename = path.file_name().and_then(|n| n.to_str())?;

    // Validate filename is a UUID (with .md extension)
    parseUuidFilename(filename)?;

    let content = fs::read_to_string(path).ok()?;

    // Check if file is encrypted (passwords are always encrypted)
    if encrypted_storage::isEncryptedFormat(&content) {
        let password = masterPassword?;
        let encrypted = encrypted_storage::parseEncryptedFile(&content).ok()?;
        let yamlContent = encrypted_storage::decryptMetadata(&encrypted.metadata, password).ok()?;
        let fm: PasswordFrontmatter = serde_yaml::from_str(&yamlContent).ok()?;

        Some(Password {
            path: path.clone(),
            folderPath: folderPath.clone(),
            frontmatter: fm,
            encryptedContent: encrypted.content,
        })
    } else {
        None // Passwords must be encrypted
    }
}

/// Scan passwords from a directory using encrypted format
fn scanPasswordsInFolder(folderPath: &PathBuf, masterPassword: Option<&str>) -> Vec<Password> {
    let mut passwords = Vec::new();

    if !folderPath.exists() {
        return passwords;
    }

    let entries = fs::read_dir(folderPath);
    for entry in entries.into_iter().flatten().filter_map(|e| e.ok()) {
        let path = entry.path();

        // Skip hidden files and non-markdown
        if !path.is_file() || path.extension().map(|ext| ext != "md").unwrap_or(true) {
            continue;
        }
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }

        if let Some(password) = processPasswordFile(&path, folderPath, masterPassword) {
            passwords.push(password);
        }
    }

    // Sort by rank stored in frontmatter
    passwords.sort_by_key(|p| p.frontmatter.rank);
    passwords
}

/// Scan all passwords recursively from the folders directory
fn scanAllPasswords(foldersBaseDir: &PathBuf, masterPassword: Option<&str>) -> Vec<Password> {
    let mut allPasswords = Vec::new();

    // Passwords in root /folders/passwords/
    let rootPasswordsDir = foldersBaseDir.join("passwords");
    if rootPasswordsDir.exists() {
        allPasswords.extend(scanPasswordsInFolder(&rootPasswordsDir, masterPassword));
    }

    // Scan all folders for their /passwords/ subdirectories
    scanPasswordsInFoldersRecursive(foldersBaseDir, &mut allPasswords, masterPassword);

    allPasswords
}

/// Helper to recursively scan folder tree for passwords subdirectories
fn scanPasswordsInFoldersRecursive(dir: &PathBuf, passwords: &mut Vec<Password>, masterPassword: Option<&str>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let filename = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

            // Skip hidden files and special directories
            if filename.starts_with('.') || filename == "notes" || filename == "tasks" || filename == "passwords" {
                continue;
            }

            if path.is_dir() {
                let passwordsSubdir = path.join("passwords");
                if passwordsSubdir.exists() && passwordsSubdir.is_dir() {
                    passwords.extend(scanPasswordsInFolder(&passwordsSubdir, masterPassword));
                }
                scanPasswordsInFoldersRecursive(&path, passwords, masterPassword);
            }
        }
    }
}

// ============================================
// READ COMMANDS
// ============================================

#[tauri::command]
pub fn getPasswords(storage: State<'_, StorageState>, folderPath: Option<String>) -> Result<Vec<PasswordInfo>, String> {
    println!("[getPasswords] Called with folderPath: {:?}", folderPath);

    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };

    // Check if vault is unlocked
    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    // Get master password for decryption
    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let passwords = match &folderPath {
        Some(fp) if !fp.is_empty() => {
            let passwordsSubdir = PathBuf::from(fp).join("passwords");
            scanPasswordsInFolder(&passwordsSubdir, passwordRef)
        },
        _ => {
            let foldersBase = foldersDir(&wsPath);
            scanAllPasswords(&foldersBase, passwordRef)
        }
    };

    println!("[getPasswords] Found {} passwords", passwords.len());

    storage.updateActivity();
    Ok(passwords.iter().map(PasswordInfo::from).collect())
}

#[tauri::command]
pub fn getPasswordById(storage: State<'_, StorageState>, id: String) -> Result<Option<PasswordInfo>, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let passwords = scanAllPasswords(&foldersDir(&wsPath), passwordRef);
    let result = passwords.iter().find(|p| p.frontmatter.id == id).map(PasswordInfo::from);

    storage.updateActivity();
    Ok(result)
}

#[tauri::command]
pub fn getPasswordContent(
    storage: State<'_, StorageState>,
    id: String,
) -> Result<DecryptedPasswordContent, String> {
    println!("[getPasswordContent] Called with id: {}", id);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Search in regular folders first
    let passwords = scanAllPasswords(&foldersDir(&wsPath), Some(&masterPassword));
    let passwordOpt = passwords.iter().find(|p| p.frontmatter.id == id);

    // If not found, check trash
    let trashPassword;
    let password = if let Some(p) = passwordOpt {
        p
    } else {
        let trashPasswordsPath = trashPasswordsDir(&wsPath);
        let trashPasswords = scanPasswordsInFolder(&trashPasswordsPath, Some(&masterPassword));
        trashPassword = trashPasswords.into_iter().find(|p| p.frontmatter.id == id)
            .ok_or("Password not found")?;
        &trashPassword
    };

    // Decrypt content section
    if password.encryptedContent.is_empty() {
        return Ok(DecryptedPasswordContent {
            url: String::new(),
            username: String::new(),
            password: String::new(),
            notes: String::new(),
        });
    }

    let decrypted = encrypted_storage::decryptContent(&password.encryptedContent, &masterPassword)?;
    let content: PasswordContent = serde_json::from_str(&decrypted)
        .map_err(|e| format!("Failed to parse password content: {}", e))?;

    println!("[getPasswordContent] Successfully decrypted content");
    storage.updateActivity();

    Ok(DecryptedPasswordContent {
        url: content.url,
        username: content.username,
        password: content.password,
        notes: content.notes,
    })
}

/// Batch decrypt multiple passwords at once - much more efficient
#[derive(serde::Serialize)]
pub struct BatchDecryptedContent {
    pub id: String,
    pub content: DecryptedPasswordContent,
}

#[tauri::command]
pub fn getPasswordContentsBatch(
    storage: State<'_, StorageState>,
    ids: Vec<String>,
) -> Result<Vec<BatchDecryptedContent>, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;
    let foldersBase = foldersDir(&wsPath);

    // Scan all passwords once
    let allPasswords = scanAllPasswords(&foldersBase, Some(&masterPassword));

    let mut results = Vec::with_capacity(ids.len());

    for id in ids {
        if let Some(password) = allPasswords.iter().find(|p| p.frontmatter.id == id) {
            let content = if password.encryptedContent.is_empty() {
                DecryptedPasswordContent {
                    url: String::new(),
                    username: String::new(),
                    password: String::new(),
                    notes: String::new(),
                }
            } else {
                let decrypted = encrypted_storage::decryptContent(&password.encryptedContent, &masterPassword)?;
                let parsed: PasswordContent = serde_json::from_str(&decrypted)
                    .map_err(|e| format!("Failed to parse password content: {}", e))?;
                DecryptedPasswordContent {
                    url: parsed.url,
                    username: parsed.username,
                    password: parsed.password,
                    notes: parsed.notes,
                }
            };

            results.push(BatchDecryptedContent { id, content });
        }
    }

    storage.updateActivity();
    Ok(results)
}

// ============================================
// CREATE COMMAND
// ============================================

#[derive(serde::Deserialize)]
pub struct CreatePasswordInput {
    pub title: String,
    pub folderPath: Option<String>,
    pub url: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub notes: Option<String>,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
pub fn createPassword(
    storage: State<'_, StorageState>,
    input: CreatePasswordInput,
) -> Result<PasswordInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace selected")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    let folderPath = match &input.folderPath {
        Some(p) if !p.is_empty() && p != "null" && p.starts_with('/') => {
            PathBuf::from(p).join("passwords")
        }
        _ => passwordsDir(&wsPath, ""),
    };

    fs::create_dir_all(&folderPath).map_err(|e| e.to_string())?;

    // Find next rank from existing passwords
    let existingPasswords = scanPasswordsInFolder(&folderPath, Some(&masterPassword));
    let nextRank = existingPasswords.iter().map(|p| p.frontmatter.rank).max().unwrap_or(0) + 1;

    // UUID is the filename
    let id = newId();
    let filename = uuidFilename(&id);
    let passwordPath = folderPath.join(&filename);

    let mut fm = PasswordFrontmatter::new(id, input.title.clone(), nextRank);
    if let Some(color) = input.color {
        fm.color = color;
    }
    if let Some(tags) = input.tags {
        fm.tags = tags;
    }

    // Create content with all sensitive fields
    let passwordContent = PasswordContent {
        url: input.url.unwrap_or_default(),
        username: input.username.unwrap_or_default(),
        password: input.password.unwrap_or_default(),
        notes: input.notes.unwrap_or_default(),
    };

    let contentJson = serde_json::to_string(&passwordContent)
        .map_err(|e| format!("Failed to serialize password content: {}", e))?;

    // Use unified encrypted format
    let fileContent = encrypted_storage::createEncryptedFile(
        &serde_yaml::to_string(&fm).map_err(|e| e.to_string())?,
        &contentJson,
        &masterPassword,
    )?;

    fs::write(&passwordPath, fileContent).map_err(|e| e.to_string())?;

    let password = Password {
        path: passwordPath,
        folderPath,
        frontmatter: fm,
        encryptedContent: String::new(), // Content is in file, not needed here
    };

    storage.updateActivity();
    Ok(PasswordInfo::from(&password))
}

// ============================================
// UPDATE COMMAND
// ============================================

#[derive(serde::Deserialize)]
pub struct UpdatePasswordInput {
    pub id: String,
    pub title: Option<String>,
    pub url: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub notes: Option<String>,
    pub color: Option<String>,
    pub pinned: Option<bool>,
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
pub fn updatePassword(
    storage: State<'_, StorageState>,
    input: UpdatePasswordInput,
) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Search in regular folders first
    let passwords = scanAllPasswords(&foldersDir(&wsPath), Some(&masterPassword));
    let passwordOpt = passwords.iter().find(|p| p.frontmatter.id == input.id);

    // If not found, check trash
    let trashPassword;
    let password = if let Some(p) = passwordOpt {
        p
    } else {
        let trashPasswordsPath = trashPasswordsDir(&wsPath);
        let trashPasswords = scanPasswordsInFolder(&trashPasswordsPath, Some(&masterPassword));
        trashPassword = trashPasswords.into_iter().find(|p| p.frontmatter.id == input.id)
            .ok_or("Password not found")?;
        &trashPassword
    };

    let mut fm = password.frontmatter.clone();

    // Update metadata fields
    if let Some(title) = input.title {
        fm.title = title;
    }
    if let Some(color) = input.color {
        fm.color = color;
    }
    if let Some(pinned) = input.pinned {
        fm.pinned = pinned;
    }
    if let Some(tags) = input.tags {
        fm.tags = tags;
    }

    fm.updated = chrono::Utc::now().timestamp_millis();

    // Get existing content and update if needed
    let currentContent: PasswordContent = if !password.encryptedContent.is_empty() {
        let decrypted = encrypted_storage::decryptContent(&password.encryptedContent, &masterPassword)?;
        serde_json::from_str(&decrypted).unwrap_or_default()
    } else {
        PasswordContent::default()
    };

    // Merge with new values
    let newContent = PasswordContent {
        url: input.url.unwrap_or(currentContent.url),
        username: input.username.unwrap_or(currentContent.username),
        password: input.password.unwrap_or(currentContent.password),
        notes: input.notes.unwrap_or(currentContent.notes),
    };

    let contentJson = serde_json::to_string(&newContent)
        .map_err(|e| format!("Failed to serialize password content: {}", e))?;

    // Use unified encrypted format
    let fileContent = encrypted_storage::createEncryptedFile(
        &serde_yaml::to_string(&fm).map_err(|e| e.to_string())?,
        &contentJson,
        &masterPassword,
    )?;

    fs::write(&password.path, fileContent).map_err(|e| e.to_string())?;

    storage.updateActivity();
    Ok(())
}

// ============================================
// DELETE COMMAND
// ============================================

#[tauri::command]
pub fn deletePassword(storage: State<'_, StorageState>, id: String, permanent: Option<bool>) -> Result<(), String> {
    println!("[deletePassword] Called with id: {}, permanent: {:?}", id, permanent);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    // Search in regular folders first
    let passwords = scanAllPasswords(&foldersDir(&wsPath), passwordRef);
    let passwordOpt = passwords.iter().find(|p| p.frontmatter.id == id);

    // Track if item is in trash
    let isInTrash;
    let trashPassword;
    let password = if let Some(p) = passwordOpt {
        isInTrash = false;
        p
    } else {
        let trashPasswordsPath = trashPasswordsDir(&wsPath);
        let trashPasswords = scanPasswordsInFolder(&trashPasswordsPath, passwordRef);
        trashPassword = trashPasswords.into_iter().find(|p| p.frontmatter.id == id)
            .ok_or("Password not found")?;
        isInTrash = true;
        &trashPassword
    };
    println!("[deletePassword] Found password at: {} (in trash: {})", password.path.display(), isInTrash);

    // If item is in trash, always permanently delete
    if permanent.unwrap_or(false) || isInTrash {
        // Permanent delete
        fs::remove_file(&password.path).map_err(|e| e.to_string())?;
        println!("[deletePassword] SUCCESS - permanently deleted");
    } else {
        // Move to trash
        let trashDir = trashPasswordsDir(&wsPath);
        fs::create_dir_all(&trashDir).map_err(|e| e.to_string())?;

        let trashPath = trashDir.join(password.path.file_name().ok_or("Invalid file name")?);
        fs::rename(&password.path, &trashPath).map_err(|e| {
            println!("[deletePassword] ERROR moving to trash: {}", e);
            e.to_string()
        })?;
        println!("[deletePassword] SUCCESS - moved to trash at: {}", trashPath.display());
    }

    storage.updateActivity();
    Ok(())
}

// ============================================
// MOVE & REORDER COMMANDS
// ============================================

#[derive(serde::Deserialize)]
pub struct ReorderPasswordsInput {
    pub folderPath: String,
    pub passwordIds: Vec<String>,
}

#[tauri::command]
pub fn reorderPasswords(storage: State<'_, StorageState>, input: ReorderPasswordsInput) -> Result<(), String> {
    println!("[reorderPasswords] Called with folderPath: {}", input.folderPath);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Determine the actual passwords directory
    let passwordsDirPath = if input.folderPath.is_empty() {
        passwordsDir(&wsPath, "")
    } else {
        PathBuf::from(&input.folderPath).join("passwords")
    };

    let passwords = scanPasswordsInFolder(&passwordsDirPath, Some(&masterPassword));

    // Update rank and re-encrypt
    for (index, passwordId) in input.passwordIds.iter().enumerate() {
        if let Some(password) = passwords.iter().find(|p| p.frontmatter.id == *passwordId) {
            let newRank = (index + 1) as u32;

            // Only update if rank changed
            if password.frontmatter.rank != newRank {
                let mut fm = password.frontmatter.clone();
                fm.rank = newRank;

                // Read and decrypt existing content
                let fileContent = fs::read_to_string(&password.path).map_err(|e| e.to_string())?;
                let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
                let contentJson = encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?;

                // Re-encrypt with updated metadata
                let newFileContent = encrypted_storage::createEncryptedFile(
                    &serde_yaml::to_string(&fm).map_err(|e| e.to_string())?,
                    &contentJson,
                    &masterPassword,
                )?;

                fs::write(&password.path, newFileContent).map_err(|e| e.to_string())?;
            }
        }
    }

    storage.updateActivity();
    println!("[reorderPasswords] SUCCESS");
    Ok(())
}

#[tauri::command]
pub fn movePasswordToFolder(storage: State<'_, StorageState>, id: String, targetFolderPath: String) -> Result<PasswordInfo, String> {
    println!("[movePasswordToFolder] Called with id: {}, targetFolderPath: {}", id, targetFolderPath);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Search in regular folders first
    let passwords = scanAllPasswords(&foldersDir(&wsPath), Some(&masterPassword));
    let passwordOpt = passwords.iter().find(|p| p.frontmatter.id == id);

    // If not found, check trash
    let trashPassword;
    let password = if let Some(p) = passwordOpt {
        p
    } else {
        let trashPasswordsPath = trashPasswordsDir(&wsPath);
        let trashPasswords = scanPasswordsInFolder(&trashPasswordsPath, Some(&masterPassword));
        trashPassword = trashPasswords.into_iter().find(|p| p.frontmatter.id == id)
            .ok_or("Password not found")?;
        &trashPassword
    };

    // Target is the passwords subdirectory within the folder
    let targetPasswordsDir = PathBuf::from(&targetFolderPath).join("passwords");

    // Create target folder if it doesn't exist
    fs::create_dir_all(&targetPasswordsDir).map_err(|e| e.to_string())?;

    // Find next rank in target folder
    let existingPasswords = scanPasswordsInFolder(&targetPasswordsDir, Some(&masterPassword));
    let nextRank = existingPasswords.iter().map(|p| p.frontmatter.rank).max().unwrap_or(0) + 1;

    // Same UUID filename, new location
    let newPath = targetPasswordsDir.join(uuidFilename(&password.frontmatter.id));

    // Update frontmatter with new rank
    let mut fm = password.frontmatter.clone();
    fm.rank = nextRank;

    // Read and decrypt existing content
    let fileContent = fs::read_to_string(&password.path).map_err(|e| e.to_string())?;
    let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
    let contentJson = encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?;

    // Re-encrypt with updated metadata
    let newFileContent = encrypted_storage::createEncryptedFile(
        &serde_yaml::to_string(&fm).map_err(|e| e.to_string())?,
        &contentJson,
        &masterPassword,
    )?;

    fs::write(&newPath, &newFileContent).map_err(|e| e.to_string())?;

    // Remove old file
    fs::remove_file(&password.path).map_err(|e| e.to_string())?;

    // Build and return updated PasswordInfo
    let movedPassword = Password {
        path: newPath,
        folderPath: targetPasswordsDir,
        frontmatter: fm,
        encryptedContent: String::new(),
    };

    storage.updateActivity();
    println!("[movePasswordToFolder] SUCCESS");
    Ok(PasswordInfo::from(&movedPassword))
}
