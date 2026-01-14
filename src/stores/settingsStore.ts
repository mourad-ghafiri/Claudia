import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Settings, SettingsOverride } from '../types';

// Default settings
const defaultSettings: Settings = {
    theme: 'system',
    defaultMode: 'notes',
    defaultColor: '#3B82F6',
    notificationsEnabled: true,
    notificationSound: true,
    notificationMinutesBefore: 15,
    floatingOpacity: 0.95,
    currentWorkspace: null,
};

interface SettingsState {
    settings: Settings;
    globalSettings: Settings | null;
    loading: boolean;
    error: string | null;

    // Actions
    fetchSettings: () => Promise<void>;
    updateSettings: (settings: Partial<Settings>) => Promise<void>;
    fetchGlobalSettings: () => Promise<void>;
    updateGlobalSettings: (settings: Partial<Settings>) => Promise<void>;
    updateWorkspaceSettings: (settings: Partial<SettingsOverride>) => Promise<void>;
}

// Helper to validate theme value
function validateTheme(theme: string | undefined): 'light' | 'dark' | 'system' {
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
        return theme;
    }
    return 'system';
}

// Helper to validate defaultMode value
function validateDefaultMode(mode: string | undefined): 'notes' | 'tasks' {
    if (mode === 'notes' || mode === 'tasks') {
        return mode;
    }
    return 'notes';
}

export const useSettingsStore = create<SettingsState>((set) => ({
    settings: defaultSettings,
    globalSettings: null,
    loading: false,
    error: null,

    fetchSettings: async () => {
        set({ loading: true, error: null });
        try {
            // getSettings returns the effective (merged) settings
            const settings = await invoke<Settings>('getSettings');
            const globalSettings = await invoke<Settings>('getGlobalSettings').catch(() => null);

            // Normalize the settings
            const normalizedSettings: Settings = {
                ...defaultSettings,
                ...settings,
                theme: validateTheme(settings.theme),
                defaultMode: validateDefaultMode(settings.defaultMode),
            };

            console.log('[SettingsStore] Fetched settings:', normalizedSettings);
            set({ settings: normalizedSettings, globalSettings, loading: false });
        } catch (error) {
            console.error('[SettingsStore] Failed to fetch settings:', error);
            set({ error: String(error), loading: false });
        }
    },

    updateSettings: async (partialSettings: Partial<Settings>) => {
        console.log('[SettingsStore] updateSettings called with:', partialSettings);

        const input = {
            theme: partialSettings.theme,
            defaultMode: partialSettings.defaultMode,
            defaultColor: partialSettings.defaultColor,
            notificationsEnabled: partialSettings.notificationsEnabled,
            notificationSound: partialSettings.notificationSound,
            notificationMinutesBefore: partialSettings.notificationMinutesBefore,
            floatingOpacity: partialSettings.floatingOpacity,
        };

        try {
            // Update both global and workspace settings
            await invoke('updateGlobalSettings', { input });
            console.log('[SettingsStore] Settings saved successfully');
        } catch (error) {
            console.error('[SettingsStore] Failed to save settings:', error);
            throw error;
        }

        // Update local state
        set(state => ({
            settings: {
                ...state.settings,
                ...partialSettings,
            },
            globalSettings: state.globalSettings ? {
                ...state.globalSettings,
                ...partialSettings,
            } : null,
        }));
        console.log('[SettingsStore] Store updated with new settings');
    },

    fetchGlobalSettings: async () => {
        set({ loading: true, error: null });
        try {
            const globalSettings = await invoke<Settings>('getGlobalSettings');
            set({ globalSettings, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    updateGlobalSettings: async (partialSettings: Partial<Settings>) => {
        const input = {
            theme: partialSettings.theme,
            defaultMode: partialSettings.defaultMode,
            defaultColor: partialSettings.defaultColor,
            notificationsEnabled: partialSettings.notificationsEnabled,
            notificationSound: partialSettings.notificationSound,
            notificationMinutesBefore: partialSettings.notificationMinutesBefore,
            floatingOpacity: partialSettings.floatingOpacity,
        };

        await invoke('updateGlobalSettings', { input });

        set(state => ({
            settings: {
                ...state.settings,
                ...partialSettings,
            },
            globalSettings: state.globalSettings ? {
                ...state.globalSettings,
                ...partialSettings,
            } : null,
        }));
    },

    updateWorkspaceSettings: async (partialSettings: Partial<SettingsOverride>) => {
        const input = {
            theme: partialSettings.theme,
            defaultMode: partialSettings.defaultMode,
            defaultColor: partialSettings.defaultColor,
            notificationsEnabled: partialSettings.notificationsEnabled,
            notificationSound: partialSettings.notificationSound,
            notificationMinutesBefore: partialSettings.notificationMinutesBefore,
            floatingOpacity: partialSettings.floatingOpacity,
        };

        await invoke('updateWorkspaceSettings', { input });

        set(state => ({
            settings: {
                ...state.settings,
                ...partialSettings,
            },
        }));
    },
}));
