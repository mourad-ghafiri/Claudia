// Password commands - encrypted password management
// All sensitive fields (url, username, password, notes) are encrypted

use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::storage::{StorageState, passwordsDir, foldersDir, parseFilename, toFilename, slugify, parseFrontmatter, toMarkdown};
use crate::models::{Password, PasswordFrontmatter, PasswordContent};
use crate::crypto;
use super::common::newId;

#[derive(serde::Serialize)]
pub struct PasswordInfo {
    pub id: String,
    pub title: String,
    pub rank: u32,
    pub slug: String,
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
            rank: p.rank,
            slug: p.slug.clone(),
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

/// Scan passwords from a directory
fn scanPasswordsInFolder(folderPath: &PathBuf) -> Vec<Password> {
    let mut passwords = Vec::new();

    if !folderPath.exists() {
        return passwords;
    }

    let entries: Vec<_> = fs::read_dir(folderPath)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().is_file() &&
            e.path().extension().map(|ext| ext == "md").unwrap_or(false) &&
            !e.file_name().to_string_lossy().starts_with('.')
        })
        .collect();

    for entry in entries {
        let path = entry.path();
        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        if let Some((rank, slug)) = parseFilename(filename) {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Some((fm, body)) = parseFrontmatter::<PasswordFrontmatter>(&content) {
                    passwords.push(Password {
                        rank,
                        slug,
                        path: path.clone(),
                        folderPath: folderPath.clone(),
                        frontmatter: fm,
                        encryptedContent: body,
                    });
                }
            }
        }
    }

    passwords.sort_by_key(|p| p.rank);
    passwords
}

/// Scan all passwords recursively from the folders directory
fn scanAllPasswords(foldersBaseDir: &PathBuf) -> Vec<Password> {
    let mut allPasswords = Vec::new();

    // Passwords in root /folders/passwords/
    let rootPasswordsDir = foldersBaseDir.join("passwords");
    if rootPasswordsDir.exists() {
        allPasswords.extend(scanPasswordsInFolder(&rootPasswordsDir));
    }

    // Scan all folders for their /passwords/ subdirectories
    scanPasswordsInFoldersRecursive(foldersBaseDir, &mut allPasswords);

    allPasswords
}

/// Helper to recursively scan folder tree for passwords subdirectories
fn scanPasswordsInFoldersRecursive(dir: &PathBuf, passwords: &mut Vec<Password>) {
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
                    passwords.extend(scanPasswordsInFolder(&passwordsSubdir));
                }
                scanPasswordsInFoldersRecursive(&path, passwords);
            }
        }
    }
}

// ============================================
// READ COMMANDS
// ============================================

#[tauri::command]
pub fn getPasswords(storage: State<'_, StorageState>, folderPath: Option<String>) -> Vec<PasswordInfo> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Vec::new(),
    };

    let passwords = match &folderPath {
        Some(fp) if !fp.is_empty() => {
            let passwordsSubdir = PathBuf::from(fp).join("passwords");
            scanPasswordsInFolder(&passwordsSubdir)
        },
        _ => {
            let foldersBase = foldersDir(&wsPath);
            scanAllPasswords(&foldersBase)
        }
    };

    passwords.iter().map(PasswordInfo::from).collect()
}

#[tauri::command]
pub fn getPasswordById(storage: State<'_, StorageState>, id: String) -> Option<PasswordInfo> {
    let wsPath = storage.getWorkspacePath()?;
    let passwords = scanAllPasswords(&foldersDir(&wsPath));
    passwords.iter().find(|p| p.frontmatter.id == id).map(PasswordInfo::from)
}

/// Find a single password by ID without scanning all
fn findPasswordById(foldersBaseDir: &PathBuf, id: &str) -> Option<Password> {
    // This is a quick scan - we check each password file until we find the matching ID
    let rootPasswordsDir = foldersBaseDir.join("passwords");

    // Check root passwords dir first
    if let Some(p) = findPasswordInFolder(&rootPasswordsDir, id) {
        return Some(p);
    }

    // Recursively check folder subdirectories
    findPasswordInFoldersRecursive(foldersBaseDir, id)
}

