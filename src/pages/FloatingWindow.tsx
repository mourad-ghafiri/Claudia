import { useEffect, useState, useRef, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { X, Check, Trash2, Tag, FileText, CheckSquare, AlertTriangle, Clock, MoreHorizontal } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownRenderer } from '../components/ui/MarkdownRenderer';
import type { Task, TaskStatus, Note } from '../types';

type ItemType = 'note' | 'task';

// Transform backend response to frontend Task type
function transformTask(taskInfo: any): Task {
  // Handle float window data (new format uses float.show, float.x, etc.)
  const floatWindow = taskInfo.float || {};
  return {
    id: taskInfo.id,
    title: taskInfo.title,
    description: '',  // Content loaded separately
    rank: taskInfo.rank ?? 0,
    slug: taskInfo.slug ?? '',
    status: (taskInfo.status as TaskStatus) ?? 'todo',
    color: taskInfo.color ?? '#3B82F6',
    pinned: taskInfo.pinned ?? false,
    tags: taskInfo.tags ?? [],
    due: taskInfo.due ?? null,
    created: taskInfo.created ?? Date.now(),
    updated: taskInfo.updated ?? Date.now(),
    folderPath: taskInfo.folderPath ?? taskInfo.folder_path ?? '',
    path: taskInfo.path ?? '',
    isVisible: floatWindow.show ?? false,
    windowX: floatWindow.x ?? 200,
    windowY: floatWindow.y ?? 150,
    windowWidth: floatWindow.w ?? 320,
    windowHeight: floatWindow.h ?? 240,
  };
}

// Transform backend response to frontend Note type
function transformNote(noteInfo: any, content: string = ''): Note {
  // Handle float window data (new format uses float.show, float.x, etc.)
  const floatWindow = noteInfo.float || {};
  return {
    id: noteInfo.id,
    title: noteInfo.title,
    content: content,
    rank: noteInfo.rank ?? 0,
    slug: noteInfo.slug ?? '',
    color: noteInfo.color ?? '#6B9F78',
    pinned: noteInfo.pinned ?? false,
    tags: noteInfo.tags ?? [],
    created: noteInfo.created ?? Date.now(),
    updated: noteInfo.updated ?? Date.now(),
    folderPath: noteInfo.folderPath ?? noteInfo.folder_path ?? '',
    path: noteInfo.path ?? '',
    isVisible: floatWindow.show ?? false,
    windowX: floatWindow.x ?? 250,
    windowY: floatWindow.y ?? 200,
    windowWidth: floatWindow.w ?? 400,
    windowHeight: floatWindow.h ?? 300,
  };
}

