import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, LayoutDashboard, Settings, FolderOpen, ChevronDown, Check, FolderPlus, Lock } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Button } from '../ui/Button';
import { MCPServerButton } from '../mcp/MCPServerButton';

export function Header() {
  const { searchQuery, setSearchQuery, currentView, setCurrentView, openSettings } = useUIStore();
  const { currentWorkspace, workspaces, openWorkspace, openFolderDialog, closeWorkspace } = useWorkspaceStore();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 bg-white dark:bg-[#242424] border-b border-[#EBE8E4] dark:border-[#393939] flex items-center justify-between px-6 gap-4">
      {/* Left: Workspace Switcher + Search */}
      <div className="flex items-center gap-4 flex-1">
        {/* Workspace Switcher */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#F5F3F0] dark:hover:bg-[#2E2E2E] rounded-lg transition-colors"
          >
            <FolderOpen className="w-4 h-4 text-[#DA7756]" />
            <span className="text-sm font-medium text-[#2D2D2D] dark:text-[#E8E6E3] max-w-[150px] truncate">
              {currentWorkspace?.name || 'Select Workspace'}
            </span>
            <ChevronDown className={`w-4 h-4 text-[#888] transition-transform ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {isWorkspaceMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-[#2A2A2A] rounded-xl shadow-xl border border-[#EBE8E4] dark:border-[#3A3A3A] overflow-hidden z-50"
              >
                {/* Recent Workspaces */}
                <div className="p-2">
                  <div className="text-xs font-semibold text-[#888] uppercase tracking-wider px-2 py-1">
                    Recent Workspaces
                  </div>
                  {workspaces.slice(0, 5).map((workspace) => (
                    <button
                      key={workspace.path}
                      onClick={() => {
                        openWorkspace(workspace.path);
                        setIsWorkspaceMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-2 py-2 hover:bg-[#F5F3F0] dark:hover:bg-[#333] rounded-lg transition-colors text-left"
                    >
                      <FolderOpen className="w-4 h-4 text-[#888] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#2D2D2D] dark:text-[#E8E6E3] truncate">
                          {workspace.name}
                        </div>
                        <div className="text-xs text-[#999] truncate">{workspace.path}</div>
                      </div>
                      {currentWorkspace?.path === workspace.path && (
                        <Check className="w-4 h-4 text-[#DA7756] flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div className="border-t border-[#EBE8E4] dark:border-[#3A3A3A]" />

                {/* Actions */}
                <div className="p-2">
                  <button
                    onClick={() => {
                      openFolderDialog();
                      setIsWorkspaceMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-2 py-2 hover:bg-[#F5F3F0] dark:hover:bg-[#333] rounded-lg transition-colors text-left"
                  >
                    <FolderPlus className="w-4 h-4 text-[#DA7756]" />
                    <span className="text-sm font-medium text-[#2D2D2D] dark:text-[#E8E6E3]">
                      Open Folder...
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      closeWorkspace();
                      setIsWorkspaceMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-2 py-2 hover:bg-[#F5F3F0] dark:hover:bg-[#333] rounded-lg transition-colors text-left"
                  >
                    <FolderOpen className="w-4 h-4 text-[#888]" />
                    <span className="text-sm text-[#666] dark:text-[#999]">
                      Close Workspace
                    </span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Search */}
        <motion.div
          animate={{ width: isSearchFocused ? 400 : 280 }}
          className="relative max-w-md"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B5AFA6] dark:text-[#6B6B6B]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder={currentView === 'notes' ? 'Search notes...' : currentView === 'tasks' ? 'Search tasks...' : 'Search passwords...'}
            className="w-full pl-10 pr-4 py-2 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-sm text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:outline-none focus:border-[#DA7756] transition-colors"
          />
        </motion.div>
      </div>

      {/* Right: View Toggle + Settings */}
      <div className="flex items-center gap-3">
        {/* View Toggle */}
        <div className="flex items-center bg-[#F5F3F0] dark:bg-[#2E2E2E] rounded-xl p-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentView('notes')}
            className={`w-8 h-8 rounded-lg transition-all ${currentView === 'notes' ? 'bg-white dark:bg-[#393939] shadow-sm' : 'hover:bg-[#EBE8E4] dark:hover:bg-[#393939]'}`}
            title="Notes View"
          >
            <FileText className={`w-4 h-4 ${currentView === 'notes' ? 'text-[#DA7756]' : 'text-[#B5AFA6] dark:text-[#6B6B6B]'}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentView('tasks')}
            className={`w-8 h-8 rounded-lg transition-all ${currentView === 'tasks' ? 'bg-white dark:bg-[#393939] shadow-sm' : 'hover:bg-[#EBE8E4] dark:hover:bg-[#393939]'}`}
            title="Tasks View"
          >
            <LayoutDashboard className={`w-4 h-4 ${currentView === 'tasks' ? 'text-[#DA7756]' : 'text-[#B5AFA6] dark:text-[#6B6B6B]'}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentView('passwords')}
            className={`w-8 h-8 rounded-lg transition-all ${currentView === 'passwords' ? 'bg-white dark:bg-[#393939] shadow-sm' : 'hover:bg-[#EBE8E4] dark:hover:bg-[#393939]'}`}
            title="Passwords View"
          >
            <Lock className={`w-4 h-4 ${currentView === 'passwords' ? 'text-[#DA7756]' : 'text-[#B5AFA6] dark:text-[#6B6B6B]'}`} />
          </Button>
        </div>
        {/* MCP Server Button */}
        <MCPServerButton />

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          onClick={openSettings}
          className="w-9 h-9 rounded-xl hover:bg-[#F5F3F0] dark:hover:bg-[#2E2E2E] transition-colors"
          title="Settings"
        >
          <Settings className="w-5 h-5 text-[#6B6B6B] dark:text-[#B5AFA6]" />
        </Button>
      </div>
    </header >
  );
}
