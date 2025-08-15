// Tiptap Bundle Entry Point
// This file imports Tiptap modules and exposes them globally

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';

// Expose Tiptap globally for use in the browser
window.ZenTiptap = {
  Core: { Editor },
  StarterKit,
  Underline,
  Link,
  
  createEditor: (element, options = {}) => {
    return new Editor({
      element,
      extensions: [
        StarterKit.configure({
          underline: false,
          link: false,
          // Keep default history for now
        }),
        Underline,
        Link,
      ],
      content: options.content || '',
      onUpdate: options.onUpdate,
      onSelectionUpdate: options.onSelectionUpdate,
      ...options,
    });
  },
};

console.log('[TiptapBundle] Tiptap loaded and exposed globally as window.ZenTiptap');
