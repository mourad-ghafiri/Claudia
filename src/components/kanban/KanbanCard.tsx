import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { formatDistanceToNow, isPast } from 'date-fns';
import { Clock, Edit2, Trash2, EyeOff, Eye, Pin, CheckSquare, GripVertical } from 'lucide-react';
import type { Task, TaskStatus } from '../../types';
import { useTaskStore } from '../../stores/taskStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { closeFloatingWindow, createFloatingWindow } from '../../lib/tauri';
import { Button } from '../ui/Button';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { useState, useRef, useEffect, useMemo, memo } from 'react';

interface KanbanCardProps {
  task: Task;
  columnStatus?: TaskStatus; // Optional - kept for potential future use
}

export const KanbanCard = memo(function KanbanCard({ task }: KanbanCardProps) {
  const { updateTask } = useTaskStore();
  // Track visibility with local state that syncs with store
  // This ensures we have accurate state for the toggle
  const [localIsVisible, setLocalIsVisible] = useState(task.isVisible);
  const { openTaskEditor, openDeleteConfirm } = useUIStore();
  const { settings } = useSettingsStore();
  const [showActions, setShowActions] = useState(false);
  // Track if currently toggling to prevent race conditions with store sync
  const [isToggling, setIsToggling] = useState(false);
  const isTogglingRef = useRef(false);

  // Tags are now string arrays
  const taskTags = task.tags || [];

  // Show visibility toggle in all columns (floating windows work for DOING tasks)
  const showVisibilityToggle = true;

  // Sync local state with task prop when it changes
  // Skip sync if currently toggling to prevent overwriting optimistic update
  useEffect(() => {
    if (!isToggling) {
      setLocalIsVisible(task.isVisible);
    }
  }, [task.id, task.isVisible, isToggling]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOverdue = task.due && isPast(new Date(task.due));

  // Memoize date formatting - expensive locale operations
  const formattedDate = useMemo(() => {
    const date = new Date(task.updated);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [task.updated]);

  // Memoize due date formatting
  const formattedDueDate = useMemo(() => {
    if (!task.due) return null;
    return formatDistanceToNow(new Date(task.due), { addSuffix: true });
  }, [task.due]);

  const toggleVisibility = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Prevent double execution
    if (isTogglingRef.current) return;
    isTogglingRef.current = true;
    setIsToggling(true);

    // Use local state for accurate toggle
    const currentIsVisible = localIsVisible;
    const newVisibleValue = !currentIsVisible;

    // Update local state IMMEDIATELY for responsive UI (optimistic update)
    setLocalIsVisible(newVisibleValue);

    try {
      if (!newVisibleValue) {
        // HIDING: Close the floating window
        try {
          await closeFloatingWindow(task.id);
        } catch {
          // Window may not exist, that's fine
        }
      } else {
        // SHOWING: Create the floating window directly
        try {
          await createFloatingWindow({
            taskId: task.id,
            itemType: 'task',
            title: task.title,
            color: task.color,
            x: task.windowX ?? 200,
            y: task.windowY ?? 150,
            width: task.windowWidth ?? 320,
            height: task.windowHeight ?? 240,
            opacity: settings?.floatingOpacity ?? 0.95,
            theme: (settings?.theme ?? 'system') as 'light' | 'dark' | 'system',
          });
        } catch (error) {
          console.error('[KanbanCard] Failed to create floating window:', error);
          setLocalIsVisible(currentIsVisible); // Rollback on error
          return;
        }
      }

      // Update the store (backend + local store)
      await updateTask({ id: task.id, float: { x: task.windowX, y: task.windowY, w: task.windowWidth, h: task.windowHeight, show: newVisibleValue } });
    } catch (error) {
      console.error('[KanbanCard] toggleVisibility failed:', error);
      setLocalIsVisible(currentIsVisible); // Rollback on error
    } finally {
      setTimeout(() => {
        isTogglingRef.current = false;
        setIsToggling(false);
      }, 300);
    }
  };

  const togglePinned = async () => {
    await updateTask({ id: task.id, pinned: !task.pinned });
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={{ ...style, borderLeftColor: task.color }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={`
        group relative bg-white dark:bg-[#2E2E2E] rounded-xl shadow-sm
        border-l-4 py-3 pr-3 pl-7 cursor-pointer select-text
        hover:shadow-md transition-shadow duration-150
        ${isDragging ? 'shadow-lg ring-2 ring-[#DA7756]' : ''}
      `}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 hover:bg-[#EBE8E4] dark:hover:bg-[#393939] rounded transition-opacity z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5 text-[#B5AFA6] dark:text-[#6B6B6B]" />
      </div>

      {/* Type indicator + Pinned */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <CheckSquare className="w-3 h-3 text-[#DA7756] opacity-50" />
        {task.pinned && (
          <Pin className="w-3 h-3 text-[#DA7756]" />
        )}
      </div>

      {/* Title */}
      <h3 className="font-medium text-[#2D2D2D] dark:text-[#E8E6E3] text-sm line-clamp-2 pr-10">
        {task.title}
      </h3>

      {/* Description preview */}
      {task.description && (
        <div className="mt-1 text-xs text-[#6B6B6B] dark:text-[#B5AFA6] line-clamp-2">
          <MarkdownRenderer content={task.description} maxChars={200} />
        </div>
      )}

      {/* Tags and Date/Time */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {taskTags.slice(0, 2).map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="px-1 py-0 text-[9px] rounded bg-[#DA7756]/10 text-[#DA7756]"
            >
              {tag}
            </span>
          ))}
          {taskTags.length > 2 && (
            <span className="text-[9px] text-[#6B6B6B]">
              +{taskTags.length - 2}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[#B5AFA6] dark:text-[#6B6B6B]">
          {formattedDate}
        </span>
      </div>

      {/* Due time */}
      {formattedDueDate && (
        <div
          className={`mt-1 flex items-center gap-1 text-[10px] ${isOverdue
            ? 'text-[#E57373]'
            : 'text-[#6B6B6B] dark:text-[#B5AFA6]'
            }`}
        >
          <Clock className="w-3 h-3" />
          <span>{formattedDueDate}</span>
        </div>
      )}


      {/* Actions overlay */}
      {showActions && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-2 right-2 flex items-center gap-1 bg-white dark:bg-[#2E2E2E] rounded-lg shadow-sm border border-[#EBE8E4] dark:border-[#393939] p-0.5"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-[#6B6B6B] hover:text-[#DA7756]"
            onClick={() => openTaskEditor(task.id)}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          {showVisibilityToggle && (
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-[#6B6B6B] hover:text-[#DA7756]"
              onClick={toggleVisibility}
              title={localIsVisible ? 'Hide floating window' : 'Show floating window'}
            >
              {localIsVisible ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-[#6B6B6B] hover:text-[#DA7756]"
            onClick={togglePinned}
          >
            <Pin className={`w-3.5 h-3.5 ${task.pinned ? 'text-[#DA7756]' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-[#E57373] hover:text-[#D32F2F]"
            onClick={() => openDeleteConfirm(task.id, 'task')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
});
