// Note commands - complete implementation with encryption

use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::storage::{StorageState, notesDir, foldersDir, parseUuidFilename, uuidFilename, parseFrontmatter, trashNotesDir};
use crate::encrypted_storage;
use crate::models::{Note, NoteFrontmatter, FloatWindow};
use super::common::newId;

#[derive(serde::Serialize)]
pub struct NoteInfo {
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
    pub float: FloatWindow,
}

impl From<&Note> for NoteInfo {
    fn from(n: &Note) -> Self {
        // folderPath should be the parent folder, not the /notes subdirectory
        // e.g., /folders/{uuid} instead of /folders/{uuid}/notes
        let folderPath = n.folderPath.parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        Self {
            id: n.frontmatter.id.clone(),
            title: n.frontmatter.title.clone(),
            rank: n.frontmatter.rank,
            color: n.frontmatter.color.clone(),
            pinned: n.frontmatter.pinned,
            tags: n.frontmatter.tags.clone(),
            created: n.frontmatter.created,
            updated: n.frontmatter.updated,
            folderPath,
            path: n.path.to_string_lossy().to_string(),
            float: n.frontmatter.float.clone(),
        }
    }
}

/// Scan notes from a directory (non-recursive within folder, but called per folder)
/// When masterPassword is provided, decrypts encrypted files
pub(crate) fn scanNotesInFolder(folderPath: &PathBuf, masterPassword: Option<&str>) -> Vec<Note> {
    let mut notes = Vec::new();

    if !folderPath.exists() {
        return notes;
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

        // Validate filename is a UUID (with .md extension)
        if parseUuidFilename(filename).is_some() {
            if let Ok(content) = fs::read_to_string(&path) {
                // Check if file is encrypted
                if encrypted_storage::isEncryptedFormat(&content) {
                    // Need master password to decrypt
                    if let Some(password) = masterPassword {
                        if let Ok(encrypted) = encrypted_storage::parseEncryptedFile(&content) {
                            if let Ok(yamlContent) = encrypted_storage::decryptMetadata(&encrypted.metadata, password) {
                                if let Ok(fm) = serde_yaml::from_str::<NoteFrontmatter>(&yamlContent) {
                                    // Don't decrypt content here - it will be decrypted on demand
                                    notes.push(Note {
                                        path: path.clone(),
                                        folderPath: folderPath.clone(),
                                        frontmatter: fm,
                                        content: String::new(), // Content loaded on demand
                                    });
                                }
                            }
                        }
                    }
                } else {
                    // Legacy unencrypted format
                    if let Some((fm, body)) = parseFrontmatter::<NoteFrontmatter>(&content) {
                        notes.push(Note {
                            path: path.clone(),
                            folderPath: folderPath.clone(),
                            frontmatter: fm,
                            content: body,
                        });
                    }
                }
            }
        }
    }

    // Sort by rank stored in frontmatter
    notes.sort_by_key(|n| n.frontmatter.rank);
    notes
}

/// Scan all notes recursively from the folders directory
/// Looks for notes in /notes/ subdirectories within each folder
pub(crate) fn scanAllNotes(foldersBaseDir: &PathBuf, masterPassword: Option<&str>) -> Vec<Note> {
    let mut allNotes = Vec::new();

    // Notes in root /folders/notes/
    let rootNotesDir = foldersBaseDir.join("notes");
    if rootNotesDir.exists() {
        allNotes.extend(scanNotesInFolder(&rootNotesDir, masterPassword));
    }

    // Scan all folders for their /notes/ subdirectories
    scanNotesInFoldersRecursive(foldersBaseDir, &mut allNotes, masterPassword);

    allNotes
}

/// Helper to recursively scan folder tree for notes subdirectories
fn scanNotesInFoldersRecursive(dir: &PathBuf, notes: &mut Vec<Note>, masterPassword: Option<&str>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let filename = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

            // Skip hidden files and special directories
            if filename.starts_with('.') || filename == "notes" || filename == "tasks" {
                continue;
            }

            if path.is_dir() {
                // Check if this folder has a notes subdirectory
                let notesSubdir = path.join("notes");
                if notesSubdir.exists() && notesSubdir.is_dir() {
                    notes.extend(scanNotesInFolder(&notesSubdir, masterPassword));
                }

                // Recurse into subfolders
                scanNotesInFoldersRecursive(&path, notes, masterPassword);
            }
        }
    }
}

