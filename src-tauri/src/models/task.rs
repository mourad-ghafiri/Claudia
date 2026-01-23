// Task model for filesystem-based storage
// UUID for stable ID, rank prefix for ordering, status from folder

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use super::common::{FloatWindow, TaskStatus};

/// Task frontmatter (YAML header in .md file)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskFrontmatter {
    pub id: String,  // UUID - stable identifier
    pub title: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due: Option<i64>,
    pub created: i64,
    pub updated: i64,
    #[serde(default)]
    pub float: FloatWindow,
}

impl TaskFrontmatter {
    pub fn new(id: String, title: String) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        Self {
            id,
            title,
            color: "#3B82F6".to_string(),
            pinned: false,
            tags: Vec::new(),
            due: None,
            created: now,
            updated: now,
            float: FloatWindow::default(),
        }
    }
}

/// Full task with parsed data and filesystem info
#[derive(Debug, Clone)]
pub struct Task {
    pub rank: u32,           // From filename prefix (e.g., 000001)
    pub slug: String,        // From filename (e.g., "my-task")
    pub path: PathBuf,       // Full path to .md file
    pub folderPath: PathBuf, // Parent folder (project folder, not status)
    pub status: TaskStatus,  // Derived from parent folder name
    pub frontmatter: TaskFrontmatter,
    pub content: String,     // Body content (after frontmatter)
}

#[allow(dead_code)] // Public API methods for model consistency
impl Task {
    /// Get the stable ID (UUID from frontmatter)
    pub fn id(&self) -> &str {
        &self.frontmatter.id
    }

    /// Get the title
    pub fn title(&self) -> &str {
        &self.frontmatter.title
    }
}
