import React, { useEffect, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ColorPicker } from '../ui/ColorPicker';
import { TagInput } from '../ui/TagInput';

import { useNoteStore } from '../../stores/noteStore';
import { useFolderStore } from '../../stores/folderStore';
import { useUIStore } from '../../stores/uiStore';
import toast from 'react-hot-toast';

export function NoteEditor({ noteId: propNoteId, embedded = false }: { noteId?: string; embedded?: boolean }) {
  const { createNote, updateNote, getNoteById } = useNoteStore();
  const { folders, currentFolderPath } = useFolderStore();
  const { isNoteEditorOpen, editingNoteId, closeNoteEditor } = useUIStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [color, setColor] = useState('#6B9F78');
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Use propNoteId if provided (embedded mode), otherwise use editingNoteId from store
  const noteIdToUse = propNoteId || editingNoteId;
  const existingNote = noteIdToUse ? getNoteById(noteIdToUse) : null;

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
        setContent(existingNote.content);
      } else {
        // New blank note - use current folder
        setTitle('');
        setFolderPath(currentFolderPath);
        setColor('#6B9F78');
        setTags([]);
        setContent('');
      }
    }
  }, [embedded, isNoteEditorOpen, existingNote?.id, propNoteId, currentFolderPath]);

  // Autosave for embedded mode (if needed in future)
  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    setIsSaving(true);
    try {
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
  }, [title, content, color, tags, folderPath, existingNote, embedded, createNote, updateNote, closeNoteEditor]);

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

      {/* Content Label */}
      <div className="px-6 py-2 border-b border-[#EBE8E4] dark:border-[#393939] bg-[#F5F3F0] dark:bg-[#2E2E2E]">
        <span className="text-xs font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider">
          Content (Markdown)
        </span>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="markdown"
          theme="vs-dark"
          value={content}
          onChange={(value) => setContent(value || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            padding: { top: 16, bottom: 16 },
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