fn findPasswordInFolder(folderPath: &PathBuf, id: &str) -> Option<Password> {
    if !folderPath.exists() {
        return None;
    }

    let entries = fs::read_dir(folderPath).ok()?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() || path.extension().map(|ext| ext != "md").unwrap_or(true) {
            continue;
        }

        let filename = path.file_name().and_then(|n| n.to_str())?;
        if filename.starts_with('.') {
            continue;
        }

        if let Some((rank, slug)) = parseFilename(filename) {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Some((fm, body)) = parseFrontmatter::<PasswordFrontmatter>(&content) {
                    if fm.id == id {
                        return Some(Password {
                            rank,
                            slug,
                            path: path.clone(),
                            folderPath: folderPath.clone(),
                            frontmatter: fm,
                            encryptedContent: body,
                        });
                    }
                }
            }
        }
    }
    None
}

fn findPasswordInFoldersRecursive(dir: &PathBuf, id: &str) -> Option<Password> {
    let entries = fs::read_dir(dir).ok()?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        let filename = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

        if filename.starts_with('.') || filename == "notes" || filename == "tasks" || filename == "passwords" {
            continue;
        }

        if path.is_dir() {
            let passwordsSubdir = path.join("passwords");
            if passwordsSubdir.exists() {
                if let Some(p) = findPasswordInFolder(&passwordsSubdir, id) {
                    return Some(p);
                }
            }
            if let Some(p) = findPasswordInFoldersRecursive(&path, id) {
                return Some(p);
            }
        }
    }
    None
}

#[tauri::command]
pub fn getPasswordContent(
    storage: State<'_, StorageState>,
    id: String,
    masterPassword: String,
) -> Result<DecryptedPasswordContent, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    // Use optimized single-password lookup instead of scanning all
    let password = findPasswordById(&foldersDir(&wsPath), &id)
        .ok_or("Password not found")?;

    // Decrypt and parse the content
    if password.encryptedContent.is_empty() {
        return Ok(DecryptedPasswordContent {
            url: String::new(),
            username: String::new(),
            password: String::new(),
            notes: String::new(),
        });
    }

    let decrypted = crypto::decrypt(&password.encryptedContent, &masterPassword)?;
    let content: PasswordContent = serde_json::from_str(&decrypted)
        .map_err(|e| format!("Failed to parse password content: {}", e))?;

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
    masterPassword: String,
) -> Result<Vec<BatchDecryptedContent>, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let foldersBase = foldersDir(&wsPath);

    // Scan all passwords once
    let allPasswords = scanAllPasswords(&foldersBase);

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
                let decrypted = crypto::decrypt(&password.encryptedContent, &masterPassword)?;
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
    pub masterPassword: String,
}

