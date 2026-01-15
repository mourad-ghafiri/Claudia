import { useEffect, useState } from 'react';
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
import { Folder as FolderIcon, ChevronRight, Plus, Trash2, Pin, Edit2, X, Check } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { useFolderStore } from '../../stores/folderStore';
import type { Task, TaskStatus } from '../../types';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import toast from 'react-hot-toast';

const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: 'todo', title: 'To Do', color: 'gray' },
  { id: 'doing', title: 'Doing', color: 'blue' },
  { id: 'done', title: 'Done', color: 'green' },
];

export function KanbanBoard() {
  const { tasks, fetchTasks, fetchTasksByFolder, updateTask, getTasksByStatus } = useTaskStore();
  const {
    folders,
    currentFolderPath,
    setCurrentFolder,
    createFolder,
    deleteFolder,
    updateFolder,
    fetchFolders,
    getBreadcrumbs,
    getFolderByPath
  } = useFolderStore();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderPath, setEditingFolderPath] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    if (currentFolderPath) {
      fetchTasksByFolder(currentFolderPath);
    } else {
      fetchTasks();
    }
  }, [currentFolderPath, fetchTasks, fetchTasksByFolder]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

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
  };

  const handleFolderClick = (folderPath: string | null) => {
    setCurrentFolder(folderPath);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName.trim(), currentFolderPath ?? undefined);
      setNewFolderName('');
      setShowNewFolder(false);
      toast.success('Folder created');
    } catch (error) {
      toast.error('Failed to create folder');
    }
  };

  const handleDeleteFolder = async (folderPath: string) => {
    if (window.confirm('Delete this folder? Tasks will be moved to parent folder.')) {
      try {
        await deleteFolder(folderPath);
        if (currentFolderPath === folderPath) {
          setCurrentFolder(null);
        }
        // Refresh tasks to show moved tasks
        await fetchTasks();
        toast.success('Folder deleted');
      } catch (error) {
        toast.error('Failed to delete folder');
      }
    }
  };

  const handleRenameFolder = async (folderPath: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      await updateFolder({ path: folderPath, name: newName.trim() });
      setEditingFolderPath(null);
      setEditingFolderName('');
      toast.success('Folder renamed');
    } catch (error) {
      toast.error('Failed to rename folder');
    }
  };

  const handlePinFolder = async (folderPath: string) => {
    const folder = getFolderByPath(folderPath);
    if (folder) {
      await updateFolder({ path: folderPath, pinned: !folder.pinned });
    }
  };

  // Helper to find folder in nested tree by path
  function findFolderByPathInTree(folderList: typeof folders, path: string): typeof folders[0] | null {
    for (const folder of folderList) {
      if (folder.path === path) return folder;
      const found = findFolderByPathInTree(folder.children || [], path);
      if (found) return found;
    }
    return null;
  }

  // Get folders for current level - in nested structure, root level is folders, sub-levels are children
  const currentFolders = currentFolderPath
    ? (findFolderByPathInTree(folders, currentFolderPath)?.children || [])
    : folders;

  const sortedCurrentFolders = [...currentFolders].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const breadcrumbs = getBreadcrumbs(currentFolderPath);

  // Filter tasks for current folder
  const getFilteredTasksByStatus = (status: TaskStatus) => {
    return getTasksByStatus(status).filter(t => currentFolderPath === null || t.folderPath === currentFolderPath);
  };

  return (
    <div className="h-full flex">
      {/* Folder Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-12' : 'w-64'} border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800/50 transition-all duration-200`}>
        {/* Sidebar Header */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          {!sidebarCollapsed && (
            <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Task Folders</h2>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${sidebarCollapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            {/* Breadcrumbs */}
            {breadcrumbs.length > 0 && (
              <div className="px-3 py-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => handleFolderClick(null)}
                  className="hover:text-blue-500"
                >
                  All
                </button>
                {breadcrumbs.map((folder, idx) => (
                  <span key={folder.id} className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    <button
                      onClick={() => handleFolderClick(folder.path)}
                      className={idx === breadcrumbs.length - 1 ? 'font-medium text-gray-700 dark:text-gray-300' : 'hover:text-blue-500'}
                    >
                      {folder.name}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Folder List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* All Tasks */}
              <button
                onClick={() => handleFolderClick(null)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  currentFolderPath === null
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <FolderIcon className="w-4 h-4" />
                <span>All Tasks</span>
              </button>

              {/* Folders */}
              {sortedCurrentFolders.map(folder => (
                <div key={folder.id} className="group relative">
                  {editingFolderPath === folder.path ? (
                    <div className="flex items-center gap-1 px-2">
                      <input
                        type="text"
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameFolder(folder.path, editingFolderName);
                          if (e.key === 'Escape') setEditingFolderPath(null);
                        }}
                        className="flex-1 px-3 py-2 text-sm bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:outline-none focus:border-[#DA7756]"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRenameFolder(folder.path, editingFolderName)}
                        className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                      >
                        <Check className="w-4 h-4 text-green-600" />
                      </button>
                      <button
                        onClick={() => setEditingFolderPath(null)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleFolderClick(folder.path)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        currentFolderPath === folder.path
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <FolderIcon className={`w-4 h-4 ${folder.pinned ? 'text-blue-500' : ''}`} />
                      <span className="flex-1 text-left truncate">{folder.name}</span>
                      {folder.pinned && <Pin className="w-3 h-3 text-blue-500" />}
                    </button>
                  )}

                  {/* Folder Actions */}
                  {editingFolderPath !== folder.path && (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingFolderPath(folder.path); setEditingFolderName(folder.name); }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        title="Rename"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePinFolder(folder.path); }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        title={folder.pinned ? 'Unpin' : 'Pin'}
                      >
                        <Pin className={`w-3 h-3 ${folder.pinned ? 'text-blue-500' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.path); }}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* New Folder Input */}
              {showNewFolder ? (
                <div className="flex items-center gap-1 px-2">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                      if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
                    }}
                    placeholder="Folder name..."
                    className="flex-1 px-3 py-2 text-sm bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:outline-none focus:border-[#DA7756]"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateFolder}
                    className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                  >
                    <Check className="w-4 h-4 text-green-600" />
                  </button>
                  <button
                    onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewFolder(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Folder</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Kanban Columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 h-full p-6 overflow-x-auto">
          <div className="flex gap-6 h-full">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                tasks={getFilteredTasksByStatus(column.id)}
                color={column.color}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="opacity-90 rotate-3 w-72">
              <KanbanCard task={activeTask} columnStatus={activeTask.status} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
