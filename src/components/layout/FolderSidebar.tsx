// Folder Sidebar with categories: Favorites, Pinned, All Folders
import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Home, PanelLeftClose, PanelLeft, Plus, ChevronDown, ChevronRight, Star, Pin, Folder, FolderOpen, MoreHorizontal, Pencil, Trash2, Palette, RefreshCw, GripVertical } from 'lucide-react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useFolderStore } from '../../stores/folderStore';
import { useUIStore } from '../../stores/uiStore';
import type { FolderInfo } from '../../types';
import toast from 'react-hot-toast';

interface FolderSidebarProps {
    title: string;
    allItemsLabel?: string;
    onFolderChange?: (folderPath: string | null) => void;
}

// Color presets for folder colors
const COLOR_PRESETS = [
    '#DA7756', '#D66565', '#D4A72C', '#6B9F78', '#4BA3A3',
    '#5B8DEF', '#9B7ED9', '#D47B9E', '#B5AFA6', '#6B6B6B'
];

// Helper to flatten folders recursively
function flattenFolders(folders: FolderInfo[]): FolderInfo[] {
    const result: FolderInfo[] = [];
    for (const folder of folders) {
        result.push(folder);
        if (folder.children && folder.children.length > 0) {
            result.push(...flattenFolders(folder.children));
        }
    }
    return result;
}

