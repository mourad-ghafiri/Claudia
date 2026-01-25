// Task commands - complete implementation with encryption

use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::storage::{StorageState, tasksDir, foldersDir, parseUuidFilename, uuidFilename, parseFrontmatter, trashTasksDir};
use crate::encrypted_storage;
use crate::models::{Task, TaskFrontmatter, TaskStatus, FloatWindow};
use super::common::newId;

#[derive(serde::Serialize)]
pub struct TaskInfo {
    pub id: String,
    pub title: String,
    pub rank: u32,
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
        // e.g., /folders/{uuid} instead of /folders/{uuid}/tasks
        let folderPath = t.folderPath.parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        Self {
            id: t.frontmatter.id.clone(),
            title: t.frontmatter.title.clone(),
            rank: t.frontmatter.rank,
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

/// Process a single task file and return Task if valid
fn processTaskFile(path: &PathBuf, folderPath: &PathBuf, status: TaskStatus, masterPassword: Option<&str>) -> Option<Task> {
    let filename = path.file_name().and_then(|n| n.to_str())?;

    // Validate filename is a UUID (with .md extension)
    parseUuidFilename(filename)?;

    let content = fs::read_to_string(path).ok()?;

    // Check if file is encrypted
    if encrypted_storage::isEncryptedFormat(&content) {
        let password = masterPassword?;
        let encrypted = encrypted_storage::parseEncryptedFile(&content).ok()?;
        let yamlContent = encrypted_storage::decryptMetadata(&encrypted.metadata, password).ok()?;
        let fm: TaskFrontmatter = serde_yaml::from_str(&yamlContent).ok()?;

        Some(Task {
            path: path.clone(),
            folderPath: folderPath.clone(),
            status,
            frontmatter: fm,
            content: String::new(), // Content loaded on demand
        })
    } else {
        // Legacy unencrypted format
        let (fm, body) = parseFrontmatter::<TaskFrontmatter>(&content)?;
        Some(Task {
            path: path.clone(),
            folderPath: folderPath.clone(),
            status,
            frontmatter: fm,
            content: body,
        })
    }
}

/// Scan tasks in a status folder
pub(crate) fn scanTasksInStatus(statusPath: &PathBuf, folderPath: &PathBuf, status: TaskStatus, masterPassword: Option<&str>) -> Vec<Task> {
    if !statusPath.exists() {
        return Vec::new();
    }

    let mut tasks = Vec::new();

    let entries = fs::read_dir(statusPath);
    for entry in entries.into_iter().flatten().filter_map(|e| e.ok()) {
        let path = entry.path();

        // Skip hidden files and non-markdown
        if !path.is_file() || path.extension().map(|ext| ext != "md").unwrap_or(true) {
            continue;
        }
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }

        if let Some(task) = processTaskFile(&path, folderPath, status, masterPassword) {
            tasks.push(task);
        }
    }

    // Sort by rank stored in frontmatter
    tasks.sort_by_key(|t| t.frontmatter.rank);
    tasks
}

/// Scan all tasks in a project folder (scans all status subfolders)
pub(crate) fn scanTasksInFolder(folderPath: &PathBuf, masterPassword: Option<&str>) -> Vec<Task> {
    let mut allTasks = Vec::new();

    for status in [TaskStatus::Todo, TaskStatus::Doing, TaskStatus::Done] {
        let statusPath = folderPath.join(status.folderName());
        allTasks.extend(scanTasksInStatus(&statusPath, folderPath, status, masterPassword));
    }

    allTasks
}

/// Scan all tasks recursively from the folders directory
/// Looks for tasks in /tasks/ subdirectories within each folder
pub(crate) fn scanAllTasks(foldersBaseDir: &PathBuf, masterPassword: Option<&str>) -> Vec<Task> {
    let mut allTasks = Vec::new();

    // Tasks in root /folders/tasks/
    let rootTasksDir = foldersBaseDir.join("tasks");
    if rootTasksDir.exists() {
        allTasks.extend(scanTasksInFolder(&rootTasksDir, masterPassword));
    }

    // Scan all folders for their /tasks/ subdirectories
    scanTasksInFoldersRecursive(foldersBaseDir, &mut allTasks, masterPassword);

    allTasks
}

/// Helper to recursively scan folder tree for tasks subdirectories
fn scanTasksInFoldersRecursive(dir: &PathBuf, tasks: &mut Vec<Task>, masterPassword: Option<&str>) {
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
                    tasks.extend(scanTasksInFolder(&tasksSubdir, masterPassword));
                }

