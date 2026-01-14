use std::fs;
use std::path::PathBuf;

use crate::storage::{StorageState, foldersDir, notesDir, tasksDir, toFilename, slugify, toMarkdown};
// Note: notesDir and tasksDir are used for root-level paths
use crate::models::{Note, NoteFrontmatter, Task, TaskFrontmatter, TaskStatus, Folder, FolderFrontmatter, FloatWindow};
use crate::commands::common::newId;
use crate::commands::note::{NoteInfo, scanNotesInFolder, scanAllNotes};
use crate::commands::task::{TaskInfo, scanTasksInFolder, scanAllTasks, scanTasksInStatus};
use crate::commands::folder::{FolderInfo, scanFolders};

// ============================================
// Notes API
// ============================================

pub fn get_notes(storage: &StorageState, folder_path: Option<&str>) -> Vec<NoteInfo> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Vec::new(),
    };

    let notes = match folder_path {
        Some(fp) if !fp.is_empty() => {
            // Scan the notes subdirectory within the specified folder
            let notesSubdir = PathBuf::from(fp).join("notes");
            scanNotesInFolder(&notesSubdir)
        }
        _ => {
            // Scan all notes across all folders
            scanAllNotes(&foldersDir(&wsPath))
        }
    };

    notes.iter().map(NoteInfo::from).collect()
}

pub fn get_note_by_id(storage: &StorageState, id: &str) -> Option<NoteInfo> {
    let wsPath = storage.getWorkspacePath()?;
    let notes = scanAllNotes(&foldersDir(&wsPath));
    notes.iter().find(|n| n.frontmatter.id == id).map(NoteInfo::from)
}

pub fn get_note_content(storage: &StorageState, id: &str) -> Option<String> {
    let wsPath = storage.getWorkspacePath()?;
    let notes = scanAllNotes(&foldersDir(&wsPath));
    notes.iter().find(|n| n.frontmatter.id == id).map(|n| n.content.clone())
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

    // If folder_path is provided, create notes in folder_path/notes/
    // Otherwise use the root workspace/folders/notes/
    let notesSubdir = match folder_path {
        Some(p) if !p.is_empty() && p != "null" && p.starts_with('/') => {
            PathBuf::from(p).join("notes")
        }
        _ => notesDir(&wsPath, ""),
    };

    fs::create_dir_all(&notesSubdir).map_err(|e| e.to_string())?;

    let existingNotes = scanNotesInFolder(&notesSubdir);
    let nextRank = existingNotes.iter().map(|n| n.rank).max().unwrap_or(0) + 1;

    let slug = slugify(title);
    let filename = toFilename(nextRank, &slug, false);
    let notePath = notesSubdir.join(&filename);

    let id = newId();
    let mut fm = NoteFrontmatter::new(id, title.to_string());
    if let Some(c) = color {
        fm.color = c.to_string();
    }
    if let Some(t) = tags {
        fm.tags = t.to_vec();
    }

    let body = content.unwrap_or_default().to_string();
    let file_content = toMarkdown(&fm, &body)?;
    fs::write(&notePath, file_content).map_err(|e| e.to_string())?;

    let note = Note {
        rank: nextRank,
        slug,
        path: notePath,
        folderPath: notesSubdir,
        frontmatter: fm,
        content: body,
    };

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
    let notes = scanAllNotes(&foldersDir(&wsPath));

    let note = notes.iter()
        .find(|n| n.frontmatter.id == id)
        .ok_or("Note not found")?;

    let mut fm = note.frontmatter.clone();
    let mut body = note.content.clone();

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

    let file_content = toMarkdown(&fm, &body)?;
    fs::write(&note.path, file_content).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn delete_note(storage: &StorageState, id: &str) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let notes = scanAllNotes(&foldersDir(&wsPath));

    let note = notes.iter()
        .find(|n| n.frontmatter.id == id)
        .ok_or("Note not found")?;

    fs::remove_file(&note.path).map_err(|e| e.to_string())
}

