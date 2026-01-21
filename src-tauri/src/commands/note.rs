// Note commands - complete implementation

use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::storage::{StorageState, notesDir, foldersDir, parseFilename, toFilename, slugify, parseFrontmatter, toMarkdown};
use crate::models::{Note, NoteFrontmatter, FloatWindow};
use super::common::newId;

#[derive(serde::Serialize)]
pub struct NoteInfo {
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
    pub float: FloatWindow,
}

impl From<&Note> for NoteInfo {
    fn from(n: &Note) -> Self {
        // folderPath should be the parent folder, not the /notes subdirectory
        // e.g., /folders/000001-work instead of /folders/000001-work/notes
        let folderPath = n.folderPath.parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        Self {
            id: n.frontmatter.id.clone(),
            title: n.frontmatter.title.clone(),
            rank: n.rank,
            slug: n.slug.clone(),
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
pub(crate) fn scanNotesInFolder(folderPath: &PathBuf) -> Vec<Note> {
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

        if let Some((rank, slug)) = parseFilename(filename) {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Some((fm, body)) = parseFrontmatter::<NoteFrontmatter>(&content) {
                    notes.push(Note {
                        rank,
                        slug,
                        path: path.clone(),
                        folderPath: folderPath.clone(),
                        frontmatter: fm,
                        content: body,
                    });
                }
            }
        }
    }

    notes.sort_by_key(|n| n.rank);
    notes
}

/// Scan all notes recursively from the folders directory
/// Looks for notes in /notes/ subdirectories within each folder
pub(crate) fn scanAllNotes(foldersBaseDir: &PathBuf) -> Vec<Note> {
    let mut allNotes = Vec::new();

    // Notes in root /folders/notes/
    let rootNotesDir = foldersBaseDir.join("notes");
    if rootNotesDir.exists() {
        allNotes.extend(scanNotesInFolder(&rootNotesDir));
    }

    // Scan all folders for their /notes/ subdirectories
    scanNotesInFoldersRecursive(foldersBaseDir, &mut allNotes);

    allNotes
}

/// Helper to recursively scan folder tree for notes subdirectories
fn scanNotesInFoldersRecursive(dir: &PathBuf, notes: &mut Vec<Note>) {
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
                    notes.extend(scanNotesInFolder(&notesSubdir));
                }

                // Recurse into subfolders
                scanNotesInFoldersRecursive(&path, notes);
            }
        }
    }
}

#[tauri::command]
pub fn getNotes(storage: State<'_, StorageState>, folderPath: Option<String>) -> Vec<NoteInfo> {
    println!("[getNotes] Called with folderPath: {:?}", folderPath);

    let wsPath = match storage.getWorkspacePath() {
        Some(p) => {
            println!("[getNotes] Workspace path: {}", p);
            p
        },
        None => {
            println!("[getNotes] No workspace path, returning empty");
            return Vec::new();
        }
    };

    let notes = match &folderPath {
        Some(fp) if !fp.is_empty() => {
            // Scan the notes subdirectory within the specified folder
            let notesSubdir = PathBuf::from(fp).join("notes");
            println!("[getNotes] Scanning folder's notes dir: {:?}", notesSubdir);
            scanNotesInFolder(&notesSubdir)
        },
        _ => {
            // Scan all notes across all folders
            let foldersBase = foldersDir(&wsPath);
            println!("[getNotes] Scanning all folders: {:?}", foldersBase);
            scanAllNotes(&foldersBase)
        }
    };

    println!("[getNotes] Found {} notes", notes.len());
    for n in &notes {
        println!("[getNotes]   - {} (id: {}, path: {})", n.frontmatter.title, n.frontmatter.id, n.path.display());
    }

    notes.iter().map(NoteInfo::from).collect()
}


#[tauri::command]
pub fn getNoteById(storage: State<'_, StorageState>, id: String) -> Option<NoteInfo> {
    println!("[getNoteById] Called with id: {}", id);

    let wsPath = storage.getWorkspacePath()?;
    let notes = scanAllNotes(&foldersDir(&wsPath));
    let result = notes.iter().find(|n| n.frontmatter.id == id).map(NoteInfo::from);

    if result.is_some() {
        println!("[getNoteById] Found note");
    } else {
        println!("[getNoteById] Note not found");
    }
    result
}

