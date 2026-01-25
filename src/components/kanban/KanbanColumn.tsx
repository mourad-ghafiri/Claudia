import { memo, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { AnimatePresence } from 'framer-motion';
import type { Task, TaskStatus } from '../../types';
import { KanbanCard } from './KanbanCard';

interface KanbanColumnProps {
  id: TaskStatus;
  title: string;
  tasks: Task[];
  color: string;
  isOver?: boolean;
  isTrashView?: boolean;
}

const columnColors: Record<TaskStatus, string> = {
  todo: 'bg-[#F5F3F0] dark:bg-[#242424]',
  doing: 'bg-[#DA7756]/5 dark:bg-[#DA7756]/10',
  done: 'bg-[#6B9F78]/5 dark:bg-[#6B9F78]/10',
};

const headerColors: Record<TaskStatus, string> = {
  todo: 'text-[#4A4A4A] dark:text-[#B5AFA6]',
  doing: 'text-[#DA7756]',
  done: 'text-[#6B9F78]',
};

const dotColors: Record<TaskStatus, string> = {
  todo: 'bg-[#B5AFA6]',
  doing: 'bg-[#DA7756]',
  done: 'bg-[#6B9F78]',
};

export const KanbanColumn = memo(function KanbanColumn({ id, title, tasks, isOver: isOverProp, isTrashView = false }: KanbanColumnProps) {
  // Use droppable for the column itself (for empty columns or dropping at the end)
  const { setNodeRef, isOver: isOverDroppable, active } = useDroppable({ id });

  // Show drop indicator when actively dragging and hovering over this column
  const showDropIndicator = (isOverProp || isOverDroppable) && active !== null;

  // Memoize task IDs array to prevent SortableContext re-renders
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  return (
    <div
      className={`
        flex flex-col flex-1 min-w-[300px] rounded-2xl border-2
        ${columnColors[id]}
        ${showDropIndicator ? 'ring-2 ring-[#DA7756] ring-opacity-50 border-[#DA7756]' : 'border-transparent'}
        transition-all duration-150
      `}
    >
      {/* Column header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${dotColors[id]}`} />
          <h2 className={`font-semibold ${headerColors[id]}`}>{title}</h2>
        </div>
        <span className="px-2.5 py-1 bg-white dark:bg-[#2E2E2E] rounded-full text-xs font-medium text-[#4A4A4A] dark:text-[#B5AFA6] shadow-sm">
          {tasks.length}
        </span>
      </div>

      {/* Cards container */}
      <div
        ref={setNodeRef}
        className="flex-1 p-3 pt-0 space-y-3 overflow-y-auto min-h-[200px]"
        style={{ scrollbarGutter: 'stable' }}
      >
        <SortableContext
          items={taskIds}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence mode="sync">
            {tasks.map((task) => (
              <KanbanCard key={task.id} task={task} columnStatus={id} isTrashView={isTrashView} />
            ))}
          </AnimatePresence>
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-24 text-sm text-[#B5AFA6] dark:text-[#6B6B6B]">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
});
