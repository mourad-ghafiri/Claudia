import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useVaultStore } from '../../stores/vaultStore';
import { Sun, Moon, Monitor, Bell, Layers, Home, FileText, ListTodo, Lock, Eye, EyeOff } from 'lucide-react';
import type { Settings } from '../../types';
import toast from 'react-hot-toast';

interface SettingsSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function SettingsSection({ title, icon, children }: SettingsSectionProps) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[#DA7756]">{icon}</span>
        <h3 className="text-sm font-semibold text-[#2D2D2D] dark:text-[#E8E6E3]">{title}</h3>
      </div>
      <div className="space-y-3 pl-6">{children}</div>
    </div>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[#2D2D2D] dark:text-[#E8E6E3]">{label}</div>
        {description && (
          <div className="text-xs text-[#6B6B6B] dark:text-[#B5AFA6] mt-0.5">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ checked, onChange, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-[#DA7756]' : 'bg-[#D8D3CC] dark:bg-[#4A4A4A]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// Helper to apply theme to document
function applyThemeToDocument(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  root.classList.remove('dark');
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('dark');
    }
  }
}

export function SettingsModal() {
  const { isSettingsOpen, closeSettings } = useUIStore();
  const { settings, fetchSettings, updateSettings } = useSettingsStore();
  const { changePassword, isSetup, lock } = useVaultStore();
  const [localSettings, setLocalSettings] = useState<Settings>(settings);
  const [isSaving, setIsSaving] = useState(false);

  // Master password change state
  // hasMasterPassword is now determined by isSetup from vaultStore
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (isSettingsOpen) {
      fetchSettings();
      // Note: We don't call checkVaultStatus() here because it sets isLoading=true
      // which causes App.tsx to show loading screen and unmount the modal
    } else {
      // Reset password fields when modal closes
      setShowPasswordSection(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
    }
  }, [isSettingsOpen, fetchSettings]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error('Current password is required');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Master password changed successfully');
      // Clear form state
      setShowPasswordSection(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      // Close settings modal before locking
      closeSettings();
      // Lock the vault after changing password - requires re-unlock
      await lock();
    } catch (error) {
      toast.error(String(error));
      setIsChangingPassword(false);
    }
  };

  // Handle cancel - revert theme to saved value
  const handleCancel = () => {
    // Revert theme to the saved value
    applyThemeToDocument(settings.theme as 'light' | 'dark' | 'system');
    closeSettings();
  };

  const handleSave = async () => {
    console.log('[SettingsModal] Saving settings:', localSettings);
    setIsSaving(true);
    try {
      await updateSettings(localSettings);
      console.log('[SettingsModal] Settings saved successfully');
      toast.success('Settings saved');
      closeSettings();
    } catch (error) {
      console.error('[SettingsModal] Failed to save settings:', error);
      toast.error('Failed to save settings');
      // Revert theme on error
      applyThemeToDocument(settings.theme as 'light' | 'dark' | 'system');
    } finally {
      setIsSaving(false);
    }
  };

  const updateLocalSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));

    // Apply theme immediately for live preview
    if (key === 'theme') {
      const theme = value as 'light' | 'dark' | 'system';
      applyThemeToDocument(theme);
      console.log('[SettingsModal] Applied theme preview:', theme);
    }
  };

  return (
    <Modal isOpen={isSettingsOpen} onClose={handleCancel} title="Settings" size="md">
      <div className="p-6 max-h-[70vh] overflow-y-auto divide-y divide-[#EBE8E4] dark:divide-[#393939]">
        {/* General */}
        <SettingsSection title="General" icon={<Home className="w-4 h-4" />}>
          <SettingsRow label="Default view" description="Choose which view to show when app starts">
            <div className="flex items-center bg-[#F5F3F0] dark:bg-[#2E2E2E] rounded-xl p-1 gap-1">
              <button
                onClick={() => updateLocalSetting('defaultMode', 'notes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  localSettings.defaultMode === 'notes'
                    ? 'bg-white dark:bg-[#393939] shadow-sm text-[#DA7756]'
                    : 'text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Notes
              </button>
              <button
                onClick={() => updateLocalSetting('defaultMode', 'tasks')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  localSettings.defaultMode === 'tasks'
                    ? 'bg-white dark:bg-[#393939] shadow-sm text-[#DA7756]'
                    : 'text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3]'
                }`}
              >
                <ListTodo className="w-3.5 h-3.5" />
                Tasks
              </button>
            </div>
          </SettingsRow>
        </SettingsSection>

        {/* Appearance */}
        <SettingsSection title="Appearance" icon={<Sun className="w-4 h-4" />}>
          <SettingsRow label="Theme" description="Choose your preferred color scheme">
            <div className="flex items-center bg-[#F5F3F0] dark:bg-[#2E2E2E] rounded-xl p-1 gap-1">
              <button
                onClick={() => updateLocalSetting('theme', 'light')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  localSettings.theme === 'light'
                    ? 'bg-white dark:bg-[#393939] shadow-sm text-[#DA7756]'
                    : 'text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                Light
              </button>
              <button
                onClick={() => updateLocalSetting('theme', 'dark')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  localSettings.theme === 'dark'
                    ? 'bg-white dark:bg-[#393939] shadow-sm text-[#DA7756]'
                    : 'text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                Dark
              </button>
              <button
                onClick={() => updateLocalSetting('theme', 'system')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  localSettings.theme === 'system'
                    ? 'bg-white dark:bg-[#393939] shadow-sm text-[#DA7756]'
                    : 'text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3]'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                System
              </button>
            </div>
          </SettingsRow>
        </SettingsSection>

        {/* Floating Windows */}
        <SettingsSection title="Floating Windows" icon={<Layers className="w-4 h-4" />}>
          <SettingsRow label="Opacity" description="Transparency of floating windows">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                value={localSettings.floatingOpacity}
                onChange={(e) => updateLocalSetting('floatingOpacity', parseFloat(e.target.value))}
                className="w-24 accent-[#DA7756]"
              />
              <span className="text-xs text-[#6B6B6B] dark:text-[#B5AFA6] w-10 text-right">
                {Math.round(localSettings.floatingOpacity * 100)}%
              </span>
            </div>
          </SettingsRow>
        </SettingsSection>

        {/* Notifications */}
        <SettingsSection title="Notifications" icon={<Bell className="w-4 h-4" />}>
          <SettingsRow label="Enable notifications" description="Show reminders for tasks with due dates">
            <ToggleSwitch
              checked={localSettings.notificationsEnabled}
              onChange={(checked) => updateLocalSetting('notificationsEnabled', checked)}
            />
          </SettingsRow>

          <SettingsRow label="Sound" description="Play sound for task reminders">
            <ToggleSwitch
              checked={localSettings.notificationSound}
              onChange={(checked) => updateLocalSetting('notificationSound', checked)}
              disabled={!localSettings.notificationsEnabled}
            />
          </SettingsRow>

          <SettingsRow label="Reminder time" description="Minutes before due time">
            <select
              value={localSettings.notificationMinutesBefore}
              onChange={(e) => updateLocalSetting('notificationMinutesBefore', parseInt(e.target.value))}
              disabled={!localSettings.notificationsEnabled}
              className="px-3 py-2 rounded-lg bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] text-sm text-[#2D2D2D] dark:text-[#E8E6E3] focus:border-[#DA7756] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </SettingsRow>
        </SettingsSection>

        {/* Security */}
        {isSetup && (
          <SettingsSection title="Security" icon={<Lock className="w-4 h-4" />}>
            {!showPasswordSection ? (
              <SettingsRow label="Master Password" description="Change your vault master password">
                <button
                  onClick={() => setShowPasswordSection(true)}
                  className="px-3 py-1.5 text-sm font-medium text-[#DA7756] hover:bg-[#DA7756]/10 rounded-lg transition-colors"
                >
                  Change
                </button>
              </SettingsRow>
            ) : (
              <div className="space-y-3">
                {/* Current Password */}
                <div>
                  <label className="block text-sm text-[#2D2D2D] dark:text-[#E8E6E3] mb-1">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-sm text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:border-[#DA7756] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-[#EBE8E4] dark:hover:bg-[#393939] rounded"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="w-4 h-4 text-[#9A948A]" />
                      ) : (
                        <Eye className="w-4 h-4 text-[#9A948A]" />
                      )}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div>
                  <label className="block text-sm text-[#2D2D2D] dark:text-[#E8E6E3] mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-sm text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:border-[#DA7756] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-[#EBE8E4] dark:hover:bg-[#393939] rounded"
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4 text-[#9A948A]" />
                      ) : (
                        <Eye className="w-4 h-4 text-[#9A948A]" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password */}
                <div>
                  <label className="block text-sm text-[#2D2D2D] dark:text-[#E8E6E3] mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-sm text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:border-[#DA7756] focus:outline-none"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowPasswordSection(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmNewPassword('');
                    }}
                    className="px-3 py-1.5 text-sm text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangePassword}
                    disabled={isChangingPassword}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-[#DA7756] hover:bg-[#C96847] rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isChangingPassword ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </div>
            )}
          </SettingsSection>
        )}

      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#EBE8E4] dark:border-[#393939] bg-[#FDFCFB] dark:bg-[#1A1A1A]">
        <button
          onClick={handleCancel}
          className="px-4 py-2 text-sm font-medium text-[#6B6B6B] dark:text-[#B5AFA6] hover:text-[#2D2D2D] dark:hover:text-[#E8E6E3] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-[#DA7756] hover:bg-[#C96847] rounded-xl transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}
