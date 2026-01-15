import React, { useEffect, useState, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ColorPicker } from '../ui/ColorPicker';
import { TagInput } from '../ui/TagInput';
import { usePasswordStore } from '../../stores/passwordStore';
import { useFolderStore } from '../../stores/folderStore';
import { useUIStore } from '../../stores/uiStore';
import toast from 'react-hot-toast';

export function PasswordEditor() {
    const { isPasswordEditorOpen, editingPasswordId, closePasswordEditor } = useUIStore();
    const { getPasswordById, createPassword, updatePassword, getDecryptedContent, isUnlocked } = usePasswordStore();
    const { currentFolderPath } = useFolderStore();

    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [notes, setNotes] = useState('');
    const [color, setColor] = useState('#DA7756');
    const [tags, setTags] = useState<string[]>([]);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const isEditing = !!editingPasswordId;

    // Load password data when editing
    useEffect(() => {
        if (isPasswordEditorOpen && editingPasswordId) {
            const pwd = getPasswordById(editingPasswordId);
            if (pwd) {
                setTitle(pwd.title);
                setColor(pwd.color || '#DA7756');
                setTags(pwd.tags || []);
                // Clear encrypted fields first (they'll be loaded async)
                setUrl('');
                setUsername('');
                setPassword('');
                setNotes('');
                // Load all decrypted content (url, username, password, notes are all encrypted)
                loadDecryptedContent(editingPasswordId);
            }
        } else if (isPasswordEditorOpen) {
            // Reset for new password
            setTitle('');
            setUrl('');
            setUsername('');
            setPassword('');
            setNotes('');
            setColor('#DA7756');
            setTags([]);
            setShowPassword(false);
        }
    }, [isPasswordEditorOpen, editingPasswordId, getPasswordById]);

    const loadDecryptedContent = async (id: string) => {
        try {
            const content = await getDecryptedContent(id);
            setUrl(content.url || '');
            setUsername(content.username || '');
            setPassword(content.password || '');
            setNotes(content.notes || '');
        } catch (e) {
            toast.error('Failed to decrypt password');
        }
    };

    const handleSave = async () => {
        if (!title.trim()) {
            toast.error('Title is required');
            return;
        }

        if (!isUnlocked) {
            toast.error('Vault is locked');
            return;
        }

        setLoading(true);
        try {
            if (isEditing) {
                await updatePassword({
                    id: editingPasswordId!,
                    title: title.trim(),
                    url: url.trim(),
                    username: username.trim(),
                    password: password,
                    notes: notes,
                    color: color,
                    tags: tags,
                });
                toast.success('Password updated');
            } else {
                await createPassword({
                    title: title.trim(),
                    folderPath: currentFolderPath,
                    url: url.trim(),
                    username: username.trim(),
                    password: password,
                    notes: notes,
                    color: color,
                    tags: tags,
                });
                toast.success('Password created');
            }
            closePasswordEditor();
        } catch (e) {
            toast.error(String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            handleSave();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        }
    }, [handleSave]);

    if (!isUnlocked && isPasswordEditorOpen) {
        return (
            <Modal isOpen={isPasswordEditorOpen} onClose={closePasswordEditor} title="Vault Locked">
                <div className="text-center py-8">
                    <p className="text-[#9A948A] dark:text-[#8C857B]">
                        Please unlock the vault first to manage passwords.
                    </p>
                </div>
            </Modal>
        );
    }

    return (
        <Modal
            isOpen={isPasswordEditorOpen}
            onClose={closePasswordEditor}
            title={isEditing ? 'Edit Password' : 'New Password'}
            size="lg"
        >
            <div className="p-6 space-y-4" onKeyDown={handleKeyDown}>
                {/* Title */}
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Password title..."
                    className="w-full text-xl font-semibold bg-transparent border-0 border-b-2 border-[#EBE8E4] dark:border-[#393939] focus:border-[#DA7756] focus:ring-0 pb-2 text-[#2D2D2D] dark:text-[#E8E6E3] placeholder:text-[#B5AFA6]"
                    autoFocus
                />

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-4">
                    {/* URL */}
                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                            URL
                        </label>
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com"
                            className="w-full px-3 py-2 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-sm text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:outline-none focus:border-[#DA7756]"
                        />
                    </div>

                    {/* Username */}
                    <div>
                        <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                            Username / Email
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="user@example.com"
                            className="w-full px-3 py-2 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-sm text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:outline-none focus:border-[#DA7756]"
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full px-3 py-2 pr-10 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-sm text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:outline-none focus:border-[#DA7756]"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-[#EBE8E4] dark:hover:bg-[#393939] rounded transition-colors"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-4 h-4 text-[#9A948A]" />
                                ) : (
                                    <Eye className="w-4 h-4 text-[#9A948A]" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Color */}
                    <div>
                        <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                            Color
                        </label>
                        <ColorPicker value={color} onChange={setColor} size="sm" />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                            Tags
                        </label>
                        <TagInput
                            value={tags}
                            onChange={setTags}
                            placeholder="Add tags..."
                        />
                    </div>

                    {/* Notes */}
                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                            Notes
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Additional notes (security questions, recovery codes, etc.)"
                            rows={3}
                            className="w-full px-3 py-2 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-sm text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] dark:placeholder-[#6B6B6B] focus:outline-none focus:border-[#DA7756] resize-none"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-[#EBE8E4] dark:border-[#393939]">
                    <Button variant="secondary" onClick={closePasswordEditor}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleSave} isLoading={loading}>
                        {isEditing ? 'Save Changes' : 'Create Password'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
