import { useEffect, useState, useMemo, useCallback } from 'react';
import {
    DndContext,
    DragOverlay,
    closestCorners,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useFolderStore } from '../stores/folderStore';
import { useUIStore } from '../stores/uiStore';
import { FolderSidebar } from '../components/layout/FolderSidebar';
import { KanbanColumn } from '../components/kanban/KanbanColumn';
import { KanbanCard } from '../components/kanban/KanbanCard';
import type { Task, TaskStatus } from '../types';
import toast from 'react-hot-toast';

const columns: { id: TaskStatus; title: string; color: string }[] = [
    { id: 'todo', title: 'To Do', color: 'gray' },
    { id: 'doing', title: 'Doing', color: 'blue' },
    { id: 'done', title: 'Done', color: 'green' },
];

export function TasksView() {
    const { tasks, fetchTasks, fetchTasksByFolder, updateTask, getTasksByStatus, moveTaskToFolder } = useTaskStore();
    const { currentFolderPath, setCurrentFolder } = useFolderStore();
    const { openTaskEditor, searchQuery } = useUIStore();
    const [activeTask, setActiveTask] = useState<Task | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        })
    );

    useEffect(() => {
        if (currentFolderPath) {
            fetchTasksByFolder(currentFolderPath);
        } else {
            fetchTasks();
        }
    }, [currentFolderPath, fetchTasks, fetchTasksByFolder]);

    // Listen for folder-deleted event to refetch tasks
    useEffect(() => {
        const handleFolderDeleted = (event: Event) => {
            const customEvent = event as CustomEvent<{ folderPath: string }>;
            // Reset current folder if it was the deleted one
            if (currentFolderPath === customEvent.detail.folderPath) {
                setCurrentFolder(null);
            }
            fetchTasks();
        };
        window.addEventListener('folder-deleted', handleFolderDeleted);
        return () => window.removeEventListener('folder-deleted', handleFolderDeleted);
    }, [fetchTasks, currentFolderPath, setCurrentFolder]);

    const handleFolderChange = useCallback((folderPath: string | null) => {
        setCurrentFolder(folderPath);
        if (folderPath) {
            fetchTasksByFolder(folderPath);
        } else {
            fetchTasks();
        }
    }, [setCurrentFolder, fetchTasksByFolder, fetchTasks]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const task = tasks.find((t) => t.id === event.active.id);
        if (task) setActiveTask(task);
    }, [tasks]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTask(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Handle dropping task onto a folder
        if (typeof overId === 'string' && overId.startsWith('folder-')) {
            const targetFolderPath = overId.replace('folder-', '');
            const task = tasks.find(t => t.id === activeId);
            if (task && task.folderPath !== targetFolderPath) {
                try {
                    await moveTaskToFolder(activeId, targetFolderPath);
                    toast.success('Task moved to folder');
                } catch (error) {
                    toast.error('Failed to move task');
                }
            }
            return;
        }

        const activeTask = tasks.find((t) => t.id === activeId);
        if (!activeTask) return;

        // Check if dropped on a column
        const targetColumn = columns.find((c) => c.id === overId);
        if (targetColumn) {
            if (activeTask.status !== targetColumn.id) {
                await updateTask({
                    id: activeId,
                    status: targetColumn.id,
                });
            }
            return;
        }

        // Check if dropped on another card
        const overTask = tasks.find((t) => t.id === overId);
        if (overTask && activeTask.status !== overTask.status) {
            await updateTask({
                id: activeId,
                status: overTask.status,
            });
        }
    }, [tasks, moveTaskToFolder, updateTask]);

    // Memoize filtered tasks by status for each column
    // When currentFolderPath is null (All Tasks), show ALL tasks regardless of folder
    // Also filter by searchQuery
    const todoTasks = useMemo(() => {
        return getTasksByStatus('todo')
            .filter(t => currentFolderPath === null || t.folderPath === currentFolderPath)
            .filter(t => !searchQuery ||
                t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
            );
    }, [tasks, currentFolderPath, searchQuery, getTasksByStatus]);

    const doingTasks = useMemo(() => {
        return getTasksByStatus('doing')
            .filter(t => currentFolderPath === null || t.folderPath === currentFolderPath)
            .filter(t => !searchQuery ||
                t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
            );
    }, [tasks, currentFolderPath, searchQuery, getTasksByStatus]);

    const doneTasks = useMemo(() => {
        return getTasksByStatus('done')
            .filter(t => currentFolderPath === null || t.folderPath === currentFolderPath)
            .filter(t => !searchQuery ||
                t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
            );
    }, [tasks, currentFolderPath, searchQuery, getTasksByStatus]);

    const tasksByStatus: Record<TaskStatus, Task[]> = useMemo(() => ({
        todo: todoTasks,
        doing: doingTasks,
        done: doneTasks,
        archived: [],
    }), [todoTasks, doingTasks, doneTasks]);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="h-full flex bg-[#FAF9F7] dark:bg-[#1A1A1A]">
                {/* Folder Sidebar */}
                <FolderSidebar
                    title="Folders"
                    allItemsLabel="All Tasks"
                    onFolderChange={handleFolderChange}
                />

                {/* Kanban Columns */}
                <div className="flex-1 h-full flex flex-col">
                    {/* Header */}
                    <div className="p-3 border-b border-[#EBE8E4] dark:border-[#2E2E2E] flex items-center justify-between bg-white dark:bg-[#242424]">
                        <h2 className="font-semibold text-[#2D2D2D] dark:text-[#E8E6E3]">Tasks</h2>
                        <button
                            onClick={() => openTaskEditor()}
                            className="p-1.5 hover:bg-[#F5F3F0] dark:hover:bg-[#2E2E2E] rounded-lg transition-colors"
                            title="New Task"
                        >
                            <Plus className="w-4 h-4 text-[#B5AFA6]" />
                        </button>
                    </div>

                    {/* Columns */}
                    <div className="flex-1 p-6 overflow-x-auto">
                        <div className="flex gap-5 h-full">
                            {columns.map((column) => (
                                <KanbanColumn
                                    key={column.id}
                                    id={column.id}
                                    title={column.title}
                                    tasks={tasksByStatus[column.id]}
                                    color={column.color}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <DragOverlay>
                    {activeTask && (
                        <div className="opacity-90 rotate-3 w-72">
                            <KanbanCard task={activeTask} columnStatus={activeTask.status} />
                        </div>
                    )}
                </DragOverlay>
            </div>
        </DndContext>
    );
}
