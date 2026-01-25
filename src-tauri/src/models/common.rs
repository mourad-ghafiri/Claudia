// Common types for Claudia filesystem-based storage
// All fields use camelCase for consistency across Rust, TypeScript, and Markdown

use serde::{Deserialize, Serialize};

/// Floating window position and visibility
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FloatWindow {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub show: bool,
}

/// Task status - derived from folder name
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    #[default]
    Todo,
    Doing,
    Done,
}

impl TaskStatus {
    pub fn fromFolder(name: &str) -> Option<Self> {
        match name.to_lowercase().as_str() {
            "todo" => Some(Self::Todo),
            "doing" => Some(Self::Doing),
            "done" => Some(Self::Done),
            _ => None,
        }
    }

    pub fn folderName(&self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::Doing => "doing",
            Self::Done => "done",
        }
    }
}
