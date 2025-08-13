// Zen Notes - Enhanced Editor with Tiptap Integration
class ZenNoteEditor {
  constructor() {
    this.titleInput = null;
    this.editorElement = null;
    this.toolbar = null;
    this.tiptapEditor = null;
    this.isChanged = false;
    this.autoSaveTimer = null;
    this.autoSaveDelay = 5000; // CRITICAL FIX: Increased to 5 seconds to reduce interference
    this.lastSavedContent = '';
    this.lastSavedTitle = '';
  }

  async init() {
    console.log('[ZenNoteEditor] Initializing...');

    this.titleInput = document.getElementById('note-title');
    this.editorElement = document.getElementById('tiptap-editor');
    this.toolbar = document.getElementById('note-toolbar');
    
    if (!this.titleInput || !this.editorElement || !this.toolbar) {
      console.error('[ZenNoteEditor] Required elements not found');
      return;
    }

    // Setup event listeners
    this.setupEventListeners();
    
    // Initialize Tiptap editor
    await this.initializeTiptap();
    
    // Load existing note data
    this.loadNoteData();
    
    // Setup slash menu
    this.setupSlashMenu();
    
    console.log('[ZenNoteEditor] Initialized successfully');
  }

  async initializeTiptap() {
    // Wait for Tiptap bundle to load
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    
    while (!window.ZenTiptap && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (window.ZenTiptap) {
      console.log('[ZenNoteEditor] Tiptap bundle found, initializing editor...');
      this.initializeTiptapEditor();
    } else {
      console.warn('[ZenNoteEditor] Tiptap bundle not found, falling back to contenteditable');
      this.fallbackToContenteditable();
    }
  }

  initializeTiptapEditor() {
    try {
      this.tiptapEditor = window.ZenTiptap.createEditor(this.editorElement, {
        content: '',
        onUpdate: ({ editor }) => {
          this.markAsChanged();
          this.debouncedAutoSave();
        },
        onSelectionUpdate: ({ editor }) => {
          this.updateToolbarState();
        },
        // Enhanced options to fix cursor and backspace issues
        editable: true,
        injectCSS: false,
        parseOptions: {
          preserveWhitespace: 'full',
        },
        // Fix backspace behavior
        enableInputRules: true,
        enablePasteRules: true,
        // CRITICAL FIX: Use Tiptap's keymap for slash detection and debugging
        onKeyDown: ({ event }) => {
          if (event.key === '/') {
            console.log('[ZenNoteEditor] Slash detected via Tiptap onKeyDown');
            this.showSlashMenu();
            return true; // Prevent default behavior
          }
          if (event.key === 'Backspace') {
            console.log('[ZenNoteEditor] Backspace detected via Tiptap onKeyDown');
          }
          return false; // Let Tiptap handle other keys
        },
      });
      
      console.log('[ZenNoteEditor] Tiptap editor initialized successfully');
      
      // CRITICAL FIX: Add slash detection after editor is ready
      this.setupTiptapSlashDetection();
      
      // Focus the editor with proper cursor positioning
      setTimeout(() => {
        this.tiptapEditor.commands.focus('end');
      }, 100);
      
    } catch (error) {
      console.error('[ZenNoteEditor] Failed to initialize Tiptap:', error);
      this.fallbackToContenteditable();
    }
  }

  fallbackToContenteditable() {
    console.log('[ZenNoteEditor] Using contenteditable fallback');
    
    // Make the editor element contenteditable
    this.editorElement.contentEditable = true;
    this.editorElement.focus();
    
    // Add basic contenteditable event listeners
    this.editorElement.addEventListener('input', () => {
      this.markAsChanged();
      this.debouncedAutoSave();
    });
    
    this.editorElement.addEventListener('keydown', (e) => {
      this.handleContenteditableKeydown(e);
    });
  }

  handleContenteditableKeydown(event) {
    // Basic markdown shortcuts for contenteditable
    if (event.key === ' ' && event.target.textContent) {
      const text = event.target.textContent;
      
      if (text.startsWith('#')) {
        event.preventDefault();
        event.target.innerHTML = `<h1>${text.substring(1).trim()}</h1>`;
        this.markAsChanged();
      } else if (text.startsWith('##')) {
        event.preventDefault();
        event.target.innerHTML = `<h2>${text.substring(2).trim()}</h2>`;
        this.markAsChanged();
      } else if (text.startsWith('-') || text.startsWith('*')) {
        event.preventDefault();
        event.target.innerHTML = `<ul><li>${text.substring(1).trim()}</li></ul>`;
        this.markAsChanged();
      }
    }
  }

  setupEventListeners() {
    // Title input events
    this.titleInput.addEventListener('input', (e) => this.handleTitleChange(e));
    
    // Toolbar button events
    this.toolbar.addEventListener('click', (e) => this.handleToolbarClick(e));
    
    // Before unload warning
    window.addEventListener('beforeunload', (e) => this.handleBeforeUnload(e));
  }

  handleTitleChange(event) {
    this.markAsChanged();
    this.updateTabTitle();
    this.debouncedAutoSave();
  }

  handleToolbarClick(event) {
    const button = event.target.closest('.toolbar-btn');
    if (!button) return;

    const command = button.dataset.command;
    if (command) {
      this.executeCommand(command);
      this.markAsChanged();
    }
  }

  executeCommand(command) {
    if (this.tiptapEditor) {
      // Use Tiptap commands
      switch (command) {
        case 'bold':
          this.tiptapEditor.chain().focus().toggleBold().run();
          break;
        case 'italic':
          this.tiptapEditor.chain().focus().toggleItalic().run();
          break;
        case 'underline':
          this.tiptapEditor.chain().focus().toggleUnderline().run();
          break;
        case 'heading1':
          this.tiptapEditor.chain().focus().toggleHeading({ level: 1 }).run();
          break;
        case 'heading2':
          this.tiptapEditor.chain().focus().toggleHeading({ level: 2 }).run();
          break;
        case 'bulletList':
          this.tiptapEditor.chain().focus().toggleBulletList().run();
          break;
        case 'orderedList':
          this.tiptapEditor.chain().focus().toggleOrderedList().run();
          break;
        case 'blockquote':
          this.tiptapEditor.chain().focus().toggleBlockquote().run();
          break;
        case 'codeBlock':
          this.tiptapEditor.chain().focus().toggleCodeBlock().run();
          break;
      }
    } else {
      // Use contenteditable commands
      document.execCommand(command, false, null);
    }
    
    this.updateToolbarState();
  }

  updateToolbarState() {
    if (!this.tiptapEditor) return;
    
    const buttons = this.toolbar.querySelectorAll('.toolbar-btn[data-command]');
    buttons.forEach(button => {
      const command = button.dataset.command;
      if (command) {
        const isActive = this.isTiptapCommandActive(command);
        button.classList.toggle('active', isActive);
      }
    });
  }

  isTiptapCommandActive(command) {
    if (!this.tiptapEditor) return false;
    
    switch (command) {
      case 'bold':
        return this.tiptapEditor.isActive('bold');
      case 'italic':
        return this.tiptapEditor.isActive('italic');
      case 'underline':
        return this.tiptapEditor.isActive('underline');
      case 'heading1':
        return this.tiptapEditor.isActive('heading', { level: 1 });
      case 'heading2':
        return this.tiptapEditor.isActive('heading', { level: 2 });
      case 'bulletList':
        return this.tiptapEditor.isActive('bulletList');
      case 'orderedList':
        return this.tiptapEditor.isActive('orderedList');
      case 'blockquote':
        return this.tiptapEditor.isActive('blockquote');
      case 'codeBlock':
        return this.tiptapEditor.isActive('codeBlock');
      default:
        return false;
    }
  }

  markAsChanged() {
    this.isChanged = true;
  }

  // Autosave with debouncing
  debouncedAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      this.performAutoSave();
    }, this.autoSaveDelay);
  }

  async performAutoSave() {
    const currentContent = this.tiptapEditor ? 
      this.tiptapEditor.getHTML() : 
      this.editorElement.innerHTML;
    const currentTitle = this.titleInput.value.trim();

    // Only save if content has actually changed
    if (currentContent !== this.lastSavedContent || currentTitle !== this.lastSavedTitle) {
      try {
        // CRITICAL FIX: Add debug logging to identify auto-save interference
        console.log('[ZenNoteEditor] Auto-saving...', {
          contentLength: currentContent.length,
          title: currentTitle,
          timestamp: new Date().toISOString()
        });
        
        await this.saveNote();
        this.lastSavedContent = currentContent;
        this.lastSavedTitle = currentTitle;
        this.isChanged = false;
        console.log('[ZenNoteEditor] Auto-saved successfully');
      } catch (error) {
        console.error('[ZenNoteEditor] Auto-save failed:', error);
      }
    }
  }

  async saveNote() {
    const noteData = {
      title: this.titleInput.value.trim(),
      content: this.tiptapEditor ? 
        this.tiptapEditor.getHTML() : 
        this.editorElement.innerHTML,
      lastModified: new Date().toISOString(),
      id: this.getNoteId()
    };

    try {
      // Try multiple storage methods for chrome context
      let saved = false;
      
      // Method 1: Try browser.storage.local (WebExtensions API)
      if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        try {
          await browser.storage.local.set({ [`zen-note-${noteData.id}`]: noteData });
          saved = true;
          console.log('[ZenNoteEditor] Saved to browser.storage.local');
        } catch (e) {
          console.warn('[ZenNoteEditor] browser.storage.local failed:', e);
        }
      }
      
      // Method 2: Try localStorage (might work in some contexts)
      if (!saved && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(`zen-note-${noteData.id}`, JSON.stringify(noteData));
          saved = true;
          console.log('[ZenNoteEditor] Saved to localStorage');
        } catch (e) {
          console.warn('[ZenNoteEditor] localStorage failed:', e);
        }
      }
      
      // Method 3: Fallback to memory storage
      if (!saved) {
        if (!window.zenNotesStorage) {
          window.zenNotesStorage = new Map();
        }
        window.zenNotesStorage.set(noteData.id, noteData);
        console.log('[ZenNoteEditor] Stored in memory (chrome context limitation)');
        
        // Try to persist to sessionStorage as backup
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(`zen-note-${noteData.id}`, JSON.stringify(noteData));
            console.log('[ZenNoteEditor] Also backed up to sessionStorage');
          }
        } catch (e) {
          console.warn('[ZenNoteEditor] sessionStorage backup failed:', e);
        }
      }
      
      return noteData;
    } catch (error) {
      console.error('[ZenNoteEditor] Save failed:', error);
      // Don't throw, just log the error
      return noteData;
    }
  }

  getNoteId() {
    const title = this.titleInput.value.trim() || 'untitled';
    const timestamp = Date.now();
    return `${title.toLowerCase().replace(/\s+/g, '-')}-${timestamp}`;
  }

  loadNoteData() {
    // For now, just set default values
    this.titleInput.value = '';
    if (this.tiptapEditor) {
      this.tiptapEditor.commands.setContent('');
    } else {
      this.editorElement.innerHTML = '';
    }
    this.isChanged = false;
    this.lastSavedContent = '';
    this.lastSavedTitle = '';
  }

  updateTabTitle() {
    const title = this.titleInput.value.trim();
    if (title) {
      document.title = `${title}`;
    } else {
      document.title = 'New Note';
    }
  }

  handleBeforeUnload(event) {
    if (this.isChanged) {
      event.preventDefault();
      event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return event.returnValue;
    }
  }

  setupSlashMenu() {
    // CRITICAL FIX: Use Tiptap's event system instead of DOM events
    // This prevents conflicts with Tiptap's internal event handling
    
    // Add click listener for slash menu items
    const slashMenu = document.getElementById('slash-menu');
    if (slashMenu) {
      slashMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.slash-item');
        if (item) {
          const command = item.dataset.command;
          this.executeSlashCommand(command);
        }
      });
    }
    
    // Setup keyboard navigation
    this.setupSlashMenuKeyboard();
    
    // Hide slash menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!slashMenu?.contains(e.target) && !this.editorElement.contains(e.target)) {
        this.hideSlashMenu();
      }
    });
    
    // CRITICAL FIX: Add fallback slash detection for when Tiptap events fail
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && this.editorElement.contains(e.target)) {
        console.log('[ZenNoteEditor] Fallback slash detection triggered');
        this.showSlashMenu();
      }
    });
  }

  setupSlashMenuKeyboard() {
    // Handle keyboard navigation in slash menu
    document.addEventListener('keydown', (e) => {
      if (!this.isSlashMenuVisible()) return;
      
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          this.hideSlashMenu();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.navigateSlashMenu(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.navigateSlashMenu(1);
          break;
        case 'Enter':
          e.preventDefault();
          this.executeSelectedSlashCommand();
          break;
      }
    });
  }

  isSlashMenuVisible() {
    const slashMenu = document.getElementById('slash-menu');
    return slashMenu && slashMenu.classList.contains('visible');
  }

  navigateSlashMenu(direction) {
    const slashMenu = document.getElementById('slash-menu');
    if (!slashMenu) return;
    
    const items = slashMenu.querySelectorAll('.slash-item');
    if (items.length === 0) return;
    
    // Find currently selected item
    let currentIndex = -1;
    items.forEach((item, index) => {
      if (item.classList.contains('selected')) {
        currentIndex = index;
      }
    });
    
    // Remove current selection
    items.forEach(item => item.classList.remove('selected'));
    
    // Calculate new index
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = items.length - 1;
    if (newIndex >= items.length) newIndex = 0;
    
    // Select new item
    items[newIndex].classList.add('selected');
  }

  executeSelectedSlashCommand() {
    const slashMenu = document.getElementById('slash-menu');
    if (!slashMenu) return;
    
    const selectedItem = slashMenu.querySelector('.slash-item.selected');
    if (selectedItem) {
      const command = selectedItem.dataset.command;
      this.executeSlashCommand(command);
    }
  }

  showSlashMenu() {
    const slashMenu = document.getElementById('slash-menu');
    if (slashMenu) {
      slashMenu.classList.add('visible');
      
      // CRITICAL FIX: Use Tiptap's cursor position instead of DOM selection
      // This fixes the first line positioning issue
      let cursorPos = { left: 20, top: 100 }; // Default fallback
      
      if (this.tiptapEditor && this.tiptapEditor.view) {
        try {
          // Get cursor position from Tiptap's view
          const { from } = this.tiptapEditor.state.selection;
          const coords = this.tiptapEditor.view.coordsAtPos(from);
          
          if (coords) {
            cursorPos = {
              left: coords.left,
              top: coords.bottom
            };
          }
        } catch (e) {
          console.warn('[ZenNoteEditor] Could not get Tiptap cursor position:', e);
        }
      }
      
      // Position absolutely on the page
      slashMenu.style.position = 'fixed';
      slashMenu.style.left = `${cursorPos.left}px`;
      slashMenu.style.top = `${cursorPos.top + 5}px`;
      
      // Ensure menu doesn't go off-screen
      const menuRect = slashMenu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Adjust horizontal position if menu goes off-screen
      if (cursorPos.left + menuRect.width > viewportWidth) {
        slashMenu.style.left = `${viewportWidth - menuRect.width - 10}px`;
      }
      
      // Adjust vertical position if menu goes off-screen
      if (cursorPos.top + menuRect.height > viewportHeight) {
        slashMenu.style.top = `${cursorPos.top - menuRect.height - 5}px`;
      }
      
      // Select first item by default
      this.selectFirstSlashMenuItem();
    }
  }

  selectFirstSlashMenuItem() {
    const slashMenu = document.getElementById('slash-menu');
    if (!slashMenu) return;
    
    const items = slashMenu.querySelectorAll('.slash-item');
    if (items.length > 0) {
      items[0].classList.add('selected');
    }
  }

  hideSlashMenu() {
    const slashMenu = document.getElementById('slash-menu');
    if (!slashMenu) return;
    
    slashMenu.classList.remove('visible');
    
    // Remove all selections
    const items = slashMenu.querySelectorAll('.slash-item');
    items.forEach(item => item.classList.remove('selected'));
  }

  executeSlashCommand(command) {
    if (this.tiptapEditor) {
      // Delete the slash character first
      const { from, to } = this.tiptapEditor.state.selection;
      
      // Find the start of the current line
      let lineStart = from;
      const text = this.tiptapEditor.state.doc.textBetween(0, from);
      
      // Walk backwards to find the start of the current line
      while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--;
      }
      
      // Check if the line starts with a slash
      const lineText = this.tiptapEditor.state.doc.textBetween(lineStart, from);
      if (lineText.startsWith('/')) {
        // Delete from the slash to the cursor position
        this.tiptapEditor.commands.deleteRange({ 
          from: lineStart, 
          to: from 
        });
      } else {
        // If no slash found, just delete the character before cursor
        this.tiptapEditor.commands.deleteRange({ 
          from: from - 1, 
          to: from 
        });
      }
      
      // Execute the command
      this.executeCommand(command);
      
      // Hide the menu
      this.hideSlashMenu();
      
      // Ensure cursor is properly positioned and editor is editable
      setTimeout(() => {
        this.ensureEditorState(this.tiptapEditor);
        
        // For headings, insert a space after the heading to make backspace work naturally
        if (command === 'heading1' || command === 'heading2') {
          this.tiptapEditor.commands.insertContent(' ');
          this.tiptapEditor.commands.focus('end');
        } else {
          // For other commands, just focus at start
          this.tiptapEditor.commands.focus('start');
        }
      }, 10);
    }
  }

  // Ensure editor is in proper state for editing
  ensureEditorState(editor) {
    // Force editor to be editable
    editor.setEditable(true);
    
    // Ensure cursor is visible
    if (!editor.state.selection.empty) {
      editor.commands.focus();
    } else {
      // If no selection, create a proper cursor position
      const { from } = editor.state.selection;
      if (from > 0) {
        editor.commands.setTextSelection(from);
      } else {
        editor.commands.focus('start');
      }
    }
  }

  // CRITICAL FIX: Setup slash detection using Tiptap's event system
  setupTiptapSlashDetection() {
    if (!this.tiptapEditor || !this.tiptapEditor.view) return;
    
    // Use Tiptap's DOM event system for slash detection
    this.tiptapEditor.view.dom.addEventListener('keydown', (event) => {
      if (event.key === '/') {
        console.log('[ZenNoteEditor] Slash detected via Tiptap DOM');
        this.showSlashMenu();
        event.preventDefault();
        event.stopPropagation();
      }
    });
    
    console.log('[ZenNoteEditor] Tiptap slash detection setup complete');
  }

  // REMOVED custom backspace handler - Tiptap handles backspace naturally
  // This fixes the global first character deletion issue
}

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('[ZenNoteEditor] DOM loaded, initializing...');
  const editor = new ZenNoteEditor();
  editor.init();
});