#[tauri::command]
pub fn getNoteContent(storage: State<'_, StorageState>, id: String) -> Result<String, String> {
    println!("[getNoteContent] Called with id: {}", id);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let notes = scanAllNotes(&foldersDir(&wsPath));
    let result = notes.iter()
        .find(|n| n.frontmatter.id == id)
        .map(|n| n.content.clone())
        .ok_or_else(|| "Note not found".to_string());

    match &result {
        Ok(content) => println!("[getNoteContent] Found content ({} bytes)", content.len()),
        Err(e) => println!("[getNoteContent] ERROR: {}", e),
    }
    result
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

    // Find next rank
    let existingNotes = scanNotesInFolder(&folderPath);
    let nextRank = existingNotes.iter().map(|n| n.rank).max().unwrap_or(0) + 1;

    let slug = slugify(&input.title);
    let filename = toFilename(nextRank, &slug, false);
    let notePath = folderPath.join(&filename);

    let id = newId();
    let mut fm = NoteFrontmatter::new(id, input.title.clone());
    if let Some(color) = input.color {
        fm.color = color;
    }
    if let Some(tags) = input.tags {
        fm.tags = tags;
    }

    let body = input.content.unwrap_or_default();
    let content = toMarkdown(&fm, &body)?;
    fs::write(&notePath, content).map_err(|e| e.to_string())?;

    let note = Note {
        rank: nextRank,
        slug,
        path: notePath,
        folderPath,
        frontmatter: fm,
        content: body,
    };

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
    let notes = scanAllNotes(&foldersDir(&wsPath));

    let note = notes.iter()
        .find(|n| n.frontmatter.id == input.id)
        .ok_or("Note not found")?;
    println!("[updateNote] Found note at: {}", note.path.display());

    let mut fm = note.frontmatter.clone();
    let mut body = note.content.clone();
    let mut newPath = note.path.clone();

    // Handle title change - also update the filename
    if let Some(ref title) = input.title {
        println!("[updateNote] Updating title to: {}", title);
        fm.title = title.clone();

        // Generate new slug from the new title and update filename
        let newSlug = slugify(title);
        if newSlug != note.slug {
            let newFilename = toFilename(note.rank, &newSlug, false);
            newPath = note.folderPath.join(&newFilename);
            println!("[updateNote] Renaming file: {} -> {}", note.path.display(), newPath.display());
        }
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

    let content = toMarkdown(&fm, &body)?;

    // If path changed (title was updated), remove old file and write new
    if newPath != note.path {
        fs::remove_file(&note.path).map_err(|e| {
            println!("[updateNote] ERROR removing old file: {}", e);
            e.to_string()
        })?;
    }
    fs::write(&newPath, content).map_err(|e| {
        println!("[updateNote] ERROR writing file: {}", e);
        e.to_string()
    })?;

    println!("[updateNote] SUCCESS");
    Ok(())
}

#[tauri::command]
pub fn deleteNote(storage: State<'_, StorageState>, id: String) -> Result<(), String> {
    println!("[deleteNote] Called with id: {}", id);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let notes = scanAllNotes(&foldersDir(&wsPath));

    let note = notes.iter()
        .find(|n| n.frontmatter.id == id)
        .ok_or("Note not found")?;
    println!("[deleteNote] Found note at: {}", note.path.display());

    fs::remove_file(&note.path).map_err(|e| {
        println!("[deleteNote] ERROR: {}", e);
        e.to_string()
    })?;

    println!("[deleteNote] SUCCESS");
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

    let _wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let folderPath = PathBuf::from(&input.folderPath);
    let notes = scanNotesInFolder(&folderPath);

    for (index, noteId) in input.noteIds.iter().enumerate() {
        if let Some(note) = notes.iter().find(|n| n.frontmatter.id == *noteId) {
            let newRank = (index + 1) as u32;
            let newFilename = toFilename(newRank, &note.slug, false);
            let newPath = folderPath.join(&newFilename);

            if note.path != newPath {
                println!("[reorderNotes] Renaming {} -> {}", note.path.display(), newPath.display());
                fs::rename(&note.path, &newPath).map_err(|e| {
                    println!("[reorderNotes] ERROR: {}", e);
                    e.to_string()
                })?;
            }
        }
    }
    println!("[reorderNotes] SUCCESS");
    Ok(())
}

#[tauri::command]
pub fn moveNoteToFolder(storage: State<'_, StorageState>, id: String, targetFolderPath: String) -> Result<NoteInfo, String> {
    println!("[moveNoteToFolder] Called with id: {}, targetFolderPath: {}", id, targetFolderPath);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let notes = scanAllNotes(&foldersDir(&wsPath));

    let note = notes.iter()
        .find(|n| n.frontmatter.id == id)
        .ok_or("Note not found")?;
    println!("[moveNoteToFolder] Found note at: {}", note.path.display());

    // Target is the notes subdirectory within the folder
    let targetNotesDir = PathBuf::from(&targetFolderPath).join("notes");

    // Create target folder if it doesn't exist
    fs::create_dir_all(&targetNotesDir).map_err(|e| e.to_string())?;

    // Find next rank in target folder
    let existingNotes = scanNotesInFolder(&targetNotesDir);
    let nextRank = existingNotes.iter().map(|n| n.rank).max().unwrap_or(0) + 1;

    // Create new filename with new rank
    let newFilename = toFilename(nextRank, &note.slug, false);
    let newPath = targetNotesDir.join(&newFilename);

    println!("[moveNoteToFolder] Moving {} -> {}", note.path.display(), newPath.display());

    // Move the file
    fs::rename(&note.path, &newPath).map_err(|e| {
        println!("[moveNoteToFolder] ERROR: {}", e);
        e.to_string()
    })?;

    // Build and return updated NoteInfo
    let movedNote = Note {
        rank: nextRank,
        slug: note.slug.clone(),
        path: newPath,
        folderPath: targetNotesDir,
        frontmatter: note.frontmatter.clone(),
        content: note.content.clone(),
    };

    println!("[moveNoteToFolder] SUCCESS");
    Ok(NoteInfo::from(&movedNote))
}
