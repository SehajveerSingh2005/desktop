// Zen Notes - Enhanced Editor with Tiptap Integration
class ZenNoteEditor {
  constructor() {
    this.titleInput = null;
    this.editorElement = null;
    this.toolbar = null;
    this.tiptapEditor = null;
    this.isChanged = false;
    this.autoSaveTimer = null;
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
      console.error('[ZenNoteEditor] Tiptap bundle not found - cannot proceed without it');
      // REMOVED: fallbackToContenteditable() call that was causing conflicts
    }
  }

  initializeTiptapEditor() {
    try {
      this.tiptapEditor = window.ZenTiptap.createEditor(this.editorElement, {
        content: '<p></p>', // CRITICAL FIX: Start with proper paragraph structure
        onUpdate: ({ editor }) => {
          this.markAsChanged();
          this.debouncedAutoSave();
        },
        onSelectionUpdate: ({ editor }) => {
          this.updateToolbarState();
          // Handle slash detection on selection/content changes
          this.handleSlashDetection();
        },
        // Enhanced options to fix cursor and backspace issues
        editable: true,
        injectCSS: false,
        enableInputRules: true,
        enablePasteRules: true,
        // CRITICAL FIX: Use TipTap's proper event handling instead of DOM listeners
        editorProps: {
          handleKeyDown: (view, event) => {
            // REMOVED: Enter override - let TipTap handle Enter naturally for better compatibility
            
            if (event.key === 'Backspace') {
              const { from, to } = view.state.selection;
              const doc = view.state.doc;
              
              console.warn('[BACKSPACE DEBUG]', {
                from, to, 
                docSize: doc.content.size,
                isEmpty: doc.content.size <= 2,
                cursorAtStart: from <= 1
              });
              
              // NUCLEAR OPTION: Always handle backspace manually in Firefox extension context
              if (from === to && from > 0 && doc.content.size > 1) {
                event.preventDefault();
                event.stopPropagation();
                
                // Always use TipTap's deleteRange instead of browser default
                this.tiptapEditor.commands.deleteRange({ from: from - 1, to: from });
                this.tiptapEditor.commands.focus();
                
                console.warn('[BACKSPACE FIX] Manual backspace at position', from);
                return true;
              }
            }
            return this.handleTipTapKeyDown(view, event);
          }
        }
      });
      
      console.log('[ZenNoteEditor] Tiptap editor initialized successfully');
      
      // REMOVED: DOM event listener slash detection - now handled via editorProps
      
      // Focus the editor with proper cursor positioning
      setTimeout(() => {
        this.tiptapEditor.commands.focus('end');
      }, 100);
      
      // Set up auto-scroll to keep cursor near center
      this.setupAutoScroll();
      
      // REMOVED: Click handler was interfering with normal editing
      
    } catch (error) {
      console.error('[ZenNoteEditor] Failed to initialize Tiptap:', error);
      // REMOVED: fallbackToContenteditable() call that was causing conflicts
      throw error; // Re-throw to prevent partial initialization
    }
  }

  // REMOVED: Old contenteditable fallback that was causing conflicts
  // fallbackToContenteditable() {
  //   console.log('[ZenNoteEditor] Using contenteditable fallback');
  //   
  //   // Make the editor element contenteditable
  //   this.editorElement.contentEditable = true;
  //   this.editorElement.focus();
  //   
  //   // Add basic contenteditable event listeners
  //   this.editorElement.addEventListener('input', () => {
  //     this.markAsChanged();
  //     this.debouncedAutoSave();
  //   });
  //   
  //   this.editorElement.addEventListener('keydown', (e) => {
  //     this.handleContenteditableKeydown(e);
  //   });
  // }

  // REMOVED: Old contenteditable keydown handler that was interfering
  // handleContenteditableKeydown(event) {
  //   // Basic markdown shortcuts for contenteditable
  //   if (event.key === ' ' && event.target.textContent) {
  //     const text = event.target.textContent;
  //     
  //     if (text.startsWith('#')) {
  //       event.preventDefault();
  //       event.target.innerHTML = `<h1>${text.substring(1).trim()}</h1>`;
  //       this.markAsChanged();
  //     } else if (text.startsWith('##')) {
  //       event.preventDefault();
  //       event.target.innerHTML = `<h2>${text.substring(2).trim()}</h2>`;
  //       this.markAsChanged();
  //     } else if (text.startsWith('-') || text.startsWith('*')) {
  //       event.preventDefault();
  //       event.target.innerHTML = `<ul><li>${text.substring(1).trim()}</li></ul>`;
  //       this.markAsChanged();
  //     }
  //   }
  // }

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
    if (!this.tiptapEditor) {
      console.warn('[ZenNoteEditor] Tiptap editor not available');
      return;
    }
    
    // Use Tiptap commands only
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
      case 'heading3':
        this.tiptapEditor.chain().focus().toggleHeading({ level: 3 }).run();
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
      case 'heading3':
        return this.tiptapEditor.isActive('heading', { level: 3 });
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
    this.showSavingStatus();
  }

  // Autosave with debouncing
  debouncedAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    // Increased delay to reduce interference with typing
    this.autoSaveTimer = setTimeout(() => {
      this.performAutoSave();
    }, 2000); // Increased from 5s to 8s
  }

  async performAutoSave() {
    // Only save if editor is stable (not in middle of command execution)
    if (!this.tiptapEditor || this.tiptapEditor.isDestroyed) return;
    
    const currentContent = this.tiptapEditor.getHTML();
    const currentTitle = this.titleInput.value.trim();

    // Only save if content has actually changed
    if (currentContent !== this.lastSavedContent || currentTitle !== this.lastSavedTitle) {
      try {
        console.log('[ZenNoteEditor] Auto-saving...', {
          contentLength: currentContent.length,
          title: currentTitle,
          timestamp: new Date().toISOString()
        });
        
        await this.saveNote();
        this.lastSavedContent = currentContent;
        this.lastSavedTitle = currentTitle;
        this.isChanged = false;
        this.showSavedStatus(); // Show green "Saved" indicator
        console.log('[ZenNoteEditor] Auto-saved successfully');
      } catch (error) {
        console.error('[ZenNoteEditor] Auto-save failed:', error);
      }
    }
  }

  async saveNote() {
    if (!this.tiptapEditor) {
      console.warn('[ZenNoteEditor] Cannot save - Tiptap editor not available');
      return null;
    }
    
    const noteData = {
      title: this.titleInput.value.trim(),
      content: this.tiptapEditor.getHTML(),
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
    }
    // REMOVED: contenteditable fallback that was causing conflicts
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
    
    // REMOVED: setupSlashMenuKeyboard() call - keyboard handling moved to TipTap's event system
    
    // Hide slash menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!slashMenu?.contains(e.target) && !this.editorElement.contains(e.target)) {
        this.hideSlashMenu();
      }
    });
    
    // REMOVED: Conflicting fallback slash detection
    // REMOVED: Multiple keydown handlers
  }

  // REMOVED: setupSlashMenuKeyboard() - all keyboard handling moved to handleTipTapKeyDown()
  // This was causing event conflicts with TipTap's internal event handling

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
      
      // Smart positioning to stay in viewport
      slashMenu.style.position = 'fixed';
      slashMenu.style.visibility = 'hidden'; // Hide while positioning
      slashMenu.style.left = `${cursorPos.left}px`;
      slashMenu.style.top = `${cursorPos.top + 5}px`;
      
      // Force layout to get accurate dimensions
      const menuRect = slashMenu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 10;
      
      // Smart horizontal positioning
      let finalLeft = cursorPos.left;
      if (finalLeft + menuRect.width > viewportWidth - margin) {
        finalLeft = viewportWidth - menuRect.width - margin;
      }
      if (finalLeft < margin) {
        finalLeft = margin;
      }
      
      // Smart vertical positioning - prefer below cursor, but go above if needed
      let finalTop = cursorPos.top + 5;
      const spaceBelow = viewportHeight - cursorPos.top;
      const spaceAbove = cursorPos.top;
      
      if (menuRect.height > spaceBelow - margin && spaceAbove > spaceBelow) {
        // Show above cursor if more space there
        finalTop = cursorPos.top - menuRect.height - 5;
      }
      
      // Ensure it doesn't go off top/bottom
      if (finalTop < margin) {
        finalTop = margin;
      } else if (finalTop + menuRect.height > viewportHeight - margin) {
        finalTop = viewportHeight - menuRect.height - margin;
      }
      
      // Apply final position
      slashMenu.style.left = `${finalLeft}px`;
      slashMenu.style.top = `${finalTop}px`;
      slashMenu.style.visibility = 'visible'; // Show after positioning
      
      // Select first item by default
      this.selectFirstSlashMenuItem();
    }
  }

  selectFirstSlashMenuItem() {
    const slashMenu = document.getElementById('slash-menu');
    if (!slashMenu) return;
    
    const items = slashMenu.querySelectorAll('.slash-item');
    if (items.length > 0) {
      // CRITICAL FIX: Clear ALL selections first
      items.forEach(item => item.classList.remove('selected'));
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
      // Delete the '/' and any filter text before executing command
      const { state } = this.tiptapEditor;
      const { from } = state.selection;
      const text = this.getTextBeforeCursor();
      const lastSlashIndex = text.lastIndexOf('/');
      
      if (lastSlashIndex !== -1) {
        const $from = state.selection.$from;
        const blockStart = $from.start();
        const deleteFrom = blockStart + lastSlashIndex;
        this.tiptapEditor.commands.deleteRange({ from: deleteFrom, to: from });
      }
      
      // Execute the command
      this.executeCommand(command);
      
      // Hide the menu
      this.hideSlashMenu();
      
      // Ensure proper cursor state
      this.tiptapEditor.commands.focus();
    }
  }

  // REMOVED: Complex ensureEditorState logic that was causing cursor issues
  // Tiptap handles cursor state naturally

  // CRITICAL FIX: Proper TipTap event handling (no DOM listeners!)
  handleTipTapKeyDown(view, event) {
    // Handle slash menu navigation if visible
    if (this.isSlashMenuVisible()) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.navigateSlashMenu(1);
        return true; // Prevent TipTap from handling
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.navigateSlashMenu(-1);
        return true; // Prevent TipTap from handling
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.executeSelectedSlashCommand();
        return true; // Prevent TipTap from handling
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.hideSlashMenu();
        return true; // Prevent TipTap from handling
      }
    }
    
    // Let TipTap handle ALL other keys naturally (including backspace!)
    // This is the key fix - no interference with TipTap's event handling
    return false;
  }
  
  getTextBeforeCursor() {
    if (!this.tiptapEditor) return '';
    
    const { state } = this.tiptapEditor;
    const { from } = state.selection;
    const $from = state.selection.$from;
    const blockStart = $from.start();
    
    return state.doc.textBetween(blockStart, from, '\0', '\0');
  }
  
  handleSlashDetection() {
    if (!this.tiptapEditor) return;
    
    const { from } = this.tiptapEditor.state.selection;
    const text = this.getTextBeforeCursor();
    const lastSlashIndex = text.lastIndexOf('/');
    
    if (lastSlashIndex !== -1) {
      // Show slash menu with filter text
      const filterText = text.substring(lastSlashIndex + 1);
      this.showSlashMenu(from, filterText);
    } else if (this.isSlashMenuVisible()) {
      // Hide slash menu if no slash found
      this.hideSlashMenu();
    }
  }

  // REMOVED: setupClickToFocus() - was interfering with normal text editing

  // Notion-like status indicators
  showSavingStatus() {
    const savingIndicator = document.getElementById('autosave-indicator');
    const savedIndicator = document.getElementById('saved-indicator');
    
    if (savingIndicator && savedIndicator) {
      savingIndicator.classList.remove('hidden');
      savedIndicator.classList.add('hidden');
    }
  }

  showSavedStatus() {
    const savingIndicator = document.getElementById('autosave-indicator');
    const savedIndicator = document.getElementById('saved-indicator');
    
    if (savingIndicator && savedIndicator) {
      savingIndicator.classList.add('hidden');
      savedIndicator.classList.remove('hidden');
      
      // Hide saved indicator after 3 seconds
      setTimeout(() => {
        savedIndicator.classList.add('hidden');
      }, 3000);
    }
  }

  // Auto-scroll to keep cursor near center (Notion-like behavior)
  setupAutoScroll() {
    if (!this.tiptapEditor) return;
    
    // Listen for cursor position changes
    this.tiptapEditor.on('selectionUpdate', ({ editor }) => {
      this.autoScrollToCursor();
    });
  }
  
  autoScrollToCursor() {
    if (!this.tiptapEditor) return;
    
    const { state } = this.tiptapEditor;
    const { from } = state.selection;
    
    // Get the DOM node at the cursor position
    const dom = this.tiptapEditor.view.dom;
    const coords = this.tiptapEditor.view.coordsAtPos(from);
    
    if (!coords) return;
    
    const viewportHeight = window.innerHeight;
    const viewportCenter = viewportHeight / 2;
    
    // Calculate the cursor position relative to the viewport
    const cursorTop = coords.top;
    const targetScrollTop = cursorTop - viewportCenter;
    
    // Get current scroll position
    const currentScrollTop = window.pageYOffset;
    
    // Only scroll if cursor is too close to edges (within 150px)
    const edgeThreshold = 150;
    const isNearTop = cursorTop < edgeThreshold;
    const isNearBottom = cursorTop > viewportHeight - edgeThreshold;
    
    if (isNearTop || isNearBottom) {
      // Calculate new scroll position
      const newScrollTop = currentScrollTop + targetScrollTop;
      
      // Always use window.scrollTo for better compatibility
      window.scrollTo({
        top: newScrollTop,
        behavior: 'smooth'
      });
      
      console.log('[AUTO-SCROLL] Scrolling to center cursor:', {
        cursorTop,
        viewportCenter,
        targetScrollTop,
        newScrollTop,
        currentScrollTop,
        isNearTop,
        isNearBottom
      });
    }
  }

  // REMOVED: Multiple conflicting event handlers that were causing bugs
  // REMOVED: Custom backspace handler - Tiptap handles backspace naturally
  // REMOVED: Complex cursor positioning logic that interfered with typing
}

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('[ZenNoteEditor] DOM loaded, initializing...');
  const editor = new ZenNoteEditor();
  editor.init();
});