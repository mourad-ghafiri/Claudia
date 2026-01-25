import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { TaskInfo, TaskStatus, CreateTaskInput, UpdateTaskInput, Task, FloatWindow, TrashTaskInfo } from '../types';
import { toTask } from '../types';
import { useTrashStore } from './trashStore';

// Content cache for task descriptions with LRU eviction to prevent memory leaks
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

interface TaskState {
    tasks: Task[];
    selectedTaskId: string | null;
    selectedTaskContent: string;
    loading: boolean;
    error: string | null;

    // Actions
    fetchTasks: () => Promise<void>;
    fetchTasksByFolder: (folderPath: string) => Promise<void>;
    fetchTrashTasks: () => Promise<void>;
    fetchTasksByStatus: (status: TaskStatus) => Promise<Task[]>;
    getTaskContent: (id: string) => Promise<string>;
    createTask: (input: CreateTaskInput) => Promise<Task>;
    updateTask: (input: UpdateTaskInput & { isVisible?: boolean }) => Promise<void>;
    deleteTask: (id: string, permanent?: boolean) => Promise<void>;
    selectTask: (id: string | null) => void;

    // Sync helpers
    getTaskById: (id: string) => Task | null;
    getTasksByStatus: (status: TaskStatus) => Task[];
    getDoingTasks: () => Task[];
    getVisibleDoingTasks: () => Task[];
    updateTaskPositionLocal: (taskId: string, x: number, y: number, width: number, height: number) => void;
    moveTaskToFolder: (id: string, targetFolderPath: string) => Promise<void>;
    reorderTasks: (folderPath: string, status: TaskStatus, taskIds: string[]) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
    tasks: [],
    selectedTaskId: null,
    selectedTaskContent: '',
    loading: false,
    error: null,

