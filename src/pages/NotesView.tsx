import { useEffect, useState, useRef, useMemo, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Pin, Edit2, ChevronRight, Eye, EyeOff, FileText, Palette, Folder as FolderIcon, GripVertical } from 'lucide-react';
import { useNoteStore } from '../stores/noteStore';
import { useFolderStore } from '../stores/folderStore';
import type { FolderInfo, TemplateInfo } from '../types';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';
import { FolderSidebar } from '../components/layout/FolderSidebar';
import { Button } from '../components/ui/Button';
import { ColorPicker } from '../components/ui/ColorPicker';
import { TagInput } from '../components/ui/TagInput';
import { TemplateSelector } from '../components/template/TemplateSelector';
import { MarkdownRenderer } from '../components/ui/MarkdownRenderer';
import { createFloatingWindow, closeFloatingWindow } from '../lib/tauri';
import { listen } from '@tauri-apps/api/event';
import toast from 'react-hot-toast';
import Editor from '@monaco-editor/react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
    DragEndEvent,
    DragStartEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Note } from '../types';

// Sortable Note Item - Unified styling with KanbanCard - memoized
const SortableNoteItem = memo(function SortableNoteItem({
    note,
    isSelected,
    onClick,
    onDelete,
    onPin,
    onToggleFloat,
    localIsHidden,
    tags,
    loadContent,
}: {
    note: Note;
    isSelected: boolean;
    onClick: () => void;
    onDelete: (id: string) => void;
    onPin: (id: string) => void;
    onToggleFloat: (id: string) => void;
    localIsHidden: boolean;
    tags: string[];
    loadContent: (id: string) => void;
}) {
    const [showActions, setShowActions] = useState(false);
    const itemRef = useRef<HTMLDivElement>(null);
    const [hasRequestedContent, setHasRequestedContent] = useState(false);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: note.id });

    // Combine refs for sortable and intersection observer
    const combinedRef = useCallback((node: HTMLDivElement | null) => {
        setNodeRef(node);
        (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }, [setNodeRef]);

    // Lazy load content when item becomes visible
    useEffect(() => {
        if (hasRequestedContent || note.content) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !hasRequestedContent) {
                    setHasRequestedContent(true);
                    loadContent(note.id);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px' }
        );

        if (itemRef.current) {
            observer.observe(itemRef.current);
        }

        return () => observer.disconnect();
    }, [note.id, note.content, hasRequestedContent, loadContent]);

    // Use the note's color or default to green
    const noteColor = note.color || '#6B9F78';

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        borderLeftColor: noteColor,
        opacity: isDragging ? 0.5 : 1,
    };


    // Memoize date formatting - expensive locale operations
    const formattedDate = useMemo(() => {
        const date = new Date(note.updated);
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }, [note.updated]);

    return (
        <div
            ref={combinedRef}
            style={style}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
            onClick={onClick}
            className={`
                group relative rounded-xl shadow-sm
                border-l-4 py-3 pr-3 pl-7 mb-2 mx-2 cursor-pointer select-text
                hover:shadow-md transition-shadow duration-150
                ${isDragging ? 'shadow-lg ring-2 ring-[#DA7756]' : ''}
                ${isSelected
                    ? 'bg-[#F5F3F0] dark:bg-[#353535]'
                    : 'bg-white dark:bg-[#2E2E2E]'
                }
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
                <FileText className="w-3 h-3 text-[#6B9F78] opacity-50" />
                {note.pinned && (
                    <Pin className="w-3 h-3 text-[#DA7756]" />
                )}
            </div>

            {/* Title */}
            <h3 className="font-medium text-[#2D2D2D] dark:text-[#E8E6E3] text-sm line-clamp-2 pr-10">
                {note.title || 'Untitled Note'}
            </h3>

            {/* Content preview */}
            {note.content && (
                <div className="mt-1 text-xs text-[#6B6B6B] dark:text-[#B5AFA6] line-clamp-2">
                    <MarkdownRenderer content={note.content} maxChars={200} />
                </div>
            )}

            {/* Tags and Date/Time */}
            <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                    {tags.slice(0, 2).map((tag, index) => (
                        <span
                            key={`${tag}-${index}`}
                            className="px-1 py-0 text-[9px] rounded bg-[#DA7756]/10 text-[#DA7756]"
                        >
                            {tag}
                        </span>
                    ))}
                    {tags.length > 2 && (
                        <span className="text-[9px] text-[#6B6B6B]">
                            +{tags.length - 2}
                        </span>
                    )}
                </div>
                <span className="text-[10px] text-[#B5AFA6] dark:text-[#6B6B6B]">
                    {formattedDate}
                </span>
            </div>

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
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFloat(note.id);
                        }}
                        title={localIsHidden ? 'Show floating window' : 'Hide floating window'}
                    >
                        {localIsHidden ? (
                            <Eye className="w-3.5 h-3.5" />
                        ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-[#6B6B6B] hover:text-[#DA7756]"
                        onClick={(e) => {
                            e.stopPropagation();
                            onPin(note.id);
                        }}
                    >
                        <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'text-[#DA7756]' : ''}`} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-[#E57373] hover:text-[#D32F2F]"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(note.id);
                        }}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </motion.div>
            )}
        </div>
    );
});

