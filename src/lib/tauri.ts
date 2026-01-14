import { invoke } from '@tauri-apps/api/core';
import type { Settings, Workspace } from '../types';

// ============================================
// WORKSPACE API
// ============================================

export async function getWorkspaces(): Promise<Workspace[]> {
  const workspaces = await invoke<any[]>('get_workspaces');
  return workspaces.map(parseWorkspace);
}

export async function getCurrentWorkspace(): Promise<Workspace | null> {
  const workspace = await invoke<any | null>('get_current_workspace');
  return workspace ? parseWorkspace(workspace) : null;
}

export async function createWorkspace(path: string): Promise<Workspace> {
  const workspace = await invoke<any>('create_workspace', { path });
  return parseWorkspace(workspace);
}

export async function openWorkspace(id: string): Promise<Workspace> {
  const workspace = await invoke<any>('open_workspace', { id });
  return parseWorkspace(workspace);
}

export async function removeWorkspace(id: string): Promise<void> {
  await invoke('remove_workspace', { id });
}

export async function closeWorkspace(): Promise<void> {
  await invoke('close_workspace');
}

export async function openFolderDialog(): Promise<string | null> {
  return await invoke<string | null>('open_folder_dialog');
}

function parseWorkspace(data: any): Workspace {
  // Convert Unix timestamp (seconds) to JavaScript timestamp (milliseconds)
  const lastOpenedSeconds = data.last_opened || data.lastOpened || 0;
  return {
    name: data.name,
    path: data.path,
    lastOpened: lastOpenedSeconds * 1000,
    isCurrent: data.is_current || data.isCurrent || false,
  };
}

// ============================================
// SETTINGS API
// ============================================

export async function getSettings(): Promise<Settings> {
  const settings = await invoke<any>('get_settings');
  return parseSettings(settings);
}

export async function updateSettings(input: Partial<Settings>): Promise<Settings> {
  // Transform to backend format
  const backendInput: any = {};
  if (input.theme !== undefined) backendInput.theme = input.theme;
  if (input.defaultColor !== undefined) backendInput.default_color = input.defaultColor;
  if (input.notificationSound !== undefined) backendInput.notification_sound = input.notificationSound;
  if (input.notificationMinutesBefore !== undefined) backendInput.notification_minutes_before = input.notificationMinutesBefore;
  if (input.floatingOpacity !== undefined) backendInput.floating_opacity = input.floatingOpacity;

  const settings = await invoke<any>('update_settings', { input: backendInput });
  return parseSettings(settings);
}

// ============================================
// FLOATING WINDOW API (for Tasks)
// ============================================

export interface FloatingWindowConfig {
  taskId: string;
  itemType: 'note' | 'task';
  title: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  theme: 'light' | 'dark' | 'system';
}

export async function createFloatingWindow(config: FloatingWindowConfig): Promise<void> {
  console.log('[tauri] createFloatingWindow called with:', config);
  try {
    await invoke('createFloatingWindow', {
      config: {
        note_id: config.taskId, // Backend uses 'note_id' as item ID
        item_type: config.itemType,
        title: config.title,
        color: config.color,
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        opacity: config.opacity,
        theme: config.theme,
      },
    });
    console.log('[tauri] createFloatingWindow succeeded');
  } catch (error) {
    console.error('[tauri] createFloatingWindow failed:', error);
    throw error;
  }
}

export async function showFloatingWindow(taskId: string): Promise<void> {
  console.log('[tauri] showFloatingWindow:', taskId);
  await invoke('showFloatingWindow', { note_id: taskId });
}

export async function hideFloatingWindow(taskId: string): Promise<void> {
  console.log('[tauri] hideFloatingWindow:', taskId);
  await invoke('hideFloatingWindow', { note_id: taskId });
}

export async function closeFloatingWindow(taskId: string): Promise<void> {
  console.log('[tauri] closeFloatingWindow:', taskId);
  await invoke('closeFloatingWindow', { note_id: taskId });
}

export async function closeAllFloatingWindows(): Promise<void> {
  console.log('[tauri] closeAllFloatingWindows');
  await invoke('closeAllFloatingWindows');
}

export async function toggleAllFloatingWindows(): Promise<boolean> {
  console.log('[tauri] toggleAllFloatingWindows');
  return await invoke('toggleAllFloatingWindows');
}

export async function ensureFloatingWindowsOnTop(): Promise<void> {
  console.log('[tauri] ensureFloatingWindowsOnTop');
  await invoke('ensureFloatingWindowsOnTop');
}

export async function updateFloatingWindowPosition(taskId: string, x: number, y: number): Promise<void> {
  console.log('[tauri] updateFloatingWindowPosition:', taskId, x, y);
  await invoke('updateFloatingWindowPosition', { note_id: taskId, x, y });
}

export async function updateFloatingWindowSize(taskId: string, width: number, height: number): Promise<void> {
  console.log('[tauri] updateFloatingWindowSize:', taskId, width, height);
  await invoke('updateFloatingWindowSize', { note_id: taskId, width, height });
}

export async function getFloatingWindowPosition(taskId: string): Promise<{ x: number; y: number } | null> {
  const result = await invoke<[number, number] | null>('getFloatingWindowPosition', { note_id: taskId });
  return result ? { x: result[0], y: result[1] } : null;
}

export async function getFloatingWindowSize(taskId: string): Promise<{ width: number; height: number } | null> {
  const result = await invoke<[number, number] | null>('getFloatingWindowSize', { note_id: taskId });
  return result ? { width: result[0], height: result[1] } : null;
}

// ============================================
// PARSE FUNCTIONS
// ============================================

function parseSettings(data: any): Settings {
  return {
    theme: data.theme,
    defaultColor: data.default_color,
    notificationsEnabled: Boolean(data.notifications_enabled ?? true),
    notificationSound: Boolean(data.notification_sound),
    notificationMinutesBefore: data.notification_minutes_before,
    floatingOpacity: data.floating_opacity,
    defaultMode: data.default_mode || 'notes',
  };
}
