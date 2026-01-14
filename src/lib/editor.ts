import { Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';

export const getEditorExtensions = (placeholder?: string): Extensions => [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
    bulletList: {
      keepMarks: true,
      keepAttributes: false,
    },
    orderedList: {
      keepMarks: true,
      keepAttributes: false,
    },
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: 'text-blue-500 hover:text-blue-600 underline cursor-pointer',
    },
  }),
  TaskList.configure({
    HTMLAttributes: {
      class: 'not-prose',
    },
  }),
  TaskItem.configure({
    nested: true,
    HTMLAttributes: {
      class: 'flex items-start gap-2',
    },
  }),
  Placeholder.configure({
    placeholder: placeholder || 'Start writing...',
    emptyEditorClass: 'is-editor-empty',
  }),
];

export const getPlainText = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};
