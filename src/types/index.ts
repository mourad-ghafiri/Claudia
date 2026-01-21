// ==============================================
// Claudia TypeScript Types
// Matches new filesystem-based Rust backend models
// ==============================================

// ============================================
// STATUS ENUMS
// ============================================

// Backend returns lowercase status
export type TaskStatus = 'todo' | 'doing' | 'done' | 'archived';

// Legacy uppercase aliases for gradual migration
export type TaskStatusUpper = 'TODO' | 'DOING' | 'DONE' | 'ARCHIVED';

// ============================================
// COMMON TYPES
// ============================================

/** Floating window position and visibility - matches Rust FloatWindow */
export interface FloatWindow {
  x: number;
  y: number;
  w: number;
  h: number;
  show: boolean;
}

// ============================================
// WORKSPACE TYPES
// ============================================

export interface WorkspaceEntry {
  path: string;
  name: string;
  lastOpened: number;
}

export interface WorkspaceInfo {
  path: string;
  name: string;
  lastOpened: number;
  isCurrent: boolean;
}

// Legacy alias
export type Workspace = WorkspaceInfo;

// ============================================
// FOLDER TYPES
// ============================================

/** FolderInfo from backend - matches Rust commands::folder::FolderInfo */
export interface FolderInfo {
  id: string;
  name: string;
  rank: number;
  slug: string;
  pinned: boolean;
  favorite: boolean;
  color: string;
  icon: string;
  path: string;
  parentPath: string | null;
  children: FolderInfo[];
}

export interface CreateFolderInput {
  name: string;
  parentPath?: string | null;
}

export interface UpdateFolderInput {
  path: string;
  name?: string;
  pinned?: boolean;
  favorite?: boolean;
  color?: string;
  icon?: string;
}

// ============================================
// NOTE TYPES
// ============================================

/** NoteInfo from backend - matches Rust commands::note::NoteInfo */
export interface NoteInfo {
  id: string;
  title: string;
  rank: number;
  slug: string;
  color: string;
  pinned: boolean;
  tags: string[];
  created: number;
  updated: number;
  folderPath: string;
  path: string;
  float: FloatWindow;
}

export interface CreateNoteInput {
  title: string;
  folderPath?: string | null;
  content?: string;
  color?: string;
  tags?: string[];
}

export interface UpdateNoteInput {
  id: string;
  title?: string;
  content?: string;
  color?: string;
  pinned?: boolean;
  tags?: string[];
  float?: FloatWindow;
}

// ============================================
// TASK TYPES
// ============================================

/** TaskInfo from backend - matches Rust commands::task::TaskInfo */
export interface TaskInfo {
  id: string;
  title: string;
  rank: number;
  slug: string;
  status: TaskStatus;
  color: string;
  pinned: boolean;
  tags: string[];
  due: number | null;
  created: number;
  updated: number;
  folderPath: string;
  path: string;
  float: FloatWindow;
}

export interface CreateTaskInput {
  title: string;
  folderPath?: string | null;
  status?: string;
  content?: string;
  color?: string;
  due?: number | null;
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  status?: string;
  content?: string;
  color?: string;
  pinned?: boolean;
  tags?: string[];
  due?: number | null;
  float?: FloatWindow;
}

// ============================================
// PASSWORD TYPES
// ============================================

/** PasswordInfo from backend - matches Rust commands::password::PasswordInfo */
/** Note: url and username are now encrypted and fetched via getPasswordContent */
export interface PasswordInfo {
  id: string;
  title: string;
  rank: number;
  slug: string;
  color: string;
  pinned: boolean;
  tags: string[];
  created: number;
  updated: number;
  folderPath: string;
  path: string;
}

/** Decrypted password content from backend */
export interface DecryptedPasswordContent {
  url: string;
  username: string;
  password: string;
  notes: string;
}

export interface CreatePasswordInput {
  title: string;
  folderPath?: string | null;
  url?: string;
  username?: string;
  password?: string;
  notes?: string;
  color?: string;
  tags?: string[];
  masterPassword: string;
}

export interface UpdatePasswordInput {
  id: string;
  title?: string;
  url?: string;
  username?: string;
  password?: string;
  notes?: string;
  color?: string;
  pinned?: boolean;
  tags?: string[];
  masterPassword: string;
}

// ============================================
// TEMPLATE TYPES
// ============================================

