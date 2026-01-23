// MCP Tools implementation using official rmcp SDK

use rmcp::{
    ErrorData as McpError,
    model::*,
    tool, tool_router,
    handler::server::tool::ToolRouter,
    handler::server::wrapper::Parameters,
};
use serde::Deserialize;
use schemars::JsonSchema;
use tauri::Emitter;

use crate::storage::StorageState;
use crate::mcp::api;

/// Claudia MCP Server - provides tools for notes, tasks, and folders
#[derive(Clone)]
pub struct ClaudiaServer {
    pub storage: StorageState,
    pub app_handle: tauri::AppHandle,
    tool_router: ToolRouter<Self>,
}

impl ClaudiaServer {
    pub fn new(storage: StorageState, app_handle: tauri::AppHandle) -> Self {
        Self {
            storage,
            app_handle,
            tool_router: Self::tool_router(),
        }
    }
}

// Implement ServerHandler - delegates tool calls to the tool_router
impl rmcp::handler::server::ServerHandler for ClaudiaServer {
    fn get_info(&self) -> rmcp::model::ServerInfo {
        let mut info = rmcp::model::ServerInfo::default();
        info.instructions = Some("Claudia MCP Server - manage notes, tasks, and folders".into());
        info
    }
    
    fn initialize(
        &self,
        _request: rmcp::model::InitializeRequestParam,
        _context: rmcp::service::RequestContext<rmcp::service::RoleServer>,
    ) -> impl std::future::Future<Output = Result<rmcp::model::InitializeResult, McpError>> + Send + '_ {
        async move {
            println!("[MCP] Initialize called");
            let mut result = rmcp::model::InitializeResult::default();
            result.capabilities.tools = Some(rmcp::model::ToolsCapability {
                list_changed: Some(false),
            });
            result.server_info.name = "claudia".into();
            result.server_info.version = "0.1.0".into();
            result.instructions = Some("Claudia MCP Server - manage notes, tasks, and folders".into());
            Ok(result)
        }
    }

    fn list_tools(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParam>,
        _context: rmcp::service::RequestContext<rmcp::service::RoleServer>,
    ) -> impl std::future::Future<Output = Result<rmcp::model::ListToolsResult, McpError>> + Send + '_ {
        async move {
            let tools = self.tool_router.list_all();
            println!("[MCP] list_tools called, found {} tools", tools.len());
            for tool in &tools {
                println!("[MCP]   - {}", tool.name);
            }
            Ok(rmcp::model::ListToolsResult {
                tools,
                next_cursor: None,
                meta: None,
            })
        }
    }

    fn call_tool(
        &self,
        request: rmcp::model::CallToolRequestParam,
        context: rmcp::service::RequestContext<rmcp::service::RoleServer>,
    ) -> impl std::future::Future<Output = Result<CallToolResult, McpError>> + Send + '_ {
        async move {
            let tool_context = rmcp::handler::server::tool::ToolCallContext::new(self, request, context);
            self.tool_router.call(tool_context).await
        }
    }
}

// ============================================
// Tool Input Types
// ============================================

#[derive(Deserialize, JsonSchema)]
pub struct FolderPathInput {
    #[serde(rename = "folderPath")]
    pub folder_path: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
pub struct IdInput {
    pub id: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct CreateNoteInput {
    pub title: String,
    pub content: Option<String>,
    #[serde(rename = "folderPath")]
    pub folder_path: Option<String>,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Deserialize, JsonSchema)]
pub struct UpdateNoteInput {
    pub id: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Deserialize, JsonSchema)]
pub struct CreateTaskInput {
    pub title: String,
    pub content: Option<String>,
    pub status: Option<String>,
    #[serde(rename = "folderPath")]
    pub folder_path: Option<String>,
    pub color: Option<String>,
    pub due: Option<i64>,
}

#[derive(Deserialize, JsonSchema)]
pub struct UpdateTaskInput {
    pub id: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub status: Option<String>,
    pub color: Option<String>,
    pub due: Option<i64>,
}

