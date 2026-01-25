import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface VaultState {
    isUnlocked: boolean;
    isSetup: boolean;
    isLoading: boolean;
    error: string | null;
    // Passwords-only access (auto-locks after 10 min inactivity)
    isPasswordsAccessUnlocked: boolean;
    passwordsError: string | null;

    // Actions
    checkVaultStatus: () => Promise<void>;
    unlock: (password: string) => Promise<boolean>;
    lock: () => Promise<void>;
    setup: (password: string) => Promise<void>;
    changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
    clearError: () => void;
    updateActivity: () => void;
    // Passwords access actions
    checkPasswordsAccess: () => Promise<void>;
    unlockPasswordsAccess: (password: string) => Promise<boolean>;
    lockPasswordsAccess: () => Promise<void>;
    updatePasswordsActivity: () => void;
    clearPasswordsError: () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
    isUnlocked: false,
    isSetup: false,
    isLoading: true,
    error: null,
    isPasswordsAccessUnlocked: false,
    passwordsError: null,

    checkVaultStatus: async () => {
        set({ isLoading: true, error: null });
        try {
            const [isSetup, isUnlocked, isPasswordsAccessUnlocked] = await Promise.all([
                invoke<boolean>('isVaultSetup'),
                invoke<boolean>('isVaultUnlocked'),
                invoke<boolean>('isPasswordsAccessUnlocked'),
            ]);
            set({ isSetup, isUnlocked, isPasswordsAccessUnlocked, isLoading: false });
        } catch (error) {
            set({ error: String(error), isLoading: false });
        }
    },

    unlock: async (password: string) => {
        set({ isLoading: true, error: null });
        try {
            const success = await invoke<boolean>('unlockVault', { password });
            if (success) {
                // Vault unlock also unlocks passwords access
                set({ isUnlocked: true, isPasswordsAccessUnlocked: true, isLoading: false });
            } else {
                set({ error: 'Invalid password', isLoading: false });
            }
            return success;
        } catch (error) {
            set({ error: String(error), isLoading: false });
            return false;
        }
    },

    lock: async () => {
        try {
            await invoke('lockVault');
            set({ isUnlocked: false, isPasswordsAccessUnlocked: false });
        } catch (error) {
            console.error('Failed to lock vault:', error);
        }
    },

    setup: async (password: string) => {
        set({ isLoading: true, error: null });
        try {
            await invoke('setupMasterPassword', { password });
            set({ isSetup: true, isUnlocked: true, isPasswordsAccessUnlocked: true, isLoading: false });
        } catch (error) {
            set({ error: String(error), isLoading: false });
            throw error;
        }
    },

    changePassword: async (oldPassword: string, newPassword: string) => {
        set({ isLoading: true, error: null });
        try {
            await invoke('changeMasterPasswordVault', { oldPassword, newPassword });
            set({ isLoading: false });
        } catch (error) {
            set({ error: String(error), isLoading: false });
            throw error;
        }
    },

    clearError: () => {
        set({ error: null });
    },

    updateActivity: () => {
        // Call backend (kept for compatibility, no longer auto-locks vault)
        invoke('updateVaultActivity').catch(console.error);
    },

    // Passwords-only access management
    checkPasswordsAccess: async () => {
        try {
            const isPasswordsAccessUnlocked = await invoke<boolean>('isPasswordsAccessUnlocked');
            set({ isPasswordsAccessUnlocked });
        } catch (error) {
            console.error('Failed to check passwords access:', error);
        }
    },

    unlockPasswordsAccess: async (password: string) => {
        set({ passwordsError: null });
        try {
            const success = await invoke<boolean>('unlockPasswordsAccess', { password });
            if (success) {
                set({ isPasswordsAccessUnlocked: true });
            } else {
                set({ passwordsError: 'Invalid password' });
            }
            return success;
        } catch (error) {
            set({ passwordsError: String(error) });
            return false;
        }
    },

    lockPasswordsAccess: async () => {
        try {
            await invoke('lockPasswordsAccess');
            set({ isPasswordsAccessUnlocked: false });
        } catch (error) {
            console.error('Failed to lock passwords access:', error);
        }
    },

    updatePasswordsActivity: () => {
        // Call backend to reset passwords auto-lock timer
        invoke('updatePasswordsActivity').catch(console.error);
    },

    clearPasswordsError: () => {
        set({ passwordsError: null });
    },
}));

// Auto-update activity on user interactions
if (typeof window !== 'undefined') {
    const debouncedUpdateActivity = (() => {
        let timeout: ReturnType<typeof setTimeout> | null = null;
        return () => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                const store = useVaultStore.getState();
                if (store.isUnlocked) {
                    store.updateActivity();
                }
            }, 5000); // Debounce activity updates to every 5 seconds
        };
    })();

    ['click', 'keydown', 'mousemove', 'scroll'].forEach(event => {
        window.addEventListener(event, debouncedUpdateActivity, { passive: true });
    });
}