#[tauri::command]
pub fn createPassword(
    storage: State<'_, StorageState>,
    input: CreatePasswordInput,
) -> Result<PasswordInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace selected")?;

    let folderPath = match &input.folderPath {
        Some(p) if !p.is_empty() && p != "null" && p.starts_with('/') => {
            PathBuf::from(p).join("passwords")
        }
        _ => passwordsDir(&wsPath, ""),
    };

    fs::create_dir_all(&folderPath).map_err(|e| e.to_string())?;

    let existingPasswords = scanPasswordsInFolder(&folderPath);
    let nextRank = existingPasswords.iter().map(|p| p.rank).max().unwrap_or(0) + 1;

    let slug = slugify(&input.title);
    let filename = toFilename(nextRank, &slug, false);
    let passwordPath = folderPath.join(&filename);

    let id = newId();
    let mut fm = PasswordFrontmatter::new(id, input.title.clone());
    if let Some(color) = input.color {
        fm.color = color;
    }
    if let Some(tags) = input.tags {
        fm.tags = tags;
    }

    // Create encrypted content with all sensitive fields
    let passwordContent = PasswordContent {
        url: input.url.unwrap_or_default(),
        username: input.username.unwrap_or_default(),
        password: input.password.unwrap_or_default(),
        notes: input.notes.unwrap_or_default(),
    };

    let contentJson = serde_json::to_string(&passwordContent)
        .map_err(|e| format!("Failed to serialize password content: {}", e))?;
    let encryptedBody = crypto::encrypt(&contentJson, &input.masterPassword)?;

    let content = toMarkdown(&fm, &encryptedBody)?;
    fs::write(&passwordPath, content).map_err(|e| e.to_string())?;

    let password = Password {
        rank: nextRank,
        slug,
        path: passwordPath,
        folderPath,
        frontmatter: fm,
        encryptedContent: encryptedBody,
    };

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
    pub masterPassword: String,
}

#[tauri::command]
pub fn updatePassword(
    storage: State<'_, StorageState>,
    input: UpdatePasswordInput,
) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let passwords = scanAllPasswords(&foldersDir(&wsPath));

    let password = passwords.iter()
        .find(|p| p.frontmatter.id == input.id)
        .ok_or("Password not found")?;

    let mut fm = password.frontmatter.clone();

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

    // Handle encrypted content updates
    let encryptedBody = if input.url.is_some() || input.username.is_some() || input.password.is_some() || input.notes.is_some() {
        // Decrypt existing to get current values
        let currentContent: PasswordContent = if !password.encryptedContent.is_empty() {
            let decrypted = crypto::decrypt(&password.encryptedContent, &input.masterPassword)?;
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
        crypto::encrypt(&contentJson, &input.masterPassword)?
    } else {
        password.encryptedContent.clone()
    };

    let content = toMarkdown(&fm, &encryptedBody)?;
    fs::write(&password.path, content).map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================
// DELETE COMMAND
// ============================================

#[tauri::command]
pub fn deletePassword(storage: State<'_, StorageState>, id: String) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let passwords = scanAllPasswords(&foldersDir(&wsPath));

    let password = passwords.iter()
        .find(|p| p.frontmatter.id == id)
        .ok_or("Password not found")?;

    fs::remove_file(&password.path).map_err(|e| e.to_string())?;

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
    println!("[reorderPasswords] Password IDs to reorder: {:?}", input.passwordIds);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    // Determine the actual passwords directory
    // If folderPath is provided, passwords are in {folderPath}/passwords/
    // If empty, passwords are in the root passwords folder
    let passwordsDir = if input.folderPath.is_empty() {
        passwordsDir(&wsPath, "")
    } else {
        PathBuf::from(&input.folderPath).join("passwords")
    };

    println!("[reorderPasswords] Scanning passwords in: {:?}", passwordsDir);
    let passwords = scanPasswordsInFolder(&passwordsDir);
    println!("[reorderPasswords] Found {} passwords", passwords.len());

    for (index, passwordId) in input.passwordIds.iter().enumerate() {
        if let Some(password) = passwords.iter().find(|p| p.frontmatter.id == *passwordId) {
            let newRank = (index + 1) as u32;
            let newFilename = toFilename(newRank, &password.slug, false);
            // Use password.folderPath which is the actual directory where the password lives
            let newPath = password.folderPath.join(&newFilename);

            if password.path != newPath {
                println!("[reorderPasswords] Renaming {} -> {}", password.path.display(), newPath.display());
                fs::rename(&password.path, &newPath).map_err(|e| {
                    println!("[reorderPasswords] ERROR: {}", e);
                    e.to_string()
                })?;
            }
        }
    }
    println!("[reorderPasswords] SUCCESS");
    Ok(())
}

#[tauri::command]
pub fn movePasswordToFolder(storage: State<'_, StorageState>, id: String, targetFolderPath: String) -> Result<PasswordInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let passwords = scanAllPasswords(&foldersDir(&wsPath));

    let password = passwords.iter()
        .find(|p| p.frontmatter.id == id)
        .ok_or("Password not found")?;

    let targetPasswordsDir = PathBuf::from(&targetFolderPath).join("passwords");
    fs::create_dir_all(&targetPasswordsDir).map_err(|e| e.to_string())?;

    let existingPasswords = scanPasswordsInFolder(&targetPasswordsDir);
    let nextRank = existingPasswords.iter().map(|p| p.rank).max().unwrap_or(0) + 1;

    let newFilename = toFilename(nextRank, &password.slug, false);
    let newPath = targetPasswordsDir.join(&newFilename);

    fs::rename(&password.path, &newPath).map_err(|e| e.to_string())?;

    let movedPassword = Password {
        rank: nextRank,
        slug: password.slug.clone(),
        path: newPath,
        folderPath: targetPasswordsDir,
        frontmatter: password.frontmatter.clone(),
        encryptedContent: password.encryptedContent.clone(),
    };

    Ok(PasswordInfo::from(&movedPassword))
}

// ============================================
// MASTER PASSWORD COMMANDS
// ============================================

fn masterPasswordPath(wsPath: &str) -> PathBuf {
    PathBuf::from(wsPath).join(".master_password_hash")
}

#[tauri::command]
pub fn isMasterPasswordSet(storage: State<'_, StorageState>) -> bool {
    match storage.getWorkspacePath() {
        Some(ws) => masterPasswordPath(&ws).exists(),
        None => false,
    }
}

#[tauri::command]
pub fn setMasterPassword(
    storage: State<'_, StorageState>,
    password: String,
) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let hashPath = masterPasswordPath(&wsPath);

    if hashPath.exists() {
        return Err("Master password already set. Use changeMasterPassword.".to_string());
    }

    let hash = crypto::hashMasterPassword(&password)?;
    fs::write(&hashPath, &hash).map_err(|e| e.to_string())?;

    // Set restrictive file permissions (owner read/write only) on Unix systems
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&hashPath, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set file permissions: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn verifyMasterPassword(
    storage: State<'_, StorageState>,
    password: String,
) -> Result<bool, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let hashPath = masterPasswordPath(&wsPath);

    if !hashPath.exists() {
        return Ok(false);
    }

    let hash = fs::read_to_string(&hashPath).map_err(|e| e.to_string())?;
    Ok(crypto::verifyMasterPassword(&password, &hash))
}

