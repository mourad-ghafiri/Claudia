// Folder model for filesystem-based storage
// Optional .folder.md for metadata, UUID for stable ID

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Folder frontmatter (YAML header in .folder.md)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderFrontmatter {
    pub id: String,  // UUID - stable identifier
    pub name: String,
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
    pub fn new(id: String, name: String) -> Self {
        Self {
            id,
            name,
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
    pub rank: u32,           // From folder name prefix (e.g., 000001)
    pub slug: String,        // From folder name (e.g., "my-project")
    pub path: PathBuf,       // Full path to folder
    pub parentPath: Option<PathBuf>, // Parent folder path (None for root)
    pub frontmatter: Option<FolderFrontmatter>, // From .folder.md (optional)
    pub children: Vec<Folder>, // Nested folders
}

impl Folder {
    /// Get the stable ID (UUID from frontmatter, or generate from path)
    pub fn id(&self) -> String {
        self.frontmatter.as_ref()
            .map(|f| f.id.clone())
            .unwrap_or_else(|| {
                // Fallback: use path hash as ID
                format!("{:x}", md5_hash(&self.path.to_string_lossy()))
            })
    }

    /// Get the name (from frontmatter or slug)
    pub fn name(&self) -> String {
        self.frontmatter.as_ref()
            .map(|f| f.name.clone())
            .unwrap_or_else(|| self.slug.clone())
    }
}

/// Simple hash for fallback ID generation
fn md5_hash(s: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}
