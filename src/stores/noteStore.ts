import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { NoteInfo, CreateNoteInput, UpdateNoteInput, Note, FloatWindow, TrashNoteInfo } from '../types';
import { toNote } from '../types';
import { useTrashStore } from './trashStore';

// Content cache for notes with LRU eviction to prevent memory leaks
const MAX_CONTENT_CACHE_SIZE = 100;
const contentCache = new Map<string, string>();

// Helper to add to cache with LRU eviction
function setContentCache(id: string, content: string) {
    // Delete first if exists to move to end (most recently used)
    contentCache.delete(id);

    // If cache is full, delete the oldest entry (first in map)
    if (contentCache.size >= MAX_CONTENT_CACHE_SIZE) {
        const firstKey = contentCache.keys().next().value;
        if (firstKey) contentCache.delete(firstKey);
    }
    contentCache.set(id, content);
}

interface NoteState {
    notes: Note[];
    selectedNoteId: string | null;
    selectedNoteContent: string;
    loading: boolean;
    error: string | null;

    // Actions
    fetchNotes: () => Promise<void>;
    fetchNotesByFolder: (folderPath: string) => Promise<void>;
    fetchTrashNotes: () => Promise<void>;
    getNoteContent: (id: string) => Promise<string>;
    createNote: (input: CreateNoteInput) => Promise<Note>;
    updateNote: (input: UpdateNoteInput & { isVisible?: boolean }) => Promise<void>;
    deleteNote: (id: string, permanent?: boolean) => Promise<void>;
    selectNote: (id: string | null) => void;
    reorderNotes: (folderPath: string, noteIds: string[]) => Promise<void>;

    // Sync helpers
    getNoteById: (id: string) => Note | null;
    updateNotePositionLocal: (noteId: string, x: number, y: number, width: number, height: number) => void;
    moveNoteToFolder: (id: string, targetFolderPath: string) => Promise<void>;
}

