import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { WorkspaceInfo } from '../types';

interface WorkspaceState {
    workspaces: WorkspaceInfo[];
    currentWorkspace: WorkspaceInfo | null;
    loading: boolean;
    error: string | null;

    // Actions
    fetchWorkspaces: () => Promise<void>;
    fetchCurrentWorkspace: () => Promise<void>;
    createWorkspace: (path: string) => Promise<WorkspaceInfo>;
    openWorkspace: (path: string) => Promise<void>;
    closeWorkspace: () => Promise<void>;
    removeWorkspace: (path: string) => Promise<void>;
    openFolderDialog: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
    workspaces: [],
    currentWorkspace: null,
    loading: false,
    error: null,

    fetchWorkspaces: async () => {
        set({ loading: true, error: null });
        try {
            const workspaces = await invoke<WorkspaceInfo[]>('getWorkspaces');
            const current = workspaces.find(w => w.isCurrent) || null;
            set({ workspaces, currentWorkspace: current, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    fetchCurrentWorkspace: async () => {
        try {
            const workspace = await invoke<WorkspaceInfo | null>('getCurrentWorkspace');
            set({ currentWorkspace: workspace });
        } catch (error) {
            console.error('Failed to fetch current workspace:', error);
        }
    },

    createWorkspace: async (path: string) => {
        const workspace = await invoke<WorkspaceInfo>('createWorkspace', { path });
        set(state => ({
            workspaces: [...state.workspaces, workspace],
            currentWorkspace: workspace,
        }));
        return workspace;
    },

    openWorkspace: async (path: string) => {
        const workspace = await invoke<WorkspaceInfo>('openWorkspace', { path });
        set(state => ({
            workspaces: state.workspaces.map(w => ({
                ...w,
                isCurrent: w.path === path,
                lastOpened: w.path === path ? workspace.lastOpened : w.lastOpened,
            })),
            currentWorkspace: workspace,
        }));
    },

    closeWorkspace: async () => {
        await invoke('closeWorkspace');
        set(state => ({
            workspaces: state.workspaces.map(w => ({ ...w, isCurrent: false })),
            currentWorkspace: null,
        }));
    },

    removeWorkspace: async (path: string) => {
        await invoke('removeWorkspace', { path });
        set(state => ({
            workspaces: state.workspaces.filter(w => w.path !== path),
            currentWorkspace: state.currentWorkspace?.path === path ? null : state.currentWorkspace,
        }));
    },

    openFolderDialog: async () => {
        try {
            // Call backend to open folder dialog - it returns the selected path or null
            const selected = await invoke<string | null>('openFolderDialog');

            if (selected) {
                // Check if this workspace already exists
                const existingWorkspace = get().workspaces.find(w => w.path === selected);
                if (existingWorkspace) {
                    // Open existing workspace
                    await get().openWorkspace(existingWorkspace.path);
                } else {
                    // Create new workspace
                    await get().createWorkspace(selected);
                }
            }
        } catch (error) {
            console.error('Failed to open folder dialog:', error);
        }
    },
}));
