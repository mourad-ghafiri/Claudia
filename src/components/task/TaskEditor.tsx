import React, { useEffect, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ColorPicker } from '../ui/ColorPicker';
import { DateTimePicker } from '../ui/DateTimePicker';
import { TagInput } from '../ui/TagInput';

import { useTaskStore } from '../../stores/taskStore';
import { useFolderStore } from '../../stores/folderStore';
import { useUIStore } from '../../stores/uiStore';
import type { TaskStatus } from '../../types';
import toast from 'react-hot-toast';

export function TaskEditor({ taskId: propTaskId, embedded = false }: { taskId?: string; embedded?: boolean }) {
    const { createTask, updateTask, getTaskById } = useTaskStore();
    const { currentFolderPath } = useFolderStore();
    const { isTaskEditorOpen, editingTaskId, pendingTaskTemplate, closeTaskEditor } = useUIStore();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState('#3B82F6');
    const [due, setDue] = useState<number | null>(null);
    const [status, setStatus] = useState<TaskStatus>('todo');
    const [folderPath, setFolderPath] = useState<string | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    // Track dark mode for Monaco Editor theme
    const [isDarkMode, setIsDarkMode] = useState(() =>
        document.documentElement.classList.contains('dark')
    );

    // Listen for theme changes
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    setIsDarkMode(document.documentElement.classList.contains('dark'));
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    // Use propTaskId if provided (embedded mode), otherwise use editingTaskId from store
    const taskIdToUse = propTaskId || editingTaskId;
    const existingTask = taskIdToUse ? getTaskById(taskIdToUse) : null;

    // Initialize form when modal opens or when taskId changes (embedded mode)
    useEffect(() => {
        if (embedded || isTaskEditorOpen) {
            if (existingTask) {
                // Editing existing task
                setTitle(existingTask.title);
                setColor(existingTask.color);
                setDue(existingTask.due);
                setStatus(existingTask.status);
                setFolderPath(existingTask.folderPath);
                setDescription(existingTask.description);
                // Tags are now string arrays directly
                setTags(existingTask.tags || []);
            } else if (pendingTaskTemplate) {
                // New task from template
                setTitle(pendingTaskTemplate.title === 'Blank Task' ? '' : pendingTaskTemplate.title);
                setColor(pendingTaskTemplate.color || '#3B82F6');
                setDue(null);
                setStatus('todo');
                setFolderPath(currentFolderPath);
                setTags([]);
                setDescription(pendingTaskTemplate.content);
            } else {
                // New blank task - use current folder
                setTitle('');
                setColor('#3B82F6');
                setDue(null);
                setStatus('todo');
                setFolderPath(currentFolderPath);
                setTags([]);
                setDescription('');
            }
        }
    }, [embedded, isTaskEditorOpen, existingTask?.id, propTaskId, currentFolderPath, pendingTaskTemplate]);

    // Handle save
    const handleSave = useCallback(async () => {
        if (!title.trim()) {
            toast.error('Please enter a title');
            return;
        }

        setIsSaving(true);
        try {
            if (existingTask) {
                await updateTask({
                    id: existingTask.id,
                    title: title.trim(),
                    content: description,
                    color,
                    due,
                    status,
                    tags,
                });
            } else {
                await createTask({
                    title: title.trim(),
                    content: description,
                    color,
                    due,
                    status,
                    folderPath: folderPath || null,
                });
            }

            toast.success(existingTask ? 'Task updated' : 'Task created');
            if (!embedded) {
                closeTaskEditor();
            }
        } catch (error) {
            console.error('Failed to save task:', error);
            toast.error('Failed to save task');
        } finally {
            setIsSaving(false);
        }
    }, [title, description, color, due, status, tags, existingTask, folderPath, embedded, createTask, updateTask, closeTaskEditor]);

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

    const editorContent = (
        <div className="p-6 space-y-4" onKeyDown={handleKeyDown}>
            {/* Title */}
            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title..."
                className="w-full text-xl font-semibold bg-transparent border-0 border-b-2 border-[#EBE8E4] dark:border-[#393939] focus:border-[#DA7756] focus:ring-0 pb-2 text-[#2D2D2D] dark:text-[#E8E6E3] placeholder:text-[#B5AFA6]"
                autoFocus
            />

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-4">
                {/* Status */}
                <div>
                    <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                        Status
                    </label>
                    <div className="flex gap-1">
                        {(['todo', 'doing', 'done'] as TaskStatus[]).map((s) => (
                            <Button
                                key={s}
                                variant={status === s ? 'primary' : 'secondary'}
                                size="sm"
                                className="flex-1 px-2 py-1 text-xs"
                                onClick={() => setStatus(s)}
                            >
                                {s === 'todo' ? 'To Do' : s === 'doing' ? 'Doing' : 'Done'}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Color */}
                <div>
                    <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                        Color
                    </label>
                    <ColorPicker value={color} onChange={setColor} size="sm" />
                </div>

                {/* Due Date */}
                <div className="col-span-2">
                    <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                        Due Date
                    </label>
                    <DateTimePicker value={due} onChange={setDue} />
                </div>

                {/* Tags */}
                <div className="col-span-2">
                    <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                        Tags
                    </label>
                    <TagInput
                        value={tags}
                        onChange={setTags}
                        placeholder="Add tags..."
                    />
                </div>
            </div>

            {/* Description Label */}
            <div>
                <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1">
                    Description (Markdown)
                </label>
            </div>

            {/* Monaco Editor */}
            <div className="h-[200px] border border-[#EBE8E4] dark:border-[#393939] rounded-xl overflow-hidden">
                <Editor
                    height="100%"
                    defaultLanguage="markdown"
                    theme={isDarkMode ? 'vs-dark' : 'light'}
                    value={description}
                    onChange={(value) => setDescription(value || '')}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: 'on',
                        padding: { top: 12, bottom: 12 },
                        scrollBeyondLastLine: false,
                        lineNumbers: 'off',
                        folding: false,
                        glyphMargin: false,
                        lineDecorationsWidth: 0,
                        lineNumbersMinChars: 0,
                    }}
                />
            </div>

            {/* Actions - only show in modal mode */}
            {!embedded && (
                <div className="flex justify-end gap-3 pt-4 border-t border-[#EBE8E4] dark:border-[#393939]">
                    <Button variant="secondary" onClick={closeTaskEditor}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
                        {existingTask ? 'Save Changes' : 'Create Task'}
                    </Button>
                </div>
            )}
        </div>
    );

    // In embedded mode, render directly without modal
    if (embedded) {
        return editorContent;
    }

    // In modal mode, wrap in Modal
    return (
        <Modal
            isOpen={isTaskEditorOpen}
            onClose={closeTaskEditor}
            title={existingTask ? 'Edit Task' : 'New Task'}
            size="lg"
        >
            {editorContent}
        </Modal>
    );
}
