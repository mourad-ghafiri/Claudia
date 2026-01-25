import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { FolderInfo, UpdateFolderInput, Folder } from '../types';
import { useTrashStore } from './trashStore';

// Unified folder structure - no more separate notes/tasks folders
interface FolderState {
    folders: FolderInfo[];
    currentFolderPath: string | null;
    loading: boolean;
    error: string | null;

    // Actions
    fetchFolders: () => Promise<void>;
    createFolder: (name: string, parentPath?: string) => Promise<FolderInfo>;
    updateFolder: (input: UpdateFolderInput) => Promise<void>;
    deleteFolder: (path: string, permanent?: boolean) => Promise<void>;
    setCurrentFolder: (folderPath: string | null) => void;
    reorderFolders: (parentPath: string | null, folderPaths: string[]) => Promise<void>;
    moveFolder: (folderPath: string, newParentPath: string | null) => Promise<void>;
    toggleFavorite: (path: string) => Promise<void>;
    togglePin: (path: string) => Promise<void>;
    setFolderColor: (path: string, color: string) => Promise<void>;

    // Helpers
    getFolderById: (id: string) => FolderInfo | null;
    getFolderByPath: (path: string) => FolderInfo | null;
    getBreadcrumbs: (folderPath: string | null) => FolderInfo[];
    getFlatFolders: () => Folder[];
}

// Helper to find folder in tree by id
function findFolderInTree(folders: FolderInfo[], id: string): FolderInfo | null {
    for (const folder of folders) {
        if (folder.id === id) return folder;
        const found = findFolderInTree(folder.children, id);
        if (found) return found;
    }
    return null;
}

// Helper to find folder in tree by path
function findFolderByPath(folders: FolderInfo[], path: string): FolderInfo | null {
    for (const folder of folders) {
        if (folder.path === path) return folder;
        const found = findFolderByPath(folder.children, path);
        if (found) return found;
    }
    return null;
}

// Helper to flatten folder tree with parent info
function flattenFolders(folders: FolderInfo[], parentPath: string | null = null): Folder[] {
    const result: Folder[] = [];
    folders.forEach((folder) => {
        result.push({
            ...folder,
            parentPath,
        });
        result.push(...flattenFolders(folder.children, folder.path));
    });
    return result;
}

// Helper to get breadcrumb trail
function getBreadcrumbTrail(folders: FolderInfo[], targetPath: string, trail: FolderInfo[] = []): FolderInfo[] | null {
    for (const folder of folders) {
        if (folder.path === targetPath) {
            return [...trail, folder];
        }
        const found = getBreadcrumbTrail(folder.children, targetPath, [...trail, folder]);
        if (found) return found;
    }
    return null;
}

export const useFolderStore = create<FolderState>((set, get) => ({
    folders: [],
    currentFolderPath: null,
    loading: false,
    error: null,

    fetchFolders: async () => {
        set({ loading: true, error: null });
        try {
            const folders = await invoke<FolderInfo[]>('getFolders');
            set({ folders, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    createFolder: async (name: string, parentPath?: string) => {
        const input = { name, parentPath };
        const folder = await invoke<FolderInfo>('createFolder', { input });
        await get().fetchFolders();
        return folder;
    },

    updateFolder: async (input: UpdateFolderInput) => {
        await invoke('updateFolder', { input });
        await get().fetchFolders();
    },

    toggleFavorite: async (path: string) => {
        const folder = findFolderByPath(get().folders, path);
        if (folder) {
            await invoke('updateFolder', { input: { path, favorite: !folder.favorite } });
            await get().fetchFolders();
        }
    },

    togglePin: async (path: string) => {
        const folder = findFolderByPath(get().folders, path);
        if (folder) {
            await invoke('updateFolder', { input: { path, pinned: !folder.pinned } });
            await get().fetchFolders();
        }
    },

    setFolderColor: async (path: string, color: string) => {
        await invoke('updateFolder', { input: { path, color } });
        await get().fetchFolders();
    },

    deleteFolder: async (path: string, permanent?: boolean) => {
        await invoke('deleteFolder', { path, permanent: permanent ?? false });
        await get().fetchFolders();
        // Refresh trash counts (folder items are moved to trash)
        useTrashStore.getState().fetchTrashCounts();
        window.dispatchEvent(new CustomEvent('folder-deleted', { detail: { folderPath: path } }));
    },

    reorderFolders: async (parentPath: string | null, folderPaths: string[]) => {
        // Update local state immediately for responsive UI
        set(state => {
            const reorderedFolders: FolderInfo[] = [];
            for (const folderPath of folderPaths) {
                const folder = state.folders.find(f => f.path === folderPath);
                if (folder) reorderedFolders.push(folder);
            }
            state.folders.forEach(f => {
                if (!folderPaths.includes(f.path)) reorderedFolders.push(f);
            });
            return { folders: reorderedFolders };
        });

        try {
            await invoke('reorderFolders', { input: { parentPath, folderPaths } });
            // Refetch folders to get updated paths (rank prefix in folder name changes)
            await get().fetchFolders();
        } catch (error) {
            console.error('Failed to reorder folders:', error);
            await get().fetchFolders();
        }
    },

    moveFolder: async (folderPath: string, newParentPath: string | null) => {
        try {
            await invoke('moveFolder', { input: { folderPath, newParentPath } });
            await get().fetchFolders();
        } catch (error) {
            console.error('Failed to move folder:', error);
            throw error;
        }
    },

    setCurrentFolder: (folderPath: string | null) => {
        set({ currentFolderPath: folderPath });
    },

    getFolderById: (id: string) => {
        return findFolderInTree(get().folders, id);
    },

    getFolderByPath: (path: string) => {
        return findFolderByPath(get().folders, path);
    },

    getBreadcrumbs: (folderPath: string | null) => {
        if (!folderPath) return [];
        return getBreadcrumbTrail(get().folders, folderPath) || [];
    },

    getFlatFolders: () => {
        return flattenFolders(get().folders);
    },
}));
