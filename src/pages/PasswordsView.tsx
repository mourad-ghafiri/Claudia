import { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Lock, Eye, EyeOff, Copy, Pin, Trash2, Edit2, Key, Folder as FolderIcon, ExternalLink, GripVertical, Globe, User, FileText } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { usePasswordStore } from '../stores/passwordStore';
import { useFolderStore } from '../stores/folderStore';
import { useUIStore } from '../stores/uiStore';
import { FolderSidebar } from '../components/layout/FolderSidebar';
import { Button } from '../components/ui/Button';
import type { PasswordInfo, FolderInfo, DecryptedPasswordContent } from '../types';
import toast from 'react-hot-toast';
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

// Helper function to copy text to clipboard with fallback
async function copyTextToClipboard(text: string): Promise<void> {
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (e) {
            console.warn('Clipboard API failed, trying fallback:', e);
        }
    }

    // Fallback: create a temporary textarea
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        document.execCommand('copy');
    } finally {
        document.body.removeChild(textArea);
    }
}

export function PasswordsView() {
    const {
        passwords,
        fetchPasswords,
        isUnlocked,
        isMasterPasswordSet,
        unlock,
        setMasterPassword,
        getDecryptedContent,
        getDecryptedContentsBatch,
        getCachedContent,
        updatePassword,
        reorderPasswords,
        movePasswordToFolder,
    } = usePasswordStore();
    const { currentFolderPath, setCurrentFolder, folders, reorderFolders } = useFolderStore();
    const { openPasswordEditor, openDeleteConfirm, searchQuery } = useUIStore();

    const [masterPasswordInput, setMasterPasswordInput] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [unlockError, setUnlockError] = useState('');
    const [draggedPassword, setDraggedPassword] = useState<PasswordInfo | null>(null);
    const [draggedFolder, setDraggedFolder] = useState<FolderInfo | null>(null);

    // Batch fetch queue - collect IDs and fetch together
    const pendingFetchIds = useRef<Set<string>>(new Set());
    const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Force re-render when cache updates
    const [, forceUpdate] = useState(0);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        })
    );

    useEffect(() => {
        checkMasterPasswordStatus();
    }, []);

    useEffect(() => {
        if (isUnlocked) {
            if (currentFolderPath) {
                fetchPasswords(currentFolderPath);
            } else {
                fetchPasswords();
            }
        }
    }, [currentFolderPath, isUnlocked, fetchPasswords]);

    // Batch content request handler - collects IDs and fetches in batches
    const requestContent = useCallback((id: string) => {
        pendingFetchIds.current.add(id);

        // Debounce batch fetching
        if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current);
        }

        fetchTimeoutRef.current = setTimeout(async () => {
            const ids = Array.from(pendingFetchIds.current);
            pendingFetchIds.current.clear();

            if (ids.length > 0) {
                try {
                    await getDecryptedContentsBatch(ids);
                    forceUpdate(v => v + 1); // Trigger re-render
                } catch (e) {
                    console.error('Batch fetch failed:', e);
                }
            }
        }, 50); // 50ms debounce to collect multiple requests
    }, [getDecryptedContentsBatch]);

    const checkMasterPasswordStatus = async () => {
        const isSet = await isMasterPasswordSet();
        setIsSettingUp(!isSet);
    };

    const handleFolderChange = useCallback((folderPath: string | null) => {
        setCurrentFolder(folderPath);
        if (isUnlocked) {
            if (folderPath) {
                fetchPasswords(folderPath);
            } else {
                fetchPasswords();
            }
        }
    }, [setCurrentFolder, isUnlocked, fetchPasswords]);

    const handleUnlock = async () => {
        setUnlockError('');
        const success = await unlock(masterPasswordInput);
        if (success) {
            setMasterPasswordInput('');
            toast.success('Vault unlocked');
        } else {
            setUnlockError('Incorrect master password');
        }
    };

    const handleSetupMasterPassword = async () => {
        if (masterPasswordInput !== confirmPassword) {
            setUnlockError('Passwords do not match');
            return;
        }
        if (masterPasswordInput.length < 8) {
            setUnlockError('Password must be at least 8 characters');
            return;
        }
        try {
            await setMasterPassword(masterPasswordInput);
            setMasterPasswordInput('');
            setConfirmPassword('');
            setIsSettingUp(false);
            toast.success('Master password set successfully');
        } catch (e) {
            setUnlockError(String(e));
        }
    };

    const copyToClipboard = useCallback(async (id: string) => {
        if (!isUnlocked) {
            toast.error('Vault is locked');
            return;
        }
        try {
            const { password } = await getDecryptedContent(id);
            if (!password) {
                toast.error('No password to copy');
                return;
            }
            await copyTextToClipboard(password);
            toast.success('Password copied to clipboard');
            // Auto-clear after 30 seconds
            setTimeout(() => {
                copyTextToClipboard('').catch(() => { });
            }, 30000);
        } catch (e) {
            toast.error(`Failed to copy: ${String(e)}`);
        }
    }, [isUnlocked, getDecryptedContent]);

    const handlePinPassword = useCallback(async (passwordId: string) => {
        const pwd = passwords.find(p => p.id === passwordId);
        if (pwd) {
            try {
                await updatePassword({ id: passwordId, pinned: !pwd.pinned });
                toast.success(pwd.pinned ? 'Password unpinned' : 'Password pinned');
            } catch (e) {
                toast.error('Failed to update password');
            }
        }
    }, [passwords, updatePassword]);

    const handleDeletePassword = useCallback((passwordId: string) => {
        openDeleteConfirm(passwordId, 'password');
    }, [openDeleteConfirm]);

    // Memoize filtered passwords to avoid recalculation on every render
    const filteredPasswords = useMemo(() => {
        return passwords
            .filter(p => currentFolderPath === null || p.folderPath === currentFolderPath)
            .filter(p =>
                p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
            )
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                if (a.rank !== b.rank) return a.rank - b.rank;
                return b.updated - a.updated;
            });
    }, [passwords, currentFolderPath, searchQuery]);


    const handleDragStart = useCallback((event: DragStartEvent) => {
        const activeId = event.active.id as string;

        const password = passwords.find(p => p.id === activeId);
        if (password) {
            setDraggedPassword(password);
            setDraggedFolder(null);
            return;
        }

        const folder = folders.find(f => f.id === activeId);
        if (folder) {
            setDraggedFolder(folder);
            setDraggedPassword(null);
            return;
        }
    }, [passwords, folders]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;
        const wasDraggingFolder = draggedFolder !== null;
        setDraggedPassword(null);
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

        // Handle dropping password onto a folder
        if (typeof overId === 'string' && overId.startsWith('folder-')) {
            const targetFolderPath = overId.replace('folder-', '');
            const password = passwords.find(p => p.id === activeId);
            if (password && password.folderPath !== targetFolderPath) {
                try {
                    await movePasswordToFolder(activeId, targetFolderPath);
                    toast.success('Password moved to folder');
                } catch (error) {
                    toast.error('Failed to move password');
                }
            }
            return;
        }

        // Handle password reordering
        if (activeId !== overId) {
            const oldIndex = filteredPasswords.findIndex((p) => p.id === activeId);
            const newIndex = filteredPasswords.findIndex((p) => p.id === overId);

            if (oldIndex !== -1 && newIndex !== -1) {
                const reorderedPasswordIds = arrayMove(filteredPasswords.map(p => p.id), oldIndex, newIndex);
                const passwordsDir = currentFolderPath
                    ? `${currentFolderPath}/passwords`
                    : '';
                await reorderPasswords(passwordsDir, reorderedPasswordIds);
            }
        }
    }, [draggedFolder, folders, passwords, filteredPasswords, currentFolderPath, reorderFolders, movePasswordToFolder, reorderPasswords]);

    // Render unlock/setup screen
    if (!isUnlocked) {
        return (
            <div className="h-full flex items-center justify-center bg-[#FAF9F7] dark:bg-[#1A1A1A]">
                <div className="w-full max-w-md p-8 bg-white dark:bg-[#242424] rounded-2xl shadow-lg">
                    <div className="flex justify-center mb-6">
                        <div className="p-4 bg-[#DA7756]/10 dark:bg-[#DA7756]/20 rounded-full">
                            <Lock className="w-8 h-8 text-[#DA7756]" />
                        </div>
                    </div>

                    <h2 className="text-xl font-semibold text-center text-[#2D2D2D] dark:text-[#E8E6E3] mb-2">
                        {isSettingUp ? 'Set Up Master Password' : 'Unlock Password Vault'}
                    </h2>
                    <p className="text-sm text-center text-[#9A948A] dark:text-[#8C857B] mb-6">
                        {isSettingUp
                            ? 'Create a master password to protect your passwords'
                            : 'Enter your master password to access passwords'}
                    </p>

                    {unlockError && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
                            {unlockError}
                        </div>
                    )}

                    <input
                        type="password"
                        placeholder="Master Password"
                        value={masterPasswordInput}
                        onChange={(e) => setMasterPasswordInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isSettingUp && handleUnlock()}
                        className="w-full px-4 py-3 mb-3 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#2E2E2E] rounded-lg text-[#2D2D2D] dark:text-[#E8E6E3] focus:outline-none focus:ring-2 focus:ring-[#DA7756]"
                        autoFocus
                    />

                    {isSettingUp && (
                        <input
                            type="password"
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSetupMasterPassword()}
                            className="w-full px-4 py-3 mb-4 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#2E2E2E] rounded-lg text-[#2D2D2D] dark:text-[#E8E6E3] focus:outline-none focus:ring-2 focus:ring-[#DA7756]"
                        />
                    )}

                    <button
                        onClick={isSettingUp ? handleSetupMasterPassword : handleUnlock}
                        className="w-full py-3 bg-[#DA7756] hover:bg-[#C4644A] text-white font-medium rounded-lg transition-colors"
                    >
                        {isSettingUp ? 'Set Master Password' : 'Unlock'}
                    </button>
                </div>
            </div>
        );
    }

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
                    allItemsLabel="All Passwords"
                    onFolderChange={handleFolderChange}
                />

                {/* Main Content */}
                <div className="flex-1 h-full flex flex-col bg-white dark:bg-[#242424] border-r border-[#EBE8E4] dark:border-[#2E2E2E]">
                    {/* Header */}
                    <div className="p-3 border-b border-[#EBE8E4] dark:border-[#2E2E2E] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-[#2D2D2D] dark:text-[#E8E6E3]">Passwords</h2>
                            <span className="text-xs text-[#9A948A] dark:text-[#8C857B]">
                                ({filteredPasswords.length})
                            </span>
                        </div>
                        <button
                            onClick={() => openPasswordEditor()}
                            className="p-1.5 hover:bg-[#F5F3F0] dark:hover:bg-[#2E2E2E] rounded-lg transition-colors"
                            title="New Password"
                        >
                            <Plus className="w-4 h-4 text-[#B5AFA6]" />
                        </button>
                    </div>

                    {/* Password List */}
                    <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
                        {filteredPasswords.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-[#9A948A] dark:text-[#8C857B]">
                                <Lock className="w-12 h-12 mb-4 opacity-50" />
                                <p className="text-lg">No passwords yet</p>
                                <p className="text-sm">Click + to add your first password</p>
                            </div>
                        ) : (
                            <SortableContext items={filteredPasswords.map(p => p.id)} strategy={verticalListSortingStrategy}>
                                <div className="pt-2">
                                    {filteredPasswords.map((pwd) => (
                                        <SortablePasswordCard
                                            key={pwd.id}
                                            password={pwd}
                                            onCopy={() => copyToClipboard(pwd.id)}
                                            onEdit={() => openPasswordEditor(pwd.id)}
                                            onPin={() => handlePinPassword(pwd.id)}
                                            onDelete={() => handleDeletePassword(pwd.id)}
                                            cachedContent={getCachedContent(pwd.id)}
                                            onRequestContent={requestContent}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        )}
                    </div>
                </div>
            </div>

            <DragOverlay>
                {draggedPassword && (
                    <div className="p-3 bg-white dark:bg-[#242424] border border-[#EBE8E4] dark:border-[#393939] rounded-xl opacity-90 shadow-xl w-64 pointer-events-none">
                        <h3 className="font-medium text-sm text-[#2D2D2D] dark:text-[#E8E6E3]">{draggedPassword.title}</h3>
                    </div>
                )}
                {draggedFolder && (
                    <div className="flex items-center gap-2 py-1.5 px-3 bg-white dark:bg-[#2E2E2E] rounded-lg shadow-lg border border-[#DA7756] opacity-90 pointer-events-none">
                        <FolderIcon className="w-4 h-4 text-[#DA7756]" />
                        <span className="text-sm text-[#2D2D2D] dark:text-[#E8E6E3]">{draggedFolder.name}</span>
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
}

// Sortable Password Card Component - memoized
// Redesigned to match Notes and Tasks card design pattern
const SortablePasswordCard = memo(function SortablePasswordCard({
    password,
    onCopy,
    onEdit,
    onPin,
    onDelete,
    cachedContent,
    onRequestContent,
}: {
    password: PasswordInfo;
    onCopy: () => void;
    onEdit: () => void;
    onPin: () => void;
    onDelete: () => void;
    cachedContent: DecryptedPasswordContent | null;
    onRequestContent: (id: string) => void;
}) {
    const [showActions, setShowActions] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: password.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        borderLeftColor: password.color || '#DA7756',
        opacity: isDragging ? 0.5 : 1,
    };

    // Lazy load decrypted content when card becomes visible
    const cardRef = useRef<HTMLDivElement>(null);
    const hasRequestedRef = useRef(false);

    // Reset request flag when cache is invalidated (content becomes null)
    useEffect(() => {
        if (!cachedContent && hasRequestedRef.current) {
            hasRequestedRef.current = false;
            // Immediately request fresh content since card is already visible
            onRequestContent(password.id);
        }
    }, [cachedContent, password.id, onRequestContent]);

    // IntersectionObserver - request content when card is visible (for initial load)
    useEffect(() => {
        if (cachedContent || hasRequestedRef.current) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !hasRequestedRef.current) {
                    hasRequestedRef.current = true;
                    onRequestContent(password.id);
                    observer.disconnect();
                }
            },
            { rootMargin: '50px' }
        );
        if (cardRef.current) {
            observer.observe(cardRef.current);
        }
        return () => observer.disconnect();
    }, [password.id, cachedContent, onRequestContent]);

    const decrypted = cachedContent;
    const hasLoadedContent = !!cachedContent;

    const passwordTags = password.tags || [];

    // Memoize date formatting
    const formattedDate = useMemo(() => {
        const date = new Date(password.updated);
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }, [password.updated]);

    const handleOpenUrl = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (decrypted?.url) {
            const url = decrypted.url.startsWith('http') ? decrypted.url : `https://${decrypted.url}`;
            openUrl(url).catch((err) => {
                console.error('Failed to open URL:', err);
                toast.error('Failed to open URL');
            });
        }
    };

    return (
        <div
            ref={(node) => {
                setNodeRef(node);
                (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            }}
            style={style}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
            className={`
                group relative bg-white dark:bg-[#2E2E2E] rounded-xl shadow-sm
                border-l-4 py-3 pr-3 pl-7 cursor-default select-text mb-2 mx-2
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
                <Key className="w-3 h-3 text-[#DA7756] opacity-50" />
                {password.pinned && <Pin className="w-3 h-3 text-[#DA7756]" />}
            </div>

            {/* Row 1: Title */}
            <h3 className="font-medium text-[#2D2D2D] dark:text-[#E8E6E3] text-sm truncate pr-10">
                {password.title}
            </h3>

            {hasLoadedContent ? (
                <>
                    {/* Row 2: Description */}
                    {decrypted?.notes && (
                        <div className="mt-1 flex items-center gap-1.5">
                            <FileText className="w-3 h-3 text-[#9A948A] flex-shrink-0" />
                            <span className="text-xs text-[#6B6B6B] dark:text-[#B5AFA6] truncate">{decrypted.notes}</span>
                        </div>
                    )}

                    {/* Row 3: URL | Username | Password */}
                    <div className="mt-1.5 flex items-center gap-4 text-xs">
                        {/* URL */}
                        {decrypted?.url && (
                            <div className="flex items-center gap-1 min-w-0 max-w-[30%]">
                                <Globe className="w-3 h-3 text-[#9A948A] flex-shrink-0" />
                                <span className="text-[#3B82F6] truncate">{decrypted.url}</span>
                                <button
                                    onClick={handleOpenUrl}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="p-0.5 hover:bg-[#F5F3F0] dark:hover:bg-[#393939] rounded flex-shrink-0"
                                    title="Open in browser"
                                >
                                    <ExternalLink className="w-3 h-3 text-[#3B82F6]" />
                                </button>
                            </div>
                        )}

                        {/* Username */}
                        {decrypted?.username && (
                            <div className="flex items-center gap-1 min-w-0 max-w-[30%]">
                                <User className="w-3 h-3 text-[#9A948A] flex-shrink-0" />
                                <span className="text-[#2D2D2D] dark:text-[#E8E6E3] truncate">{decrypted.username}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        copyTextToClipboard(decrypted.username);
                                        toast.success('Username copied');
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="p-0.5 hover:bg-[#F5F3F0] dark:hover:bg-[#393939] rounded flex-shrink-0"
                                    title="Copy username"
                                >
                                    <Copy className="w-3 h-3 text-[#9A948A]" />
                                </button>
                            </div>
                        )}

                        {/* Password */}
                        {decrypted?.password && (
                            <div className="flex items-center gap-1 min-w-0">
                                <Key className="w-3 h-3 text-[#9A948A] flex-shrink-0" />
                                <span className="font-mono text-[#DA7756] truncate max-w-[80px]">
                                    {showPassword ? decrypted.password : '••••••••'}
                                </span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowPassword(!showPassword); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="p-0.5 hover:bg-[#F5F3F0] dark:hover:bg-[#393939] rounded flex-shrink-0"
                                    title={showPassword ? 'Hide' : 'Show'}
                                >
                                    {showPassword ? <EyeOff className="w-3 h-3 text-[#9A948A]" /> : <Eye className="w-3 h-3 text-[#9A948A]" />}
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onCopy(); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="p-0.5 hover:bg-[#F5F3F0] dark:hover:bg-[#393939] rounded flex-shrink-0"
                                    title="Copy password"
                                >
                                    <Copy className="w-3 h-3 text-[#9A948A]" />
                                </button>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="mt-1 text-xs text-[#B5AFA6] dark:text-[#6B6B6B]">Loading...</div>
            )}

            {/* Row 4: All tags + timestamp */}
            <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
                    {passwordTags.map((tag, index) => (
                        <span key={`${tag}-${index}`} className="px-1.5 py-0.5 text-[9px] rounded bg-[#DA7756]/10 text-[#DA7756]">
                            {tag}
                        </span>
                    ))}
                </div>
                <span className="text-[10px] text-[#B5AFA6] dark:text-[#6B6B6B] flex-shrink-0">{formattedDate}</span>
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
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-[#6B6B6B] hover:text-[#DA7756]" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-[#6B6B6B] hover:text-[#DA7756]" onClick={(e) => { e.stopPropagation(); onPin(); }} title={password.pinned ? 'Unpin' : 'Pin'}>
                        <Pin className={`w-3.5 h-3.5 ${password.pinned ? 'text-[#DA7756]' : ''}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-[#E57373] hover:text-[#D32F2F]" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </motion.div>
            )}
        </div>
    );
});