                // Recurse into subfolders
                scanTasksInFoldersRecursive(&path, tasks, masterPassword);
            }
        }
    }
}

#[tauri::command]
pub fn getTasks(storage: State<'_, StorageState>, folderPath: Option<String>, status: Option<String>) -> Result<Vec<TaskInfo>, String> {
    let wsPath = match storage.getWorkspacePath() {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    let tasks = match &folderPath {
        Some(fp) if !fp.is_empty() => {
            // Scan the tasks subdirectory within the specified folder
            let tasksSubdir = PathBuf::from(fp).join("tasks");
            scanTasksInFolder(&tasksSubdir, passwordRef)
        },
        _ => {
            // Scan all tasks across all folders
            scanAllTasks(&foldersDir(&wsPath), passwordRef)
        }
    };

    // Filter by status if provided
    let filteredTasks: Vec<_> = if let Some(statusStr) = status {
        let targetStatus = TaskStatus::fromFolder(&statusStr);
        tasks.into_iter().filter(|t| targetStatus.map(|s| t.status == s).unwrap_or(true)).collect()
    } else {
        tasks
    };

    storage.updateActivity();
    Ok(filteredTasks.iter().map(TaskInfo::from).collect())
}

#[tauri::command]
pub fn getTaskById(storage: State<'_, StorageState>, id: String) -> Result<Option<TaskInfo>, String> {
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

#[tauri::command]
pub fn getTaskContent(storage: State<'_, StorageState>, id: String) -> Result<String, String> {
    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Search in regular folders first
    let tasks = scanAllTasks(&foldersDir(&wsPath), Some(&masterPassword));
    let taskOpt = tasks.iter().find(|t| t.frontmatter.id == id);

    // If not found, check trash
    let trashTask;
    let task = if let Some(t) = taskOpt {
        t
    } else {
        // Scan all status folders in trash
        let trashTasksPath = trashTasksDir(&wsPath);
        let mut trashTasks = Vec::new();
        for status in [TaskStatus::Todo, TaskStatus::Doing, TaskStatus::Done] {
            let statusPath = trashTasksPath.join(status.folderName());
            if statusPath.exists() {
                trashTasks.extend(scanTasksInStatus(&statusPath, &trashTasksPath, status, Some(&masterPassword)));
            }
        }
        trashTask = trashTasks.into_iter().find(|t| t.frontmatter.id == id)
            .ok_or_else(|| "Task not found".to_string())?;
        &trashTask
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
    Ok(content)
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

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

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

    // Find next rank from existing tasks
    let existingTasks = scanTasksInStatus(&statusPath, &tasksBasePath, status, Some(&masterPassword));
    let nextRank = existingTasks.iter().map(|t| t.frontmatter.rank).max().unwrap_or(0) + 1;

    // UUID is the filename
    let id = newId();
    let filename = uuidFilename(&id);
    let taskPath = statusPath.join(&filename);

    let mut fm = TaskFrontmatter::new(id, input.title.clone(), nextRank);
    if let Some(color) = input.color {
        fm.color = color;
    }
    if let Some(due) = input.due {
        fm.due = Some(due);
    }

    let body = input.content.unwrap_or_default();

    // Encrypt and save
    let fileContent = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;
    fs::write(&taskPath, fileContent).map_err(|e| e.to_string())?;

    let task = Task {
        path: taskPath,
        folderPath: tasksBasePath,
        status,
        frontmatter: fm,
        content: body,
    };

    storage.updateActivity();
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

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Search in regular folders first
    let tasks = scanAllTasks(&foldersDir(&wsPath), Some(&masterPassword));
    let taskOpt = tasks.iter().find(|t| t.frontmatter.id == input.id);

    // If not found, check trash
    let trashTask;
    let task = if let Some(t) = taskOpt {
        t
    } else {
        // Scan all status folders in trash
        let trashTasksPath = trashTasksDir(&wsPath);
        let mut trashTasks = Vec::new();
        for status in [TaskStatus::Todo, TaskStatus::Doing, TaskStatus::Done] {
            let statusPath = trashTasksPath.join(status.folderName());
            if statusPath.exists() {
                trashTasks.extend(scanTasksInStatus(&statusPath, &trashTasksPath, status, Some(&masterPassword)));
            }
        }
        trashTask = trashTasks.into_iter().find(|t| t.frontmatter.id == input.id)
            .ok_or("Task not found")?;
        &trashTask
    };

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

    // Handle title change (filename no longer changes with title)
    if let Some(ref title) = input.title {
        fm.title = title.clone();
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

    // Handle status change (move file to different status folder)
    if statusChanged {
        let targetStatusPath = task.folderPath.join(targetStatus.folderName());
        fs::create_dir_all(&targetStatusPath).map_err(|e| e.to_string())?;

        // Same UUID filename, different status folder
        newPath = targetStatusPath.join(uuidFilename(&task.frontmatter.id));
        println!("[updateTask] Moving file to new status: {} -> {}", task.path.display(), newPath.display());
    }

    fm.updated = chrono::Utc::now().timestamp_millis();

    // Encrypt and save
    let content = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;

    // If path changed (status change), write to new location and remove old
    if newPath != task.path {
        fs::write(&newPath, &content).map_err(|e| e.to_string())?;
        fs::remove_file(&task.path).map_err(|e| e.to_string())?;
    } else {
        fs::write(&newPath, content).map_err(|e| e.to_string())?;
    }

    storage.updateActivity();
    Ok(())
}

#[tauri::command]
pub fn deleteTask(storage: State<'_, StorageState>, id: String, permanent: Option<bool>) -> Result<(), String> {
    println!("[deleteTask] Called with id: {}, permanent: {:?}", id, permanent);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword();
    let passwordRef = masterPassword.as_deref();

    // Search in regular folders first
    let tasks = scanAllTasks(&foldersDir(&wsPath), passwordRef);
    let taskOpt = tasks.iter().find(|t| t.frontmatter.id == id);

    // Track if item is in trash
    let isInTrash;
    let trashTask;
    let task = if let Some(t) = taskOpt {
        isInTrash = false;
        t
    } else {
        // Scan all status folders in trash
        let trashTasksPath = trashTasksDir(&wsPath);
        let mut trashTasks = Vec::new();
        for status in [TaskStatus::Todo, TaskStatus::Doing, TaskStatus::Done] {
            let statusPath = trashTasksPath.join(status.folderName());
            if statusPath.exists() {
                trashTasks.extend(scanTasksInStatus(&statusPath, &trashTasksPath, status, passwordRef));
            }
        }
        trashTask = trashTasks.into_iter().find(|t| t.frontmatter.id == id)
            .ok_or("Task not found")?;
        isInTrash = true;
        &trashTask
    };
    println!("[deleteTask] Found task at: {} (in trash: {})", task.path.display(), isInTrash);

    // If item is in trash, always permanently delete
    if permanent.unwrap_or(false) || isInTrash {
        // Permanent delete
        fs::remove_file(&task.path).map_err(|e| e.to_string())?;
        println!("[deleteTask] SUCCESS - permanently deleted");
    } else {
        // Move to trash - preserve status folder structure
        let trashDir = trashTasksDir(&wsPath);
        let statusDir = trashDir.join(task.status.folderName());
        fs::create_dir_all(&statusDir).map_err(|e| e.to_string())?;

        let trashPath = statusDir.join(task.path.file_name().ok_or("Invalid file name")?);
        fs::rename(&task.path, &trashPath).map_err(|e| {
            println!("[deleteTask] ERROR moving to trash: {}", e);
            e.to_string()
        })?;
        println!("[deleteTask] SUCCESS - moved to trash at: {}", trashPath.display());
    }

    storage.updateActivity();
    Ok(())
}

#[tauri::command]
pub fn moveTaskToFolder(storage: State<'_, StorageState>, id: String, targetFolderPath: String) -> Result<TaskInfo, String> {
    println!("[moveTaskToFolder] Called with id: {}, targetFolderPath: {}", id, targetFolderPath);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Search in regular folders first
    let tasks = scanAllTasks(&foldersDir(&wsPath), Some(&masterPassword));
    let taskOpt = tasks.iter().find(|t| t.frontmatter.id == id);

    // If not found, check trash
    let trashTask;
    let task = if let Some(t) = taskOpt {
        t
    } else {
        // Scan all status folders in trash
        let trashTasksPath = trashTasksDir(&wsPath);
        let mut trashTasks = Vec::new();
        for status in [TaskStatus::Todo, TaskStatus::Doing, TaskStatus::Done] {
            let statusPath = trashTasksPath.join(status.folderName());
            if statusPath.exists() {
                trashTasks.extend(scanTasksInStatus(&statusPath, &trashTasksPath, status, Some(&masterPassword)));
            }
        }
        trashTask = trashTasks.into_iter().find(|t| t.frontmatter.id == id)
            .ok_or("Task not found")?;
        &trashTask
    };
    println!("[moveTaskToFolder] Found task at: {}", task.path.display());

    // Target is the tasks subdirectory within the folder
    let targetTasksDir = PathBuf::from(&targetFolderPath).join("tasks");

    // Ensure target folder and status subfolder exist
    let statusPath = targetTasksDir.join(task.status.folderName());
    fs::create_dir_all(&statusPath).map_err(|e| e.to_string())?;

    // Find next rank in target status folder
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
    fs::remove_file(&task.path).map_err(|e| {
        println!("[moveTaskToFolder] ERROR removing old file: {}", e);
        e.to_string()
    })?;

    println!("[moveTaskToFolder] Moved {} -> {}", task.path.display(), newPath.display());

    // Build and return updated TaskInfo
    let movedTask = Task {
        path: newPath,
        folderPath: targetTasksDir,
        status: task.status,
        frontmatter: fm,
        content: body,
    };

    println!("[moveTaskToFolder] SUCCESS");
    storage.updateActivity();
    Ok(TaskInfo::from(&movedTask))
}

#[derive(serde::Deserialize)]
pub struct ReorderTasksInput {
    pub folderPath: String,
    pub status: String,
    pub taskIds: Vec<String>,
}

#[tauri::command]
pub fn reorderTasks(storage: State<'_, StorageState>, input: ReorderTasksInput) -> Result<(), String> {
    println!("[reorderTasks] Called with folderPath: {}, status: {}", input.folderPath, input.status);
    println!("[reorderTasks] Task IDs to reorder: {:?}", input.taskIds);

    let wsPath = storage.getWorkspacePath().ok_or("No workspace")?;

    if !storage.isUnlocked() {
        return Err("Vault is locked".to_string());
    }

    let masterPassword = storage.getMasterPassword().ok_or("No master password")?;

    // Parse the status
    let status = TaskStatus::fromFolder(&input.status).ok_or("Invalid status")?;

    // Determine the tasks directory
    // If folderPath is provided, tasks are in {folderPath}/tasks/{status}/
    // If empty, tasks are in the root tasks folder
    let tasksDirPath = if input.folderPath.is_empty() {
        tasksDir(&wsPath, "")
    } else {
        PathBuf::from(&input.folderPath).join("tasks")
    };

    let statusPath = tasksDirPath.join(status.folderName());
    println!("[reorderTasks] Scanning tasks in: {:?}", statusPath);

    let tasks = scanTasksInStatus(&statusPath, &tasksDirPath, status, Some(&masterPassword));
    println!("[reorderTasks] Found {} tasks", tasks.len());

    // Update rank in frontmatter instead of renaming files
    for (index, taskId) in input.taskIds.iter().enumerate() {
        if let Some(task) = tasks.iter().find(|t| t.frontmatter.id == *taskId) {
            let newRank = (index + 1) as u32;

            // Only update if rank changed
            if task.frontmatter.rank != newRank {
                println!("[reorderTasks] Updating rank for {} from {} to {}", taskId, task.frontmatter.rank, newRank);
                let mut fm = task.frontmatter.clone();
                fm.rank = newRank;

                // Get content from file
                let fileContent = fs::read_to_string(&task.path)
                    .map_err(|e| format!("Failed to read file: {}", e))?;

                let body = if encrypted_storage::isEncryptedFormat(&fileContent) {
                    let encrypted = encrypted_storage::parseEncryptedFile(&fileContent)?;
                    encrypted_storage::decryptContent(&encrypted.content, &masterPassword)?
                } else {
                    task.content.clone()
                };

                let content = encrypted_storage::serializeAndEncrypt(&fm, &body, &masterPassword)?;
                fs::write(&task.path, content).map_err(|e| {
                    println!("[reorderTasks] ERROR: {}", e);
                    e.to_string()
                })?;
            }
        }
    }
    println!("[reorderTasks] SUCCESS");
    storage.updateActivity();
    Ok(())
}
