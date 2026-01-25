// Note model for filesystem-based storage
// UUID for stable ID and filename, rank in frontmatter for ordering

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use super::common::FloatWindow;

/// Note frontmatter (YAML header in .md file)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteFrontmatter {
    pub id: String,  // UUID - stable identifier (also used as filename)
    pub title: String,
    #[serde(default)]
    pub rank: u32,   // For ordering within folder
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created: i64,
    pub updated: i64,
    #[serde(default)]
    pub float: FloatWindow,
}

impl NoteFrontmatter {
    pub fn new(id: String, title: String, rank: u32) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        Self {
            id,
            title,
            rank,
            color: "#6B9F78".to_string(),
            pinned: false,
            tags: Vec::new(),
            created: now,
            updated: now,
            float: FloatWindow::default(),
        }
    }
}

/// Full note with parsed data and filesystem info
#[derive(Debug, Clone)]
pub struct Note {
    pub path: PathBuf,       // Full path to .md file
    pub folderPath: PathBuf, // Parent folder path
    pub frontmatter: NoteFrontmatter,
    pub content: String,     // Body content (after frontmatter)
}

#[allow(dead_code)] // Public API methods for model consistency
impl Note {
    /// Get the stable ID (UUID from frontmatter)
    pub fn id(&self) -> &str {
        &self.frontmatter.id
    }

    /// Get the title
    pub fn title(&self) -> &str {
        &self.frontmatter.title
    }
}
