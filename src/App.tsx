import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Header } from './components/layout/Header';
import { NotesView } from './pages/NotesView';
import { TasksView } from './pages/TasksView';
import { PasswordsView } from './pages/PasswordsView';
import { WorkspaceHome } from './pages/WorkspaceHome';
import { NoteEditor } from './components/note/NoteEditor';
import { TaskEditor } from './components/task/TaskEditor';
import { PasswordEditor } from './components/password/PasswordEditor';
import { DeleteConfirm } from './components/ui/DeleteConfirm';
import { SettingsModal } from './components/settings/SettingsModal';
import { useUIStore, type ViewType } from './stores/uiStore';
import { useSettingsStore } from './stores/settingsStore';
import { useTaskStore } from './stores/taskStore';
import { useNoteStore } from './stores/noteStore';
import { useFolderStore } from './stores/folderStore';
import { useWorkspaceStore } from './stores/workspaceStore';
import { useFloatingWindows } from './hooks/useFloatingWindows';
import { useNotifications } from './hooks/useNotifications';

function App() {
  const { currentView, setCurrentView, openTaskEditor, openNoteEditor } = useUIStore();
  const { settings, globalSettings, fetchSettings } = useSettingsStore();
  const { fetchTasks } = useTaskStore();
  const { fetchNotes } = useNoteStore();
  const { fetchFolders } = useFolderStore();
  const { currentWorkspace, fetchWorkspaces, fetchCurrentWorkspace, openFolderDialog } = useWorkspaceStore();

  // Initialize floating windows manager
  useFloatingWindows();

  // Initialize notifications for task reminders
  useNotifications();

  // Initialize workspace on mount
  useEffect(() => {
    fetchWorkspaces();
    fetchCurrentWorkspace();
    fetchSettings();
  }, [fetchWorkspaces, fetchCurrentWorkspace, fetchSettings]);

  // Load workspace data when workspace changes
  useEffect(() => {
    if (currentWorkspace) {
      fetchTasks();
      fetchNotes();
      fetchFolders();
    }
  }, [currentWorkspace, fetchTasks, fetchNotes, fetchFolders]);

  // Apply default mode only on initial load (once) - wait for settings to be fetched
  const hasAppliedDefaultMode = useRef(false);
  useEffect(() => {
    // Only apply once globalSettings is actually fetched (not the default values)
    if (globalSettings && settings.defaultMode && !hasAppliedDefaultMode.current) {
      setCurrentView(settings.defaultMode as ViewType);
      hasAppliedDefaultMode.current = true;
    }
  }, [globalSettings, settings.defaultMode, setCurrentView]);

  // Apply theme
  useEffect(() => {
    console.log('[App] Applying theme:', settings.theme);
    const root = document.documentElement;

    // Remove dark class first, then add if needed
    root.classList.remove('dark');

    if (settings.theme === 'dark') {
      console.log('[App] Setting dark theme');
      root.classList.add('dark');
    } else if (settings.theme === 'light') {
      console.log('[App] Setting light theme');
      // Already removed dark class above
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      console.log('[App] Setting system theme, prefersDark:', prefersDark);
      if (prefersDark) {
        root.classList.add('dark');
      }
    }

    // Listen for system theme changes when theme is set to 'system'
    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        console.log('[App] System theme changed, prefersDark:', e.matches);
        root.classList.toggle('dark', e.matches);
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [settings.theme]);

  // Handle window close - hide instead of quit (tray-only app)
  useEffect(() => {
    const mainWindow = getCurrentWindow();

    const setupCloseHandler = async () => {
      const unlisten = await mainWindow.onCloseRequested(async (event) => {
        // Prevent default close behavior
        event.preventDefault();
        // Hide the window instead
        await mainWindow.hide();
      });
      return unlisten;
    };

    const cleanup = setupCloseHandler();
    return () => {
      cleanup.then((unlisten) => unlisten());
    };
  }, []);

  // Listen for tray events and floating window events
  useEffect(() => {
    const unlistenNewTask = listen('open-new-task', () => {
      openTaskEditor();
    });

    const unlistenEditTask = listen<{ taskId: string }>('open-task-editor', (event) => {
      openTaskEditor(event.payload.taskId);
    });

    const unlistenNewNote = listen('open-new-note', () => {
      openNoteEditor();
    });

    const unlistenEditNote = listen<{ noteId: string }>('open-note-editor', (event) => {
      openNoteEditor(event.payload.noteId);
    });

    // Listen for navigate events from tray menu
    const unlistenNavigate = listen<string>('navigate', (event) => {
      const path = event.payload;
      if (path === '/notes') {
        setCurrentView('notes');
      } else if (path === '/tasks') {
        setCurrentView('tasks');
      }
    });

    // Listen for task deleted from floating window
    const unlistenTaskDeleted = listen<{ taskId: string }>('task-deleted', () => {
      fetchTasks();
    });

    // Listen for task status changed from floating window
    const unlistenStatusChanged = listen<{ taskId: string; status: string }>('task-status-changed', () => {
      fetchTasks();
    });

    // Note: task-hidden is handled by useFloatingWindows hook (avoids duplicate updateTask calls)

    // Listen for note deleted from floating window
    const unlistenNoteDeleted = listen<{ noteId: string }>('note-deleted', () => {
      fetchNotes();
    });

    // Note: note-hidden is handled by NotesView (avoids duplicate updateNote calls)

    // Listen for open folder dialog from tray
    const unlistenOpenFolder = listen('open-folder-dialog', () => {
      openFolderDialog();
    });

    // Listen for MCP server changes to refresh UI
    const unlistenMcpNotes = listen('mcp-notes-changed', () => {
      console.log('[App] MCP notes changed, refreshing...');
      fetchNotes();
    });

    const unlistenMcpTasks = listen('mcp-tasks-changed', () => {
      console.log('[App] MCP tasks changed, refreshing...');
      fetchTasks();
    });

    const unlistenMcpFolders = listen<string>('mcp-folders-changed', () => {
      console.log('[App] MCP folders changed, refreshing...');
      fetchFolders();
    });

    return () => {
      unlistenNewTask.then((unlisten) => unlisten());
      unlistenEditTask.then((unlisten) => unlisten());
      unlistenNewNote.then((unlisten) => unlisten());
      unlistenEditNote.then((unlisten) => unlisten());
      unlistenNavigate.then((unlisten) => unlisten());
      unlistenTaskDeleted.then((unlisten) => unlisten());
      unlistenStatusChanged.then((unlisten) => unlisten());
      unlistenNoteDeleted.then((unlisten) => unlisten());
      unlistenOpenFolder.then((unlisten) => unlisten());
      unlistenMcpNotes.then((unlisten) => unlisten());
      unlistenMcpTasks.then((unlisten) => unlisten());
      unlistenMcpFolders.then((unlisten) => unlisten());
    };
  }, [openTaskEditor, openNoteEditor, setCurrentView, fetchTasks, fetchNotes, fetchFolders, openFolderDialog]);

  const renderView = () => {
    switch (currentView) {
      case 'notes':
        return <NotesView />;
      case 'tasks':
        return <TasksView />;
      case 'passwords':
        return <PasswordsView />;
      default:
        return <NotesView />;
    }
  };

  // Show workspace home if no workspace selected
  if (!currentWorkspace) {
    return (
      <div className="h-screen flex flex-col bg-[#FAF9F7] dark:bg-[#1A1A1A] text-[#2D2D2D] dark:text-[#E8E6E3]">
        <WorkspaceHome />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#FAF9F7] dark:bg-[#1A1A1A] text-[#2D2D2D] dark:text-[#E8E6E3]">
      <Header />
      <main className="flex-1 overflow-hidden relative">
        {renderView()}
      </main>

      {/* Modals */}
      <TaskEditor />
      <NoteEditor />
      <PasswordEditor />
      <DeleteConfirm />
      <SettingsModal />
    </div>
  );
}

export default App;
