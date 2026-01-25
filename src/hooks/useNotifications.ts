import { useEffect, useRef, useCallback } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { Task } from '../types';

// Lazy load notification functions to avoid issues during SSR/initial load
let notificationModule: {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<string>;
  sendNotification: (options: { title: string; body: string }) => void;
} | null = null;

async function getNotificationModule() {
  if (!notificationModule) {
    try {
      notificationModule = await import('@tauri-apps/plugin-notification');
    } catch (error) {
      console.error('[useNotifications] Failed to load notification module:', error);
      return null;
    }
  }
  return notificationModule;
}

// Track which tasks have already been notified
const notifiedTasks = new Set<string>();

// Notification sound (simple beep using Web Audio API)
function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 880; // A5 note
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.error('[useNotifications] Failed to play sound:', error);
  }
}

export function useNotifications() {
  const { tasks } = useTaskStore();
  const { settings } = useSettingsStore();
  const permissionRef = useRef<boolean | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request notification permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const module = await getNotificationModule();
        if (!module) {
          permissionRef.current = false;
          return;
        }

        let granted = await module.isPermissionGranted();
        if (!granted) {
          const permission = await module.requestPermission();
          granted = permission === 'granted';
        }
        permissionRef.current = granted;
        console.log('[useNotifications] Permission granted:', granted);
      } catch (error) {
        console.error('[useNotifications] Failed to check permission:', error);
        permissionRef.current = false;
      }
    };

    checkPermission();
  }, []);

  // Check for upcoming due tasks
  const checkDueTasks = useCallback(() => {
    if (!settings.notificationsEnabled || !permissionRef.current) {
      return;
    }

    const now = Date.now();
    const reminderMs = settings.notificationMinutesBefore * 60 * 1000;

    // Find tasks with due dates that are coming up
    const upcomingTasks = tasks.filter((task: Task) => {
      // Only consider tasks that:
      // 1. Have a due date
      // 2. Are not done
      // 3. Haven't been notified yet
      if (!task.due || task.status === 'done') {
        return false;
      }

      // Check if already notified
      const notifyKey = `${task.id}-${task.due}`;
      if (notifiedTasks.has(notifyKey)) {
        return false;
      }

      // Check if due time is within the reminder window
      const dueTime = task.due;
      const timeUntilDue = dueTime - now;

      // Notify if due time is within reminderMs and in the future
      // but not more than reminderMs + 60 seconds (to avoid re-notifying if check interval is slow)
      return timeUntilDue > 0 && timeUntilDue <= reminderMs + 60000;
    });

    // Send notifications for upcoming tasks
    for (const task of upcomingTasks) {
      const notifyKey = `${task.id}-${task.due}`;
      notifiedTasks.add(notifyKey);

      const minutesLeft = Math.round((task.due! - now) / 60000);
      const timeText = minutesLeft <= 1 ? 'now' : `in ${minutesLeft} minutes`;

      console.log(`[useNotifications] Sending reminder for task: ${task.title}, due ${timeText}`);

      // Send notification asynchronously
      getNotificationModule().then((module) => {
        if (module) {
          try {
            module.sendNotification({
              title: 'Task Reminder',
              body: `"${task.title}" is due ${timeText}`,
            });
          } catch (error) {
            console.error('[useNotifications] Failed to send notification:', error);
          }
        }
      });

      // Play sound if enabled
      if (settings.notificationSound) {
        playNotificationSound();
      }
    }
  }, [tasks, settings.notificationsEnabled, settings.notificationMinutesBefore, settings.notificationSound]);

  // Set up interval to check for due tasks
  useEffect(() => {
    if (!settings.notificationsEnabled) {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      return;
    }

    // Check immediately
    checkDueTasks();

    // Then check every 30 seconds
    checkIntervalRef.current = setInterval(checkDueTasks, 30000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [settings.notificationsEnabled, checkDueTasks]);

  // Clean up old notification records (tasks that are past due)
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      for (const key of notifiedTasks) {
        const [, dueStr] = key.split('-');
        const due = parseInt(dueStr, 10);
        if (due < oneDayAgo) {
          notifiedTasks.delete(key);
        }
      }
    }, 60 * 60 * 1000); // Clean up every hour

    return () => clearInterval(cleanupInterval);
  }, []);
}
