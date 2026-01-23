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
import { Plus, Folder as FolderIcon } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useFolderStore } from '../stores/folderStore';
import { useUIStore } from '../stores/uiStore';
import { FolderSidebar } from '../components/layout/FolderSidebar';
import { KanbanColumn } from '../components/kanban/KanbanColumn';
import { KanbanCard } from '../components/kanban/KanbanCard';
import { TemplateSelector } from '../components/template/TemplateSelector';
import type { Task, TaskStatus, FolderInfo, TemplateInfo } from '../types';
import toast from 'react-hot-toast';

const columns: { id: TaskStatus; title: string; color: string }[] = [
    { id: 'todo', title: 'To Do', color: 'gray' },
    { id: 'doing', title: 'Doing', color: 'blue' },
    { id: 'done', title: 'Done', color: 'green' },
];

export function TasksView() {
    const { tasks, fetchTasks, fetchTasksByFolder, updateTask, getTasksByStatus, moveTaskToFolder } = useTaskStore();
    const { currentFolderPath, setCurrentFolder, moveFolder, getFolderById } = useFolderStore();
    const { openTaskEditorWithTemplate, searchQuery } = useUIStore();
    const [activeTask, setActiveTask] = useState<Task | null>(null);
    const [draggedFolder, setDraggedFolder] = useState<FolderInfo | null>(null);
    const [showTemplateSelector, setShowTemplateSelector] = useState(false);

    const handleNewTask = useCallback(() => {
        setShowTemplateSelector(true);
    }, []);

    const handleTemplateSelect = useCallback((content: string, templateInfo: TemplateInfo) => {
        openTaskEditorWithTemplate(content, templateInfo.color, templateInfo.name);
    }, [openTaskEditorWithTemplate]);

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
        const activeId = event.active.id as string;

        // Check if it's a task
        const task = tasks.find((t) => t.id === activeId);
        if (task) {
            setActiveTask(task);
            setDraggedFolder(null);
            return;
        }

        // Check if it's a folder (search recursively through tree)
        const folder = getFolderById(activeId);
        if (folder) {
            setDraggedFolder(folder);
            setActiveTask(null);
        }
    }, [tasks, getFolderById]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;
        const wasDraggingFolder = draggedFolder !== null;
        setActiveTask(null);
        setDraggedFolder(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Handle folder movement (drop folder onto another folder to move it inside)
        if (wasDraggingFolder) {
            // overId is in format "folder-{path}" from droppable
            if (typeof overId === 'string' && overId.startsWith('folder-')) {
                const targetFolderPath = overId.replace('folder-', '');
                // Search recursively through folder tree to find the dragged folder
                const activeFolder = getFolderById(activeId);

                if (activeFolder && activeFolder.path !== targetFolderPath) {
                    // Check if target is not a descendant of the source (prevent moving into itself)
                    if (!targetFolderPath.startsWith(activeFolder.path + '/')) {
                        try {
                            await moveFolder(activeFolder.path, targetFolderPath);
                            toast.success('Folder moved');
                        } catch (error) {
                            toast.error('Failed to move folder');
                        }
                    }
                }
            }
            return;
        }

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
    }, [tasks, draggedFolder, moveTaskToFolder, updateTask, moveFolder, getFolderById]);

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
                            onClick={handleNewTask}
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
                    {draggedFolder && (
                        <div className="flex items-center gap-2 py-1.5 px-3 bg-white dark:bg-[#2E2E2E] rounded-lg shadow-lg border border-[#DA7756] opacity-90 pointer-events-none">
                            <FolderIcon className="w-4 h-4 text-[#DA7756]" />
                            <span className="text-sm text-[#2D2D2D] dark:text-[#E8E6E3]">{draggedFolder.name}</span>
                        </div>
                    )}
                </DragOverlay>

                {/* Template Selector Modal */}
                <TemplateSelector
                    isOpen={showTemplateSelector}
                    onClose={() => setShowTemplateSelector(false)}
                    onSelect={handleTemplateSelect}
                    templateType="tasks"
                />
            </div>
        </DndContext>
    );
}