export const useNoteStore = create<NoteState>((set, get) => ({
    notes: [],
    selectedNoteId: null,
    selectedNoteContent: '',
    loading: false,
    error: null,

    fetchNotes: async () => {
        set({ loading: true, error: null });
        try {
            const notesInfo = await invoke<NoteInfo[]>('getNotes', { folderPath: null });
            // Don't load content upfront - only load when note is selected
            // Use cached content if available, otherwise empty string
            const notes = notesInfo.map((info) => {
                const cachedContent = contentCache.get(info.id) || '';
                return toNote(info, cachedContent);
            });
            set({ notes, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    fetchNotesByFolder: async (folderPath: string) => {
        set({ loading: true, error: null });
        try {
            const notesInfo = await invoke<NoteInfo[]>('getNotes', { folderPath });
            // Don't load content upfront - only load when note is selected
            const notes = notesInfo.map((info) => {
                const cachedContent = contentCache.get(info.id) || '';
                return toNote(info, cachedContent);
            });
            set({ notes, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    fetchTrashNotes: async () => {
        set({ loading: true, error: null });
        try {
            const trashNotes = await invoke<TrashNoteInfo[]>('listTrashNotes');
            // Convert TrashNoteInfo to Note format
            const notes: Note[] = trashNotes.map((info) => ({
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
                content: contentCache.get(info.id) || '',
                isVisible: false,
                windowX: 250,
                windowY: 200,
                windowWidth: 400,
                windowHeight: 300,
            }));
            set({ notes, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    getNoteContent: async (id: string) => {
        const cached = contentCache.get(id);
        if (cached !== undefined) {
            // Update both selectedNoteContent AND the note in the notes array
            set(state => ({
                selectedNoteContent: cached,
                notes: state.notes.map(n => n.id === id ? { ...n, content: cached } : n),
            }));
            return cached;
        }
        const content = await invoke<string>('getNoteContent', { id });
        setContentCache(id, content);
        // Update both selectedNoteContent and the note in the notes array
        set(state => ({
            selectedNoteContent: content,
            notes: state.notes.map(n => n.id === id ? { ...n, content } : n),
        }));
        return content;
    },

    createNote: async (input: CreateNoteInput) => {
        const noteInfo = await invoke<NoteInfo>('createNote', { input });
        const content = input.content || '';
        setContentCache(noteInfo.id, content);
        const note = toNote(noteInfo, content);
        set(state => ({ notes: [...state.notes, note] }));
        return note;
    },

    updateNote: async (input: UpdateNoteInput & { isVisible?: boolean }) => {
        // Build the backend input
        const backendInput: UpdateNoteInput = {
            id: input.id,
            title: input.title,
            color: input.color,
            pinned: input.pinned,
            tags: input.tags,
            content: input.content,
        };

        // Handle float window updates
        if (input.isVisible !== undefined || input.float) {
            const currentNote = get().notes.find(n => n.id === input.id);
            if (currentNote) {
                const floatWindow: FloatWindow = {
                    x: input.float?.x ?? currentNote.windowX,
                    y: input.float?.y ?? currentNote.windowY,
                    w: input.float?.w ?? currentNote.windowWidth,
                    h: input.float?.h ?? currentNote.windowHeight,
                    show: input.isVisible ?? input.float?.show ?? currentNote.isVisible,
                };
                backendInput.float = floatWindow;
            }
        }

        await invoke('updateNote', { input: backendInput });

        // Update content cache if content was changed
        if (input.content !== undefined) {
            setContentCache(input.id, input.content);
        }

        set(state => ({
            notes: state.notes.map(n => {
                if (n.id !== input.id) return n;
                return {
                    ...n,
                    title: input.title ?? n.title,
                    color: input.color ?? n.color,
                    pinned: input.pinned ?? n.pinned,
                    tags: input.tags ?? n.tags,
                    content: input.content ?? n.content,
                    isVisible: input.isVisible ?? input.float?.show ?? n.isVisible,
                    windowX: input.float?.x ?? n.windowX,
                    windowY: input.float?.y ?? n.windowY,
                    windowWidth: input.float?.w ?? n.windowWidth,
                    windowHeight: input.float?.h ?? n.windowHeight,
                    updated: Date.now(),
                };
            }),
        }));
    },

    deleteNote: async (id: string, permanent?: boolean) => {
        await invoke('deleteNote', { id, permanent: permanent ?? false });
        contentCache.delete(id);
        set(state => ({
            notes: state.notes.filter(n => n.id !== id),
            selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
        }));
        // Refresh trash counts
        useTrashStore.getState().fetchTrashCounts();
    },

    selectNote: (id: string | null) => {
        set({ selectedNoteId: id });
        if (id) {
            get().getNoteContent(id);
        } else {
            set({ selectedNoteContent: '' });
        }
    },

    reorderNotes: async (folderPath: string, noteIds: string[]) => {
        // Update ranks locally
        set(state => ({
            notes: state.notes.map(n => {
                const newRank = noteIds.indexOf(n.id);
                if (newRank !== -1) {
                    return { ...n, rank: newRank + 1 };
                }
                return n;
            }),
        }));
        // Persist to backend
        try {
            await invoke('reorderNotes', { input: { folderPath, noteIds } });
        } catch (error) {
            console.error('Failed to reorder notes:', error);
            // Refetch to sync state
            await get().fetchNotes();
        }
    },

    getNoteById: (id: string) => {
        return get().notes.find(n => n.id === id) || null;
    },

    updateNotePositionLocal: (noteId: string, x: number, y: number, width: number, height: number) => {
        set(state => ({
            notes: state.notes.map(n => {
                if (n.id !== noteId) return n;
                return {
                    ...n,
                    windowX: x,
                    windowY: y,
                    windowWidth: width,
                    windowHeight: height,
                };
            }),
        }));
    },

    moveNoteToFolder: async (id: string, targetFolderPath: string) => {
        await invoke('moveNoteToFolder', { id, targetFolderPath });
        // Remove from local state immediately (works for both regular and trash items)
        set(state => ({
            notes: state.notes.filter(n => n.id !== id),
        }));
        // Refresh trash counts (in case item was moved from/to trash)
        useTrashStore.getState().fetchTrashCounts();
    },
}));
