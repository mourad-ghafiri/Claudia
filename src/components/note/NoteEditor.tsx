import React, { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Bold, Italic, Code, List, ListOrdered, Heading1, Heading2, Quote, Link as LinkIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ColorPicker } from '../ui/ColorPicker';
import { TagInput } from '../ui/TagInput';

import { useNoteStore } from '../../stores/noteStore';
import { useFolderStore } from '../../stores/folderStore';
import { useUIStore } from '../../stores/uiStore';
import { getEditorExtensions } from '../../lib/editor';
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

export function NoteEditor({ noteId: propNoteId, embedded = false }: { noteId?: string; embedded?: boolean }) {
  const { createNote, updateNote, getNoteById } = useNoteStore();
  const { folders, currentFolderPath } = useFolderStore();
  const { isNoteEditorOpen, editingNoteId, closeNoteEditor } = useUIStore();

  const [title, setTitle] = useState('');
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [color, setColor] = useState('#6B9F78');
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Use propNoteId if provided (embedded mode), otherwise use editingNoteId from store
  const noteIdToUse = propNoteId || editingNoteId;
  const existingNote = noteIdToUse ? getNoteById(noteIdToUse) : null;

  const editor = useEditor({
    extensions: getEditorExtensions('Write your note... (Supports Markdown & Mermaid diagrams)'),
    content: '',
    editorProps: {
      attributes: {
        class: 'tiptap prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-4 py-3',
      },
    },
  });

  // Initialize form when modal opens or when noteId changes (embedded mode)
  useEffect(() => {
    if (embedded || isNoteEditorOpen) {
      if (existingNote) {
        // Editing existing note
        setTitle(existingNote.title);
        setFolderPath(existingNote.folderPath);
        setColor(existingNote.color || '#6B9F78');
        // Tags are now string arrays directly
        setTags(existingNote.tags || []);
        editor?.commands.setContent(existingNote.content);
      } else {
        // New blank note - use current folder
        setTitle('');
        setFolderPath(currentFolderPath);
        setColor('#6B9F78');
        setTags([]);
        editor?.commands.setContent('');
      }
    }
  }, [embedded, isNoteEditorOpen, existingNote?.id, editor, propNoteId, currentFolderPath]);

  // Autosave for embedded mode (if needed in future)
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    setIsSaving(true);
    try {
      const content = editor?.getHTML() || '';

      if (existingNote) {
        await updateNote({
          id: existingNote.id,
          title: title.trim(),
          content,
          color,
          tags,
        });
        toast.success('Note updated');
      } else {
        console.log('[NoteEditor] Creating note with folderPath:', folderPath);
        console.log('[NoteEditor] currentFolderPath from store:', currentFolderPath);
        await createNote({
          title: title.trim(),
          content,
          folderPath,
          color,
          tags,
        });
        toast.success('Note created');
      }
      if (!embedded) {
        closeNoteEditor();
      }
    } catch (error) {
      toast.error('Failed to save note');
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
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* Title Bar */}
      <div className="p-6 pb-4 border-b border-[#EBE8E4] dark:border-[#393939]">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title..."
          className="w-full text-2xl font-bold bg-transparent border-0 focus:ring-0 p-0 text-[#2D2D2D] dark:text-[#E8E6E3] placeholder:text-[#B5AFA6]"
          autoFocus
        />

        {/* Metadata Row */}
        <div className="mt-4 flex flex-wrap items-start gap-6">
          {/* Folder Selector */}
          <div>
            <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1.5">
              Folder
            </label>
            <select
              value={folderPath || ''}
              onChange={(e) => setFolderPath(e.target.value || null)}
              className="text-sm px-3 py-2 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-[#2D2D2D] dark:text-[#E8E6E3] focus:outline-none focus:border-[#DA7756]"
            >
              <option value="">Root Folder</option>
              {folders.map((folder: { path: string; name: string }) => (
                <option key={folder.path} value={folder.path}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          {/* Color Picker */}
          <div>
            <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1.5">
              Color
            </label>
            <ColorPicker value={color} onChange={setColor} size="sm" />
          </div>
        </div>

        {/* Tags */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1.5">
            Tags
          </label>
          <TagInput
            value={tags}
            onChange={setTags}
            placeholder="Add tags (press Enter)..."
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-2 border-b border-[#EBE8E4] dark:border-[#393939] bg-[#F5F3F0] dark:bg-[#2E2E2E]">
        <div className="flex flex-wrap gap-1">
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
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive('code')}
            title="Inline Code"
          >
            <Code className="w-4 h-4" />
          </ToolbarButton>

          <div className="w-px h-6 bg-[#D8D3CC] dark:bg-[#4A4A4A] mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
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
          <ToolbarButton
            onClick={() => {
              const url = window.prompt('Enter URL:');
              if (url) {
                editor.chain().focus().setLink({ href: url }).run();
              }
            }}
            isActive={editor.isActive('link')}
            title="Insert Link"
          >
            <LinkIcon className="w-4 h-4" />
          </ToolbarButton>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>

      {/* Actions - only show in modal mode */}
      {!embedded && (
        <div className="flex justify-end gap-3 p-6 pt-4 border-t border-[#EBE8E4] dark:border-[#393939]">
          <Button variant="secondary" onClick={closeNoteEditor}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
            {existingNote ? 'Save Note' : 'Create Note'}
          </Button>
        </div>
      )}
    </div>
  );

  // In embedded mode, render directly without modal
  if (embedded) {
    return <div className="h-full">{editorContent}</div>;
  }

  // In modal mode, wrap in Modal
  return (
    <Modal
      isOpen={isNoteEditorOpen}
      onClose={closeNoteEditor}
      title={existingNote ? 'Edit Note' : 'New Note'}
      size="xl"
    >
      {editorContent}
    </Modal>
  );
}
