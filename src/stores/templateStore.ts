import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { TemplateInfo, TemplateType } from '../types';

interface TemplateState {
  noteTemplates: TemplateInfo[];
  taskTemplates: TemplateInfo[];
  loading: boolean;
  error: string | null;
  initialized: boolean;

  // Actions
  fetchTemplates: (templateType: TemplateType) => Promise<void>;
  getTemplateContent: (templateType: TemplateType, id: string) => Promise<string>;
  initializeDefaultTemplates: () => Promise<void>;

  // Helpers
  getTemplatesByCategory: (templateType: TemplateType, category: string) => TemplateInfo[];
  getTemplateById: (templateType: TemplateType, id: string) => TemplateInfo | undefined;
  getCategories: (templateType: TemplateType) => string[];
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  noteTemplates: [],
  taskTemplates: [],
  loading: false,
  error: null,
  initialized: false,

  fetchTemplates: async (templateType: TemplateType) => {
    set({ loading: true, error: null });
    try {
      const templates = await invoke<TemplateInfo[]>('getTemplates', { templateType });
      if (templateType === 'notes') {
        set({ noteTemplates: templates, loading: false });
      } else {
        set({ taskTemplates: templates, loading: false });
      }
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  getTemplateContent: async (templateType: TemplateType, id: string) => {
    try {
      const content = await invoke<string>('getTemplateContent', { templateType, id });
      return content;
    } catch (error) {
      console.error('Failed to get template content:', error);
      return '';
    }
  },

  initializeDefaultTemplates: async () => {
    if (get().initialized) return;

    set({ loading: true, error: null });
    try {
      await invoke('initializeDefaultTemplates');
      set({ initialized: true, loading: false });
      // Fetch both types after initialization
      await get().fetchTemplates('notes');
      await get().fetchTemplates('tasks');
    } catch (error) {
      console.error('Failed to initialize default templates:', error);
      // Set initialized to true to prevent infinite retry loops
      // Set error so UI can display it if needed
      set({
        initialized: true,
        loading: false,
        error: 'Failed to initialize templates. Some features may not work correctly.',
      });
    }
  },

  getTemplatesByCategory: (templateType: TemplateType, category: string) => {
    const templates = templateType === 'notes' ? get().noteTemplates : get().taskTemplates;
    if (category === 'all') return templates;
    return templates.filter(t => t.category === category);
  },

  getTemplateById: (templateType: TemplateType, id: string) => {
    const templates = templateType === 'notes' ? get().noteTemplates : get().taskTemplates;
    return templates.find(t => t.id === id);
  },

  getCategories: (templateType: TemplateType) => {
    const templates = templateType === 'notes' ? get().noteTemplates : get().taskTemplates;
    const categories = new Set(templates.map(t => t.category));
    return Array.from(categories);
  },
}));
