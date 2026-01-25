import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { TrashNoteInfo, TrashTaskInfo, TrashPasswordInfo, TrashCounts } from '../types';

export type TrashTab = 'notes' | 'tasks' | 'passwords';

interface TrashState {
    notes: TrashNoteInfo[];
    tasks: TrashTaskInfo[];
    passwords: TrashPasswordInfo[];
    counts: TrashCounts;
    activeTab: TrashTab;
    loading: boolean;
    error: string | null;

    // Actions
    fetchTrashNotes: () => Promise<void>;
    fetchTrashTasks: () => Promise<void>;
    fetchTrashPasswords: () => Promise<void>;
    fetchTrashCounts: () => Promise<void>;
    fetchAll: () => Promise<void>;
    emptyTrash: () => Promise<void>;
    restoreAll: () => Promise<void>;
    setActiveTab: (tab: TrashTab) => void;
}

export const useTrashStore = create<TrashState>((set, get) => ({
    notes: [],
    tasks: [],
    passwords: [],
    counts: { notes: 0, tasks: 0, passwords: 0, total: 0 },
    activeTab: 'notes',
    loading: false,
    error: null,

    fetchTrashNotes: async () => {
        try {
            const notes = await invoke<TrashNoteInfo[]>('listTrashNotes');
            set({ notes });
        } catch (error) {
            console.error('Failed to fetch trash notes:', error);
        }
    },

    fetchTrashTasks: async () => {
        try {
            const tasks = await invoke<TrashTaskInfo[]>('listTrashTasks');
            set({ tasks });
        } catch (error) {
            console.error('Failed to fetch trash tasks:', error);
        }
    },

    fetchTrashPasswords: async () => {
        try {
            const passwords = await invoke<TrashPasswordInfo[]>('listTrashPasswords');
            set({ passwords });
        } catch (error) {
            console.error('Failed to fetch trash passwords:', error);
        }
    },

    fetchTrashCounts: async () => {
        try {
            const counts = await invoke<TrashCounts>('getTrashCounts');
            set({ counts });
        } catch (error) {
            console.error('Failed to fetch trash counts:', error);
        }
    },

    fetchAll: async () => {
        set({ loading: true, error: null });
        try {
            await Promise.all([
                get().fetchTrashNotes(),
                get().fetchTrashTasks(),
                get().fetchTrashPasswords(),
                get().fetchTrashCounts(),
            ]);
            set({ loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    emptyTrash: async () => {
        try {
            await invoke('emptyTrash');
            set({
                notes: [],
                tasks: [],
                passwords: [],
                counts: { notes: 0, tasks: 0, passwords: 0, total: 0 },
            });
            // Dispatch event to notify views to refresh
            window.dispatchEvent(new CustomEvent('trash-emptied'));
        } catch (error) {
            console.error('Failed to empty trash:', error);
            throw error;
        }
    },

    restoreAll: async () => {
        try {
            await invoke('restoreAllFromTrash');
            set({
                notes: [],
                tasks: [],
                passwords: [],
                counts: { notes: 0, tasks: 0, passwords: 0, total: 0 },
            });
            // Dispatch event to notify views to refresh (items moved to root folders)
            window.dispatchEvent(new CustomEvent('trash-restored'));
        } catch (error) {
            console.error('Failed to restore all from trash:', error);
            throw error;
        }
    },

    setActiveTab: (tab: TrashTab) => {
        set({ activeTab: tab });
    },
}));