#[tauri::command]
pub fn changeMasterPassword(
    storage: State<'_, StorageState>,
    currentPassword: String,
    newPassword: String,
) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let hashPath = masterPasswordPath(&wsPath);

    let currentHash = fs::read_to_string(&hashPath).map_err(|e| e.to_string())?;
    if !crypto::verifyMasterPassword(&currentPassword, &currentHash) {
        return Err("Current password is incorrect".to_string());
    }

    // Re-encrypt all passwords with new master password
    let passwords = scanAllPasswords(&foldersDir(&wsPath));
    for pwd in &passwords {
        if pwd.encryptedContent.is_empty() {
            continue;
        }
        let plain = crypto::decrypt(&pwd.encryptedContent, &currentPassword)?;
        let newEncrypted = crypto::encrypt(&plain, &newPassword)?;
        let content = toMarkdown(&pwd.frontmatter, &newEncrypted)?;
        fs::write(&pwd.path, content).map_err(|e| e.to_string())?;
    }

    let newHash = crypto::hashMasterPassword(&newPassword)?;
    fs::write(&hashPath, &newHash).map_err(|e| e.to_string())?;

    // Set restrictive file permissions (owner read/write only) on Unix systems
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&hashPath, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set file permissions: {}", e))?;
    }

    Ok(())
}
