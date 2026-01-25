# Changelog

All notable changes to Claudia will be documented in this file.

---

## Version 1.0.0 (25-01-2026)

**Initial Release** — A complete local-first productivity suite with full encryption.

### Core Features
- **Notes Management**: Full markdown support with GFM, syntax highlighting, Mermaid diagrams
- **Task Management**: Kanban board with Todo/Doing/Done columns
- **Password Manager**: Secure credential storage with URL, username, password, and notes

### Security
- **Unified Encryption System**: All data encrypted with AES-256-GCM
- **Argon2id Key Derivation**: Memory-hard password hashing
- **Master Password Protection**: Single password to unlock all your data
- **Auto-lock**: Automatic vault locking after inactivity
- **Encrypted File Format**: `CLAUDIA-ENCRYPTED-v1` with separate metadata and content sections

### Organization
- **Folders**: Nested folder hierarchy with customizable colors and icons
- **Tags**: Tag-based organization for notes, tasks, and passwords
- **Pinning**: Pin important items to the top
- **Drag & Drop**: Reorder items and move between folders

### Floating Windows
- **Always-on-top Windows**: Pop out notes and tasks as floating windows
- **Glass Effect**: macOS vibrancy/transparency support
- **Position & Size Persistence**: Windows remember their location
- **Adjustable Opacity**: Control window transparency

### Templates
- **Built-in Templates**: 12 note templates and 12 task templates
- **Custom Templates**: Create your own in `~/.claudia/templates/`

### Trash / Recycle Bin
- **Soft Delete**: Deleted notes, tasks, and passwords are moved to Trash instead of permanent deletion
- **Restore Items**: Drag items from Trash back to any folder to restore them
- **Permanent Delete**: Delete from Trash to permanently remove items
- **Empty Trash**: Clear all trashed items at once
- **Folder Deletion**: When deleting a folder, all items inside are moved to Trash

### AI Integration
- **MCP Server**: Built-in Model Context Protocol server
- **Full CRUD Operations**: AI assistants can manage notes, tasks, and folders
- **Local Only**: MCP server runs on localhost

### User Experience
- **Tray App**: Runs in system tray, hidden from dock/taskbar
- **Auto-show on Launch**: Window appears when app starts
- **Hide to Tray**: Close window to hide (app keeps running)
- **Theme Support**: Light, dark, and system themes
- **Notifications**: Task due date reminders with sound

### Technical
- **Local Storage**: All data stored as encrypted markdown files
- **Cross-platform**: macOS, Windows, Linux support
- **Offline First**: No internet required
- **Sync Compatible**: Works with Dropbox, iCloud, Google Drive
