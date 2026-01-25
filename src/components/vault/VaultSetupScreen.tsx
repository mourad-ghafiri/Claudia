import { useState } from 'react';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { useVaultStore } from '../../stores/vaultStore';

export function VaultSetupScreen() {
    const { setup, error, isLoading, clearError } = useVaultStore();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const passwordMatch = password === confirmPassword;
    const passwordStrong = password.length >= 8;
    const canSubmit = password.trim() && confirmPassword.trim() && passwordMatch && passwordStrong;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        if (!passwordMatch) {
            setLocalError('Passwords do not match');
            return;
        }

        if (!passwordStrong) {
            setLocalError('Password must be at least 8 characters');
            return;
        }

        try {
            await setup(password);
        } catch {
            // Error is handled in store
        }
    };

    const displayError = localError || error;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#FAF9F7] dark:bg-[#1A1A1A]">
            <div className="w-full max-w-md p-8">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 rounded-full bg-[#DA7756]/10 flex items-center justify-center mb-4">
                        <Shield className="w-8 h-8 text-[#DA7756]" />
                    </div>
                    <h1 className="text-2xl font-semibold text-[#2D2D2D] dark:text-[#E8E6E3]">
                        Set Up Encryption
                    </h1>
                    <p className="text-sm text-[#888580] dark:text-[#A09A93] mt-2 text-center">
                        Create a master password to encrypt your data.
                        <br />
                        <span className="text-[#DA7756]">This password cannot be recovered if lost.</span>
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setLocalError(null);
                                if (error) clearError();
                            }}
                            placeholder="Master password"
                            className="w-full px-4 py-3 pr-12 rounded-lg border border-[#EBE8E4] dark:border-[#2E2E2E] bg-white dark:bg-[#242424] text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] focus:outline-none focus:ring-2 focus:ring-[#DA7756] focus:border-transparent"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#888580] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3]"
                        >
                            {showPassword ? (
                                <EyeOff className="w-5 h-5" />
                            ) : (
                                <Eye className="w-5 h-5" />
                            )}
                        </button>
                    </div>

                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => {
                                setConfirmPassword(e.target.value);
                                setLocalError(null);
                            }}
                            placeholder="Confirm password"
                            className="w-full px-4 py-3 pr-12 rounded-lg border border-[#EBE8E4] dark:border-[#2E2E2E] bg-white dark:bg-[#242424] text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] focus:outline-none focus:ring-2 focus:ring-[#DA7756] focus:border-transparent"
                        />
                    </div>

                    {/* Password requirements */}
                    <div className="space-y-2 text-sm">
                        <div className={`flex items-center gap-2 ${passwordStrong ? 'text-green-600 dark:text-green-400' : 'text-[#888580]'}`}>
                            {passwordStrong ? (
                                <CheckCircle className="w-4 h-4" />
                            ) : (
                                <div className="w-4 h-4 rounded-full border border-current" />
                            )}
                            <span>At least 8 characters</span>
                        </div>
                        {confirmPassword && (
                            <div className={`flex items-center gap-2 ${passwordMatch ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                                {passwordMatch ? (
                                    <CheckCircle className="w-4 h-4" />
                                ) : (
                                    <AlertCircle className="w-4 h-4" />
                                )}
                                <span>{passwordMatch ? 'Passwords match' : 'Passwords do not match'}</span>
                            </div>
                        )}
                    </div>

                    {displayError && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span className="text-sm">{displayError}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading || !canSubmit}
                        className="w-full py-3 rounded-lg bg-[#DA7756] text-white font-medium hover:bg-[#C5684A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? 'Setting up...' : 'Set Master Password'}
                    </button>
                </form>

                <p className="mt-6 text-xs text-center text-[#888580] dark:text-[#A09A93]">
                    Your data will be encrypted with AES-256-GCM encryption.
                    <br />
                    Store your password securely - it cannot be recovered.
                </p>
            </div>
        </div>
    );
}