    fetchTasks: async () => {
        set({ loading: true, error: null });
        try {
            const tasksInfo = await invoke<TaskInfo[]>('getTasks', {
                folderPath: null,
                status: null,
            });
            // Don't load content upfront - only load when task is selected
            const tasks = tasksInfo.map((info) => {
                const cachedDescription = contentCache.get(info.id) || '';
                return toTask(info, cachedDescription);
            });
            set({ tasks, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    fetchTasksByFolder: async (folderPath: string) => {
        set({ loading: true, error: null });
        try {
            const tasksInfo = await invoke<TaskInfo[]>('getTasks', {
                folderPath,
                status: null,
            });
            // Don't load content upfront - only load when task is selected
            const tasks = tasksInfo.map((info) => {
                const cachedDescription = contentCache.get(info.id) || '';
                return toTask(info, cachedDescription);
            });
            set({ tasks, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    fetchTrashTasks: async () => {
        set({ loading: true, error: null });
        try {
            const trashTasks = await invoke<TrashTaskInfo[]>('listTrashTasks');
            // Convert TrashTaskInfo to Task format
            const tasks: Task[] = trashTasks.map((info) => ({
                id: info.id,
                title: info.title,
                rank: 0,
                status: info.status,
                color: info.color,
                pinned: info.pinned,
                tags: info.tags,
                due: info.due,
                created: info.created,
                updated: info.updated,
                folderPath: '.trash',
                path: info.path,
                description: contentCache.get(info.id) || '',
                isVisible: false,
                windowX: 200,
                windowY: 150,
                windowWidth: 320,
                windowHeight: 240,
            }));
            set({ tasks, loading: false });
        } catch (error) {
            set({ error: String(error), loading: false });
        }
    },

    fetchTasksByStatus: async (status: TaskStatus) => {
        const tasksInfo = await invoke<TaskInfo[]>('getTasks', {
            folderPath: null,
            status,
        });
        // Don't load content upfront - only load when task is selected
        const tasks = tasksInfo.map((info) => {
            const cachedDescription = contentCache.get(info.id) || '';
            return toTask(info, cachedDescription);
        });
        return tasks;
    },

    getTaskContent: async (id: string) => {
        const cached = contentCache.get(id);
        if (cached !== undefined) {
            // Update both selectedTaskContent AND the task in the tasks array
            set(state => ({
                selectedTaskContent: cached,
                tasks: state.tasks.map(t => t.id === id ? { ...t, description: cached } : t),
            }));
            return cached;
        }
        const content = await invoke<string>('getTaskContent', { id });
        setContentCache(id, content);
        // Update both selectedTaskContent and the task in the tasks array
        set(state => ({
            selectedTaskContent: content,
            tasks: state.tasks.map(t => t.id === id ? { ...t, description: content } : t),
        }));
        return content;
    },

    createTask: async (input: CreateTaskInput) => {
        const taskInfo = await invoke<TaskInfo>('createTask', { input });
        const description = input.content || '';
        setContentCache(taskInfo.id, description);
        const task = toTask(taskInfo, description);
        set(state => ({ tasks: [...state.tasks, task] }));
        return task;
    },

    updateTask: async (input: UpdateTaskInput & { isVisible?: boolean }) => {
        // Build the UpdateTaskInput for the backend
        const backendInput: UpdateTaskInput = {
            id: input.id,
            title: input.title,
            status: input.status,
            color: input.color,
            pinned: input.pinned,
            tags: input.tags,
            due: input.due,
            content: input.content,
        };

        // Handle float window updates
        if (input.isVisible !== undefined || input.float) {
            const currentTask = get().tasks.find(t => t.id === input.id);
            if (currentTask) {
                const floatWindow: FloatWindow = {
                    x: input.float?.x ?? currentTask.windowX,
                    y: input.float?.y ?? currentTask.windowY,
                    w: input.float?.w ?? currentTask.windowWidth,
                    h: input.float?.h ?? currentTask.windowHeight,
                    show: input.isVisible ?? input.float?.show ?? currentTask.isVisible,
                };
                backendInput.float = floatWindow;
            }
        }

        await invoke('updateTask', { input: backendInput });

        // Update content cache if content was changed
        if (input.content !== undefined) {
            setContentCache(input.id, input.content);
        }

        set(state => ({
            tasks: state.tasks.map(t => {
                if (t.id !== input.id) return t;
                return {
                    ...t,
                    title: input.title ?? t.title,
                    status: (input.status as TaskStatus) ?? t.status,
                    color: input.color ?? t.color,
                    pinned: input.pinned ?? t.pinned,
                    tags: input.tags ?? t.tags,
                    due: input.due ?? t.due,
                    description: input.content ?? t.description,
                    isVisible: input.isVisible ?? input.float?.show ?? t.isVisible,
                    windowX: input.float?.x ?? t.windowX,
                    windowY: input.float?.y ?? t.windowY,
                    windowWidth: input.float?.w ?? t.windowWidth,
                    windowHeight: input.float?.h ?? t.windowHeight,
                    updated: Date.now(),
                };
            }),
        }));
    },

    deleteTask: async (id: string, permanent?: boolean) => {
        await invoke('deleteTask', { id, permanent: permanent ?? false });
        contentCache.delete(id);
        set(state => ({
            tasks: state.tasks.filter(t => t.id !== id),
            selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
        }));
        // Refresh trash counts
        useTrashStore.getState().fetchTrashCounts();
    },

    selectTask: (id: string | null) => {
        set({ selectedTaskId: id });
        if (id) {
            get().getTaskContent(id);
        } else {
            set({ selectedTaskContent: '' });
        }
    },

    getTaskById: (id: string) => {
        return get().tasks.find(t => t.id === id) || null;
    },

    getTasksByStatus: (status: TaskStatus) => {
        return get().tasks.filter(t => t.status === status);
    },

    getDoingTasks: () => {
        return get().tasks.filter(t => t.status === 'doing');
    },

    getVisibleDoingTasks: () => {
        return get().tasks.filter(t => t.status === 'doing' && t.isVisible);
    },

    updateTaskPositionLocal: (taskId: string, x: number, y: number, width: number, height: number) => {
        set(state => ({
            tasks: state.tasks.map(t => {
                if (t.id !== taskId) return t;
                return {
                    ...t,
                    windowX: x,
                    windowY: y,
                    windowWidth: width,
                    windowHeight: height,
                };
            }),
        }));
    },

    moveTaskToFolder: async (id: string, targetFolderPath: string) => {
        await invoke('moveTaskToFolder', { id, targetFolderPath });
        // Remove from local state immediately (works for both regular and trash items)
        set(state => ({
            tasks: state.tasks.filter(t => t.id !== id),
        }));
        // Refresh trash counts (in case item was moved from/to trash)
        useTrashStore.getState().fetchTrashCounts();
    },

    reorderTasks: async (folderPath: string, status: TaskStatus, taskIds: string[]) => {
        // Update ranks locally first for immediate UI feedback
        set(state => ({
            tasks: state.tasks.map(t => {
                const newRank = taskIds.indexOf(t.id);
                if (newRank !== -1 && t.status === status) {
                    return { ...t, rank: newRank + 1 };
                }
                return t;
            }),
        }));
        // Persist to backend
        try {
            await invoke('reorderTasks', { input: { folderPath, status, taskIds } });
        } catch (error) {
            console.error('Failed to reorder tasks:', error);
            // Refetch to sync state
            await get().fetchTasks();
        }
    },
}));