#[tauri::command]
pub fn getNotes(storage: State<'_, StorageState>, folderPath: Option<String>) -> Result<Vec<NoteInfo>, String> {
    println!("[getNotes] Called with folderPath: {:?}", folderPath);

    let wsPath = match storage.getWorkspacePath() {
        Some(p) => {
            println!("[getNotes] Workspace path: {}", p);
            p
        },
        None => {
            println!("[getNotes] No workspace path, returning empty");
            return Ok(Vec::new());
        }
    };

    // Check if vault is unlocked
    if !storage.isUnlocked() {
        println!("[getNotes] Vault is locked");
        return Err("Vault is locked".to_string());
    }

    // Get master password for decryption
    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let notes = match &folderPath {
        Some(fp) if !fp.is_empty() => {
            // Scan the notes subdirectory within the specified folder
            let notesSubdir = PathBuf::from(fp).join("notes");
            println!("[getNotes] Scanning folder's notes dir: {:?}", notesSubdir);
            scanNotesInFolder(&notesSubdir, passwordRef)
        },
        _ => {
            // Scan all notes across all folders
            let foldersBase = foldersDir(&wsPath);
            println!("[getNotes] Scanning all folders: {:?}", foldersBase);
            scanAllNotes(&foldersBase, passwordRef)
        }
    };

    println!("[getNotes] Found {} notes", notes.len());
    for n in &notes {
        println!("[getNotes]   - {} (id: {}, path: {})", n.frontmatter.title, n.frontmatter.id, n.path.display());
    }

    // Update activity to reset auto-lock timer
    storage.updateActivity();

    Ok(notes.iter().map(NoteInfo::from).collect())
}


#[tauri::command]
pub fn getNoteById(storage: State<'_, StorageState>, id: String) -> Result<Option<NoteInfo>, String> {
    println!("[getNoteById] Called with id: {}", id);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let notes = scanAllNotes(&foldersDir(&wsPath), passwordRef);
    let result = notes.iter().find(|n| n.frontmatter.id == id).map(NoteInfo::from);

    if result.is_some() {
        println!("[getNoteById] Found note");
    } else {
        println!("[getNoteById] Note not found");
    }

    storage.updateActivity();
    Ok(result)
}

