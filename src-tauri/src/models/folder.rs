// Folder model for filesystem-based storage
// UUID for stable ID and directory name, rank in frontmatter for ordering

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Folder frontmatter (YAML header in .folder.md)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderFrontmatter {
    pub id: String,  // UUID - stable identifier (also used as directory name)
    pub name: String,
    #[serde(default)]
    pub rank: u32,   // For ordering within parent
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default = "default_folder_color")]
    pub color: String,
    #[serde(default)]
    pub icon: String,
}

fn default_folder_color() -> String {
    "#6B7280".to_string()
}

impl FolderFrontmatter {
    pub fn new(id: String, name: String, rank: u32) -> Self {
        Self {
            id,
            name,
            rank,
            pinned: false,
            favorite: false,
            color: default_folder_color(),
            icon: String::new(),
        }
    }
}

/// Full folder with parsed data and filesystem info
#[derive(Debug, Clone)]
pub struct Folder {
    pub path: PathBuf,       // Full path to folder
    pub parentPath: Option<PathBuf>, // Parent folder path (None for root)
    pub frontmatter: FolderFrontmatter, // From .folder.md (required)
    pub children: Vec<Folder>, // Nested folders
}

