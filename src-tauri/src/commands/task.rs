// Task commands - complete implementation

use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::storage::{StorageState, tasksDir, foldersDir, parseFilename, toFilename, slugify, parseFrontmatter, toMarkdown};
use crate::models::{Task, TaskFrontmatter, TaskStatus, FloatWindow};
use super::common::newId;

#[derive(serde::Serialize)]
pub struct TaskInfo {
    pub id: String,
    pub title: String,
    pub rank: u32,
    pub slug: String,
    pub status: TaskStatus,
    pub color: String,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub due: Option<i64>,
    pub created: i64,
    pub updated: i64,
    pub folderPath: String,
    pub path: String,
    pub float: FloatWindow,
}

impl From<&Task> for TaskInfo {
    fn from(t: &Task) -> Self {
        // folderPath should be the parent folder, not the /tasks subdirectory
        // e.g., /folders/000001-work instead of /folders/000001-work/tasks
        let folderPath = t.folderPath.parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        Self {
            id: t.frontmatter.id.clone(),
            title: t.frontmatter.title.clone(),
            rank: t.rank,
            slug: t.slug.clone(),
            status: t.status,
            color: t.frontmatter.color.clone(),
            pinned: t.frontmatter.pinned,
            tags: t.frontmatter.tags.clone(),
            due: t.frontmatter.due,
            created: t.frontmatter.created,
            updated: t.frontmatter.updated,
            folderPath,
            path: t.path.to_string_lossy().to_string(),
            float: t.frontmatter.float.clone(),
        }
    }
}

/// Scan tasks in a status folder
pub(crate) fn scanTasksInStatus(statusPath: &PathBuf, folderPath: &PathBuf, status: TaskStatus) -> Vec<Task> {
    let mut tasks = Vec::new();

    if !statusPath.exists() {
        return tasks;
    }

    let entries: Vec<_> = fs::read_dir(statusPath)
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
                if let Some((fm, body)) = parseFrontmatter::<TaskFrontmatter>(&content) {
                    tasks.push(Task {
                        rank,
                        slug,
                        path: path.clone(),
                        folderPath: folderPath.clone(),
                        status,
                        frontmatter: fm,
                        content: body,
                    });
                }
            }
        }
    }

    tasks.sort_by_key(|t| t.rank);
    tasks
}

/// Scan all tasks in a project folder (scans all status subfolders)
pub(crate) fn scanTasksInFolder(folderPath: &PathBuf) -> Vec<Task> {
    let mut allTasks = Vec::new();

    for status in [TaskStatus::Todo, TaskStatus::Doing, TaskStatus::Done, TaskStatus::Archived] {
        let statusPath = folderPath.join(status.folderName());
        allTasks.extend(scanTasksInStatus(&statusPath, folderPath, status));
    }

    allTasks
}

/// Scan all tasks recursively from the folders directory
/// Looks for tasks in /tasks/ subdirectories within each folder
pub(crate) fn scanAllTasks(foldersBaseDir: &PathBuf) -> Vec<Task> {
    let mut allTasks = Vec::new();

    // Tasks in root /folders/tasks/
    let rootTasksDir = foldersBaseDir.join("tasks");
    if rootTasksDir.exists() {
        allTasks.extend(scanTasksInFolder(&rootTasksDir));
    }

    // Scan all folders for their /tasks/ subdirectories
    scanTasksInFoldersRecursive(foldersBaseDir, &mut allTasks);

    allTasks
}

/// Helper to recursively scan folder tree for tasks subdirectories
fn scanTasksInFoldersRecursive(dir: &PathBuf, tasks: &mut Vec<Task>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let filename = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

            // Skip hidden files and special directories
            if filename.starts_with('.') || filename == "notes" || filename == "tasks" {
                continue;
            }

            if path.is_dir() {
                // Check if this folder has a tasks subdirectory
                let tasksSubdir = path.join("tasks");
                if tasksSubdir.exists() && tasksSubdir.is_dir() {
                    tasks.extend(scanTasksInFolder(&tasksSubdir));
                }

                // Recurse into subfolders
                scanTasksInFoldersRecursive(&path, tasks);
            }
        }
    }
}

