import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { useMCPStore } from '../../stores/mcpStore';
import { useState } from 'react';

interface MCPServerDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export function MCPServerDialog({ isOpen, onClose }: MCPServerDialogProps) {
    const { isRunning, startServer, stopServer, isLoading } = useMCPStore();
    const [copiedUrl, setCopiedUrl] = useState(false);
    const [copiedJson, setCopiedJson] = useState(false);

    const MCP_PORT = 44055;
    const MCP_URL = `http://127.0.0.1:${MCP_PORT}/sse`;
    const clientConfig = {
        "mcpServers": {
            "claudia": {
                "url": MCP_URL
            }
        }
    };

    const handleCopyUrl = () => {
        navigator.clipboard.writeText(MCP_URL);
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
    };

    const handleCopyJson = () => {
        navigator.clipboard.writeText(JSON.stringify(clientConfig, null, 2));
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
    };

    const toggleServer = async () => {
        if (isRunning) {
            await stopServer();
        } else {
            await startServer();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="fixed top-16 right-4 w-96 bg-white dark:bg-[#242424] rounded-xl shadow-2xl border border-[#EBE8E4] dark:border-[#2E2E2E] z-50 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-[#EBE8E4] dark:border-[#2E2E2E] flex items-center justify-between bg-[#FAF9F7] dark:bg-[#1A1A1A]">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500'}`} />
                                <h3 className="font-semibold text-sm text-[#2D2D2D] dark:text-[#E8E6E3]">MCP Server</h3>
                            </div>
                            <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${isRunning
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                {isRunning ? 'Active' : 'Stopped'}
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h4 className="text-sm font-medium text-[#2D2D2D] dark:text-[#E8E6E3] mb-1">Server Status</h4>
                                    <p className="text-xs text-[#B5AFA6] dark:text-[#6B6B6B]">
                                        {isRunning ? 'Server is running and ready for connections.' : 'Start the server to connect MCP clients.'}
                                    </p>
                                </div>
                                <button
                                    onClick={toggleServer}
                                    disabled={isLoading}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isRunning ? 'bg-[#DA7756]' : 'bg-[#EBE8E4] dark:bg-[#393939]'
                                        }`}
                                >
                                    <span
                                        className={`${isRunning ? 'translate-x-6' : 'translate-x-1'
                                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                    />
                                </button>
                            </div>

                            {/* Connection Info */}
                            {isRunning && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    className="pt-2 space-y-4"
                                >
                                    {/* URL Section */}
                                    <div>
                                        <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] mb-1.5 uppercase tracking-wider">
                                            Connection URL (SSE)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-[#F5F3F0] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#2E2E2E] rounded-lg px-3 py-2 text-sm font-mono text-[#4A4A4A] dark:text-[#B5AFA6] truncate select-all">
                                                {MCP_URL}
                                            </div>
                                            <button
                                                onClick={handleCopyUrl}
                                                className="p-2 hover:bg-[#F5F3F0] dark:hover:bg-[#2E2E2E] rounded-lg transition-colors border border-transparent hover:border-[#EBE8E4] dark:hover:border-[#393939]"
                                                title="Copy URL"
                                            >
                                                {copiedUrl ? (
                                                    <Check className="w-4 h-4 text-green-500" />
                                                ) : (
                                                    <Copy className="w-4 h-4 text-[#6B6B6B] dark:text-[#B5AFA6]" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* JSON Config Section */}
                                    <div>
                                        <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] mb-1.5 uppercase tracking-wider">
                                            Client Configuration
                                        </label>
                                        <div className="relative">
                                            <pre className="bg-[#F5F3F0] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#2E2E2E] rounded-lg px-3 py-2 text-xs font-mono text-[#4A4A4A] dark:text-[#B5AFA6] overflow-x-auto">
                                                {JSON.stringify(clientConfig, null, 2)}
                                            </pre>
                                            <button
                                                onClick={handleCopyJson}
                                                className="absolute top-2 right-2 p-1.5 hover:bg-[#EBE8E4] dark:hover:bg-[#2E2E2E] rounded transition-colors"
                                                title="Copy JSON"
                                            >
                                                {copiedJson ? (
                                                    <Check className="w-3.5 h-3.5 text-green-500" />
                                                ) : (
                                                    <Copy className="w-3.5 h-3.5 text-[#6B6B6B] dark:text-[#B5AFA6]" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/20">
                                        <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                                            Add this configuration to your Claude Desktop settings or any MCP-compatible client to access your notes and tasks.
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