pub fn search_notes(storage: &StorageState, query: &str) -> Vec<NoteInfo> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Vec::new(),
    };

    let notes = scanAllNotes(&foldersDir(&wsPath));
    let query_lower = query.to_lowercase();

    notes.iter()
        .filter(|n| {
            n.frontmatter.title.to_lowercase().contains(&query_lower) ||
            n.content.to_lowercase().contains(&query_lower)
        })
        .map(NoteInfo::from)
        .collect()
}

// ============================================
// Tasks API
// ============================================

pub fn get_tasks(storage: &StorageState, folder_path: Option<&str>, status_filter: Option<&str>) -> Vec<TaskInfo> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Vec::new(),
    };

    let tasks = match folder_path {
        Some(fp) if !fp.is_empty() => {
            // Scan the tasks subdirectory within the specified folder
            let tasksSubdir = PathBuf::from(fp).join("tasks");
            scanTasksInFolder(&tasksSubdir)
        }
        _ => {
            // Scan all tasks across all folders
            scanAllTasks(&foldersDir(&wsPath))
        }
    };

    let filtered: Vec<_> = if let Some(status_str) = status_filter {
        let target_status = TaskStatus::fromFolder(status_str);
        tasks.into_iter().filter(|t| target_status.map(|s| t.status == s).unwrap_or(true)).collect()
    } else {
        tasks
    };

    filtered.iter().map(TaskInfo::from).collect()
}

pub fn get_task_by_id(storage: &StorageState, id: &str) -> Option<TaskInfo> {
    let wsPath = storage.getWorkspacePath()?;
    let tasks = scanAllTasks(&foldersDir(&wsPath));
    tasks.iter().find(|t| t.frontmatter.id == id).map(TaskInfo::from)
}

pub fn get_task_content(storage: &StorageState, id: &str) -> Option<String> {
    let wsPath = storage.getWorkspacePath()?;
    let tasks = scanAllTasks(&foldersDir(&wsPath));
    tasks.iter().find(|t| t.frontmatter.id == id).map(|t| t.content.clone())
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

    // If folder_path is provided, create tasks in folder_path/tasks/
    // Otherwise use the root workspace/folders/tasks/
    let tasksSubdir = match folder_path {
        Some(p) if !p.is_empty() && p != "null" && p.starts_with('/') => {
            PathBuf::from(p).join("tasks")
        }
        _ => tasksDir(&wsPath, ""),
    };

    let task_status = status
        .and_then(|s| TaskStatus::fromFolder(s))
        .unwrap_or(TaskStatus::Todo);

    let statusPath = tasksSubdir.join(task_status.folderName());
    fs::create_dir_all(&statusPath).map_err(|e| e.to_string())?;

    let existingTasks = scanTasksInStatus(&statusPath, &tasksSubdir, task_status);
    let nextRank = existingTasks.iter().map(|t| t.rank).max().unwrap_or(0) + 1;

    let slug = slugify(title);
    let filename = toFilename(nextRank, &slug, false);
    let taskPath = statusPath.join(&filename);

    let id = newId();
    let mut fm = TaskFrontmatter::new(id, title.to_string());
    if let Some(c) = color {
        fm.color = c.to_string();
    }
    if let Some(d) = due {
        fm.due = Some(d);
    }

    let body = content.unwrap_or_default().to_string();
    let file_content = toMarkdown(&fm, &body)?;
    fs::write(&taskPath, file_content).map_err(|e| e.to_string())?;

    let task = Task {
        rank: nextRank,
        slug,
        path: taskPath,
        folderPath: tasksSubdir,
        status: task_status,
        frontmatter: fm,
        content: body,
    };

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
    let tasks = scanAllTasks(&foldersDir(&wsPath));

    let task = tasks.iter()
        .find(|t| t.frontmatter.id == id)
        .ok_or("Task not found")?;

    let mut fm = task.frontmatter.clone();
    let mut body = task.content.clone();
    let mut newPath = task.path.clone();

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

    let file_content = toMarkdown(&fm, &body)?;

    if newPath != task.path {
        fs::remove_file(&task.path).map_err(|e| e.to_string())?;
    }
    fs::write(&newPath, file_content).map_err(|e| e.to_string())
}