export const FolderSidebar = memo(function FolderSidebar({
    title,
    allItemsLabel = 'All Items',
    onFolderChange,
}: FolderSidebarProps) {
    const {
        folders,
        currentFolderPath,
        setCurrentFolder,
        createFolder,
        updateFolder,
        fetchFolders,
        toggleFavorite,
        togglePin,
        setFolderColor,
    } = useFolderStore();
    const { openDeleteConfirm, isSidebarCollapsed, toggleSidebar } = useUIStore();

    // Section collapse states
    const [favoritesExpanded, setFavoritesExpanded] = useState(true);
    const [pinnedExpanded, setPinnedExpanded] = useState(true);
    const [foldersExpanded, setFoldersExpanded] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folder: FolderInfo } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Dialog states
    const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [dialogFolder, setDialogFolder] = useState<FolderInfo | null>(null);
    const [folderName, setFolderName] = useState('');
    const [parentFolderPath, setParentFolderPath] = useState<string | null>(null);

    // Categorize folders
    const { favoriteFolders, pinnedFolders, regularFolders } = useMemo(() => {
        const allFlat = flattenFolders(folders);
        return {
            favoriteFolders: allFlat.filter(f => f.favorite),
            pinnedFolders: allFlat.filter(f => f.pinned && !f.favorite),
            regularFolders: folders.sort((a, b) => a.rank - b.rank),
        };
    }, [folders]);

    useEffect(() => {
        fetchFolders();
    }, [fetchFolders]);

    // Close context menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setContextMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleFolderSelect = (folderPath: string | null) => {
        setCurrentFolder(folderPath);
        onFolderChange?.(folderPath);
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await fetchFolders();
            toast.success('Folders refreshed');
        } catch (error) {
            toast.error('Failed to refresh');
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, folder: FolderInfo) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, folder });
    };

    const handleCreateFolder = async () => {
        if (!folderName.trim()) {
            setShowNewFolderDialog(false);
            return;
        }
        try {
            const newFolder = await createFolder(folderName.trim(), parentFolderPath ?? undefined);
            handleFolderSelect(newFolder.path);
            setFolderName('');
            setParentFolderPath(null);
            setShowNewFolderDialog(false);
            toast.success('Folder created');
        } catch (error) {
            toast.error('Failed to create folder');
        }
    };

    const handleRename = async () => {
        if (!dialogFolder || !folderName.trim()) {
            setShowRenameDialog(false);
            return;
        }
        try {
            await updateFolder({ path: dialogFolder.path, name: folderName.trim() });
            setShowRenameDialog(false);
            setFolderName('');
            setDialogFolder(null);
            toast.success('Folder renamed');
        } catch (error) {
            toast.error('Failed to rename folder');
        }
    };

    const handleColorSelect = async (color: string) => {
        if (!dialogFolder) return;
        try {
            await setFolderColor(dialogFolder.path, color);
            setShowColorPicker(false);
            setDialogFolder(null);
            toast.success('Color updated');
        } catch (error) {
            toast.error('Failed to update color');
        }
    };

    // Context menu actions
    const menuActions = {
        newSubfolder: () => {
            if (contextMenu) {
                setParentFolderPath(contextMenu.folder.path);
                setFolderName('');
                setShowNewFolderDialog(true);
                setContextMenu(null);
            }
        },
        rename: () => {
            if (contextMenu) {
                setDialogFolder(contextMenu.folder);
                setFolderName(contextMenu.folder.name);
                setShowRenameDialog(true);
                setContextMenu(null);
            }
        },
        toggleFavorite: async () => {
            if (contextMenu) {
                try {
                    await toggleFavorite(contextMenu.folder.path);
                    toast.success(contextMenu.folder.favorite ? 'Removed from favorites' : 'Added to favorites');
                } catch (error) {
                    toast.error('Failed to update');
                }
                setContextMenu(null);
            }
        },
        togglePin: async () => {
            if (contextMenu) {
                try {
                    await togglePin(contextMenu.folder.path);
                    toast.success(contextMenu.folder.pinned ? 'Unpinned' : 'Pinned');
                } catch (error) {
                    toast.error('Failed to update');
                }
                setContextMenu(null);
            }
        },
        changeColor: () => {
            if (contextMenu) {
                setDialogFolder(contextMenu.folder);
                setShowColorPicker(true);
                setContextMenu(null);
            }
        },
        delete: () => {
            if (contextMenu) {
                openDeleteConfirm(contextMenu.folder.path, 'folder');
                setContextMenu(null);
            }
        },
    };

    // Render a single folder item with draggable (for reordering) and droppable (for note drops) support
    const DraggableFolderItem = ({ folder, indent = 0, isDraggable = true }: { folder: FolderInfo; indent?: number; isDraggable?: boolean }) => {
        const isSelected = currentFolderPath === folder.path;

        // Draggable hook for drag-and-drop reordering (uses folder.id)
        const {
            attributes,
            listeners,
            setNodeRef: setDraggableRef,
            transform,
            isDragging,
        } = useDraggable({
            id: folder.id,
            disabled: !isDraggable,
        });

        // Droppable hook for receiving notes AND for folder reorder targets (uses folder-${folder.path})
        const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: `folder-${folder.path}` });

        // Combine refs
        const setNodeRef = (node: HTMLElement | null) => {
            setDraggableRef(node);
            setDroppableRef(node);
        };

        const style = transform ? {
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
            zIndex: isDragging ? 1000 : undefined,
        } : undefined;

        return (
            <div
                ref={setNodeRef}
                key={folder.path}
                onClick={() => handleFolderSelect(folder.path)}
                onContextMenu={(e) => handleContextMenu(e, folder)}
                className={`
                    group flex items-center gap-1 py-1.5 px-2 mx-1 rounded-lg cursor-pointer transition-all duration-150
                    ${isDragging ? 'shadow-lg ring-2 ring-[#DA7756] opacity-50' : ''}
                    ${isSelected
                        ? 'bg-[#DA7756]/15 text-[#DA7756]'
                        : isOver
                            ? 'bg-[#6B9F78]/20 ring-2 ring-[#6B9F78]'
                            : 'text-[#2D2D2D] dark:text-[#E8E6E3] hover:bg-[#EBE8E4] dark:hover:bg-[#2E2E2E]'
                    }
                `}
                style={{ ...style, paddingLeft: `${8 + indent * 16}px` }}
            >
                {/* Drag handle - only show for draggable folders */}
                {isDraggable && (
                    <div
                        {...attributes}
                        {...listeners}
                        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 -ml-1 hover:bg-[#D8D3CC] dark:hover:bg-[#393939] rounded transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <GripVertical className="w-3 h-3 text-[#B5AFA6] dark:text-[#6B6B6B]" />
                    </div>
                )}
                {folder.color && (
                    <div
                        className="w-1 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: folder.color }}
                    />
                )}
                {isSelected ? (
                    <FolderOpen className="w-4 h-4 flex-shrink-0" />
                ) : (
                    <Folder className="w-4 h-4 flex-shrink-0 text-[#B5AFA6] dark:text-[#6B6B6B]" />
                )}
                <span className="flex-1 truncate text-sm">{folder.name}</span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, folder);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#D8D3CC] dark:hover:bg-[#393939] rounded transition-opacity"
                >
                    <MoreHorizontal className="w-3 h-3 text-[#B5AFA6] dark:text-[#6B6B6B]" />
                </button>
            </div>
        );
    };

    // Render folder with children
    const renderFolderWithChildren = (folder: FolderInfo, indent: number = 0, isDraggable: boolean = true) => (
        <div key={folder.path}>
            <DraggableFolderItem folder={folder} indent={indent} isDraggable={isDraggable && indent === 0} />
            {folder.children?.map(child => renderFolderWithChildren(child, indent + 1, false))}
        </div>
    );

    // Render section
    const renderSection = (
        sectionTitle: string,
        icon: React.ReactNode,
        items: FolderInfo[],
        expanded: boolean,
        setExpanded: (v: boolean) => void,
        flat: boolean = false,
        draggable: boolean = false
    ) => {
        if (items.length === 0) return null;

        return (
            <div className="mb-3">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-medium text-[#B5AFA6] dark:text-[#6B6B6B] uppercase tracking-wider hover:text-[#6B6B6B] dark:hover:text-[#B5AFA6] transition-colors"
                >
                    {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {icon}
                    <span>{sectionTitle}</span>
                    <span className="ml-auto bg-[#EBE8E4] dark:bg-[#2E2E2E] text-[#6B6B6B] text-xs px-1.5 py-0.5 rounded">{items.length}</span>
                </button>
                {expanded && (
                    <div className="mt-1">
                        {flat
                            ? items.map(f => <DraggableFolderItem key={f.path} folder={f} isDraggable={false} />)
                            : items.map(f => renderFolderWithChildren(f, 0, draggable))
                        }
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`
            flex flex-col flex-shrink-0 bg-[#FAF9F7] dark:bg-[#242424] border-r border-[#EBE8E4] dark:border-[#2E2E2E] transition-all duration-200
            ${isSidebarCollapsed ? 'w-14' : 'w-56'}
        `}>
            {/* Header */}
            <div className="p-3 border-b border-[#EBE8E4] dark:border-[#2E2E2E] flex items-center justify-between">
                {!isSidebarCollapsed && (
                    <h2 className="font-semibold text-sm text-[#2D2D2D] dark:text-[#E8E6E3]">{title}</h2>
                )}
                <div className={`flex items-center gap-1 ${isSidebarCollapsed ? 'mx-auto' : ''}`}>
                    {!isSidebarCollapsed && (
                        <>
                            <button
                                onClick={() => {
                                    setParentFolderPath(null);
                                    setFolderName('');
                                    setShowNewFolderDialog(true);
                                }}
                                className="p-1.5 hover:bg-[#EBE8E4] dark:hover:bg-[#2E2E2E] rounded-lg transition-colors"
                                title="New Folder"
                            >
                                <Plus className="w-4 h-4 text-[#6B6B6B] dark:text-[#B5AFA6]" />
                            </button>
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className="p-1.5 hover:bg-[#EBE8E4] dark:hover:bg-[#2E2E2E] rounded-lg transition-colors disabled:opacity-50"
                                title="Refresh Folders"
                            >
                                <RefreshCw className={`w-4 h-4 text-[#6B6B6B] dark:text-[#B5AFA6] ${isRefreshing ? 'animate-spin' : ''}`} />
                            </button>
                        </>
                    )}
                    <button
                        onClick={toggleSidebar}
                        className="p-1.5 hover:bg-[#EBE8E4] dark:hover:bg-[#2E2E2E] rounded-lg transition-colors"
                    >
                        {isSidebarCollapsed ? (
                            <PanelLeft className="w-4 h-4 text-[#6B6B6B] dark:text-[#B5AFA6]" />
                        ) : (
                            <PanelLeftClose className="w-4 h-4 text-[#6B6B6B] dark:text-[#B5AFA6]" />
                        )}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto py-2" style={{ scrollbarGutter: 'stable' }}>
                {/* All Items */}
                <div className="relative group mx-2 mb-3">
                    <div
                        onClick={() => handleFolderSelect(null)}
                        className={`
                            flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors
                            ${currentFolderPath === null
                                ? 'bg-[#DA7756]/15 text-[#DA7756]'
                                : 'text-[#6B6B6B] dark:text-[#B5AFA6] hover:bg-[#EBE8E4] dark:hover:bg-[#2E2E2E]'
                            }
                        `}
                    >
                        <Home className="w-4 h-4" />
                        {!isSidebarCollapsed && (
                            <span className="text-sm font-medium">
                                {allItemsLabel}
                            </span>
                        )}
                    </div>
                    {isSidebarCollapsed && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-[#2D2D2D] dark:bg-[#1A1A1A] text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                            {allItemsLabel}
                        </div>
                    )}
                </div>

                {!isSidebarCollapsed && (
                    <>
                        {renderSection('Favorites', <Star className="w-3 h-3 text-[#D4A72C]" />, favoriteFolders, favoritesExpanded, setFavoritesExpanded, true, false)}
                        {renderSection('Pinned', <Pin className="w-3 h-3 text-[#5B8DEF]" />, pinnedFolders, pinnedExpanded, setPinnedExpanded, true, false)}
                        {(favoriteFolders.length > 0 || pinnedFolders.length > 0) && regularFolders.length > 0 && (
                            <div className="h-px bg-[#EBE8E4] dark:bg-[#2E2E2E] mx-3 my-2" />
                        )}
                        {renderSection('Folders', <Folder className="w-3 h-3" />, regularFolders, foldersExpanded, setFoldersExpanded, false, true)}

                        {folders.length === 0 && (
                            <div className="text-center py-8 px-4">
                                <Folder className="w-10 h-10 text-[#D8D3CC] dark:text-[#393939] mx-auto mb-3" />
                                <p className="text-sm text-[#B5AFA6] dark:text-[#6B6B6B] mb-3">No folders yet</p>
                                <button
                                    onClick={() => {
                                        setParentFolderPath(null);
                                        setFolderName('');
                                        setShowNewFolderDialog(true);
                                    }}
                                    className="text-sm text-[#DA7756] hover:underline"
                                >
                                    Create your first folder
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* Collapsed view */}
                {isSidebarCollapsed && folders.length > 0 && (
                    <div className="flex flex-col gap-1 px-2">
                        {favoriteFolders.map(f => (
                            <div key={f.id} className="relative group">
                                <button
                                    onClick={() => handleFolderSelect(f.path)}
                                    className={`w-full p-2 rounded-lg transition-colors ${currentFolderPath === f.path ? 'bg-[#DA7756]/15' : 'hover:bg-[#EBE8E4] dark:hover:bg-[#2E2E2E]'
                                        }`}
                                >
                                    <Star className="w-4 h-4 text-[#D4A72C] mx-auto" />
                                </button>
                                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-[#2D2D2D] dark:bg-[#1A1A1A] text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                                    {f.name}
                                </div>
                            </div>
                        ))}
                        {pinnedFolders.map(f => (
                            <div key={f.id} className="relative group">
                                <button
                                    onClick={() => handleFolderSelect(f.path)}
                                    className={`w-full p-2 rounded-lg transition-colors ${currentFolderPath === f.path ? 'bg-[#DA7756]/15' : 'hover:bg-[#EBE8E4] dark:hover:bg-[#2E2E2E]'
                                        }`}
                                >
                                    <Pin className="w-4 h-4 text-[#5B8DEF] mx-auto" />
                                </button>
                                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-[#2D2D2D] dark:bg-[#1A1A1A] text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                                    {f.name}
                                </div>
                            </div>
                        ))}
                        {regularFolders.filter(f => !f.favorite && !f.pinned).map(f => (
                            <div key={f.id} className="relative group">
                                <button
                                    onClick={() => handleFolderSelect(f.path)}
                                    className={`w-full p-2 rounded-lg transition-colors ${currentFolderPath === f.path ? 'bg-[#DA7756]/15' : 'hover:bg-[#EBE8E4] dark:hover:bg-[#2E2E2E]'
                                        }`}
                                >
                                    <Folder className="w-4 h-4 text-[#B5AFA6] dark:text-[#6B6B6B] mx-auto" style={f.color ? { color: f.color } : undefined} />
                                </button>
                                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-[#2D2D2D] dark:bg-[#1A1A1A] text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                                    {f.name}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            {!isSidebarCollapsed && (
                <div className="p-3 border-t border-[#EBE8E4] dark:border-[#2E2E2E] text-xs text-[#B5AFA6] dark:text-[#6B6B6B]">
                    {folders.length} folder{folders.length !== 1 ? 's' : ''}
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="fixed bg-white dark:bg-[#2E2E2E] border border-[#EBE8E4] dark:border-[#393939] rounded-xl shadow-xl py-1 z-50 min-w-[180px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button onClick={menuActions.newSubfolder} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#2D2D2D] dark:text-[#E8E6E3] hover:bg-[#EBE8E4] dark:hover:bg-[#393939]">
                        <Plus className="w-4 h-4" /> New Subfolder
                    </button>
                    <button onClick={menuActions.rename} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#2D2D2D] dark:text-[#E8E6E3] hover:bg-[#EBE8E4] dark:hover:bg-[#393939]">
                        <Pencil className="w-4 h-4" /> Rename
                    </button>
                    <div className="h-px bg-[#EBE8E4] dark:bg-[#393939] my-1" />
                    <button onClick={menuActions.toggleFavorite} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#2D2D2D] dark:text-[#E8E6E3] hover:bg-[#EBE8E4] dark:hover:bg-[#393939]">
                        <Star className={`w-4 h-4 ${contextMenu.folder.favorite ? 'text-[#D4A72C] fill-[#D4A72C]' : ''}`} />
                        {contextMenu.folder.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                    </button>
                    <button onClick={menuActions.togglePin} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#2D2D2D] dark:text-[#E8E6E3] hover:bg-[#EBE8E4] dark:hover:bg-[#393939]">
                        <Pin className={`w-4 h-4 ${contextMenu.folder.pinned ? 'text-[#5B8DEF] fill-[#5B8DEF]' : ''}`} />
                        {contextMenu.folder.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button onClick={menuActions.changeColor} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#2D2D2D] dark:text-[#E8E6E3] hover:bg-[#EBE8E4] dark:hover:bg-[#393939]">
                        <Palette className="w-4 h-4" /> Change Color
                    </button>
                    <div className="h-px bg-[#EBE8E4] dark:bg-[#393939] my-1" />
                    <button onClick={menuActions.delete} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#D66565] hover:bg-[#EBE8E4] dark:hover:bg-[#393939]">
                        <Trash2 className="w-4 h-4" /> Delete
                    </button>
                </div>
            )}

            {/* New Folder Dialog */}
            {showNewFolderDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-[#242424] border border-[#EBE8E4] dark:border-[#393939] rounded-xl shadow-xl w-80 p-4">
                        <h3 className="text-lg font-semibold text-[#2D2D2D] dark:text-[#E8E6E3] mb-4">
                            {parentFolderPath ? 'New Subfolder' : 'New Folder'}
                        </h3>
                        <input
                            type="text"
                            value={folderName}
                            onChange={(e) => setFolderName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                            placeholder="Folder name..."
                            className="w-full bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg px-3 py-2 text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:outline-none focus:border-[#DA7756]"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => { setShowNewFolderDialog(false); setFolderName(''); }}
                                className="px-4 py-2 text-sm text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateFolder}
                                className="px-4 py-2 text-sm bg-[#DA7756] text-white rounded-lg hover:bg-[#C96847] transition-colors"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rename Dialog */}
            {showRenameDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-[#242424] border border-[#EBE8E4] dark:border-[#393939] rounded-xl shadow-xl w-80 p-4">
                        <h3 className="text-lg font-semibold text-[#2D2D2D] dark:text-[#E8E6E3] mb-4">Rename Folder</h3>
                        <input
                            type="text"
                            value={folderName}
                            onChange={(e) => setFolderName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                            placeholder="New name..."
                            className="w-full bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg px-3 py-2 text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:outline-none focus:border-[#DA7756]"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => { setShowRenameDialog(false); setFolderName(''); setDialogFolder(null); }}
                                className="px-4 py-2 text-sm text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRename}
                                className="px-4 py-2 text-sm bg-[#DA7756] text-white rounded-lg hover:bg-[#C96847] transition-colors"
                            >
                                Rename
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Color Picker Dialog */}
            {showColorPicker && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-[#242424] border border-[#EBE8E4] dark:border-[#393939] rounded-xl shadow-xl w-72 p-4">
                        <h3 className="text-lg font-semibold text-[#2D2D2D] dark:text-[#E8E6E3] mb-4">Choose Color</h3>
                        <div className="grid grid-cols-5 gap-2">
                            {COLOR_PRESETS.map(color => (
                                <button
                                    key={color}
                                    onClick={() => handleColorSelect(color)}
                                    className={`w-10 h-10 rounded-lg transition-transform hover:scale-110 ${dialogFolder?.color === color ? 'ring-2 ring-[#DA7756] ring-offset-2 ring-offset-white dark:ring-offset-[#242424]' : ''
                                        }`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => { setShowColorPicker(false); setDialogFolder(null); }}
                                className="px-4 py-2 text-sm text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3] transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});
