import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTaskStore } from '../stores/taskStore';
import { useUIStore } from '../stores/uiStore';
import {
  closeAllFloatingWindows,
  ensureFloatingWindowsOnTop,
} from '../lib/tauri';

export function useFloatingWindows() {
  const { updateTask, updateTaskPositionLocal, getTaskById } = useTaskStore();
  const { areFloatingTasksVisible, setFloatingTasksVisible } = useUIStore();
  const openWindowsRef = useRef<Set<string>>(new Set());

  // NOTE: Window creation is now handled directly by KanbanCard.toggleHidden()
  // This hook only handles:
  // 1. task-hidden events from floating windows
  // 2. Closing all windows when areFloatingTasksVisible is toggled off
  // 3. Position updates from floating windows
  // 4. Ensuring windows stay on top

  // Handle task-hidden event from floating windows
  useEffect(() => {
    const unlisten = listen('task-hidden', async (event: any) => {
      const { taskId } = event.payload;
      console.log('[useFloatingWindows] Received task-hidden event for:', taskId);

      // Immediately remove from tracked windows to prevent race conditions
      // This ensures the next toggle will create a new window
      if (openWindowsRef.current.has(taskId)) {
        console.log('[useFloatingWindows] Removing task from tracked windows:', taskId);
        openWindowsRef.current.delete(taskId);
      }

      try {
        await updateTask({ id: taskId, isVisible: false });
        console.log('[useFloatingWindows] Task isVisible updated to false:', taskId);
      } catch (error) {
        console.error('[useFloatingWindows] Failed to hide task:', error);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updateTask]);

  // Handle task status change event from floating windows
  useEffect(() => {
    const unlisten = listen('task-status-changed', async (event: any) => {
      const { taskId, status } = event.payload;
      console.log('[useFloatingWindows] Received task-status-changed event:', taskId, status);
      // Task is already updated by floating window, just refresh store
      // The window will close automatically when it's no longer in "doing" status
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Handle task position change from floating windows
  useEffect(() => {
    const unlisten = listen('task-position-changed', (event: any) => {
      const { taskId, position_x, position_y, width, height } = event.payload;
      console.log('[useFloatingWindows] Received task-position-changed event:', taskId, { position_x, position_y, width, height });
      // Get current task to fill in missing values
      const currentTask = getTaskById(taskId);
      if (currentTask) {
        updateTaskPositionLocal(
          taskId,
          position_x ?? currentTask.windowX,
          position_y ?? currentTask.windowY,
          width ?? currentTask.windowWidth,
          height ?? currentTask.windowHeight
        );
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updateTaskPositionLocal, getTaskById]);

  // Periodically ensure floating windows stay on top (every 5 seconds)
  useEffect(() => {
    if (!areFloatingTasksVisible) return;

    const interval = setInterval(() => {
      ensureFloatingWindowsOnTop().catch(console.error);
    }, 5000);

    return () => clearInterval(interval);
  }, [areFloatingTasksVisible]);

  // Toggle all floating windows visibility
  const toggleFloatingVisibility = async () => {
    if (areFloatingTasksVisible) {
      await closeAllFloatingWindows();
      openWindowsRef.current.clear();
    }
    setFloatingTasksVisible(!areFloatingTasksVisible);
  };

  return { toggleFloatingVisibility };
}
