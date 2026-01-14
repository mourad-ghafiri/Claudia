// Password model for filesystem-based storage
// UUID for stable ID, rank prefix for ordering
// All sensitive content is encrypted with master password

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Password frontmatter (YAML header in .md file)
/// Only non-sensitive metadata - all credentials are encrypted in body
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordFrontmatter {
    pub id: String,  // UUID - stable identifier
    pub title: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created: i64,
    pub updated: i64,
}

impl PasswordFrontmatter {
    pub fn new(id: String, title: String) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        Self {
            id,
            title,
            color: "#DA7756".to_string(),
            pinned: false,
            tags: Vec::new(),
            created: now,
            updated: now,
        }
    }
}

/// Encrypted content structure (serialized to JSON then encrypted)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PasswordContent {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub notes: String,
}

/// Full password with parsed data and filesystem info
#[derive(Debug, Clone)]
pub struct Password {
    pub rank: u32,
    pub slug: String,
    pub path: PathBuf,
    pub folderPath: PathBuf,
    pub frontmatter: PasswordFrontmatter,
    pub encryptedContent: String,
}

impl Password {
    pub fn id(&self) -> &str {
        &self.frontmatter.id
    }

    pub fn title(&self) -> &str {
        &self.frontmatter.title
    }
}
