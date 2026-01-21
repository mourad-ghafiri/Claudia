// Template model for filesystem-based storage
// Templates are stored in ~/.claudia/templates/notes/ and ~/.claudia/templates/tasks/
// Each template is a folder containing template.md and assets/

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Template type - note or task
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TemplateType {
    Note,
    Task,
}

impl TemplateType {
    pub fn folderName(&self) -> &'static str {
        match self {
            Self::Note => "notes",
            Self::Task => "tasks",
        }
    }

    pub fn fromStr(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "note" | "notes" => Some(Self::Note),
            "task" | "tasks" => Some(Self::Task),
            _ => None,
        }
    }
}

/// Template frontmatter (YAML header in template.md file)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateFrontmatter {
    pub id: String,           // UUID - stable identifier
    pub name: String,         // Display name
    pub description: String,  // Short description
    #[serde(default)]
    pub category: String,     // Category (basic, productivity, planning, documentation, learning)
    #[serde(default)]
    pub icon: String,         // Lucide icon name
    #[serde(default)]
    pub color: String,        // Accent color
    #[serde(default)]
    pub order: u32,           // Display order (lower = first)
}

impl TemplateFrontmatter {
    pub fn new(id: String, name: String, description: String) -> Self {
        Self {
            id,
            name,
            description,
            category: "basic".to_string(),
            icon: "FileText".to_string(),
            color: "#B5AFA6".to_string(),
            order: 100,
        }
    }
}

/// Full template with parsed data and filesystem info
#[derive(Debug, Clone)]
pub struct Template {
    pub slug: String,              // Folder name (e.g., "meeting-notes")
    pub path: PathBuf,             // Full path to template folder
    pub templatePath: PathBuf,     // Path to template.md
    pub assetsPath: PathBuf,       // Path to assets folder
    pub templateType: TemplateType,
    pub frontmatter: TemplateFrontmatter,
    pub content: String,           // Body content (after frontmatter)
}

impl Template {
    pub fn id(&self) -> &str {
        &self.frontmatter.id
    }

    pub fn name(&self) -> &str {
        &self.frontmatter.name
    }
}
