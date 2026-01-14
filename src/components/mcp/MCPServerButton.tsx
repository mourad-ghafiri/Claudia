import { Server } from 'lucide-react';
import { useMCPStore } from '../../stores/mcpStore';
import { useState } from 'react';
import { MCPServerDialog } from './MCPServerDialog';

export function MCPServerButton() {
    const { isRunning, isLoading } = useMCPStore();
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsDialogOpen(true)}
                className={`p-2 rounded-lg transition-all duration-200 relative group ${isRunning
                        ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30'
                        : 'hover:bg-[#F5F3F0] dark:hover:bg-[#2E2E2E] text-[#6B6B6B] dark:text-[#B5AFA6]'
                    }`}
                title="MCP Server Settings"
            >
                <Server className={`w-4 h-4 ${isLoading ? 'animate-pulse' : ''}`} />

                {/* Status Indicator Dot */}
                <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full border border-white dark:border-[#242424] transition-colors ${isRunning ? 'bg-green-500' : 'bg-transparent'
                    }`} />
            </button>

            <MCPServerDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
            />
        </>
    );
}
