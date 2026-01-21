import React, { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ColorPicker } from '../ui/ColorPicker';
import { DateTimePicker } from '../ui/DateTimePicker';
import { TagInput } from '../ui/TagInput';

import { useTaskStore } from '../../stores/taskStore';
import { useFolderStore } from '../../stores/folderStore';
import { useUIStore } from '../../stores/uiStore';
import { getEditorExtensions } from '../../lib/editor';
import type { TaskStatus } from '../../types';
import toast from 'react-hot-toast';

interface ToolbarButtonProps {
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title?: string;
}

function ToolbarButton({ onClick, isActive, children, title }: ToolbarButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`
        p-1.5 rounded-lg transition-colors
        ${isActive
                    ? 'bg-[#DA7756]/10 text-[#DA7756]'
                    : 'hover:bg-[#F5F3F0] dark:hover:bg-[#393939] text-[#6B6B6B] dark:text-[#B5AFA6]'
                }
      `}
        >
            {children}
        </button>
    );
}

export function TaskEditor({ taskId: propTaskId, embedded = false }: { taskId?: string; embedded?: boolean }) {
    const { createTask, updateTask, getTaskById } = useTaskStore();
    const { currentFolderPath } = useFolderStore();
    const { isTaskEditorOpen, editingTaskId, pendingTaskTemplate, closeTaskEditor } = useUIStore();

    const [title, setTitle] = useState('');
    const [color, setColor] = useState('#3B82F6');
    const [due, setDue] = useState<number | null>(null);
    const [status, setStatus] = useState<TaskStatus>('todo');
    const [folderPath, setFolderPath] = useState<string | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    // Use propTaskId if provided (embedded mode), otherwise use editingTaskId from store
    const taskIdToUse = propTaskId || editingTaskId;
    const existingTask = taskIdToUse ? getTaskById(taskIdToUse) : null;

    const editor = useEditor({
        extensions: getEditorExtensions('Add task description...'),
        content: '',
        editorProps: {
            attributes: {
                class: 'tiptap prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[150px]',
            },
        },
    });

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
                editor?.commands.setContent(existingTask.description);
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
                editor?.commands.setContent(pendingTaskTemplate.content);
            } else {
                // New blank task - use current folder
                setTitle('');
                setColor('#3B82F6');
                setDue(null);
                setStatus('todo');
                setFolderPath(currentFolderPath);
                setTags([]);
                editor?.commands.setContent('');
            }
        }
    }, [embedded, isTaskEditorOpen, existingTask?.id, editor, propTaskId, currentFolderPath, pendingTaskTemplate]);

    // Handle save
    const handleSave = async () => {
        if (!title.trim()) {
            toast.error('Please enter a title');
            return;
        }

        setIsSaving(true);
        try {
            const description = editor?.getHTML() || '';

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

    if (!editor) return null;

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

            {/* Toolbar */}
            <div className="flex flex-wrap gap-1 p-2 bg-[#F5F3F0] dark:bg-[#2E2E2E] rounded-xl border border-[#EBE8E4] dark:border-[#393939]">
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                    title="Bold (Cmd+B)"
                >
                    <Bold className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                    title="Italic (Cmd+I)"
                >
                    <Italic className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    isActive={editor.isActive('strike')}
                    title="Strikethrough"
                >
                    <Strikethrough className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    isActive={editor.isActive('code')}
                    title="Code"
                >
                    <Code className="w-4 h-4" />
                </ToolbarButton>

                <div className="w-px h-6 bg-[#D8D3CC] dark:bg-[#4A4A4A] mx-1" />

                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive('bulletList')}
                    title="Bullet List"
                >
                    <List className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive('orderedList')}
                    title="Numbered List"
                >
                    <ListOrdered className="w-4 h-4" />
                </ToolbarButton>

                <div className="w-px h-6 bg-[#D8D3CC] dark:bg-[#4A4A4A] mx-1" />

                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive('blockquote')}
                    title="Quote"
                >
                    <Quote className="w-4 h-4" />
                </ToolbarButton>
            </div>

            {/* Editor */}
            <div className="min-h-[150px] max-h-[300px] overflow-y-auto border border-[#EBE8E4] dark:border-[#393939] rounded-xl">
                <EditorContent editor={editor} />
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