#[tauri::command]
pub fn getTasks(storage: State<'_, StorageState>, folderPath: Option<String>, status: Option<String>) -> Vec<TaskInfo> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Vec::new(),
    };

    let tasks = match &folderPath {
        Some(fp) if !fp.is_empty() => {
            // Scan the tasks subdirectory within the specified folder
            let tasksSubdir = PathBuf::from(fp).join("tasks");
            scanTasksInFolder(&tasksSubdir)
        },
        _ => {
            // Scan all tasks across all folders
            scanAllTasks(&foldersDir(&wsPath))
        }
    };

    // Filter by status if provided
    let filteredTasks: Vec<_> = if let Some(statusStr) = status {
        let targetStatus = TaskStatus::fromFolder(&statusStr);
        tasks.into_iter().filter(|t| targetStatus.map(|s| t.status == s).unwrap_or(true)).collect()
    } else {
        tasks
    };

    filteredTasks.iter().map(TaskInfo::from).collect()
}

#[tauri::command]
pub fn getTaskById(storage: State<'_, StorageState>, id: String) -> Option<TaskInfo> {
    let wsPath = storage.getWorkspacePath()?;
    let tasks = scanAllTasks(&foldersDir(&wsPath));
    tasks.iter().find(|t| t.frontmatter.id == id).map(TaskInfo::from)
}

#[tauri::command]
pub fn getTaskContent(storage: State<'_, StorageState>, id: String) -> Result<String, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let tasks = scanAllTasks(&foldersDir(&wsPath));
    tasks.iter()
        .find(|t| t.frontmatter.id == id)
        .map(|t| t.content.clone())
        .ok_or_else(|| "Task not found".to_string())
}

#[derive(serde::Deserialize)]
pub struct CreateTaskInput {
    pub title: String,
    pub folderPath: Option<String>,
    pub status: Option<String>,
    pub content: Option<String>,
    pub color: Option<String>,
    pub due: Option<i64>,
}

#[tauri::command]
pub fn createTask(storage: State<'_, StorageState>, input: CreateTaskInput) -> Result<TaskInfo, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace selected")?;

    println!("[createTask] Received folderPath: {:?}", input.folderPath);
    println!("[createTask] Workspace path: {}", wsPath);

    // If folderPath is provided, create tasks in folderPath/tasks/
    // Otherwise use the root workspace/folders/tasks/
    let tasksBasePath = match &input.folderPath {
        Some(p) if !p.is_empty() && p != "null" && p.starts_with('/') => {
            // Create tasks in the folder's tasks subdirectory
            PathBuf::from(p).join("tasks")
        }
        _ => tasksDir(&wsPath, ""),
    };

    println!("[createTask] Using tasksBasePath: {:?}", tasksBasePath);
    let status = input.status
        .and_then(|s| TaskStatus::fromFolder(&s))
        .unwrap_or(TaskStatus::Todo);

    let statusPath = tasksBasePath.join(status.folderName());
    fs::create_dir_all(&statusPath).map_err(|e| e.to_string())?;

    // Find next rank
    let existingTasks = scanTasksInStatus(&statusPath, &tasksBasePath, status);
    let nextRank = existingTasks.iter().map(|t| t.rank).max().unwrap_or(0) + 1;

    let slug = slugify(&input.title);
    let filename = toFilename(nextRank, &slug, false);
    let taskPath = statusPath.join(&filename);

    let id = newId();
    let mut fm = TaskFrontmatter::new(id, input.title.clone());
    if let Some(color) = input.color {
        fm.color = color;
    }
    if let Some(due) = input.due {
        fm.due = Some(due);
    }

    let body = input.content.unwrap_or_default();
    let content = toMarkdown(&fm, &body)?;
    fs::write(&taskPath, content).map_err(|e| e.to_string())?;

    let task = Task {
        rank: nextRank,
        slug,
        path: taskPath,
        folderPath: tasksBasePath,
        status,
        frontmatter: fm,
        content: body,
    };

    Ok(TaskInfo::from(&task))
}

#[derive(serde::Deserialize)]
pub struct UpdateTaskInput {
    pub id: String,
    pub title: Option<String>,
    pub status: Option<String>,
    pub content: Option<String>,
    pub color: Option<String>,
    pub pinned: Option<bool>,
    pub tags: Option<Vec<String>>,
    pub due: Option<i64>,
    pub float: Option<FloatWindow>,
}