#[tauri::command]
pub fn getNoteContent(storage: State<'_, StorageState>, id: String) -> Result<String, String> {
    println!("[getNoteContent] Called with id: {}", id);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Search in regular folders first
    let notes = scanAllNotes(&foldersDir(&wsPath), Some(&masterPassword));
    let noteOpt = notes.iter().find(|n| n.frontmatter.id == id);

    // If not found, check trash
    let trashNote;
    let note = if let Some(n) = noteOpt {
        n
    } else {
        let trashNotesPath = trashNotesDir(&wsPath);
        let trashNotes = scanNotesInFolder(&trashNotesPath, Some(&masterPassword));
        trashNote = trashNotes.into_iter().find(|n| n.frontmatter.id == id)
            .ok_or_else(|| "Note not found".to_string())?;
        &trashNote
    };

    // Read file and decrypt content
    let fileContent = fs::read_to_string(&note.path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let content = if encrypted_storage::isEncryptedFormat(&fileContent) {
        let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
        encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?
    } else {
        // Legacy unencrypted format
        note.content.clone()
    };

    println!("[getNoteContent] Found content ({} bytes)", content.len());
    storage.updateActivity();
    Ok(content)
}

#[derive(serde::Deserialize)]
pub struct CreateNoteInput {
    pub title: String,
    pub folderPath: Option<String>,
    pub content: Option<String>,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
pub fn createNote(storage: State<'_, StorageState>, input: CreateNoteInput) -> Result<NoteInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace selected")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    println!("[createNote] Received folderPath: {:?}", input.folderPath);
    println!("[createNote] Workspace path: {}", wsPath);

    // If folderPath is provided, create notes in folderPath/notes/
    // Otherwise use the root workspace/folders/notes/
    let folderPath = match &input.folderPath {
        Some(p) if !p.is_empty() && p != "null" && p.starts_with('/') => {
            // Create notes in the folder's notes subdirectory
            PathBuf::from(p).join("notes")
        }
        _ => notesDir(&wsPath, ""),
    };

    println!("[createNote] Using folderPath: {:?}", folderPath);

    fs::create_dir_all(&folderPath).map_err(|e| e.to_string())?;

    // Find next rank from existing notes
    let existingNotes = scanNotesInFolder(&folderPath, Some(&masterPassword));
    let nextRank = existingNotes.iter().map(|n| n.frontmatter.rank).max().unwrap_or(0) + 1;

    // UUID is the filename
    let id = newId();
    let filename = uuidFilename(&id);
    let notePath = folderPath.join(&filename);

    let mut fm = NoteFrontmatter::new(id, input.title.clone(), nextRank);
    if let Some(color) = input.color {
        fm.color = color;
    }
    if let Some(tags) = input.tags {
        fm.tags = tags;
    }

    let body = input.content.unwrap_or_default();

    // Encrypt and save
    let fileContent = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;
    fs::write(&notePath, fileContent).map_err(|e| e.to_string())?;

    let note = Note {
        path: notePath,
        folderPath,
        frontmatter: fm,
        content: body,
    };

    storage.updateActivity();
    Ok(NoteInfo::from(&note))
}

#[derive(serde::Deserialize)]
pub struct UpdateNoteInput {
    pub id: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub color: Option<String>,
    pub pinned: Option<bool>,
    pub tags: Option<Vec<String>>,
    pub float: Option<FloatWindow>,
}

#[tauri::command]
pub fn updateNote(storage: State<'_, StorageState>, input: UpdateNoteInput) -> Result<(), String> {
    println!("[updateNote] Called with id: {}", input.id);
    println!("[updateNote] Updates - title: {:?}, content: {:?}, color: {:?}, pinned: {:?}",
             input.title.as_ref().map(|_| "[set]"),
             input.content.as_ref().map(|_| "[set]"),
             input.color,
             input.pinned);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Search in regular folders first
    let notes = scanAllNotes(&foldersDir(&wsPath), Some(&masterPassword));
    let noteOpt = notes.iter().find(|n| n.frontmatter.id == input.id);

    // If not found, check trash
    let trashNote;
    let note = if let Some(n) = noteOpt {
        n
    } else {
        let trashNotesPath = trashNotesDir(&wsPath);
        let trashNotes = scanNotesInFolder(&trashNotesPath, Some(&masterPassword));
        trashNote = trashNotes.into_iter().find(|n| n.frontmatter.id == input.id)
            .ok_or("Note not found")?;
        &trashNote
    };
    println!("[updateNote] Found note at: {}", note.path.display());

    let mut fm = note.frontmatter.clone();

    // Get existing body content (need to decrypt from file)
    let fileContent = fs::read_to_string(&note.path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut body = if encrypted_storage::isEncryptedFormat(&fileContent) {
        let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
        encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?
    } else {
        note.content.clone()
    };

    // Handle title change (filename no longer changes with title)
    if let Some(ref title) = input.title {
        println!("[updateNote] Updating title to: {}", title);
        fm.title = title.clone();
    }
    if let Some(content) = input.content {
        println!("[updateNote] Updating content ({} bytes)", content.len());
        body = content;
    }
    if let Some(color) = input.color {
        println!("[updateNote] Updating color to: {}", color);
        fm.color = color;
    }
    if let Some(pinned) = input.pinned {
        println!("[updateNote] Updating pinned to: {}", pinned);
        fm.pinned = pinned;
    }
    if let Some(tags) = input.tags {
        println!("[updateNote] Updating tags to: {:?}", tags);
        fm.tags = tags;
    }
    if let Some(float) = input.float {
        println!("[updateNote] Updating float to: {:?}", float);
        fm.float = float;
    }

    fm.updated = chrono::Utc::now().timestamp_millis();

    // Encrypt and save
    let content = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;
    fs::write(&note.path, content).map_err(|e| {
        println!("[updateNote] ERROR writing file: {}", e);
        e.to_string()
    })?;

    println!("[updateNote] SUCCESS");
    storage.updateActivity();
    Ok(())
}

#[tauri::command]
pub fn deleteNote(storage: State<'_, StorageState>, id: String, permanent: Option<bool>) -> Result<(), String> {
    println!("[deleteNote] Called with id: {}, permanent: {:?}", id, permanent);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    // Search in regular folders first
    let notes = scanAllNotes(&foldersDir(&wsPath), passwordRef);
    let noteOpt = notes.iter().find(|n| n.frontmatter.id == id);

    // Track if item is in trash
    let isInTrash;
    let trashNote;
    let note = if let Some(n) = noteOpt {
        isInTrash = false;
        n
    } else {
        // Check trash
        let trashNotesPath = trashNotesDir(&wsPath);
        let trashNotes = scanNotesInFolder(&trashNotesPath, passwordRef);
        trashNote = trashNotes.into_iter().find(|n| n.frontmatter.id == id)
            .ok_or("Note not found")?;
        isInTrash = true;
        &trashNote
    };
    println!("[deleteNote] Found note at: {} (in trash: {})", note.path.display(), isInTrash);

    // If item is in trash, always permanently delete
    if permanent.unwrap_or(false) || isInTrash {
        // Permanent delete
        fs::remove_file(&note.path).map_err(|e| {
            println!("[deleteNote] ERROR: {}", e);
            e.to_string()
        })?;
        println!("[deleteNote] SUCCESS - permanently deleted");
    } else {
        // Move to trash
        let trashDir = trashNotesDir(&wsPath);
        fs::create_dir_all(&trashDir).map_err(|e| e.to_string())?;

        let trashPath = trashDir.join(note.path.file_name().ok_or("Invalid file name")?);
        fs::rename(&note.path, &trashPath).map_err(|e| {
            println!("[deleteNote] ERROR moving to trash: {}", e);
            e.to_string()
        })?;
        println!("[deleteNote] SUCCESS - moved to trash at: {}", trashPath.display());
    }

    storage.updateActivity();
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct ReorderNotesInput {
    pub folderPath: String,
    pub noteIds: Vec<String>,
}

#[tauri::command]
pub fn reorderNotes(storage: State<'_, StorageState>, input: ReorderNotesInput) -> Result<(), String> {
    println!("[reorderNotes] Called with folderPath: {}", input.folderPath);
    println!("[reorderNotes] Note IDs to reorder: {:?}", input.noteIds);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Determine the actual notes directory
    // If folderPath is provided, notes are in {folderPath}/notes/
    // If empty, notes are in the root notes folder
    let notesDirPath = if input.folderPath.is_empty() {
        notesDir(&wsPath, "")
    } else {
        PathBuf::from(&input.folderPath).join("notes")
    };

    println!("[reorderNotes] Scanning notes in: {:?}", notesDirPath);
    let notes = scanNotesInFolder(&notesDirPath, Some(&masterPassword));
    println!("[reorderNotes] Found {} notes", notes.len());

    // Update rank in frontmatter instead of renaming files
    for (index, noteId) in input.noteIds.iter().enumerate() {
        if let Some(note) = notes.iter().find(|n| n.frontmatter.id == *noteId) {
            let newRank = (index + 1) as u32;

            // Only update if rank changed
            if note.frontmatter.rank != newRank {
                println!("[reorderNotes] Updating rank for {} from {} to {}", noteId, note.frontmatter.rank, newRank);
                let mut fm = note.frontmatter.clone();
                fm.rank = newRank;

                // Need to get actual content from file for re-encryption
                let fileContent = fs::read_to_string(&note.path)
                    .map_err(|e| format!("Failed to read file: {}", e))?;

                let body = if encrypted_storage::isEncryptedFormat(&fileContent) {
                    let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
                    encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?
                } else {
                    note.content.clone()
                };

                let content = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;
                fs::write(&note.path, content).map_err(|e| {
                    println!("[reorderNotes] ERROR: {}", e);
                    e.to_string()
                })?;
            }
        }
    }
    println!("[reorderNotes] SUCCESS");
    storage.updateActivity();
    Ok(())
}

#[tauri::command]
pub fn moveNoteToFolder(storage: State<'_, StorageState>, id: String, targetFolderPath: String) -> Result<NoteInfo, String> {
    println!("[moveNoteToFolder] Called with id: {}, targetFolderPath: {}", id, targetFolderPath);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Search in regular folders first
    let notes = scanAllNotes(&foldersDir(&wsPath), Some(&masterPassword));
    let noteOpt = notes.iter().find(|n| n.frontmatter.id == id);

    // If not found, check trash
    let trashNote;
    let note = if let Some(n) = noteOpt {
        n
    } else {
        let trashNotesPath = trashNotesDir(&wsPath);
        let trashNotes = scanNotesInFolder(&trashNotesPath, Some(&masterPassword));
        trashNote = trashNotes.into_iter().find(|n| n.frontmatter.id == id)
            .ok_or("Note not found")?;
        &trashNote
    };
    println!("[moveNoteToFolder] Found note at: {}", note.path.display());

    // Target is the notes subdirectory within the folder
    let targetNotesDir = PathBuf::from(&targetFolderPath).join("notes");

    // Create target folder if it doesn't exist
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
    fs::remove_file(&note.path).map_err(|e| {
        println!("[moveNoteToFolder] ERROR removing old file: {}", e);
        e.to_string()
    })?;

    println!("[moveNoteToFolder] Moved {} -> {}", note.path.display(), newPath.display());

    // Build and return updated NoteInfo
    let movedNote = Note {
        path: newPath,
        folderPath: targetNotesDir,
        frontmatter: fm,
        content: body,
    };

    println!("[moveNoteToFolder] SUCCESS");
    storage.updateActivity();
    Ok(NoteInfo::from(&movedNote))
}
