import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { PasswordInfo, CreatePasswordInput, UpdatePasswordInput, DecryptedPasswordContent } from '../types';

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

// Auto-lock timeout - 10 minutes
const AUTO_LOCK_TIMEOUT = 10 * 60 * 1000;
const AUTO_LOCK_CHECK_INTERVAL = 60 * 1000; // Check every minute

interface PasswordState {
    passwords: PasswordInfo[];
    selectedPasswordId: string | null;
    isUnlocked: boolean;
    masterPassword: string | null; // Held in memory while unlocked
    loading: boolean;
    error: string | null;
    // Decrypted content cache
    decryptedCache: Map<string, CachedContent>;
    // Auto-lock
    lastActivity: number;
    autoLockTimerId: ReturnType<typeof setInterval> | null;

    // Actions
    fetchPasswords: (folderPath?: string) => Promise<void>;
    getPasswordById: (id: string) => PasswordInfo | null;
    getDecryptedContent: (id: string) => Promise<DecryptedPasswordContent>;
    getDecryptedContentsBatch: (ids: string[]) => Promise<void>;
    getCachedContent: (id: string) => DecryptedPasswordContent | null;
    invalidateCache: (id?: string) => void;
    createPassword: (input: Omit<CreatePasswordInput, 'masterPassword'>) => Promise<void>;
    updatePassword: (input: Omit<UpdatePasswordInput, 'masterPassword'>) => Promise<void>;
    deletePassword: (id: string) => Promise<void>;
    selectPassword: (id: string | null) => void;
    reorderPasswords: (folderPath: string, passwordIds: string[]) => Promise<void>;
    movePasswordToFolder: (id: string, targetFolderPath: string) => Promise<void>;

    // Master password
    isMasterPasswordSet: () => Promise<boolean>;
    setMasterPassword: (password: string) => Promise<void>;
    unlock: (password: string) => Promise<boolean>;
    lock: () => void;
    changeMasterPassword: (current: string, newPassword: string) => Promise<void>;

    // Auto-lock
    resetActivity: () => void;
    startAutoLock: () => void;
    stopAutoLock: () => void;
}

export const usePasswordStore = create<PasswordState>((set, get) => ({
    passwords: [],
    selectedPasswordId: null,
    isUnlocked: false,
    masterPassword: null,
    loading: false,
    error: null,
    decryptedCache: new Map(),
    lastActivity: Date.now(),
    autoLockTimerId: null,

    fetchPasswords: async (folderPath?: string) => {
        set({ loading: true, error: null });
        try {
            const passwords = await invoke<PasswordInfo[]>('getPasswords', { folderPath: folderPath ?? null });
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

    getDecryptedContent: async (id) => {
        const { masterPassword, decryptedCache, resetActivity } = get();
        if (!masterPassword) {
            throw new Error('Vault is locked');
        }

        // Reset activity timer on password access
        resetActivity();

        // Check cache first
        const cached = decryptedCache.get(id);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.content;
        }

        // Fetch from backend
        const content = await invoke<DecryptedPasswordContent>('getPasswordContent', { id, masterPassword });

        // Update cache
        const newCache = new Map(decryptedCache);
        newCache.set(id, { content, timestamp: Date.now() });
        set({ decryptedCache: newCache });

        return content;
    },

    getDecryptedContentsBatch: async (ids: string[]) => {
        const { masterPassword, decryptedCache } = get();
        if (!masterPassword) {
            throw new Error('Vault is locked');
        }

        // Filter out IDs that are already cached
        const uncachedIds = ids.filter(id => {
            const cached = decryptedCache.get(id);
            return !cached || Date.now() - cached.timestamp >= CACHE_TTL;
        });

        if (uncachedIds.length === 0) {
            return; // All requested IDs are cached
        }

        // Batch fetch from backend
        const results = await invoke<BatchDecryptedContent[]>('getPasswordContentsBatch', {
            ids: uncachedIds,
            masterPassword,
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
        const { masterPassword, fetchPasswords, resetActivity } = get();
        if (!masterPassword) {
            throw new Error('Vault is locked');
        }
        resetActivity();
        await invoke('createPassword', { input: { ...input, masterPassword } });
        await fetchPasswords();
    },

    updatePassword: async (input) => {
        const { masterPassword, fetchPasswords, invalidateCache, resetActivity } = get();
        if (!masterPassword) {
            throw new Error('Vault is locked');
        }
        resetActivity();
        await invoke('updatePassword', { input: { ...input, masterPassword } });
        invalidateCache(input.id); // Clear stale cached content for this password
        await fetchPasswords();
    },

    deletePassword: async (id) => {
        await invoke('deletePassword', { id });
        get().invalidateCache(id); // Clear cached content for deleted password
        await get().fetchPasswords();
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
        // Refetch all passwords to ensure consistency
        await get().fetchPasswords();
    },

    // Master password methods
    isMasterPasswordSet: async () => {
        return await invoke<boolean>('isMasterPasswordSet');
    },

    setMasterPassword: async (password) => {
        await invoke('setMasterPassword', { password });
        set({ isUnlocked: true, masterPassword: password, lastActivity: Date.now() });
        get().startAutoLock();
    },

    unlock: async (password) => {
        const isValid = await invoke<boolean>('verifyMasterPassword', { password });
        if (isValid) {
            set({ isUnlocked: true, masterPassword: password, lastActivity: Date.now() });
            get().startAutoLock();
        }
        return isValid;
    },

    lock: () => {
        get().stopAutoLock();
        set({ isUnlocked: false, masterPassword: null, selectedPasswordId: null, decryptedCache: new Map() });
    },

    changeMasterPassword: async (currentPassword, newPassword) => {
        await invoke('changeMasterPassword', { currentPassword, newPassword });
        set({ masterPassword: newPassword });
        get().resetActivity();
    },

    // Auto-lock methods
    resetActivity: () => {
        set({ lastActivity: Date.now() });
    },

    startAutoLock: () => {
        const { autoLockTimerId } = get();
        // Don't start if already running
        if (autoLockTimerId) return;

        const timerId = setInterval(() => {
            const { masterPassword, lastActivity, lock } = get();
            if (masterPassword && Date.now() - lastActivity > AUTO_LOCK_TIMEOUT) {
                lock();
            }
        }, AUTO_LOCK_CHECK_INTERVAL);

        set({ autoLockTimerId: timerId });
    },

    stopAutoLock: () => {
        const { autoLockTimerId } = get();
        if (autoLockTimerId) {
            clearInterval(autoLockTimerId);
            set({ autoLockTimerId: null });
        }
    },
}));
