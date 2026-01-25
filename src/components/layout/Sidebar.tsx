import { motion } from 'framer-motion';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useVaultStore } from '../../stores/vaultStore';
import { Button } from '../ui/Button';

export function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar, openTaskEditor } = useUIStore();
  const { lock } = useVaultStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: isSidebarCollapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col"
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
        {!isSidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-[#DA7756] to-[#C96847] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Claudia</span>
          </motion.div>
        )}
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          {isSidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* New Task Button */}
      <div className="p-3">
        <Button
          variant="primary"
          className={`w-full ${isSidebarCollapsed ? 'px-0' : ''}`}
          onClick={() => openTaskEditor()}
        >
          <Plus className="w-4 h-4" />
          {!isSidebarCollapsed && <span className="ml-2">New Task</span>}
        </Button>
      </div>

      {/* Footer */}
      <div className="mt-auto p-3 border-t border-gray-200 dark:border-gray-800">
        <Button
          variant="ghost"
          className={`w-full ${isSidebarCollapsed ? 'px-0' : ''} text-[#888580] hover:text-[#DA7756]`}
          onClick={() => lock()}
          title="Lock vault"
        >
          <Lock className="w-4 h-4" />
          {!isSidebarCollapsed && <span className="ml-2">Lock Vault</span>}
        </Button>
        {!isSidebarCollapsed && (
          <p className="text-xs text-gray-400 text-center mt-2">
            Claudia v0.2.0
          </p>
        )}
      </div>
    </motion.aside>
  );
}