#[derive(Deserialize, JsonSchema)]
pub struct TasksFilterInput {
    #[serde(rename = "folderPath")]
    pub folder_path: Option<String>,
    pub status: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
pub struct SearchInput {
    pub query: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct CreateFolderInput {
    pub name: String,
    #[serde(rename = "parentPath")]
    pub parent_path: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
pub struct DeleteFolderInput {
    pub path: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct MoveInput {
    pub id: String,
    #[serde(rename = "targetFolderPath")]
    pub target_folder_path: String,
}

// ============================================
// Tool Implementations
// ============================================

#[tool_router]
impl ClaudiaServer {
    // --- Notes ---
    
    #[tool(description = "List all notes, optionally filtered by folder")]
    async fn list_notes(&self, input: Parameters<FolderPathInput>) -> Result<CallToolResult, McpError> {
        let notes = api::get_notes(&self.storage, input.0.folder_path.as_deref());
        let json = serde_json::to_string_pretty(&notes).unwrap_or_else(|_| "[]".to_string());
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Get a specific note by ID, including its content")]
    async fn get_note(&self, input: Parameters<IdInput>) -> Result<CallToolResult, McpError> {
        let note = api::get_note_by_id(&self.storage, &input.0.id)
            .ok_or_else(|| McpError::invalid_params(format!("Note not found: {}", input.0.id), None))?;
        let content = api::get_note_content(&self.storage, &input.0.id).unwrap_or_default();
        let result = serde_json::json!({ "note": note, "content": content });
        Ok(CallToolResult::success(vec![Content::text(serde_json::to_string_pretty(&result).unwrap())]))
    }

    #[tool(description = "Create a new note")]
    async fn create_note(&self, input: Parameters<CreateNoteInput>) -> Result<CallToolResult, McpError> {
        let note = api::create_note(
            &self.storage,
            &input.0.title,
            input.0.content.as_deref(),
            input.0.folder_path.as_deref(),
            input.0.color.as_deref(),
            input.0.tags.as_deref(),
        ).map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-notes-changed", ());
        Ok(CallToolResult::success(vec![Content::text(serde_json::to_string_pretty(&note).unwrap())]))
    }

    #[tool(description = "Update an existing note")]
    async fn update_note(&self, input: Parameters<UpdateNoteInput>) -> Result<CallToolResult, McpError> {
        api::update_note(
            &self.storage,
            &input.0.id,
            input.0.title.as_deref(),
            input.0.content.as_deref(),
            input.0.color.as_deref(),
            None,
            input.0.tags.as_deref(),
            None,
        ).map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-notes-changed", ());
        Ok(CallToolResult::success(vec![Content::text(format!("Note {} updated successfully", input.0.id))]))
    }

    #[tool(description = "Delete a note by ID")]
    async fn delete_note(&self, input: Parameters<IdInput>) -> Result<CallToolResult, McpError> {
        api::delete_note(&self.storage, &input.0.id)
            .map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-notes-changed", ());
        Ok(CallToolResult::success(vec![Content::text(format!("Note {} deleted successfully", input.0.id))]))
    }

    #[tool(description = "Search notes by title or content")]
    async fn search_notes(&self, input: Parameters<SearchInput>) -> Result<CallToolResult, McpError> {
        let notes = api::search_notes(&self.storage, &input.0.query);
        let json = serde_json::to_string_pretty(&notes).unwrap_or_else(|_| "[]".to_string());
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Move a note to a different folder")]
    async fn move_note_to_folder(&self, input: Parameters<MoveInput>) -> Result<CallToolResult, McpError> {
        let moved = api::move_note_to_folder(&self.storage, &input.0.id, &input.0.target_folder_path)
            .map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-notes-changed", ());
        Ok(CallToolResult::success(vec![Content::text(serde_json::to_string_pretty(&moved).unwrap())]))
    }

    // --- Tasks ---

    #[tool(description = "List all tasks, optionally filtered by folder or status")]
    async fn list_tasks(&self, input: Parameters<TasksFilterInput>) -> Result<CallToolResult, McpError> {
        let tasks = api::get_tasks(&self.storage, input.0.folder_path.as_deref(), input.0.status.as_deref());
        let json = serde_json::to_string_pretty(&tasks).unwrap_or_else(|_| "[]".to_string());
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Get a specific task by ID")]
    async fn get_task(&self, input: Parameters<IdInput>) -> Result<CallToolResult, McpError> {
        let task = api::get_task_by_id(&self.storage, &input.0.id)
            .ok_or_else(|| McpError::invalid_params(format!("Task not found: {}", input.0.id), None))?;
        let content = api::get_task_content(&self.storage, &input.0.id).unwrap_or_default();
        let result = serde_json::json!({ "task": task, "content": content });
        Ok(CallToolResult::success(vec![Content::text(serde_json::to_string_pretty(&result).unwrap())]))
    }

    #[tool(description = "Create a new task")]
    async fn create_task(&self, input: Parameters<CreateTaskInput>) -> Result<CallToolResult, McpError> {
        let task = api::create_task(
            &self.storage,
            &input.0.title,
            input.0.content.as_deref(),
            input.0.status.as_deref(),
            input.0.folder_path.as_deref(),
            input.0.color.as_deref(),
            input.0.due,
        ).map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-tasks-changed", ());
        Ok(CallToolResult::success(vec![Content::text(serde_json::to_string_pretty(&task).unwrap())]))
    }

    #[tool(description = "Update an existing task")]
    async fn update_task(&self, input: Parameters<UpdateTaskInput>) -> Result<CallToolResult, McpError> {
        api::update_task(
            &self.storage,
            &input.0.id,
            input.0.title.as_deref(),
            input.0.content.as_deref(),
            input.0.status.as_deref(),
            input.0.color.as_deref(),
            None,
            None,
            input.0.due,
            None,
        ).map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-tasks-changed", ());
        Ok(CallToolResult::success(vec![Content::text(format!("Task {} updated successfully", input.0.id))]))
    }

    #[tool(description = "Delete a task by ID")]
    async fn delete_task(&self, input: Parameters<IdInput>) -> Result<CallToolResult, McpError> {
        api::delete_task(&self.storage, &input.0.id)
            .map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-tasks-changed", ());
        Ok(CallToolResult::success(vec![Content::text(format!("Task {} deleted successfully", input.0.id))]))
    }

    #[tool(description = "Mark a task as done")]
    async fn complete_task(&self, input: Parameters<IdInput>) -> Result<CallToolResult, McpError> {
        api::update_task(
            &self.storage,
            &input.0.id,
            None, None, Some("done"), None, None, None, None, None,
        ).map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-tasks-changed", ());
        Ok(CallToolResult::success(vec![Content::text(format!("Task {} marked as done", input.0.id))]))
    }

    #[tool(description = "Move a task to a different folder")]
    async fn move_task_to_folder(&self, input: Parameters<MoveInput>) -> Result<CallToolResult, McpError> {
        let moved = api::move_task_to_folder(&self.storage, &input.0.id, &input.0.target_folder_path)
            .map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-tasks-changed", ());
        Ok(CallToolResult::success(vec![Content::text(serde_json::to_string_pretty(&moved).unwrap())]))
    }

    // --- Folders ---

    #[tool(description = "List all folders in the workspace")]
    async fn list_folders(&self) -> Result<CallToolResult, McpError> {
        let folders = api::get_folders(&self.storage);
        let json = serde_json::to_string_pretty(&folders).unwrap_or_else(|_| "[]".to_string());
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Create a new folder")]
    async fn create_folder(&self, input: Parameters<CreateFolderInput>) -> Result<CallToolResult, McpError> {
        let folder = api::create_folder(
            &self.storage,
            &input.0.name,
            input.0.parent_path.as_deref(),
        ).map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-folders-changed", ());
        Ok(CallToolResult::success(vec![Content::text(serde_json::to_string_pretty(&folder).unwrap())]))
    }

    #[tool(description = "Delete a folder and all its contents")]
    async fn delete_folder(&self, input: Parameters<DeleteFolderInput>) -> Result<CallToolResult, McpError> {
        api::delete_folder(&self.storage, &input.0.path)
            .map_err(|e| McpError::internal_error(e, None))?;
        let _ = self.app_handle.emit("mcp-folders-changed", ());
        Ok(CallToolResult::success(vec![Content::text(format!("Folder {} deleted successfully", input.0.path))]))
    }

    // --- Floating Windows ---

    #[tool(description = "Show a note in a floating window")]
    async fn show_note(&self, input: Parameters<IdInput>) -> Result<CallToolResult, McpError> {
        let note = api::get_note_by_id(&self.storage, &input.0.id)
            .ok_or_else(|| McpError::invalid_params(format!("Note not found: {}", input.0.id), None))?;
        
        let config = crate::commands::floating::FloatingWindowConfig {
            note_id: input.0.id.clone(),
            item_type: "note".to_string(),
            title: note.title,
            color: note.color,
            x: 100.0,
            y: 100.0,
            width: 400.0,
            height: 500.0,
            opacity: 1.0,
            theme: "system".to_string(),
        };

        crate::commands::floating::createFloatingWindow(self.app_handle.clone(), config)
            .map_err(|e| McpError::internal_error(e, None))?;
        Ok(CallToolResult::success(vec![Content::text(format!("Showing note {}", input.0.id))]))
    }

    #[tool(description = "Hide a note's floating window")]
    async fn hide_note(&self, input: Parameters<IdInput>) -> Result<CallToolResult, McpError> {
        crate::commands::floating::hideFloatingWindow(self.app_handle.clone(), input.0.id.clone())
            .map_err(|e| McpError::internal_error(e, None))?;
        Ok(CallToolResult::success(vec![Content::text(format!("Hiding note {}", input.0.id))]))
    }

    #[tool(description = "Show a task in a floating window")]
    async fn show_task(&self, input: Parameters<IdInput>) -> Result<CallToolResult, McpError> {
        let task = api::get_task_by_id(&self.storage, &input.0.id)
            .ok_or_else(|| McpError::invalid_params(format!("Task not found: {}", input.0.id), None))?;
        
        let config = crate::commands::floating::FloatingWindowConfig {
            note_id: input.0.id.clone(),
            item_type: "task".to_string(),
            title: task.title,
            color: task.color,
            x: 100.0,
            y: 100.0,
            width: 400.0,
            height: 500.0,
            opacity: 1.0,
            theme: "system".to_string(),
        };

        crate::commands::floating::createFloatingWindow(self.app_handle.clone(), config)
            .map_err(|e| McpError::internal_error(e, None))?;
        Ok(CallToolResult::success(vec![Content::text(format!("Showing task {}", input.0.id))]))
    }

    #[tool(description = "Hide a task's floating window")]
    async fn hide_task(&self, input: Parameters<IdInput>) -> Result<CallToolResult, McpError> {
        crate::commands::floating::hideFloatingWindow(self.app_handle.clone(), input.0.id.clone())
            .map_err(|e| McpError::internal_error(e, None))?;
        Ok(CallToolResult::success(vec![Content::text(format!("Hiding task {}", input.0.id))]))
    }
}
