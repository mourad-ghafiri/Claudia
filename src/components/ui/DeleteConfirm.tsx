import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useNoteStore } from '../../stores/noteStore';
import { useTaskStore } from '../../stores/taskStore';
import { useFolderStore } from '../../stores/folderStore';
import { usePasswordStore } from '../../stores/passwordStore';
import { useUIStore } from '../../stores/uiStore';
import type { FolderInfo } from '../../types';
import toast from 'react-hot-toast';

// Helper to find folder in nested tree by id or path
function findFolderInTree(folders: FolderInfo[], idOrPath: string): FolderInfo | null {
  for (const folder of folders) {
    // Match by id or path since FolderSidebar passes path
    if (folder.id === idOrPath || folder.path === idOrPath) return folder;
    const found = findFolderInTree(folder.children || [], idOrPath);
    if (found) return found;
  }
  return null;
}

export function DeleteConfirm() {
  const { deleteNote, getNoteById } = useNoteStore();
  const { deleteTask, getTaskById } = useTaskStore();
  const { deleteFolder, folders, setCurrentFolder } = useFolderStore();
  const { deletePassword, getPasswordById } = usePasswordStore();
  const { isDeleteConfirmOpen, deletingItemId, deletingItemType, closeDeleteConfirm } = useUIStore();
  const [isDeleting, setIsDeleting] = useState(false);

  const note = deletingItemType === 'note' && deletingItemId ? getNoteById(deletingItemId) : null;
  const task = deletingItemType === 'task' && deletingItemId ? getTaskById(deletingItemId) : null;
  const password = deletingItemType === 'password' && deletingItemId ? getPasswordById(deletingItemId) : null;

  // Get folder info for folder deletion (search in nested tree)
  const folder = deletingItemType === 'folder' && deletingItemId
    ? findFolderInTree(folders, deletingItemId)
    : null;

  const itemName = note?.title || task?.title || folder?.name || password?.title || 'this item';
  const itemTypeName = deletingItemType === 'note' ? 'Note'
    : deletingItemType === 'task' ? 'Task'
    : deletingItemType === 'password' ? 'Password'
    : 'Folder';

  const handleDelete = async () => {
    if (!deletingItemId || !deletingItemType) return;

    setIsDeleting(true);
    try {
      if (deletingItemType === 'note') {
        await deleteNote(deletingItemId);
        toast.success('Note deleted');
      } else if (deletingItemType === 'task') {
        await deleteTask(deletingItemId);
        toast.success('Task deleted');
      } else if (deletingItemType === 'folder' && folder) {
        await deleteFolder(folder.path);
        setCurrentFolder(null);
        toast.success('Folder deleted');
      } else if (deletingItemType === 'password') {
        await deletePassword(deletingItemId);
        toast.success('Password deleted');
      }
      closeDeleteConfirm();
    } catch (error) {
      toast.error(`Failed to delete ${deletingItemType}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const getWarningMessage = () => {
    if (deletingItemType === 'folder') {
      return (
        <>
          Are you sure you want to delete{' '}
          <span className="font-medium text-[#4A4A4A] dark:text-[#E8E6E3]">
            "{itemName}"
          </span>
          ? This will permanently delete the folder and all notes and tasks inside it.
        </>
      );
    }
    return (
      <>
        Are you sure you want to delete{' '}
        <span className="font-medium text-[#4A4A4A] dark:text-[#E8E6E3]">
          "{itemName}"
        </span>
        ? This action cannot be undone.
      </>
    );
  };

  return (
    <Modal
      isOpen={isDeleteConfirmOpen}
      onClose={closeDeleteConfirm}
      size="sm"
      showCloseButton={false}
    >
      <div className="p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-[#E57373]/10 dark:bg-[#E57373]/20 mx-auto mb-4 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-[#E57373]" />
        </div>

        <h3 className="text-lg font-semibold text-[#2D2D2D] dark:text-[#E8E6E3] mb-2">
          Delete {itemTypeName}
        </h3>

        <p className="text-sm text-[#6B6B6B] dark:text-[#B5AFA6] mb-6">
          {getWarningMessage()}
        </p>

        <div className="flex justify-center gap-3">
          <Button variant="secondary" onClick={closeDeleteConfirm}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} isLoading={isDeleting}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
