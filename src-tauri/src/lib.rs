// Allow non-snake_case names for JSON serialization compatibility with TypeScript frontend
#![allow(non_snake_case)]

mod commands;
mod crypto;
mod mcp;
mod models;
mod storage;

use std::sync::Arc;
use parking_lot::RwLock;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};
use tokio_util::sync::CancellationToken;

#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;

// MCP Server state
pub struct MCPServerManager {
    is_running: Arc<RwLock<bool>>,
    cancel_token: Arc<RwLock<Option<CancellationToken>>>,
}

impl MCPServerManager {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(RwLock::new(false)),
            cancel_token: Arc::new(RwLock::new(None)),
        }
    }

    pub fn is_running(&self) -> bool {
        *self.is_running.read()
    }
}

const MCP_PORT: u16 = 44055;
const MCP_BIND_ADDRESS: &str = "127.0.0.1:44055";

#[tauri::command]
async fn start_mcp_server(
    app: tauri::AppHandle,
    mcp_manager: State<'_, MCPServerManager>,
    storage: State<'_, storage::StorageState>,
) -> Result<(), String> {
    use rmcp::transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    };
    
    if *mcp_manager.is_running.read() {
        return Err("MCP server is already running".to_string());
    }
    
    println!("[MCP] Starting server on {}...", MCP_BIND_ADDRESS);
    
    let storage_arc = storage.inner().clone();
    let app_handle = app.clone();
    
    let ct = CancellationToken::new();
    *mcp_manager.cancel_token.write() = Some(ct.clone());
    
    // Create the MCP service
    let service = StreamableHttpService::new(
        move || Ok(mcp::ClaudiaServer::new(storage_arc.clone(), app_handle.clone())),
        LocalSessionManager::default().into(),
        StreamableHttpServerConfig {
            cancellation_token: ct.child_token(),
            ..Default::default()
        },
    );
    
    let router = axum::Router::new().fallback_service(service);
    
    let is_running = mcp_manager.is_running.clone();
    *is_running.write() = true;
    
    // Start server in background
    tokio::spawn(async move {
        let tcp_listener = match tokio::net::TcpListener::bind(MCP_BIND_ADDRESS).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[MCP] Failed to bind: {}", e);
                *is_running.write() = false;
                return;
            }
        };
        
        println!("[MCP] Server started successfully on {}", MCP_BIND_ADDRESS);
        
        let _ = axum::serve(tcp_listener, router)
            .with_graceful_shutdown(async move {
                ct.cancelled().await;
            })
            .await;
        
        *is_running.write() = false;
        println!("[MCP] Server stopped");
    });
    
    Ok(())
}

#[tauri::command]
async fn stop_mcp_server(mcp_manager: State<'_, MCPServerManager>) -> Result<(), String> {
    println!("[MCP] Stopping server...");
    if let Some(ct) = mcp_manager.cancel_token.read().as_ref() {
        ct.cancel();
    }
    *mcp_manager.cancel_token.write() = None;
    Ok(())
}

#[tauri::command]
async fn get_mcp_server_status(mcp_manager: State<'_, MCPServerManager>) -> Result<bool, String> {
    Ok(mcp_manager.is_running())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Hide from dock on macOS (tray-only app)
            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Accessory);

            // Initialize storage
            let storage = storage::initStorage().expect("Failed to initialize storage");
            
            // Load current workspace if set
            {
                let settings = storage.globalSettings.read();
                if let Some(ref wsPath) = settings.currentWorkspace {
                    println!("Current workspace: {}", wsPath);
                }
            }
            
            app.manage(storage);

            // Initialize MCP server manager
            app.manage(MCPServerManager::new());

            // Create tray menu
            let quit = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(false)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // MCP Server
            start_mcp_server,
            stop_mcp_server,
            get_mcp_server_status,
            // Settings
            commands::settings::getSettings,
            commands::settings::getGlobalSettings,
            commands::settings::updateGlobalSettings,
            commands::settings::updateWorkspaceSettings,
            // Workspace
            commands::workspace::getWorkspaces,
            commands::workspace::getCurrentWorkspace,
            commands::workspace::createWorkspace,
            commands::workspace::openWorkspace,
            commands::workspace::closeWorkspace,
            commands::workspace::removeWorkspace,
            commands::workspace::openFolderDialog,
            // Folder
            commands::folder::getFolders,
            commands::folder::createFolder,
            commands::folder::updateFolder,
            commands::folder::deleteFolder,
            commands::folder::reorderFolders,
            commands::folder::moveFolder,
            // Note
            commands::note::getNotes,
            commands::note::getNoteById,
            commands::note::getNoteContent,
            commands::note::createNote,
            commands::note::updateNote,
            commands::note::deleteNote,
            commands::note::reorderNotes,
            commands::note::moveNoteToFolder,
            // Task
            commands::task::getTasks,
            commands::task::getTaskById,
            commands::task::getTaskContent,
            commands::task::createTask,
            commands::task::updateTask,
            commands::task::deleteTask,
            commands::task::moveTaskToFolder,
            commands::task::reorderTasks,
            // Password
            commands::password::getPasswords,
            commands::password::getPasswordById,
            commands::password::getPasswordContent,
            commands::password::getPasswordContentsBatch,
            commands::password::createPassword,
            commands::password::updatePassword,
            commands::password::deletePassword,
            commands::password::reorderPasswords,
            commands::password::movePasswordToFolder,
            commands::password::isMasterPasswordSet,
            commands::password::setMasterPassword,
            commands::password::verifyMasterPassword,
            commands::password::changeMasterPassword,
            // Floating window
            commands::floating::createFloatingWindow,
            commands::floating::showFloatingWindow,
            commands::floating::hideFloatingWindow,
            commands::floating::closeFloatingWindow,
            commands::floating::closeAllFloatingWindows,
            commands::floating::toggleAllFloatingWindows,
            commands::floating::updateFloatingWindowPosition,
            commands::floating::updateFloatingWindowSize,
            commands::floating::getFloatingWindowPosition,
            commands::floating::getFloatingWindowSize,
            // Templates
            commands::template::getTemplates,
            commands::template::getTemplateContent,
            commands::template::initializeDefaultTemplates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
