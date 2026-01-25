import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
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
  const { isDeleteConfirmOpen, deletingItemId, deletingItemType, closeDeleteConfirm, isTrashSelected } = useUIStore();
  const [isDeleting, setIsDeleting] = useState(false);

  const note = deletingItemType === 'note' && deletingItemId ? getNoteById(deletingItemId) : null;
  const task = deletingItemType === 'task' && deletingItemId ? getTaskById(deletingItemId) : null;
  const password = deletingItemType === 'password' && deletingItemId ? getPasswordById(deletingItemId) : null;

  // Get folder info for folder deletion (search in nested tree)
  const folder = deletingItemType === 'folder' && deletingItemId
    ? findFolderInTree(folders, deletingItemId)
    : null;

  // Check if item is in trash (either by isTrashSelected flag or by folderPath)
  const isItemInTrash = isTrashSelected ||
    note?.folderPath === '.trash' ||
    task?.folderPath === '.trash' ||
    password?.folderPath === '.trash';

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
        toast.success(isItemInTrash ? 'Note permanently deleted' : 'Note moved to trash');
      } else if (deletingItemType === 'task') {
        await deleteTask(deletingItemId);
        toast.success(isItemInTrash ? 'Task permanently deleted' : 'Task moved to trash');
      } else if (deletingItemType === 'folder' && folder) {
        await deleteFolder(folder.path);
        setCurrentFolder(null);
        toast.success('Folder deleted');
      } else if (deletingItemType === 'password') {
        await deletePassword(deletingItemId);
        toast.success(isItemInTrash ? 'Password permanently deleted' : 'Password moved to trash');
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
          ? All items inside will be moved to trash, then the folder will be deleted.
        </>
      );
    }

    if (isItemInTrash) {
      return (
        <>
          Are you sure you want to <span className="font-medium text-[#E57373]">permanently delete</span>{' '}
          <span className="font-medium text-[#4A4A4A] dark:text-[#E8E6E3]">
            "{itemName}"
          </span>
          ? This action cannot be undone.
        </>
      );
    }

    return (
      <>
        Are you sure you want to move{' '}
        <span className="font-medium text-[#4A4A4A] dark:text-[#E8E6E3]">
          "{itemName}"
        </span>
        {' '}to trash? You can restore it later from the trash.
      </>
    );
  };

  const getTitle = () => {
    if (isItemInTrash) {
      return `Permanently Delete ${itemTypeName}`;
    }
    if (deletingItemType === 'folder') {
      return 'Delete Folder';
    }
    return `Move ${itemTypeName} to Trash`;
  };

  const getButtonText = () => {
    if (isItemInTrash) {
      return 'Delete Forever';
    }
    if (deletingItemType === 'folder') {
      return 'Delete';
    }
    return 'Move to Trash';
  };

  return (
    <Modal
      isOpen={isDeleteConfirmOpen}
      onClose={closeDeleteConfirm}
      size="sm"
      showCloseButton={false}
    >
      <div className="p-6 text-center">
        <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${
          isItemInTrash
            ? 'bg-[#E57373]/20 dark:bg-[#E57373]/30'
            : 'bg-[#DA7756]/10 dark:bg-[#DA7756]/20'
        }`}>
          {isItemInTrash ? (
            <AlertTriangle className="w-6 h-6 text-[#E57373]" />
          ) : (
            <Trash2 className="w-6 h-6 text-[#DA7756]" />
          )}
        </div>

        <h3 className="text-lg font-semibold text-[#2D2D2D] dark:text-[#E8E6E3] mb-2">
          {getTitle()}
        </h3>

        <p className="text-sm text-[#6B6B6B] dark:text-[#B5AFA6] mb-6">
          {getWarningMessage()}
        </p>

        <div className="flex justify-center gap-3">
          <Button variant="secondary" onClick={closeDeleteConfirm}>
            Cancel
          </Button>
          <Button
            variant={isItemInTrash ? "danger" : "primary"}
            onClick={handleDelete}
            isLoading={isDeleting}
          >
            {getButtonText()}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