export type TemplateType = 'notes' | 'tasks';
export type TemplateCategory = 'basic' | 'productivity' | 'planning' | 'documentation' | 'learning' | 'development' | 'operations';

/** TemplateInfo from backend - matches Rust commands::template::TemplateInfo */
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  order: number;
  slug: string;
  templateType: string;
}

// ============================================
// SETTINGS TYPES
// ============================================

/** Settings from backend - matches Rust models::config::Settings */
export interface Settings {
  theme: string;
  defaultMode: string;
  defaultColor: string;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationMinutesBefore: number;
  floatingOpacity: number;
  currentWorkspace?: string | null;
}

/** Partial settings for workspace overrides */
export interface SettingsOverride {
  theme?: string;
  defaultMode?: string;
  defaultColor?: string;
  notificationsEnabled?: boolean;
  notificationSound?: boolean;
  notificationMinutesBefore?: number;
  floatingOpacity?: number;
}

// ============================================
// UI CONSTANTS
// ============================================

export const TASK_COLORS = [
  { value: '#3B82F6', name: 'Blue' },
  { value: '#EF4444', name: 'Red' },
  { value: '#10B981', name: 'Green' },
  { value: '#F59E0B', name: 'Amber' },
  { value: '#8B5CF6', name: 'Purple' },
  { value: '#EC4899', name: 'Pink' },
  { value: '#06B6D4', name: 'Cyan' },
  { value: '#6B7280', name: 'Gray' },
] as const;

export const TAG_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#84CC16', // Lime
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#6B7280', // Gray
] as const;

// ============================================
// EXTENDED TYPES FOR UI COMPONENTS
// These include content and computed fields
// ============================================

/**
 * Extended Note type with content for UI components
 * Flattens float window properties for easier access
 */
export interface Note extends Omit<NoteInfo, 'float'> {
  content: string;
  // Flattened float window properties
  isVisible: boolean;
  windowX: number;
  windowY: number;
  windowWidth: number;
  windowHeight: number;
}

/**
 * Extended Task type with content for UI components
 * Flattens float window properties for easier access
 */
export interface Task extends Omit<TaskInfo, 'float'> {
  description: string;
  // Flattened float window properties
  isVisible: boolean;
  windowX: number;
  windowY: number;
  windowWidth: number;
  windowHeight: number;
}

/**
 * Extended Folder type for UI components
 */
export interface Folder extends FolderInfo {
  parentPath: string | null;
}

/**
 * Extended Password type with decrypted content for UI components
 */
export interface Password extends PasswordInfo {
  decryptedUrl: string;
  decryptedUsername: string;
  decryptedPassword: string;
  decryptedNotes: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Convert NoteInfo to extended Note */
export function toNote(info: NoteInfo, content: string = ''): Note {
  return {
    id: info.id,
    title: info.title,
    rank: info.rank,
    slug: info.slug,
    color: info.color,
    pinned: info.pinned,
    tags: info.tags,
    created: info.created,
    updated: info.updated,
    folderPath: info.folderPath,
    path: info.path,
    content,
    isVisible: info.float.show,
    // Provide sensible defaults when values are 0 (unset)
    windowX: info.float.x || 250,
    windowY: info.float.y || 200,
    windowWidth: info.float.w || 400,
    windowHeight: info.float.h || 300,
  };
}

/** Convert TaskInfo to extended Task */
export function toTask(info: TaskInfo, description: string = ''): Task {
  return {
    id: info.id,
    title: info.title,
    rank: info.rank,
    slug: info.slug,
    status: info.status,
    color: info.color,
    pinned: info.pinned,
    tags: info.tags,
    due: info.due,
    created: info.created,
    updated: info.updated,
    folderPath: info.folderPath,
    path: info.path,
    description,
    isVisible: info.float.show,
    // Provide sensible defaults when values are 0 (unset)
    windowX: info.float.x || 200,
    windowY: info.float.y || 150,
    windowWidth: info.float.w || 320,
    windowHeight: info.float.h || 240,
  };
}

/** Convert status to lowercase (backend format) */
export function toLowerStatus(status: string): TaskStatus {
  return status.toLowerCase() as TaskStatus;
}

/** Convert status to uppercase (legacy UI format) */
export function toUpperStatus(status: TaskStatus): TaskStatusUpper {
  return status.toUpperCase() as TaskStatusUpper;
}
