import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { PasswordInfo, CreatePasswordInput, UpdatePasswordInput, DecryptedPasswordContent, TrashPasswordInfo } from '../types';
import { useTrashStore } from './trashStore';

// Cache for decrypted content - avoids re-decryption
interface CachedContent {
    content: DecryptedPasswordContent;
    timestamp: number;
}

// Batch fetch response type
interface BatchDecryptedContent {
    id: string;
    content: DecryptedPasswordContent;
}

// Cache TTL - 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

interface PasswordState {
    passwords: PasswordInfo[];
    selectedPasswordId: string | null;
    loading: boolean;
    error: string | null;
    // Decrypted content cache
    decryptedCache: Map<string, CachedContent>;

    // Actions
    fetchPasswords: (folderPath?: string) => Promise<void>;
    fetchTrashPasswords: () => Promise<void>;
    getPasswordById: (id: string) => PasswordInfo | null;
    getDecryptedContent: (id: string) => Promise<DecryptedPasswordContent>;
    getDecryptedContentsBatch: (ids: string[]) => Promise<void>;
    getCachedContent: (id: string) => DecryptedPasswordContent | null;
    invalidateCache: (id?: string) => void;
    createPassword: (input: CreatePasswordInput) => Promise<void>;
    updatePassword: (input: UpdatePasswordInput) => Promise<void>;
    deletePassword: (id: string, permanent?: boolean) => Promise<void>;
    selectPassword: (id: string | null) => void;
    reorderPasswords: (folderPath: string, passwordIds: string[]) => Promise<void>;
    movePasswordToFolder: (id: string, targetFolderPath: string) => Promise<void>;
    clearCache: () => void;
}

export const usePasswordStore = create<PasswordState>((set, get) => ({
    passwords: [],
    selectedPasswordId: null,
    loading: false,
    error: null,
    decryptedCache: new Map(),

    fetchPasswords: async (folderPath?: string) => {
        set({ loading: true, error: null });
        try {
            const passwords = await invoke<PasswordInfo[]>('getPasswords', { folderPath: folderPath ?? null });
            set({ passwords, loading: false });
        } catch (e) {
            set({ error: String(e), loading: false });
        }
    },

    fetchTrashPasswords: async () => {
        set({ loading: true, error: null });
        try {
            const trashPasswords = await invoke<TrashPasswordInfo[]>('listTrashPasswords');
            // Convert TrashPasswordInfo to PasswordInfo format
            const passwords: PasswordInfo[] = trashPasswords.map((info) => ({
                id: info.id,
                title: info.title,
                rank: 0,
                color: info.color,
                pinned: info.pinned,
                tags: info.tags,
                created: info.created,
                updated: info.updated,
                folderPath: '.trash',
                path: info.path,
            }));
            set({ passwords, loading: false });
        } catch (e) {
            set({ error: String(e), loading: false });
        }
    },

    getPasswordById: (id) => {
        return get().passwords.find(p => p.id === id) ?? null;
    },

    getCachedContent: (id) => {
        const cached = get().decryptedCache.get(id);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.content;
        }
        return null;
    },

    invalidateCache: (id?: string) => {
        if (id) {
            const cache = get().decryptedCache;
            cache.delete(id);
            set({ decryptedCache: new Map(cache) });
        } else {
            set({ decryptedCache: new Map() });
        }
    },

    clearCache: () => {
        set({ decryptedCache: new Map(), selectedPasswordId: null });
    },

    getDecryptedContent: async (id) => {
        const { decryptedCache } = get();

        // Check cache first
        const cached = decryptedCache.get(id);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.content;
        }

        // Fetch from backend (vault handles encryption)
        const content = await invoke<DecryptedPasswordContent>('getPasswordContent', { id });

        // Update cache
        const newCache = new Map(decryptedCache);
        newCache.set(id, { content, timestamp: Date.now() });
        set({ decryptedCache: newCache });

        return content;
    },

    getDecryptedContentsBatch: async (ids: string[]) => {
        const { decryptedCache } = get();

        // Filter out IDs that are already cached
        const uncachedIds = ids.filter(id => {
            const cached = decryptedCache.get(id);
            return !cached || Date.now() - cached.timestamp >= CACHE_TTL;
        });

        if (uncachedIds.length === 0) {
            return; // All requested IDs are cached
        }

        // Batch fetch from backend (vault handles encryption)
        const results = await invoke<BatchDecryptedContent[]>('getPasswordContentsBatch', {
            ids: uncachedIds,
        });

        // Update cache with all results
        const newCache = new Map(decryptedCache);
        const now = Date.now();
        for (const { id, content } of results) {
            newCache.set(id, { content, timestamp: now });
        }
        set({ decryptedCache: newCache });
    },

    createPassword: async (input) => {
        const { fetchPasswords } = get();
        await invoke('createPassword', { input });
        await fetchPasswords();
    },

    updatePassword: async (input) => {
        const { fetchPasswords, invalidateCache } = get();
        await invoke('updatePassword', { input });
        invalidateCache(input.id); // Clear stale cached content for this password
        await fetchPasswords();
    },

    deletePassword: async (id, permanent?) => {
        await invoke('deletePassword', { id, permanent: permanent ?? false });
        get().invalidateCache(id); // Clear cached content for deleted password
        // Remove from local state immediately
        set(state => ({
            passwords: state.passwords.filter(p => p.id !== id),
            selectedPasswordId: state.selectedPasswordId === id ? null : state.selectedPasswordId,
        }));
        // Refresh trash counts
        useTrashStore.getState().fetchTrashCounts();
    },

    selectPassword: (id) => {
        set({ selectedPasswordId: id });
    },

    reorderPasswords: async (folderPath: string, passwordIds: string[]) => {
        // Update ranks locally
        set(state => ({
            passwords: state.passwords.map(p => {
                const newRank = passwordIds.indexOf(p.id);
                if (newRank !== -1) {
                    return { ...p, rank: newRank + 1 };
                }
                return p;
            }),
        }));
        // Persist to backend
        try {
            await invoke('reorderPasswords', { input: { folderPath, passwordIds } });
        } catch (error) {
            console.error('Failed to reorder passwords:', error);
            // Refetch to sync state
            await get().fetchPasswords();
        }
    },

    movePasswordToFolder: async (id: string, targetFolderPath: string) => {
        await invoke('movePasswordToFolder', { id, targetFolderPath });
        // Remove from local state immediately (works for both regular and trash items)
        set(state => ({
            passwords: state.passwords.filter(p => p.id !== id),
        }));
        // Refresh trash counts (in case item was moved from/to trash)
        useTrashStore.getState().fetchTrashCounts();
    },
}));