pub fn delete_task(storage: &StorageState, id: &str) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let tasks = scanAllTasks(&foldersDir(&wsPath));

    let task = tasks.iter()
        .find(|t| t.frontmatter.id == id)
        .ok_or("Task not found")?;

    fs::remove_file(&task.path).map_err(|e| e.to_string())
}

// ============================================
// Folders API
// ============================================

pub fn get_folders(storage: &StorageState) -> Vec<FolderInfo> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Vec::new(),
    };

    let baseDir = foldersDir(&wsPath);
    let folders = scanFolders(&baseDir, None);
    folders.iter().map(FolderInfo::from).collect()
}

pub fn create_folder(
    storage: &StorageState,
    name: &str,
    parent_path: Option<&str>,
) -> Result<FolderInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    let baseDir = foldersDir(&wsPath);

    let parentDir = parent_path
        .map(PathBuf::from)
        .unwrap_or(baseDir.clone());

    let existingFolders = scanFolders(&parentDir, None);
    let nextRank = existingFolders.iter().map(|f| f.rank).max().unwrap_or(0) + 1;

    let slug = slugify(name);
    let folderName = toFilename(nextRank, &slug, true);
    let folderPath = parentDir.join(&folderName);

    fs::create_dir_all(&folderPath).map_err(|e| e.to_string())?;

    let id = newId();
    let fm = FolderFrontmatter::new(id.clone(), name.to_string());
    let content = toMarkdown(&fm, "")?;
    fs::write(folderPath.join(".folder.md"), content).map_err(|e| e.to_string())?;

    // Create notes/ and tasks/ subdirectories
    fs::create_dir_all(folderPath.join("notes")).map_err(|e| e.to_string())?;
    fs::create_dir_all(folderPath.join("tasks")).map_err(|e| e.to_string())?;
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
    let notes = scanAllNotes(&foldersDir(&wsPath));

    let note = notes.iter()
        .find(|n| n.frontmatter.id == id)
        .ok_or("Note not found")?;

    // Target is the notes subdirectory within the folder
    let targetNotesDir = PathBuf::from(target_folder_path).join("notes");
    fs::create_dir_all(&targetNotesDir).map_err(|e| e.to_string())?;

    let existingNotes = scanNotesInFolder(&targetNotesDir);
    let nextRank = existingNotes.iter().map(|n| n.rank).max().unwrap_or(0) + 1;

    let newFilename = toFilename(nextRank, &note.slug, false);
    let newPath = targetNotesDir.join(&newFilename);

    fs::rename(&note.path, &newPath).map_err(|e| e.to_string())?;

    let movedNote = Note {
        rank: nextRank,
        slug: note.slug.clone(),
        path: newPath,
        folderPath: targetNotesDir,
        frontmatter: note.frontmatter.clone(),
        content: note.content.clone(),
    };

    Ok(NoteInfo::from(&movedNote))
}

pub fn move_task_to_folder(storage: &StorageState, id: &str, target_folder_path: &str) -> Result<TaskInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let tasks = scanAllTasks(&foldersDir(&wsPath));

    let task = tasks.iter()
        .find(|t| t.frontmatter.id == id)
        .ok_or("Task not found")?;

    // Target is the tasks subdirectory within the folder
    let targetTasksDir = PathBuf::from(target_folder_path).join("tasks");
    let statusPath = targetTasksDir.join(task.status.folderName());
    fs::create_dir_all(&statusPath).map_err(|e| e.to_string())?;

    let existingTasks = scanTasksInStatus(&statusPath, &targetTasksDir, task.status);
    let nextRank = existingTasks.iter().map(|t| t.rank).max().unwrap_or(0) + 1;

    let newFilename = toFilename(nextRank, &task.slug, false);
    let newPath = statusPath.join(&newFilename);

    fs::rename(&task.path, &newPath).map_err(|e| e.to_string())?;

    let movedTask = Task {
        rank: nextRank,
        slug: task.slug.clone(),
        path: newPath,
        folderPath: targetTasksDir,
        status: task.status,
        frontmatter: task.frontmatter.clone(),
        content: task.content.clone(),
    };

    Ok(TaskInfo::from(&movedTask))
}
