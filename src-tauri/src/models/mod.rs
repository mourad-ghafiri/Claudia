// Models module for Claudia filesystem-based storage
// All fields use camelCase for consistency

pub mod common;
pub mod config;
pub mod folder;
pub mod note;
pub mod password;
pub mod task;

pub use common::{FloatWindow, TaskStatus};
pub use config::{Settings, SettingsOverride, WorkspaceEntry};
pub use folder::{Folder, FolderFrontmatter};
pub use note::{Note, NoteFrontmatter};
pub use password::{Password, PasswordFrontmatter, PasswordContent};
pub use task::{Task, TaskFrontmatter};

