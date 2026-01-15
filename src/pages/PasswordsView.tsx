import { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Lock, Eye, EyeOff, Copy, Pin, Trash2, Edit2, Key, Folder as FolderIcon, Globe, User, FileText, ExternalLink } from 'lucide-react';
import { open as openUrl } from '@tauri-apps/plugin-shell';
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
            if (activeId !== overId) {
                const folderPaths = folders.map(f => f.path);
                const activeFolder = folders.find(f => f.id === activeId);
                const overFolder = folders.find(f => f.id === overId);
                if (!activeFolder || !overFolder) return;

                const oldIndex = folderPaths.indexOf(activeFolder.path);
                const newIndex = folderPaths.indexOf(overFolder.path);

                if (oldIndex !== -1 && newIndex !== -1) {
                    const reorderedFolderPaths = arrayMove(folderPaths, oldIndex, newIndex);
                    await reorderFolders(null, reorderedFolderPaths);
                    toast.success('Folder reordered');
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

    const handleCardClick = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    return (
        <div
            ref={(node) => {
                setNodeRef(node);
                (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            }}
            style={style}
            onClick={handleCardClick}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
            className={`
                relative bg-white dark:bg-[#2E2E2E] rounded-xl shadow-sm
                border-l-4 p-4 cursor-grab active:cursor-grabbing mb-3 mx-2
                hover:shadow-md transition-all duration-150
                ${isDragging ? 'shadow-lg ring-2 ring-[#DA7756]' : ''}
            `}
            {...attributes}
            {...listeners}
        >
            {/* Header: Title + Pinned */}
            <div className="flex items-center gap-3 mb-3">
                <Key className="w-5 h-5 text-[#DA7756] flex-shrink-0" />
                <h3 className="font-semibold text-[#2D2D2D] dark:text-[#E8E6E3] text-base flex-1 truncate">
                    {password.title}
                </h3>
                {password.pinned && (
                    <Pin className="w-4 h-4 text-[#DA7756] flex-shrink-0" />
                )}
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {/* URL - full width */}
                <div className="col-span-2">
                    <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-[#9A948A] flex-shrink-0" />
                        {!hasLoadedContent ? (
                            <span className="text-sm text-[#B5AFA6] dark:text-[#6B6B6B]">Loading...</span>
                        ) : decrypted?.url ? (
                            <button
                                className="text-sm text-[#3B82F6] hover:underline truncate flex-1 text-left flex items-center gap-1"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const url = decrypted.url.startsWith('http') ? decrypted.url : `https://${decrypted.url}`;
                                    openUrl(url);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <span className="truncate">{decrypted.url}</span>
                                <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
                            </button>
                        ) : (
                            <span className="text-sm text-[#B5AFA6] dark:text-[#6B6B6B] italic">No URL</span>
                        )}
                    </div>
                </div>

                {/* Username */}
                <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#9A948A] flex-shrink-0" />
                    {!hasLoadedContent ? (
                        <span className="text-sm text-[#B5AFA6] dark:text-[#6B6B6B]">...</span>
                    ) : decrypted?.username ? (
                        <>
                            <span className="text-sm text-[#2D2D2D] dark:text-[#E8E6E3] truncate flex-1">
                                {decrypted.username}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    copyTextToClipboard(decrypted.username);
                                    toast.success('Username copied');
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="p-1 hover:bg-[#F5F3F0] dark:hover:bg-[#393939] rounded transition-colors"
                            >
                                <Copy className="w-3.5 h-3.5 text-[#9A948A]" />
                            </button>
                        </>
                    ) : (
                        <span className="text-sm text-[#B5AFA6] dark:text-[#6B6B6B] italic">No username</span>
                    )}
                </div>

                {/* Password */}
                <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-[#9A948A] flex-shrink-0" />
                    {!hasLoadedContent ? (
                        <span className="text-sm text-[#B5AFA6] dark:text-[#6B6B6B]">...</span>
                    ) : decrypted?.password ? (
                        <>
                            <span className="text-sm font-mono text-[#DA7756] truncate flex-1">
                                {showPassword ? decrypted.password : '••••••••••••'}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowPassword(!showPassword);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="p-1 hover:bg-[#F5F3F0] dark:hover:bg-[#393939] rounded transition-colors"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-3.5 h-3.5 text-[#9A948A]" />
                                ) : (
                                    <Eye className="w-3.5 h-3.5 text-[#9A948A]" />
                                )}
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCopy();
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="p-1 hover:bg-[#F5F3F0] dark:hover:bg-[#393939] rounded transition-colors"
                            >
                                <Copy className="w-3.5 h-3.5 text-[#9A948A]" />
                            </button>
                        </>
                    ) : (
                        <span className="text-sm text-[#B5AFA6] dark:text-[#6B6B6B] italic">No password</span>
                    )}
                </div>

                {/* Notes - full width */}
                {hasLoadedContent && decrypted?.notes && (
                    <div className="col-span-2 flex items-start gap-2">
                        <FileText className="w-4 h-4 text-[#9A948A] flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-[#6B6B6B] dark:text-[#B5AFA6] line-clamp-2">
                            {decrypted.notes}
                        </span>
                    </div>
                )}

                {/* Tags - full width */}
                {passwordTags.length > 0 && (
                    <div className="col-span-2 flex items-center gap-2 pt-1">
                        {passwordTags.map((tag, index) => (
                            <span
                                key={`${tag}-${index}`}
                                className="px-2 py-1 text-xs rounded-md bg-[#DA7756]/10 text-[#DA7756] font-medium"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Actions overlay */}
            {showActions && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute top-3 right-3 flex items-center gap-1 bg-white dark:bg-[#2E2E2E] rounded-lg shadow-md border border-[#EBE8E4] dark:border-[#393939] p-1"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-[#6B6B6B] hover:text-[#DA7756]"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
                        }}
                        title="Edit"
                    >
                        <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-[#6B6B6B] hover:text-[#DA7756]"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCopy();
                        }}
                        title="Copy password"
                    >
                        <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-[#6B6B6B] hover:text-[#DA7756]"
                        onClick={(e) => {
                            e.stopPropagation();
                            onPin();
                        }}
                        title={password.pinned ? 'Unpin' : 'Pin'}
                    >
                        <Pin className={`w-4 h-4 ${password.pinned ? 'text-[#DA7756]' : ''}`} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-[#E57373] hover:text-[#D32F2F]"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        title="Delete"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </motion.div>
            )}
        </div>
    );
});