export function NotesView() {
    const { notes, loading, fetchNotes, fetchNotesByFolder, createNote, updateNote, reorderNotes, getNoteById, updateNotePositionLocal, moveNoteToFolder, getNoteContent } = useNoteStore();
    const { currentFolderPath, setCurrentFolder, folders, reorderFolders } = useFolderStore();
    // Tags are now stored directly as string arrays on notes
    const { searchQuery, openDeleteConfirm, selectedNoteId, setSelectedNoteId } = useUIStore();
    const { settings } = useSettingsStore();
    const [editingTitle, setEditingTitle] = useState('');
    const [editingContent, setEditingContent] = useState('');
    const [editingColor, setEditingColor] = useState('#6B9F78');
    const [editingTags, setEditingTags] = useState<string[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);
    const [draggedNote, setDraggedNote] = useState<Note | null>(null);
    const [draggedFolder, setDraggedFolder] = useState<FolderInfo | null>(null);
    // Track local visibility state for each note
    const [localVisibleStates, setLocalVisibleStates] = useState<Record<string, boolean>>({});
    const togglingRef = useRef<string | null>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    // Template selector state
    const [showTemplateSelector, setShowTemplateSelector] = useState(false);
    // Track dark mode for Monaco Editor theme
    const [isDarkMode, setIsDarkMode] = useState(() =>
        document.documentElement.classList.contains('dark')
    );

    // Listen for theme changes
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    setIsDarkMode(document.documentElement.classList.contains('dark'));
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    // Sync local visible states with notes
    // Uses functional update to avoid stale closure issues with localVisibleStates
    useEffect(() => {
        setLocalVisibleStates(prevStates => {
            const newStates: Record<string, boolean> = {};
            notes.forEach(note => {
                newStates[note.id] = prevStates[note.id] ?? note.isVisible;
            });
            return newStates;
        });
    }, [notes]);

    // Listen for note-hidden and note-position-changed events from floating windows
    useEffect(() => {
        let isMounted = true;
        let unlistenHidden: (() => void) | null = null;
        let unlistenPosition: (() => void) | null = null;

        const setupListeners = async () => {
            const hiddenListener = await listen<{ noteId: string }>('note-hidden', async (event) => {
                if (!isMounted) return;
                const { noteId } = event.payload;
                // Update local state
                setLocalVisibleStates(prev => ({ ...prev, [noteId]: false }));
                // Update store
                await updateNote({ id: noteId, isVisible: false });
            });

            const positionListener = await listen<{ noteId: string; position_x?: number; position_y?: number; width?: number; height?: number }>(
                'note-position-changed',
                (event) => {
                    if (!isMounted) return;
                    const { noteId, position_x, position_y, width, height } = event.payload;
                    // Get current note to fill in missing values
                    const currentNote = getNoteById(noteId);
                    if (currentNote) {
                        updateNotePositionLocal(
                            noteId,
                            position_x ?? currentNote.windowX,
                            position_y ?? currentNote.windowY,
                            width ?? currentNote.windowWidth,
                            height ?? currentNote.windowHeight
                        );
                    }
                }
            );

            // Check if still mounted before storing listeners
            if (isMounted) {
                unlistenHidden = hiddenListener;
                unlistenPosition = positionListener;
            } else {
                // Component unmounted during setup - clean up immediately
                hiddenListener();
                positionListener();
            }
        };

        setupListeners();

        return () => {
            isMounted = false;
            unlistenHidden?.();
            unlistenPosition?.();
        };
    }, [updateNote, updateNotePositionLocal, getNoteById]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        })
    );

    const selectedNote = selectedNoteId ? getNoteById(selectedNoteId) : null;

    // Filter and sort notes for current folder - memoized to avoid recalculation on every render
    // When currentFolderPath is null (All Notes), show ALL notes regardless of folder
    // When a specific folder is selected, show only notes in that folder
    const filteredNotes = useMemo(() => {
        return notes
            .filter(note => currentFolderPath === null || note.folderPath === currentFolderPath)
            .filter(note => searchQuery ? note.title.toLowerCase().includes(searchQuery.toLowerCase()) : true)
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                if (a.rank !== b.rank) return a.rank - b.rank;
                return b.updated - a.updated;
            });
    }, [notes, currentFolderPath, searchQuery]);

    useEffect(() => {
        fetchNotes();
    }, [fetchNotes]);

    // Auto-select first note when entering Notes view for the first time
    useEffect(() => {
        if (!selectedNoteId && filteredNotes.length > 0) {
            setSelectedNoteId(filteredNotes[0].id);
        }
    }, [filteredNotes, selectedNoteId, setSelectedNoteId]);

    // Listen for folder-deleted event to refetch notes
    useEffect(() => {
        const handleFolderDeleted = (event: Event) => {
            const customEvent = event as CustomEvent<{ folderPath: string }>;
            // Reset current folder if it was the deleted one
            if (currentFolderPath === customEvent.detail.folderPath) {
                setCurrentFolder(null);
            }
            fetchNotes();
        };
        window.addEventListener('folder-deleted', handleFolderDeleted);
        return () => window.removeEventListener('folder-deleted', handleFolderDeleted);
    }, [fetchNotes, currentFolderPath, setCurrentFolder]);

    // Load content when a note is selected (lazy loading)
    // Uses isCurrent flag to prevent stale async operations from affecting state
    useEffect(() => {
        if (!selectedNoteId || isEditing) return;

        let isCurrent = true;

        const loadContent = async () => {
            await getNoteContent(selectedNoteId);
            // Content is loaded into the notes array by getNoteContent
            // The isCurrent check ensures we don't process stale results
            if (!isCurrent) {
                console.log('[NotesView] Skipping stale content load for:', selectedNoteId);
            }
        };

        loadContent();

        return () => {
            isCurrent = false;
        };
    }, [selectedNoteId, isEditing, getNoteContent]);

    useEffect(() => {
        if (selectedNote && !isEditing) {
            setEditingTitle(selectedNote.title);
            setEditingContent(selectedNote.content);
            setEditingColor(selectedNote.color || '#6B9F78');
            // Tags are now string arrays
            setEditingTags(selectedNote.tags || []);
        }
    }, [selectedNoteId, selectedNote, isEditing]);

    const handleFolderChange = useCallback((folderPath: string | null) => {
        setCurrentFolder(folderPath);
        if (folderPath) {
            fetchNotesByFolder(folderPath);
        } else {
            fetchNotes();
        }
        // Clear selection - the auto-select effect will pick the first note in new folder
        setSelectedNoteId(null);
    }, [setCurrentFolder, fetchNotesByFolder, fetchNotes, setSelectedNoteId]);

    const handleNewNote = () => {
        // Open template selector
        setShowTemplateSelector(true);
    };

    const handleTemplateSelect = async (content: string, templateInfo: TemplateInfo) => {
        // Create a new note with the template content
        try {
            const newNote = await createNote({
                title: templateInfo.name === 'Blank Note' ? 'Untitled Note' : templateInfo.name,
                content: content,
                folderPath: currentFolderPath,
                color: templateInfo.color || '#6B9F78',
            });
            // Select the new note and enter edit mode
            setSelectedNoteId(newNote.id);
            setEditingTitle(newNote.title);
            setEditingContent(content);
            setEditingColor(newNote.color || '#6B9F78');
            setEditingTags([]);
            setIsMetadataExpanded(false);
            setIsEditing(true);
            // Focus title input after state updates
            setTimeout(() => {
                titleInputRef.current?.focus();
                titleInputRef.current?.select();
            }, 50);
        } catch (error) {
            toast.error('Failed to create note');
        }
    };

    const handleTitleBlur = async () => {
        if (selectedNoteId && editingTitle !== selectedNote?.title) {
            await updateNote({ id: selectedNoteId, title: editingTitle });
        }
    };

    const handleSave = async () => {
        if (!selectedNoteId) return;

        // Tags are now stored as string arrays directly
        await updateNote({
            id: selectedNoteId,
            content: editingContent,
            title: editingTitle,
            color: editingColor,
            tags: editingTags,
        });
        setIsEditing(false);
        setIsMetadataExpanded(false);
        toast.success('Note saved');
    };

    const handleDeleteNote = useCallback((noteId: string) => {
        openDeleteConfirm(noteId, 'note');
        if (selectedNoteId === noteId) setSelectedNoteId(null);
    }, [openDeleteConfirm, selectedNoteId, setSelectedNoteId]);

    const handlePinNote = useCallback(async (noteId: string) => {
        const note = getNoteById(noteId);
        if (note) {
            await updateNote({ id: noteId, pinned: !note.pinned });
            toast.success(note.pinned ? 'Note unpinned' : 'Note pinned');
        }
    }, [getNoteById, updateNote]);

    const handleToggleFloat = useCallback(async (noteId: string) => {
        // Prevent double execution
        if (togglingRef.current === noteId) return;
        togglingRef.current = noteId;

        const note = getNoteById(noteId);
        if (!note) {
            togglingRef.current = null;
            return;
        }

        const currentIsVisible = localVisibleStates[noteId] ?? note.isVisible;
        const newVisibleValue = !currentIsVisible;

        // Update local state immediately
        setLocalVisibleStates(prev => ({ ...prev, [noteId]: newVisibleValue }));

        try {
            if (!newVisibleValue) {
                // HIDING: Close the floating window
                try {
                    await closeFloatingWindow(noteId);
                } catch (error) {
                    // Window may not exist
                }
            } else {
                // SHOWING: Create the floating window
                await createFloatingWindow({
                    taskId: noteId,
                    itemType: 'note',
                    title: note.title || 'Untitled Note',
                    color: note.color || '#6B9F78',
                    x: note.windowX ?? 250,
                    y: note.windowY ?? 200,
                    width: note.windowWidth ?? 400,
                    height: note.windowHeight ?? 300,
                    opacity: settings?.floatingOpacity ?? 0.95,
                    theme: (settings?.theme ?? 'system') as 'light' | 'dark' | 'system',
                });
            }

            // Update the store
            await updateNote({ id: noteId, isVisible: newVisibleValue });
        } catch (error) {
            // Revert local state on error
            setLocalVisibleStates(prev => ({ ...prev, [noteId]: currentIsVisible }));
        } finally {
            setTimeout(() => {
                togglingRef.current = null;
            }, 300);
        }
    }, [getNoteById, localVisibleStates, settings, updateNote]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const activeId = event.active.id as string;

        // Check if it's a note
        const note = notes.find(n => n.id === activeId);
        if (note) {
            setDraggedNote(note);
            setDraggedFolder(null);
            return;
        }

        // Check if it's a folder
        const folder = folders.find(f => f.id === activeId);
        if (folder) {
            setDraggedFolder(folder);
            setDraggedNote(null);
            return;
        }
    }, [notes, folders]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;
        const wasDraggingFolder = draggedFolder !== null;
        setDraggedNote(null);
        setDraggedFolder(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Handle folder reordering
        if (wasDraggingFolder) {
            // overId is in format "folder-{path}" from droppable
            if (typeof overId === 'string' && overId.startsWith('folder-')) {
                const targetFolderPath = overId.replace('folder-', '');
                const folderPaths = folders.map(f => f.path);
                const activeFolder = folders.find(f => f.id === activeId);
                const overFolder = folders.find(f => f.path === targetFolderPath);

                if (activeFolder && overFolder && activeFolder.path !== overFolder.path) {
                    const oldIndex = folderPaths.indexOf(activeFolder.path);
                    const newIndex = folderPaths.indexOf(overFolder.path);

                    if (oldIndex !== -1 && newIndex !== -1) {
                        const reorderedFolderPaths = arrayMove(folderPaths, oldIndex, newIndex);
                        await reorderFolders(null, reorderedFolderPaths);
                        toast.success('Folder reordered');
                    }
                }
            }
            return;
        }

        // Handle dropping note onto a folder
        if (typeof overId === 'string' && overId.startsWith('folder-')) {
            const targetFolderPath = overId.replace('folder-', '');
            const note = notes.find(n => n.id === activeId);
            if (note && note.folderPath !== targetFolderPath) {
                try {
                    await moveNoteToFolder(activeId, targetFolderPath);
                    toast.success('Note moved to folder');
                } catch (error) {
                    toast.error('Failed to move note');
                }
            }
            return;
        }

        // Handle note reordering within the current view
        if (activeId !== overId) {
            const oldIndex = filteredNotes.findIndex((note) => note.id === activeId);
            const newIndex = filteredNotes.findIndex((note) => note.id === overId);

            if (oldIndex !== -1 && newIndex !== -1) {
                const reorderedFilteredNoteIds = arrayMove(filteredNotes.map(n => n.id), oldIndex, newIndex);
                await reorderNotes(currentFolderPath || '', reorderedFilteredNoteIds);
            }
        }
    }, [draggedFolder, folders, notes, filteredNotes, currentFolderPath, reorderFolders, moveNoteToFolder, reorderNotes]);

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
                    allItemsLabel="All Notes"
                    onFolderChange={handleFolderChange}
                />

                {/* Notes List */}
                <div className="w-80 flex-shrink-0 bg-white dark:bg-[#242424] border-r border-[#EBE8E4] dark:border-[#2E2E2E] flex flex-col">
                    <div className="p-3 border-b border-[#EBE8E4] dark:border-[#2E2E2E]">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold text-[#2D2D2D] dark:text-[#E8E6E3]">Notes</h2>
                            <button
                                onClick={handleNewNote}
                                className="p-1.5 hover:bg-[#F5F3F0] dark:hover:bg-[#2E2E2E] rounded-lg transition-colors"
                                title="New Note"
                            >
                                <Plus className="w-4 h-4 text-[#B5AFA6]" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
                        {loading ? (
                            <div className="p-4 text-center text-sm text-[#B5AFA6] dark:text-[#6B6B6B]">
                                <div className="animate-pulse">Loading notes...</div>
                            </div>
                        ) : filteredNotes.length === 0 ? (
                            <div className="p-4 text-center text-sm text-[#B5AFA6] dark:text-[#6B6B6B]">
                                No notes found
                            </div>
                        ) : (
                            <SortableContext items={filteredNotes.map(n => n.id)} strategy={verticalListSortingStrategy}>
                                <div className="pt-2">
                                    {filteredNotes.map(note => (
                                        <SortableNoteItem
                                            key={note.id}
                                            note={note}
                                            isSelected={selectedNoteId === note.id}
                                            onClick={() => {
                                                setSelectedNoteId(note.id);
                                                setIsEditing(false);
                                            }}
                                            onDelete={handleDeleteNote}
                                            onPin={handlePinNote}
                                            onToggleFloat={handleToggleFloat}
                                            localIsHidden={!(localVisibleStates[note.id] ?? note.isVisible)}
                                            tags={note.tags || []}
                                            loadContent={getNoteContent}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        )}
                    </div>
                </div>

                {/* Note Editor/Preview */}
                <div className="flex-1 min-w-0 flex flex-col bg-[#FAF9F7] dark:bg-[#1A1A1A] h-full overflow-hidden">
                    {selectedNote ? (
                        <>
                            {/* Title bar */}
                            <div className="p-6 pb-4 border-b border-[#EBE8E4] dark:border-[#2E2E2E] bg-white dark:bg-[#242424]">
                                <div className="flex items-start justify-between gap-4">
                                    {/* Palette icon before title - only in edit mode */}
                                    {isEditing && (
                                        <button
                                            onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
                                            className={`p-2 -ml-2 rounded-xl transition-colors flex-shrink-0 ${isMetadataExpanded
                                                ? 'bg-[#DA7756]/10 text-[#DA7756]'
                                                : 'text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#DA7756] hover:bg-[#F5F3F0] dark:hover:bg-[#2E2E2E]'
                                                }`}
                                            title="Color & Tags"
                                        >
                                            <Palette className="w-4 h-4" />
                                        </button>
                                    )}
                                    <input
                                        ref={titleInputRef}
                                        type="text"
                                        value={editingTitle}
                                        onChange={(e) => setEditingTitle(e.target.value)}
                                        onBlur={handleTitleBlur}
                                        className="flex-1 text-2xl font-semibold bg-transparent border-0 focus:ring-0 focus:outline-none p-0 text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#D8D3CC] dark:placeholder-[#4A4A4A]"
                                        placeholder="Note title..."
                                        disabled={!isEditing}
                                    />
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {isEditing ? (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        setIsEditing(false);
                                                        setIsMetadataExpanded(false);
                                                    }}
                                                    className="px-4 py-2 text-sm font-medium text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3] transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleSave}
                                                    className="px-4 py-2 text-sm font-medium text-white bg-[#DA7756] hover:bg-[#C96847] rounded-xl transition-colors"
                                                >
                                                    Save
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setEditingContent(selectedNote.content);
                                                    setEditingColor(selectedNote.color || '#6B9F78');
                                                    // Tags are now string arrays
                                                    setEditingTags(selectedNote.tags || []);
                                                    setIsMetadataExpanded(false);
                                                    setIsEditing(true);
                                                    // Focus title input after state updates
                                                    setTimeout(() => {
                                                        titleInputRef.current?.focus();
                                                    }, 50);
                                                }}
                                                className="px-4 py-2 text-sm font-medium text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#DA7756] transition-colors flex items-center gap-1.5"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                                Edit
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Collapsible metadata row - only show in edit mode */}
                                {isEditing && isMetadataExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="mt-3 flex items-center gap-3"
                                    >
                                        {/* Color Picker - inline */}
                                        <ColorPicker value={editingColor} onChange={setEditingColor} size="sm" />

                                        {/* Divider */}
                                        <div className="w-px h-6 bg-[#EBE8E4] dark:bg-[#393939]" />

                                        {/* Tags - inline */}
                                        <div className="flex-1">
                                            <TagInput
                                                value={editingTags}
                                                onChange={setEditingTags}
                                                placeholder="Add tags..."
                                            />
                                        </div>
                                    </motion.div>
                                )}

                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-hidden relative bg-white dark:bg-[#242424]">
                                {isEditing ? (
                                    <Editor
                                        height="100%"
                                        defaultLanguage="markdown"
                                        theme={isDarkMode ? 'vs-dark' : 'light'}
                                        value={editingContent}
                                        onChange={(value) => setEditingContent(value || '')}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            wordWrap: 'on',
                                            padding: { top: 20, bottom: 20 },
                                            scrollBeyondLastLine: false,
                                            lineNumbers: 'off',
                                        }}
                                    />
                                ) : (
                                    <div className="w-full h-full p-6 overflow-y-auto">
                                        <MarkdownRenderer content={selectedNote.content} maxChars={-1} className="prose-headings:text-[#2D2D2D] dark:prose-headings:text-[#E8E6E3] prose-p:text-[#4A4A4A] dark:prose-p:text-[#C8C6C3] prose-a:text-[#DA7756]" />
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-[#B5AFA6] dark:text-[#6B6B6B]">
                            <div className="text-center">
                                <ChevronRight className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                <p>Select a note to view or edit</p>
                            </div>
                        </div>
                    )}
                </div>

                <DragOverlay>
                    {draggedNote && (
                        <div className="p-3 bg-white dark:bg-[#242424] border border-[#EBE8E4] dark:border-[#393939] rounded-xl opacity-90 shadow-xl w-64 pointer-events-none">
                            <h3 className="font-medium text-sm text-[#2D2D2D] dark:text-[#E8E6E3]">{draggedNote.title}</h3>
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
                    templateType="notes"
                />
            </div>
        </DndContext>
    );
}