export function FloatingWindow() {
  const [itemType, setItemType] = useState<ItemType>('task');
  const [task, setTask] = useState<Task | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [showAllTags, setShowAllTags] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const windowRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingUpdatesRef = useRef<{ window_x?: number; window_y?: number; window_width?: number; window_height?: number }>({});
  // Track current position/size locally to avoid stale values when saving
  const currentPositionRef = useRef<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });
  // Track if a save is in progress to prevent overlapping saves
  const isSavingRef = useRef(false);

  // Get itemId, type, opacity, and theme from URL params
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('id') || params.get('itemId') || params.get('noteId'); // Support multiple param names
  const urlType = params.get('type') as ItemType | null;
  const urlOpacity = params.get('opacity');
  const urlTheme = params.get('theme') as 'light' | 'dark' | 'system' | null;
  const opacity = urlOpacity ? parseFloat(urlOpacity) : 1;
  const theme = urlTheme || 'system';

  // Track current theme in state so it can be updated by events
  const [currentTheme, setCurrentTheme] = useState(theme);

  // Apply theme based on current theme state
  useEffect(() => {
    const applyTheme = (isDark: boolean) => {
      document.documentElement.classList.toggle('dark', isDark);
    };

    if (currentTheme === 'dark') {
      applyTheme(true);
      return;
    }

    if (currentTheme === 'light') {
      applyTheme(false);
      return;
    }

    // currentTheme === 'system': use system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      applyTheme(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [currentTheme]);

  // Listen for theme changes from main window
  useEffect(() => {
    let isMounted = true;
    let unlistenTheme: (() => void) | null = null;

    const setupListener = async () => {
      const themeListener = await listen<{ theme: 'light' | 'dark' | 'system' }>('theme-changed', (event) => {
        if (!isMounted) return;
        console.log('[FloatingWindow] Theme changed:', event.payload.theme);
        setCurrentTheme(event.payload.theme);
      });

      if (isMounted) {
        unlistenTheme = themeListener;
      } else {
        themeListener();
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      unlistenTheme?.();
    };
  }, []);

  // Set item type from URL
  useEffect(() => {
    if (urlType) {
      setItemType(urlType);
    }
  }, [urlType]);

  const MAX_VISIBLE_TAGS = 2;

  // Save position/size to database
  const savePositionSize = useCallback(async (id: string, type: ItemType, updates: { window_x?: number; window_y?: number; window_width?: number; window_height?: number }) => {
    console.log('[FloatingWindow] Saving position/size:', id, type, updates);
    console.log('[FloatingWindow] Current position ref:', currentPositionRef.current);
    try {
      const payload: any = { id };

      // Update local position ref with the new values
      if (updates.window_x !== undefined) currentPositionRef.current.x = updates.window_x;
      if (updates.window_y !== undefined) currentPositionRef.current.y = updates.window_y;
      if (updates.window_width !== undefined) currentPositionRef.current.w = updates.window_width;
      if (updates.window_height !== undefined) currentPositionRef.current.h = updates.window_height;

      // Get current item for visibility status
      const currentItem = type === 'task' ? task : note;

      // Build complete float object using the local ref (always has latest values)
      const floatUpdate = {
        x: currentPositionRef.current.x,
        y: currentPositionRef.current.y,
        w: currentPositionRef.current.w,
        h: currentPositionRef.current.h,
        show: currentItem?.isVisible ?? true,
      };
      payload.float = floatUpdate;
      console.log('[FloatingWindow] Complete float object:', floatUpdate);

      if (type === 'task') {
        await invoke('updateTask', { input: payload });
        await emit('task-position-changed', {
          taskId: id,
          position_x: updates.window_x,
          position_y: updates.window_y,
          width: updates.window_width,
          height: updates.window_height
        });
      } else {
        await invoke('updateNote', { input: payload });
        await emit('note-position-changed', {
          noteId: id,
          position_x: updates.window_x,
          position_y: updates.window_y,
          width: updates.window_width,
          height: updates.window_height
        });
      }
      console.log('[FloatingWindow] Position/size saved successfully');
    } catch (error) {
      console.error('[FloatingWindow] Failed to save window position/size:', error);
    }
  }, [task, note]);

  // Debounced save for position/size changes with race condition protection
  const debouncedSave = useCallback((id: string, type: ItemType, updates: { window_x?: number; window_y?: number; window_width?: number; window_height?: number }) => {
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const attemptSave = async () => {
      // Skip if already saving - updates will be picked up by next save
      if (isSavingRef.current) {
        // Re-schedule to try again after current save completes
        saveTimeoutRef.current = window.setTimeout(attemptSave, 100);
        return;
      }

      // Check if there are updates to save
      if (Object.keys(pendingUpdatesRef.current).length === 0) {
        return;
      }

      isSavingRef.current = true;
      const updatesToSave = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};

      try {
        await savePositionSize(id, type, updatesToSave);
      } finally {
        isSavingRef.current = false;
      }
    };

    saveTimeoutRef.current = window.setTimeout(attemptSave, 500);
  }, [savePositionSize]);

  useEffect(() => {
    windowRef.current = getCurrentWindow();
    let isMounted = true;
    let unlistenMove: (() => void) | null = null;
    let unlistenResize: (() => void) | null = null;

    const setupListeners = async () => {
      if (!windowRef.current || !itemId) return;

      // Get initial scale factor for logging
      const initialScaleFactor = await windowRef.current.scaleFactor();
      console.log('[FloatingWindow] Initial scale factor:', initialScaleFactor);

      // Set up move listener - queries scale factor on each event for multi-monitor support
      const moveListener = await windowRef.current.onMoved(async (position) => {
        if (!isMounted || !windowRef.current) return;
        // Query current scale factor to handle multi-monitor setups
        const scaleFactor = await windowRef.current.scaleFactor();
        const logicalX = Math.round(position.payload.x / scaleFactor);
        const logicalY = Math.round(position.payload.y / scaleFactor);
        console.log('[FloatingWindow] Window moved - logical:', logicalX, logicalY);
        debouncedSave(itemId, itemType, { window_x: logicalX, window_y: logicalY });
      });

      // Set up resize listener - queries scale factor on each event for multi-monitor support
      const resizeListener = await windowRef.current.onResized(async (size) => {
        if (!isMounted || !windowRef.current) return;
        // Query current scale factor to handle multi-monitor setups
        const scaleFactor = await windowRef.current.scaleFactor();
        const logicalWidth = Math.round(size.payload.width / scaleFactor);
        const logicalHeight = Math.round(size.payload.height / scaleFactor);
        console.log('[FloatingWindow] Window resized - logical:', logicalWidth, logicalHeight);
        debouncedSave(itemId, itemType, { window_width: logicalWidth, window_height: logicalHeight });
      });

      // Check if still mounted before storing listeners
      if (isMounted) {
        unlistenMove = moveListener;
        unlistenResize = resizeListener;
      } else {
        // Component unmounted during setup - clean up immediately
        moveListener();
        resizeListener();
      }
    };

    setupListeners();

    return () => {
      isMounted = false;
      // Clean up listeners if they were set up
      unlistenMove?.();
      unlistenResize?.();
      // Clear any pending save timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Flush any pending updates
      if (itemId && Object.keys(pendingUpdatesRef.current).length > 0) {
        const updatesToSave = { ...pendingUpdatesRef.current };
        pendingUpdatesRef.current = {};
        savePositionSize(itemId, itemType, updatesToSave);
      }
    };
  }, [itemId, itemType, debouncedSave, savePositionSize]);

  // Fetch item data and tags
  useEffect(() => {
    if (!itemId) return;

    async function fetchItem() {
      console.log('[FloatingWindow] Fetching', itemType, ':', itemId);
      try {
        if (itemType === 'task') {
          const fetchedTask = await invoke<any>('getTaskById', { id: itemId });
          if (fetchedTask) {
            // Also fetch task content (description)
            let description = '';
            try {
              description = await invoke<string>('getTaskContent', { id: itemId });
            } catch {
              description = '';
            }
            const transformed = transformTask(fetchedTask);
            transformed.description = description;
            console.log('[FloatingWindow] Task fetched');
            setTask(transformed);

            // Initialize position ref with loaded values
            currentPositionRef.current = {
              x: transformed.windowX,
              y: transformed.windowY,
              w: transformed.windowWidth,
              h: transformed.windowHeight,
            };
            console.log('[FloatingWindow] Initialized position ref:', currentPositionRef.current);

            // Tags are now string arrays directly on the task
            setTags(transformed.tags || []);
          }
        } else {
          // Fetch note
          const fetchedNote = await invoke<any>('getNoteById', { id: itemId });
          if (fetchedNote) {
            // Also fetch note content
            let content = '';
            try {
              content = await invoke<string>('getNoteContent', { id: itemId });
            } catch {
              content = '';
            }
            const transformed = transformNote(fetchedNote, content);
            console.log('[FloatingWindow] Note fetched');
            setNote(transformed);

            // Initialize position ref with loaded values
            currentPositionRef.current = {
              x: transformed.windowX,
              y: transformed.windowY,
              w: transformed.windowWidth,
              h: transformed.windowHeight,
            };
            console.log('[FloatingWindow] Initialized position ref:', currentPositionRef.current);

            // Tags are now string arrays directly on the note
            setTags(transformed.tags || []);
          }
        }
      } catch (error) {
        console.error('[FloatingWindow] Failed to fetch item:', error);
      }
    }

    fetchItem();

    // Listen for updates from main window
    const eventName = itemType === 'task' ? `task-updated-${itemId}` : `note-updated-${itemId}`;
    const unlistenUpdate = listen<any>(eventName, async (event) => {
      const updatedItem = event.payload;
      if (itemType === 'task') {
        if (updatedItem.status === 'doing' && !updatedItem.isVisible) {
          setTask(updatedItem);
          // Tags are now string arrays directly on the task
          setTags(updatedItem.tags || []);
        }
      } else {
        if (!updatedItem.isVisible) {
          setNote(updatedItem);
          // Tags are now string arrays directly on the note
          setTags(updatedItem.tags || []);
        }
      }
    });

    // Listen for deletion
    const deleteEventName = itemType === 'task' ? `task-deleted-${itemId}` : `note-deleted-${itemId}`;
    const unlistenDelete = listen(deleteEventName, async () => {
      if (windowRef.current) {
        await windowRef.current.close();
      }
    });

    return () => {
      unlistenUpdate.then((unlisten) => unlisten());
      unlistenDelete.then((unlisten) => unlisten());
    };
  }, [itemId, itemType]);

  // Flush any pending position/size saves immediately
  const flushPendingSave = useCallback(async () => {
    if (!itemId) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (Object.keys(pendingUpdatesRef.current).length > 0) {
      const updatesToSave = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      console.log('[FloatingWindow] Flushing pending saves before close:', updatesToSave);
      await savePositionSize(itemId, itemType, updatesToSave);
    }
  }, [itemId, itemType, savePositionSize]);

  const handleClose = async () => {
    if (!itemId || !windowRef.current) return;
    await flushPendingSave();

    if (itemType === 'task') {
      await emit('task-hidden', { taskId: itemId });
    } else {
      await emit('note-hidden', { noteId: itemId });
    }
    await windowRef.current.close();
  };

  const handleMarkDone = async () => {
    if (!task || !windowRef.current) return;
    try {
      await flushPendingSave();
      await invoke('updateTask', {
        input: {
          id: task.id,
          status: 'done',
          float: {
            x: task.windowX,
            y: task.windowY,
            w: task.windowWidth,
            h: task.windowHeight,
            show: false
          }
        }
      });
      await emit('task-status-changed', { taskId: task.id, status: 'done' });
      await emit('task-hidden', { taskId: task.id });
      await windowRef.current.close();
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleStartDrag = async () => {
    if (windowRef.current) {
      await windowRef.current.startDragging();
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!windowRef.current) return;
    setIsDeleting(true);
    try {
      if (itemType === 'task' && task) {
        await invoke('deleteTask', { id: task.id });
        await emit('task-deleted', { taskId: task.id });
      } else if (itemType === 'note' && note) {
        await invoke('deleteNote', { id: note.id });
        await emit('note-deleted', { noteId: note.id });
      }
      await windowRef.current.close();
    } catch (error) {
      console.error('Failed to delete item:', error);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  const [isHovered, setIsHovered] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagsCount = tags.length - MAX_VISIBLE_TAGS;
  const tagsPopupRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Close tags popup when clicking outside
  useEffect(() => {
    if (!showAllTags) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (tagsPopupRef.current && !tagsPopupRef.current.contains(e.target as Node)) {
        setShowAllTags(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAllTags]);

  // Close actions popup when clicking outside
  useEffect(() => {
    if (!showActions) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showActions]);

  // Get the current item
  const currentItem = itemType === 'task' ? task : note;

  // Helper to get relative time for due dates
  const getRelativeTime = (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return '';
    }
  };

  if (!currentItem) {
    return (
      <div className="floating-window-container" style={{ overflow: 'hidden' }}>
        <div
          className="w-full h-full flex flex-col items-center justify-center rounded-2xl"
          style={{
            background: `rgba(255, 255, 255, ${opacity * 0.95})`,
            backdropFilter: `blur(${Math.round(12 + (1 - opacity) * 8)}px)`,
            WebkitBackdropFilter: `blur(${Math.round(12 + (1 - opacity) * 8)}px)`,
          }}
        >
          <div className="dark:hidden">
            <div className="animate-pulse mb-2 text-[#6B6B6B]">Loading...</div>
            <div className="text-xs text-[#B5AFA6]">
              {itemType === 'task' ? 'Task' : 'Note'}
            </div>
          </div>
          <div className="hidden dark:block">
            <div className="animate-pulse mb-2 text-[#B5AFA6]">Loading...</div>
            <div className="text-xs text-[#6B6B6B]">
              {itemType === 'task' ? 'Task' : 'Note'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const accentColor = currentItem.color || (itemType === 'task' ? '#DA7756' : '#6B9F78');
  const hasDueTime = itemType === 'task' && task?.due && task.due > 0;
  const isOverdue = hasDueTime && task!.due! < Date.now();
  const isDueSoon = hasDueTime && !isOverdue && task!.due! - Date.now() < 24 * 60 * 60 * 1000;

  // Content to display
  const displayContent = itemType === 'task' ? task?.description : note?.content;

  // Glass background styles - opacity directly controls transparency
  // User's opacity setting: 1 = fully opaque, 0.5 = semi-transparent, etc.
  // The opacity value from settings (0.0 to 1.0) controls how see-through the window is
  const glassAlpha = opacity; // Direct mapping: 1 = solid, 0.5 = half transparent

  const glassStyle = {
    background: `rgba(255, 255, 255, ${glassAlpha * 0.95})`,
    backdropFilter: `blur(${Math.round(12 + (1 - opacity) * 8)}px)`,
    WebkitBackdropFilter: `blur(${Math.round(12 + (1 - opacity) * 8)}px)`,
  };

  const glassDarkStyle = {
    background: `rgba(30, 30, 30, ${glassAlpha * 0.95})`,
    backdropFilter: `blur(${Math.round(12 + (1 - opacity) * 8)}px)`,
    WebkitBackdropFilter: `blur(${Math.round(12 + (1 - opacity) * 8)}px)`,
  };

  return (
    <div
      className="floating-window-container"
      style={{ overflow: 'hidden' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        className="relative w-full h-full flex flex-col rounded-2xl"
        style={{ overflow: 'hidden' }}
        initial={false}
        animate={{
          scale: isHovered ? 1.003 : 1,
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Glass background - light mode */}
        <div className="dark:hidden absolute inset-0 rounded-2xl" style={glassStyle} />
        {/* Glass background - dark mode */}
        <div className="hidden dark:block absolute inset-0 rounded-2xl" style={glassDarkStyle} />

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col h-full">

          {/* Header - draggable */}
          <div
            onMouseDown={handleStartDrag}
            className="flex items-center gap-2 px-3 py-2 cursor-move select-none border-b border-black/5 dark:border-white/5"
          >
            {/* Type indicator pill */}
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: `${accentColor}18`,
                color: accentColor
              }}
            >
              {itemType === 'task' ? (
                <>
                  <CheckSquare className="w-3 h-3" />
                  <span>Task</span>
                </>
              ) : (
                <>
                  <FileText className="w-3 h-3" />
                  <span>Note</span>
                </>
              )}
            </div>

            {/* Due time badge for tasks - in header */}
            {hasDueTime && (
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
                  isOverdue
                    ? 'bg-[#E57373]/15 text-[#D32F2F]'
                    : isDueSoon
                    ? 'bg-[#F59E0B]/15 text-[#D97706]'
                    : 'bg-[#6B9F78]/15 text-[#5A8A68]'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>{getRelativeTime(task!.due!)}</span>
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Close button */}
            <motion.button
              onClick={handleClose}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              title="Hide"
              initial={{ opacity: 0.5 }}
              animate={{ opacity: isHovered ? 1 : 0.5 }}
            >
              <X className="w-3.5 h-3.5 text-[#6B6B6B] dark:text-[#B5AFA6]" />
            </motion.button>
          </div>

          {/* Title section */}
          <div className="px-4 pt-3 pb-2">
            <h3 className="text-sm font-semibold text-[#2D2D2D] dark:text-[#E8E6E3] leading-snug line-clamp-2">
              {currentItem.title}
            </h3>
          </div>

          {/* Content area */}
          <div className="flex-1 px-4 pb-3 overflow-y-auto overflow-x-hidden floating-content-scroll">
            {displayContent ? (
              <MarkdownRenderer
                content={displayContent}
                maxChars={300}
                className="text-[13px] leading-relaxed text-[#4A4A4A] dark:text-[#C8C6C3]"
              />
            ) : (
              <p className="text-[13px] text-[#B5AFA6] dark:text-[#6B6B6B] italic">
                No {itemType === 'task' ? 'description' : 'content'}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2.5 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-2">
            {/* Tags section */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0 relative">
              {tags.length > 0 ? (
                <>
                  {visibleTags.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium truncate max-w-[70px] bg-black/5 dark:bg-white/10 text-[#6B6B6B] dark:text-[#B5AFA6]"
                      title={tag}
                    >
                      {tag}
                    </span>
                  ))}
                  {hiddenTagsCount > 0 && (
                    <button
                      onClick={() => setShowAllTags(!showAllTags)}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/5 dark:bg-white/10 text-[#6B6B6B] dark:text-[#B5AFA6] hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
                    >
                      +{hiddenTagsCount}
                    </button>
                  )}

                  {/* Tags popup */}
                  <AnimatePresence>
                    {showAllTags && hiddenTagsCount > 0 && (
                      <motion.div
                        ref={tagsPopupRef}
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-2 p-2.5 rounded-xl shadow-lg border border-white/20 dark:border-white/10 z-50"
                        style={glassStyle}
                      >
                        <div className="dark:hidden">
                          <div className="flex items-center gap-1 mb-2 text-[10px] text-[#6B6B6B] font-medium uppercase tracking-wide">
                            <Tag className="w-3 h-3" />
                            Tags
                          </div>
                          <div className="flex flex-wrap gap-1.5 max-w-[180px]">
                            {tags.map((tag, index) => (
                              <span
                                key={`${tag}-${index}`}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/5 text-[#6B6B6B]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="hidden dark:block" style={glassDarkStyle}>
                          <div className="flex items-center gap-1 mb-2 text-[10px] text-[#B5AFA6] font-medium uppercase tracking-wide">
                            <Tag className="w-3 h-3" />
                            Tags
                          </div>
                          <div className="flex flex-wrap gap-1.5 max-w-[180px]">
                            {tags.map((tag, index) => (
                              <span
                                key={`${tag}-${index}`}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-[#B5AFA6]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : null}
            </div>

            {/* Actions menu */}
            <div className="relative" ref={actionsRef}>
              <motion.button
                onClick={() => setShowActions(!showActions)}
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[#6B6B6B] dark:text-[#B5AFA6]"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <MoreHorizontal className="w-4 h-4" />
              </motion.button>

              {/* Actions dropdown */}
              <AnimatePresence>
                {showActions && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full right-0 mb-2 p-1 rounded-xl shadow-lg border border-black/10 dark:border-white/10 z-50 min-w-[130px] bg-white/90 dark:bg-[#2a2a2a]/95 backdrop-blur-xl"
                  >
                    {/* Mark as Done - only for tasks */}
                    {itemType === 'task' && task?.status !== 'done' && (
                      <button
                        onClick={() => {
                          setShowActions(false);
                          handleMarkDone();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-[#6B9F78] hover:bg-[#6B9F78]/10 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Done
                      </button>
                    )}
                    {/* Delete */}
                    <button
                      onClick={() => {
                        setShowActions(false);
                        handleDelete();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-[#E57373] hover:bg-[#E57373]/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Color accent line at bottom */}
          <div
            className="h-1 w-full"
            style={{ backgroundColor: accentColor }}
          />
        </div>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center rounded-2xl z-50 bg-black/30 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="mx-4 w-[240px] rounded-xl p-4 shadow-2xl bg-white/95 dark:bg-[#2a2a2a]/95 backdrop-blur-xl border border-black/10 dark:border-white/10"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3 bg-[#E57373]/15">
                  <AlertTriangle className="w-5 h-5 text-[#E57373]" />
                </div>
                <h3 className="text-[13px] font-semibold text-[#2D2D2D] dark:text-[#E8E6E3] mb-1">
                  Delete {itemType === 'task' ? 'Task' : 'Note'}?
                </h3>
                <p className="text-[11px] text-[#6B6B6B] dark:text-[#B5AFA6] mb-4 leading-relaxed line-clamp-2">
                  "{currentItem?.title}"
                </p>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={cancelDelete}
                    className="flex-1 px-3 py-2 text-[11px] font-semibold rounded-lg bg-black/5 dark:bg-white/10 text-[#2D2D2D] dark:text-[#E8E6E3] hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={isDeleting}
                    className="flex-1 px-3 py-2 text-[11px] font-semibold rounded-lg bg-[#E57373] text-white hover:bg-[#D32F2F] transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
