import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Clock, Trash2, ChevronRight } from 'lucide-react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { Workspace } from '../types';
import logo from '../assets/logo.png';

function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

function WorkspaceCard({
    workspace,
    onOpen,
    onRemove,
}: {
    workspace: Workspace;
    onOpen: () => void;
    onRemove: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            whileHover={{ scale: 1.01 }}
            className="group relative flex items-center gap-4 p-4 bg-white dark:bg-[#2A2A2A] rounded-xl border border-[#EBE8E4] dark:border-[#3A3A3A] hover:border-[#DA7756] dark:hover:border-[#DA7756] transition-all cursor-pointer shadow-sm hover:shadow-md"
            onClick={onOpen}
        >
            {/* Folder Icon */}
            <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-gradient-to-br from-[#DA7756] to-[#C96847] rounded-xl shadow-inner">
                <FolderOpen className="w-6 h-6 text-white" />
            </div>

            {/* Workspace Info */}
            <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-[#2D2D2D] dark:text-[#E8E6E3] truncate">
                    {workspace.name}
                </h3>
                <p className="text-sm text-[#888] dark:text-[#888] truncate">{workspace.path}</p>
            </div>

            {/* Time & Actions */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-[#999] dark:text-[#777]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatRelativeTime(workspace.lastOpened)}</span>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all"
                    title="Remove from list"
                >
                    <Trash2 className="w-4 h-4 text-red-500" />
                </button>
                <ChevronRight className="w-5 h-5 text-[#CCC] dark:text-[#555] group-hover:text-[#DA7756] transition-colors" />
            </div>
        </motion.div>
    );
}

export function WorkspaceHome() {
    const { workspaces, loading: isLoading, fetchWorkspaces, openWorkspace, removeWorkspace, openFolderDialog } =
        useWorkspaceStore();

    useEffect(() => {
        fetchWorkspaces();
    }, [fetchWorkspaces]);

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-[#FAF9F7] to-[#F0EDE9] dark:from-[#1A1A1A] dark:to-[#141414] overflow-auto">
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
                {/* Hero Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="text-center mb-12"
                >
                    {/* Logo */}
                    <div className="relative inline-block mb-6">
                        <img src={logo} alt="Claudia" className="w-28 h-28 drop-shadow-xl" />
                    </div>

                    <h1 className="text-3xl font-bold text-[#2D2D2D] dark:text-[#E8E6E3] mb-3">
                        Welcome to Claudia
                    </h1>
                    <p className="text-lg text-[#666] dark:text-[#999] max-w-md mx-auto">
                        Your notes, tasks, and passwords, beautifully organized. Select a workspace to get started.
                    </p>
                </motion.div>

                {/* Open Folder Button */}
                <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                    onClick={openFolderDialog}
                    className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-[#DA7756] to-[#C96847] hover:from-[#C96847] hover:to-[#B85938] text-white rounded-2xl text-lg font-semibold shadow-lg hover:shadow-xl transition-all mb-12"
                >
                    <FolderOpen className="w-6 h-6" />
                    Open Folder
                </motion.button>

                {/* Recent Workspaces */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="w-full max-w-2xl"
                >
                    <h2 className="text-sm font-semibold text-[#888] dark:text-[#777] uppercase tracking-wider mb-4">
                        Recent Workspaces
                    </h2>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-3 border-[#DA7756] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : workspaces.length === 0 ? (
                        <div className="text-center py-12 bg-white/50 dark:bg-[#2A2A2A]/50 rounded-2xl border border-dashed border-[#DDD] dark:border-[#444]">
                            <FolderOpen className="w-12 h-12 text-[#CCC] dark:text-[#555] mx-auto mb-3" />
                            <p className="text-[#888] dark:text-[#777]">No recent workspaces</p>
                            <p className="text-sm text-[#AAA] dark:text-[#666] mt-1">
                                Click "Open Folder" to create your first workspace
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {workspaces.map((workspace) => (
                                <WorkspaceCard
                                    key={workspace.path}
                                    workspace={workspace}
                                    onOpen={() => openWorkspace(workspace.path)}
                                    onRemove={() => removeWorkspace(workspace.path)}
                                />
                            ))}
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Footer */}
            <div className="text-center py-4 text-xs text-[#BBB] dark:text-[#555]">
                Claudia • Notes & Tasks & Passwords Management
            </div>
        </div>
    );
}