#[tauri::command]
pub fn updateTask(storage: State<'_, StorageState>, input: UpdateTaskInput) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let tasks = scanAllTasks(&foldersDir(&wsPath));

    let task = tasks.iter()
        .find(|t| t.frontmatter.id == input.id)
        .ok_or("Task not found")?;

    let mut fm = task.frontmatter.clone();
    let mut body = task.content.clone();
    let mut newPath = task.path.clone();
    let mut newSlug = task.slug.clone();

    // Handle title change - also update the slug for filename
    if let Some(ref title) = input.title {
        fm.title = title.clone();
        newSlug = slugify(title);
    }
    if let Some(content) = input.content {
        body = content;
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
    if let Some(due) = input.due {
        fm.due = Some(due);
    }
    if let Some(float) = input.float {
        fm.float = float;
    }

    // Determine the target status folder
    let targetStatus = input.status
        .as_ref()
        .and_then(|s| TaskStatus::fromFolder(s))
        .unwrap_or(task.status);

    let statusChanged = targetStatus != task.status;
    let slugChanged = newSlug != task.slug;

    // Handle status change and/or title change (move/rename file)
    if statusChanged || slugChanged {
        let targetStatusPath = if statusChanged {
            task.folderPath.join(targetStatus.folderName())
        } else {
            task.path.parent().unwrap().to_path_buf()
        };

        fs::create_dir_all(&targetStatusPath).map_err(|e| e.to_string())?;

        let newFilename = toFilename(task.rank, &newSlug, false);
        newPath = targetStatusPath.join(&newFilename);

        println!("[updateTask] Renaming/moving file: {} -> {}", task.path.display(), newPath.display());
    }

    fm.updated = chrono::Utc::now().timestamp_millis();

    let content = toMarkdown(&fm, &body)?;

    // If path changed, remove old and write new
    if newPath != task.path {
        fs::remove_file(&task.path).map_err(|e| e.to_string())?;
    }
    fs::write(&newPath, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn deleteTask(storage: State<'_, StorageState>, id: String) -> Result<(), String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let tasks = scanAllTasks(&foldersDir(&wsPath));

    let task = tasks.iter()
        .find(|t| t.frontmatter.id == id)
        .ok_or("Task not found")?;

    fs::remove_file(&task.path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn moveTaskToFolder(storage: State<'_, StorageState>, id: String, targetFolderPath: String) -> Result<TaskInfo, String> {
    println!("[moveTaskToFolder] Called with id: {}, targetFolderPath: {}", id, targetFolderPath);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;
    let tasks = scanAllTasks(&foldersDir(&wsPath));

    let task = tasks.iter()
        .find(|t| t.frontmatter.id == id)
        .ok_or("Task not found")?;
    println!("[moveTaskToFolder] Found task at: {}", task.path.display());

    // Target is the tasks subdirectory within the folder
    let targetTasksDir = PathBuf::from(&targetFolderPath).join("tasks");

    // Ensure target folder and status subfolder exist
    let statusPath = targetTasksDir.join(task.status.folderName());
    fs::create_dir_all(&statusPath).map_err(|e| e.to_string())?;

    // Find next rank in target status folder
    let existingTasks = scanTasksInStatus(&statusPath, &targetTasksDir, task.status);
    let nextRank = existingTasks.iter().map(|t| t.rank).max().unwrap_or(0) + 1;

    // Create new filename with new rank
    let newFilename = toFilename(nextRank, &task.slug, false);
    let newPath = statusPath.join(&newFilename);

    println!("[moveTaskToFolder] Moving {} -> {}", task.path.display(), newPath.display());

    // Move the file
    fs::rename(&task.path, &newPath).map_err(|e| {
        println!("[moveTaskToFolder] ERROR: {}", e);
        e.to_string()
    })?;

    // Build and return updated TaskInfo
    let movedTask = Task {
        rank: nextRank,
        slug: task.slug.clone(),
        path: newPath,
        folderPath: targetTasksDir,
        status: task.status,
        frontmatter: task.frontmatter.clone(),
        content: task.content.clone(),
    };

    println!("[moveTaskToFolder] SUCCESS");
    Ok(TaskInfo::from(&movedTask))
}
