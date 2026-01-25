import { create } from 'zustand';

export type ViewType = 'notes' | 'tasks' | 'passwords';
type DeleteItemType = 'note' | 'task' | 'folder' | 'password';

interface UIState {
    // View state
    currentView: ViewType;
    setCurrentView: (view: ViewType) => void;

    // Trash selection
    isTrashSelected: boolean;
    setTrashSelected: (selected: boolean) => void;

    // Selected items (persisted across view switches)
    selectedNoteId: string | null;
    setSelectedNoteId: (id: string | null) => void;

    // Sidebar state
    isSidebarCollapsed: boolean;
    toggleSidebar: () => void;

    // Search
    searchQuery: string;
    setSearchQuery: (query: string) => void;

    // Floating tasks visibility
    areFloatingTasksVisible: boolean;
    setFloatingTasksVisible: (visible: boolean) => void;

    // Task Editor Modal
    isTaskEditorOpen: boolean;
    editingTaskId: string | null;
    pendingTaskTemplate: { content: string; color: string; title: string } | null;
    openTaskEditor: (taskId?: string) => void;
    openTaskEditorWithTemplate: (content: string, color: string, title: string) => void;
    closeTaskEditor: () => void;

    // Note Editor Modal
    isNoteEditorOpen: boolean;
    editingNoteId: string | null;
    openNoteEditor: (noteId?: string) => void;
    closeNoteEditor: () => void;

    // Password Editor Modal
    isPasswordEditorOpen: boolean;
    editingPasswordId: string | null;
    openPasswordEditor: (passwordId?: string) => void;
    closePasswordEditor: () => void;

    // Settings Modal
    isSettingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;

    // Delete Confirmation Modal
    isDeleteConfirmOpen: boolean;
    deletingItemId: string | null;
    deletingItemType: DeleteItemType | null;
    openDeleteConfirm: (itemId: string, itemType: DeleteItemType) => void;
    closeDeleteConfirm: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    // View state
    currentView: 'notes',  // Default to notes, will be overridden by settings.defaultMode
    setCurrentView: (view) => set({ currentView: view }),

    // Trash selection
    isTrashSelected: false,
    setTrashSelected: (selected) => set({ isTrashSelected: selected }),

    // Selected items (persisted across view switches)
    selectedNoteId: null,
    setSelectedNoteId: (id) => set({ selectedNoteId: id }),

    // Sidebar state
    isSidebarCollapsed: true,
    toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

    // Search
    searchQuery: '',
    setSearchQuery: (query) => set({ searchQuery: query }),

    // Floating tasks visibility
    areFloatingTasksVisible: true,
    setFloatingTasksVisible: (visible) => set({ areFloatingTasksVisible: visible }),

    // Task Editor Modal
    isTaskEditorOpen: false,
    editingTaskId: null,
    pendingTaskTemplate: null,
    openTaskEditor: (taskId) => set({ isTaskEditorOpen: true, editingTaskId: taskId ?? null, pendingTaskTemplate: null }),
    openTaskEditorWithTemplate: (content, color, title) => set({
        isTaskEditorOpen: true,
        editingTaskId: null,
        pendingTaskTemplate: { content, color, title }
    }),
    closeTaskEditor: () => set({ isTaskEditorOpen: false, editingTaskId: null, pendingTaskTemplate: null }),

    // Note Editor Modal
    isNoteEditorOpen: false,
    editingNoteId: null,
    openNoteEditor: (noteId) => set({ isNoteEditorOpen: true, editingNoteId: noteId ?? null }),
    closeNoteEditor: () => set({ isNoteEditorOpen: false, editingNoteId: null }),

    // Password Editor Modal
    isPasswordEditorOpen: false,
    editingPasswordId: null,
    openPasswordEditor: (passwordId) => set({ isPasswordEditorOpen: true, editingPasswordId: passwordId ?? null }),
    closePasswordEditor: () => set({ isPasswordEditorOpen: false, editingPasswordId: null }),

    // Settings Modal
    isSettingsOpen: false,
    openSettings: () => set({ isSettingsOpen: true }),
    closeSettings: () => set({ isSettingsOpen: false }),

    // Delete Confirmation Modal
    isDeleteConfirmOpen: false,
    deletingItemId: null,
    deletingItemType: null,
    openDeleteConfirm: (itemId, itemType) => set({
        isDeleteConfirmOpen: true,
        deletingItemId: itemId,
        deletingItemType: itemType,
    }),
    closeDeleteConfirm: () => set({
        isDeleteConfirmOpen: false,
        deletingItemId: null,
        deletingItemType: null,
    }),
}));
