# Claudia ✨

> Your personal companion for notes, tasks, and passwords — beautifully organized, always accessible.

---

## 🌟 What is Claudia?

Claudia is a **desktop productivity app** built with [Tauri](https://tauri.app/) (Rust backend) and React. It keeps your notes, tasks, and passwords in one place, stored locally on your computer as readable markdown files.

**Key highlights:**
- 📝 **Notes** with markdown, code highlighting, and Mermaid diagrams
- ✅ **Tasks** with a kanban board (Todo → Doing → Done)
- 🔐 **Passwords** with AES-256-GCM encryption
- 🪟 **Floating windows** that stay on top of everything
- 🎨 **Beautiful themes** — light, dark, or system
- 🤖 **MCP integration** — works with Claude and AI assistants

---

## 📸 Screenshots

### Home Screen
![Home Screen](screenshots/home.png)

### Notes View
![Notes View](screenshots/notes.png)

### Tasks Board
![Tasks Board](screenshots/tasks.png)

### Password Manager
![Password Manager](screenshots/passwords.png)

### Floating Windows
![Floating Windows](screenshots/floating.png)

### MCP Server
![Settings](screenshots/mcp.png)

### Settings
![Settings](screenshots/settings.png)

---

## ✨ Features

### 📝 Notes

Write notes with full markdown support, organized in folders.

| Feature | Status |
|---------|:------:|
| Markdown with GFM | ✅ |
| Code syntax highlighting | ✅ |
| Mermaid diagrams | ✅ |
| Pin notes | ✅ |
| Color coding | ✅ |
| Tags | ✅ |
| Drag & drop reordering | ✅ |
| Float as separate window | ✅ |

---

### ✅ Tasks

A kanban board to manage your to-dos with drag-and-drop between columns.

| Column | Description |
|--------|-------------|
| **Todo** | Tasks waiting to be started |
| **Doing** | Tasks you're working on |
| **Done** | Completed tasks |
| **Archived** | Old tasks (status available in data model) |

| Feature | Status |
|---------|:------:|
| Drag & drop between columns | ✅ |
| Due dates | ✅ |
| Pin tasks | ✅ |
| Color coding | ✅ |
| Tags | ✅ |
| Float as separate window | ✅ |

---

### 🔐 Password Manager

Secure local vault for your passwords.

| Feature | Status |
|---------|:------:|
| Master password setup | ✅ |
| AES-256-GCM encryption | ✅ |
| Argon2id key derivation | ✅ |
| Store URL, username, password, notes | ✅ |
| Show/hide passwords | ✅ |
| One-click copy | ✅ |
| Color coding & tags | ✅ |
| Pin & reorder | ✅ |
| Change master password | ✅ |

#### 🔒 Security

| Layer | Technology |
|-------|------------|
| Key Derivation | Argon2id |
| Encryption | AES-256-GCM |
| Storage | Local only |

> Your master password derives an encryption key via Argon2id. Passwords are encrypted with AES-256-GCM and stored locally. Nothing leaves your device.

---

### 📁 Folders

A unified folder system that can contain both notes and tasks.

| Feature | Status |
|---------|:------:|
| Create folders | ✅ |
| Nested subfolders | ✅ |
| Color customization | ✅ |
| Icon customization | ✅ |
| Pin/favorite folders | ✅ |
| Delete folders | ✅ |

---

### 📋 Templates

Built-in templates for notes and tasks.

| Type | Templates |
|------|-----------|
| **Notes** | Blank, Meeting Notes, Daily Journal, Weekly Review, Project Plan, Decision Document, Feature Spec, Bug Report, Book Notes, Learning Notes, Interview Notes, Sprint Retro |
| **Tasks** | Blank, Quick Task, Feature Development, Bug Fix, Code Review, Refactoring, Research, Design, Deployment, Meeting Prep, Documentation, Learning |

#### Custom Templates

Create your own templates in `~/.claudia/templates/notes/` or `~/.claudia/templates/tasks/`.

**Structure:**
```
~/.claudia/templates/notes/
└── my-template/
    ├── template.md    # Required
    └── assets/        # Optional (for images)
```

**Example `template.md`:**
```markdown
---
id: "550e8400-e29b-41d4-a716-446655440000"
name: "My Template"
description: "A short description"
category: "productivity"
icon: "FileText"
color: "#5B8DEF"
order: 100
---

## My Template Content

- [ ] Checklist item
- [ ] Another item
```

| Field | Description |
|-------|-------------|
| `id` | Unique UUID |
| `name` | Display name |
| `description` | Short description |
| `category` | `basic`, `productivity`, `planning`, `documentation`, `learning`, `development`, `operations` |
| `icon` | [Lucide icon](https://lucide.dev/icons) name (e.g., `FileText`, `CheckSquare`, `Bug`) |
| `color` | Hex color (e.g., `#5B8DEF`) |
| `order` | Sort order (lower = first) |

---

### 🪟 Floating Windows

Pop out notes or tasks as always-on-top floating windows.

| Feature | Status |
|---------|:------:|
| Always on top | ✅ |
| Glass/vibrancy effect (macOS) | ✅ |
| Position persistence | ✅ |
| Size persistence | ✅ |
| Adjustable opacity | ✅ |
| Toggle all windows | ✅ |

---

### ⚙️ Settings

| Setting | Options |
|---------|---------|
| Theme | Light, Dark, System |
| Default view | Notes or Tasks |
| Default color | Any color |
| Notifications | Enable/disable |
| Notification sound | Enable/disable |
| Reminder time | Minutes before due |
| Floating window opacity | 50-100% |

---

### 🤖 MCP Integration

Claudia includes a built-in MCP (Model Context Protocol) server for AI assistant integration.

**Available MCP Tools:**

| Category | Tools |
|----------|-------|
| **Notes** | `list_notes`, `get_note`, `create_note`, `update_note`, `delete_note`, `search_notes`, `move_note_to_folder`, `show_note`, `hide_note` |
| **Tasks** | `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task`, `complete_task`, `move_task_to_folder`, `show_task`, `hide_task` |
| **Folders** | `list_folders`, `create_folder`, `delete_folder` |

---

## 💾 Data Storage

Your data is stored as markdown files on your filesystem:

```
📁 Your Workspace
├── config.md                       # Workspace settings override (optional)
└── 📁 folders/
    ├── 📁 notes/                   # Root-level notes
    │   └── 000001-my-note.md       # Note file (rank-slug.md)
    ├── 📁 tasks/                   # Root-level tasks
    │   ├── 📁 todo/                # Tasks by status
    │   │   └── 000001-task.md
    │   ├── 📁 doing/
    │   ├── 📁 done/
    │   └── 📁 archived/
    ├── 📁 passwords/               # Root-level passwords
    │   └── 000001-login.md         # Encrypted password file
    └── 📁 My Project/              # A subfolder
        ├── .folder.md              # Folder metadata
        ├── 📁 notes/               # Folder's notes
        ├── 📁 tasks/               # Folder's tasks
        │   ├── 📁 todo/
        │   ├── 📁 doing/
        │   ├── 📁 done/
        │   └── 📁 archived/
        └── 📁 passwords/           # Folder's passwords
```

**Benefits:**
- 📖 Readable markdown files
- 💾 Easy to backup — just copy the folder
- 🔄 Git-friendly for version control
- ☁️ Sync with Dropbox, iCloud, etc.
- 🔒 Private — 100% local, no cloud

---

## 🚀 Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production (includes DMG)
npm run tauri build

# Build app only (no DMG, faster)
npm run release
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, TypeScript, Vite |
| Styling | Vanilla CSS, Framer Motion |
| State | Zustand |
| Backend | Rust, Tauri v2 |
| Encryption | AES-256-GCM, Argon2 |
| MCP | rmcp SDK |

---

## ❓ FAQ

**Q: Where is my data stored?**
> In the workspace folder you chose. Notes and tasks are markdown files.

**Q: Can I sync between devices?**
> Yes. Put your workspace in Dropbox, iCloud, or Google Drive.

**Q: Can I use Claudia offline?**
> Yes. No internet required.

**Q: How do I backup my data?**
> Copy your workspace folder.

**Q: Does Claudia collect any data?**
> No. Zero tracking, zero analytics, zero cloud.

**Q: Can I have multiple workspaces?**
> Yes. Each workspace is a separate folder.

**Q: What if I forget my master password?**
> No recovery possible. This is by design for security.

**Q: Are passwords sent to any server?**
> No. Everything stays local.

**Q: Can I create custom templates?**
> Yes. Add folders to `~/.claudia/templates/notes/` or `~/.claudia/templates/tasks/`.

**Q: What is MCP?**
> Model Context Protocol. Lets AI assistants like Claude manage your notes and tasks. Runs locally only.

---

## 📜 License

This work is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) © Mourad GHAFIRI

---

<p align="center">
  <b>Made with ❤️ for people who love staying organized</b>
  <br><br>
  <i>Claudia v0.2.0</i>
</p>
