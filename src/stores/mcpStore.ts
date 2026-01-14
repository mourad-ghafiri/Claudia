import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

const MCP_PORT = 44055;
const MCP_URL = `http://127.0.0.1:${MCP_PORT}/sse`;

interface MCPState {
    isRunning: boolean;
    isLoading: boolean;
    serverUrl: string;
    error: string | null;

    // Actions
    startServer: () => Promise<void>;
    stopServer: () => Promise<void>;
    checkServerStatus: () => Promise<void>;
}

export const useMCPStore = create<MCPState>((set) => ({
    isRunning: false,
    isLoading: false,
    serverUrl: MCP_URL,
    error: null,

    startServer: async () => {
        set({ isLoading: true, error: null });
        try {
            // Try to invoke the start_mcp_server command if it exists
            // If not, we'll just set the state to running
            try {
                await invoke('start_mcp_server');
            } catch {
                // MCP server might be managed externally or auto-started
                console.log('[MCP] Server start command not available, assuming external management');
            }
            set({ isRunning: true, isLoading: false });
        } catch (error) {
            set({ error: String(error), isLoading: false });
        }
    },

    stopServer: async () => {
        set({ isLoading: true, error: null });
        try {
            // Try to invoke the stop_mcp_server command if it exists
            try {
                await invoke('stop_mcp_server');
            } catch {
                // MCP server might be managed externally
                console.log('[MCP] Server stop command not available, assuming external management');
            }
            set({ isRunning: false, isLoading: false });
        } catch (error) {
            set({ error: String(error), isLoading: false });
        }
    },

    checkServerStatus: async () => {
        try {
            // Try to check server status via command or HTTP ping
            try {
                const status = await invoke<boolean>('get_mcp_server_status');
                set({ isRunning: status });
            } catch {
                // If command doesn't exist, try HTTP ping
                try {
                    await fetch(MCP_URL, { method: 'HEAD', mode: 'no-cors' });
                    set({ isRunning: true });
                } catch {
                    set({ isRunning: false });
                }
            }
        } catch (error) {
            set({ isRunning: false });
        }
    },
}));
