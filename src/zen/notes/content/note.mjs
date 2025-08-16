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
      await this.initializeTiptapEditor();
    } else {
      console.error('[ZenNoteEditor] Tiptap bundle not found - cannot proceed without it');
    }
  }

  async initializeTiptapEditor() {
    try {
      this.tiptapEditor = window.ZenTiptap.createEditor(this.editorElement, {
        content: '<p></p>',
        onUpdate: ({ editor }) => {
          this.markAsChanged();
          this.debouncedAutoSave();
        },
        onSelectionUpdate: ({ editor }) => {
          this.updateToolbarState();
          this.handleSlashDetection();
        },
        editable: true,
        injectCSS: false,
        enableInputRules: true,
        enablePasteRules: true,
        editorProps: {
          handleKeyDown: (view, event) => {
            if (event.key === 'Backspace') {
              const { from, to } = view.state.selection;
              const doc = view.state.doc;
              
              if (from === to && from > 0 && doc.content.size > 1) {
                event.preventDefault();
                event.stopPropagation();
                
                this.tiptapEditor.commands.deleteRange({ from: from - 1, to: from });
                this.tiptapEditor.commands.focus();
                
                return true;
              }
            }
            return this.handleTipTapKeyDown(view, event);
          }
        }
      });
      
      console.log('[ZenNoteEditor] Tiptap editor initialized successfully');
      
      setTimeout(() => {
        if (this.tiptapEditor && this.tiptapEditor.commands) {
          this.tiptapEditor.commands.focus('end');
        }
      }, 100);
      
      this.setupAutoScroll();
      
      // Check storage health first
      await this.checkStorageHealth();
      
      // Load any saved note data after editor is ready
      this.loadSavedNote();
      
    } catch (error) {
      console.error('[ZenNoteEditor] Failed to initialize Tiptap:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Title input events
    this.titleInput.addEventListener('input', (e) => this.handleTitleChange(e));
    
    // Toolbar button events
    this.toolbar.addEventListener('click', (e) => this.handleToolbarClick(e));
    
    // New board button event
    const newBoardBtn = document.getElementById('new-board-btn');
    if (newBoardBtn) {
      newBoardBtn.addEventListener('click', (e) => this.handleNewBoard(e));
    }
    
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

  handleNewBoard(event) {
    event.preventDefault();
    
    // Save current note before switching
    if (this.isChanged) {
      this.performAutoSave();
    }
    
    // Switch to canvas mode
    this.switchToCanvas();
  }

  switchToCanvas() {
    try {
      // Use the EXACT same URL pattern that works for notes
      const canvasUrl = 'chrome://browser/content/zen-notes/canvas.xhtml';
      
      // Use the same pattern that works for notes
      if (typeof window !== 'undefined' && window.gBrowser) {
        let triggeringPrincipal;
        try {
          triggeringPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
        } catch (e) {
          triggeringPrincipal = null;
        }
        
        const newTab = window.gBrowser.addTab(canvasUrl, {
          triggeringPrincipal: triggeringPrincipal
        });
        
        window.gBrowser.selectedTab = newTab;
        console.log('[ZenNoteEditor] Canvas tab opened:', canvasUrl);
      } else {
        // Fallback for other contexts
        window.open(canvasUrl, '_blank');
      }
      
      console.log('[ZenNoteEditor] Switching to canvas mode');
    } catch (error) {
      console.error('[ZenNoteEditor] Failed to switch to canvas:', error);
      // Fallback: try to navigate directly
      window.location.href = 'chrome://browser/content/zen-notes/canvas.xhtml';
    }
  }

  executeCommand(command) {
    if (!this.tiptapEditor || !this.tiptapEditor.commands) {
      console.warn('[ZenNoteEditor] Tiptap editor not available');
      return;
    }
    
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
    if (!this.tiptapEditor || !this.tiptapEditor.commands) return;
    
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
    if (!this.tiptapEditor || !this.tiptapEditor.commands) return false;
    
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

  debouncedAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      this.performAutoSave();
    }, 2000);
  }

  async performAutoSave() {
    if (!this.tiptapEditor || !this.tiptapEditor.commands || this.tiptapEditor.isDestroyed) return;
    
    const currentContent = this.tiptapEditor.getHTML();
    const currentTitle = this.titleInput.value.trim();

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
        this.showSavedStatus();
        console.log('[ZenNoteEditor] Auto-saved successfully');
      } catch (error) {
        console.error('[ZenNoteEditor] Auto-save failed:', error);
      }
    }
  }

  async saveNote() {
    if (!this.tiptapEditor || !this.tiptapEditor.commands) {
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
      console.log('[ZenNoteEditor] Saving note:', { id: noteData.id, title: noteData.title, contentLength: noteData.content.length });
      
      // PRIMARY: Save to IndexedDB (most reliable browser storage)
      let savedToIndexedDB = false;
      try {
        savedToIndexedDB = await this.saveToIndexedDB(noteData);
        if (savedToIndexedDB) {
          console.log('[ZenNoteEditor] ✅ Successfully saved to IndexedDB');
        }
      } catch (e) {
        console.warn('[ZenNoteEditor] IndexedDB save failed:', e.message);
      }
      
      // SECONDARY: Always save to memory storage (session backup)
      this.saveToMemoryStorage(noteData);
      
      // TERTIARY: Try other storage methods if IndexedDB failed
      if (!savedToIndexedDB) {
        console.log('[ZenNoteEditor] IndexedDB failed, trying alternative storage...');
        
        // Try browser.storage.local if available
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
          try {
            await this.saveToBrowserStorage(noteData);
            console.log('[ZenNoteEditor] ✅ Saved to browser.storage.local as backup');
          } catch (e) {
            console.warn('[ZenNoteEditor] browser.storage.local backup failed:', e.message);
          }
        }
        
        // Try localStorage as backup
        try {
          this.saveToLocalStorage(noteData);
          console.log('[ZenNoteEditor] ✅ Saved to localStorage as backup');
        } catch (e) {
          console.warn('[ZenNoteEditor] localStorage backup failed:', e.message);
        }
        
        // Try sessionStorage as additional backup
        try {
          this.saveToSessionStorage(noteData);
          console.log('[ZenNoteEditor] ✅ Saved to sessionStorage as backup');
        } catch (e) {
          console.warn('[ZenNoteEditor] sessionStorage backup failed:', e.message);
        }
        
        // LAST RESORT: Save to file (guaranteed to work)
        try {
          await this.saveToFileStorage(noteData);
          console.log('[ZenNoteEditor] ✅ Saved to file as last resort');
        } catch (e) {
          console.warn('[ZenNoteEditor] File save failed:', e.message);
        }
      }
      
      if (savedToIndexedDB) {
        console.log('[ZenNoteEditor] Note saved successfully to persistent storage');
      } else {
        console.warn('[ZenNoteEditor] Note saved to memory only - will not persist across restarts');
      }
      
      return noteData;
    } catch (error) {
      console.error('[ZenNoteEditor] Save failed completely:', error);
      // Even if everything fails, save to memory as last resort
      this.saveToMemoryStorage(noteData);
      return noteData;
    }
  }
  
  // Save to browser.storage.local (Firefox extension API)
  async saveToBrowserStorage(noteData) {
    try {
      await browser.storage.local.set({ [`zen-note-${noteData.id}`]: noteData });
      await browser.storage.local.set({ 'zen-current-note-id': noteData.id });
      console.log('[ZenNoteEditor] Saved to browser.storage.local');
      return true;
    } catch (e) {
      throw e;
    }
  }
  
  // Save to IndexedDB (most reliable browser storage)
  async saveToIndexedDB(noteData) {
    return new Promise((resolve, reject) => {
      try {
        console.log('[ZenNoteEditor] Opening IndexedDB...');
        
        // Always use version 2 to ensure consistency with health check
        const version = 2;
        console.log(`[ZenNoteEditor] Opening IndexedDB with version ${version}...`);
        
        const request = indexedDB.open('ZenNotesDB', version);
        
        request.onerror = () => {
          console.error('[ZenNoteEditor] IndexedDB open failed:', request.error);
          reject(new Error('IndexedDB open failed: ' + request.error.message));
        };
        
        request.onsuccess = (event) => {
          const db = event.target.result;
          console.log('[ZenNoteEditor] IndexedDB opened successfully');
          
          try {
            // Check if the object store exists
            if (!db.objectStoreNames.contains('notes')) {
              console.error('[ZenNoteEditor] Object store "notes" not found in IndexedDB');
              reject(new Error('Object store "notes" not found - database schema issue'));
              return;
            }
            
            const transaction = db.transaction(['notes'], 'readwrite');
            const store = transaction.objectStore('notes');
            
            // Save note data
            const noteRequest = store.put(noteData);
            noteRequest.onsuccess = () => {
              console.log('[ZenNoteEditor] Note data saved to IndexedDB successfully');
              
              // Also save the current note ID for persistence
              const idData = { id: 'zen-current-note-id', value: noteData.id, timestamp: Date.now() };
              const idRequest = store.put(idData);
              idRequest.onsuccess = () => {
                console.log('[ZenNoteEditor] Note ID saved to IndexedDB successfully');
                resolve(true);
              };
              idRequest.onerror = () => {
                console.error('[ZenNoteEditor] Failed to save note ID to IndexedDB:', idRequest.error);
                // Note data was saved, so we consider this a partial success
                resolve(true);
              };
            };
            noteRequest.onerror = () => {
              console.error('[ZenNoteEditor] Failed to save note to IndexedDB:', noteRequest.error);
              reject(new Error('Failed to save note to IndexedDB: ' + noteRequest.error.message));
            };
          } catch (e) {
            console.error('[ZenNoteEditor] IndexedDB transaction error:', e);
            reject(e);
          }
        };
        
        request.onupgradeneeded = (event) => {
          console.log('[ZenNoteEditor] IndexedDB upgrade needed, creating schema...');
          const db = event.target.result;
          
          // Create the notes object store if it doesn't exist
          if (!db.objectStoreNames.contains('notes')) {
            const store = db.createObjectStore('notes', { keyPath: 'id' });
            console.log('[ZenNoteEditor] ✅ Created IndexedDB object store: notes');
          }
        };
        
        request.onblocked = () => {
          console.warn('[ZenNoteEditor] IndexedDB blocked - another tab might have it open');
          reject(new Error('IndexedDB blocked by another tab'));
        };
        
      } catch (e) {
        console.error('[ZenNoteEditor] IndexedDB setup error:', e);
        reject(e);
      }
    });
  }
  
  // Save to localStorage
  saveToLocalStorage(noteData) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`zen-note-${noteData.id}`, JSON.stringify(noteData));
        localStorage.setItem('zen-current-note-id', noteData.id);
        console.log('[ZenNoteEditor] Saved to localStorage');
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    } catch (e) {
      return Promise.reject(e);
    }
  }
  
  // Save to memory storage
  saveToMemoryStorage(noteData) {
    if (!window.zenNotesStorage) {
      window.zenNotesStorage = new Map();
    }
    window.zenNotesStorage.set(noteData.id, noteData);
    window.zenNotesStorage.set('zen-current-note-id', noteData.id);
    console.log('[ZenNoteEditor] Saved to memory storage');
  }
  
  // Save to sessionStorage
  saveToSessionStorage(noteData) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(`zen-note-${noteData.id}`, JSON.stringify(noteData));
        sessionStorage.setItem('zen-current-note-id', noteData.id);
        console.log('[ZenNoteEditor] Saved to sessionStorage');
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    } catch (e) {
      return Promise.reject(e);
    }
  }
  
  // Save to a simple file-based storage (most reliable fallback)
  saveToFileStorage(noteData) {
    try {
      // Create a download link with the note data
      const dataStr = JSON.stringify(noteData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      // Create a unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `zen-note-${noteData.id}-${timestamp}.json`;
      
      // Create download link
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = filename;
      link.style.display = 'none';
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      URL.revokeObjectURL(link.href);
      
      console.log('[ZenNoteEditor] ✅ Saved to file:', filename);
      return Promise.resolve(true);
    } catch (e) {
      console.error('[ZenNoteEditor] File save failed:', e);
      return Promise.resolve(false);
    }
  }

  getNoteId() {
    // Try to get existing ID from memory storage first
    if (window.zenNotesStorage && window.zenNotesStorage.has('zen-current-note-id')) {
      const existingId = window.zenNotesStorage.get('zen-current-note-id');
      if (existingId) {
        console.log('[ZenNoteEditor] Using existing note ID from memory:', existingId);
        return existingId;
      }
    }
    
    // If no existing ID, create a new one based on the title
    const title = this.titleInput.value.trim() || 'untitled';
    const titleHash = this.hashString(title);
    const newId = `note-${titleHash}`;
    
    console.log('[ZenNoteEditor] Generated new note ID:', newId, 'for title:', title);
    
    // Store this ID in memory storage
    if (!window.zenNotesStorage) {
      window.zenNotesStorage = new Map();
    }
    window.zenNotesStorage.set('zen-current-note-id', newId);
    
    return newId;
  }
  
  // Simple hash function to create consistent IDs
  hashString(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36); // Convert to base36 for shorter IDs
  }

  async loadSavedNote() {
    try {
      console.log('[ZenNoteEditor] Loading saved note...');
      let noteData = null;
      let noteId = null;
      
      // PRIMARY: Try to load from IndexedDB first (most reliable)
      try {
        console.log('[ZenNoteEditor] Attempting to load from IndexedDB...');
        noteData = await this.loadFromIndexedDB();
        if (noteData) {
          noteId = noteData.id;
          console.log('[ZenNoteEditor] ✅ Successfully loaded from IndexedDB:', { title: noteData.title, contentLength: noteData.content?.length || 0 });
        }
      } catch (e) {
        console.warn('[ZenNoteEditor] IndexedDB load failed:', e.message);
      }
      
      // SECONDARY: If IndexedDB failed, try browser.storage.local
      if (!noteData && typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        try {
          console.log('[ZenNoteEditor] Attempting to load from browser.storage.local...');
          const idResult = await browser.storage.local.get('zen-current-note-id');
          noteId = idResult['zen-current-note-id'];
          
          if (noteId) {
            const result = await browser.storage.local.get(`zen-note-${noteId}`);
            noteData = result[`zen-note-${noteId}`];
            if (noteData) {
              console.log('[ZenNoteEditor] ✅ Successfully loaded from browser.storage.local');
            }
          }
        } catch (e) {
          console.warn('[ZenNoteEditor] browser.storage.local load failed:', e.message);
        }
      }
      
      // TERTIARY: If still no data, try to find any note by scanning storage
      if (!noteData) {
        console.log('[ZenNoteEditor] No note found by ID, scanning storage for any notes...');
        
        // Try to find any note in IndexedDB
        try {
          const allNotes = await this.getAllNotesFromIndexedDB();
          if (allNotes.length > 0) {
            // Use the most recently modified note
            const mostRecentNote = allNotes.sort((a, b) => 
              new Date(b.lastModified || 0) - new Date(a.lastModified || 0)
            )[0];
            noteData = mostRecentNote;
            noteId = mostRecentNote.id;
            console.log('[ZenNoteEditor] ✅ Found note by scanning IndexedDB:', { title: noteData.title, contentLength: noteData.content?.length || 0 });
          }
        } catch (e) {
          console.warn('[ZenNoteEditor] Failed to scan IndexedDB:', e.message);
        }
        
        // If still no data, try browser.storage.local scan
        if (!noteData && typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
          try {
            const allNotes = await browser.storage.local.get(null);
            for (const [key, value] of Object.entries(allNotes)) {
              if (key.startsWith('zen-note-') && value && value.title) {
                noteId = value.id;
                noteData = value;
                console.log('[ZenNoteEditor] ✅ Found note by scanning browser.storage.local:', { title: value.title, contentLength: value.content?.length || 0 });
                break;
              }
            }
          } catch (e) {
            console.warn('[ZenNoteEditor] Failed to scan browser.storage.local:', e.message);
          }
        }
      }
      
      // FINAL: If we found data, load it and update memory storage
      if (noteData) {
        // Store the note ID for future use
        if (!window.zenNotesStorage) {
          window.zenNotesStorage = new Map();
        }
        window.zenNotesStorage.set('zen-current-note-id', noteId);
        window.zenNotesStorage.set(noteId, noteData);
        
        // Load the saved content
        if (noteData.title) {
          this.titleInput.value = noteData.title;
          this.updateTabTitle();
        }
        
        if (noteData.content && this.tiptapEditor && this.tiptapEditor.commands) {
          this.tiptapEditor.commands.setContent(noteData.content);
        }
        
        // Update saved state
        this.lastSavedContent = noteData.content || '';
        this.lastSavedTitle = noteData.title || '';
        this.isChanged = false;
        
        console.log('[ZenNoteEditor] Note loaded successfully:', {
          title: noteData.title,
          contentLength: noteData.content?.length || 0,
          noteId: noteId,
          source: noteData.source || 'unknown'
        });
      } else {
        console.log('[ZenNoteEditor] No saved note found, starting with empty note');
        this.loadNoteData();
      }
      
    } catch (error) {
      console.error('[ZenNoteEditor] Failed to load saved note:', error);
      this.loadNoteData();
    }
  }

  loadNoteData() {
    this.titleInput.value = '';
    if (this.tiptapEditor && this.tiptapEditor.commands) {
      this.tiptapEditor.commands.setContent('');
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

  setupSlashMenu() {
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
    
    document.addEventListener('click', (e) => {
      if (!slashMenu?.contains(e.target) && !this.editorElement.contains(e.target)) {
        this.hideSlashMenu();
      }
    });
  }

  isSlashMenuVisible() {
    const slashMenu = document.getElementById('slash-menu');
    return slashMenu && slashMenu.classList.contains('visible');
  }

  showSlashMenu() {
    const slashMenu = document.getElementById('slash-menu');
    if (slashMenu) {
      slashMenu.classList.add('visible');
      
      let cursorPos = { left: 20, top: 100 };
      
      if (this.tiptapEditor && this.tiptapEditor.view && this.tiptapEditor.state) {
        try {
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
      
      slashMenu.style.position = 'fixed';
      slashMenu.style.left = `${cursorPos.left}px`;
      slashMenu.style.top = `${cursorPos.top + 5}px`;
    }
  }

  hideSlashMenu() {
    const slashMenu = document.getElementById('slash-menu');
    if (!slashMenu) return;
    
    slashMenu.classList.remove('visible');
    
    const items = slashMenu.querySelectorAll('.slash-item');
    items.forEach(item => item.classList.remove('selected'));
  }

  executeSlashCommand(command) {
    if (this.tiptapEditor && this.tiptapEditor.commands) {
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
      
      this.executeCommand(command);
      this.hideSlashMenu();
      this.tiptapEditor.commands.focus();
    }
  }

  handleTipTapKeyDown(view, event) {
    if (this.isSlashMenuVisible()) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || 
          event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        return true;
      }
    }
    return false;
  }
  
  getTextBeforeCursor() {
    if (!this.tiptapEditor || !this.tiptapEditor.state) return '';
    
    const { state } = this.tiptapEditor;
    const { from } = state.selection;
    const $from = state.selection.$from;
    const blockStart = $from.start();
    
    return state.doc.textBetween(blockStart, from, '\0', '\0');
  }
  
  handleSlashDetection() {
    if (!this.tiptapEditor || !this.tiptapEditor.commands) return;
    
    const { from } = this.tiptapEditor.state.selection;
    const text = this.getTextBeforeCursor();
    const lastSlashIndex = text.lastIndexOf('/');
    
    if (lastSlashIndex !== -1) {
      this.showSlashMenu(from);
    } else if (this.isSlashMenuVisible()) {
      this.hideSlashMenu();
    }
  }

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
      
      setTimeout(() => {
        savedIndicator.classList.add('hidden');
      }, 3000);
    }
  }

  setupAutoScroll() {
    if (!this.tiptapEditor || !this.tiptapEditor.commands) return;
    
    this.tiptapEditor.on('selectionUpdate', ({ editor }) => {
      this.autoScrollToCursor();
    });
  }
  
  autoScrollToCursor() {
    if (!this.tiptapEditor || !this.tiptapEditor.commands) return;
    
    const { state } = this.tiptapEditor;
    const { from } = state.selection;
    
    const coords = this.tiptapEditor.view.coordsAtPos(from);
    if (!coords) return;
    
    const viewportHeight = window.innerHeight;
    const viewportCenter = viewportHeight / 2;
    const cursorTop = coords.top;
    const targetScrollTop = cursorTop - viewportCenter;
    const currentScrollTop = window.pageYOffset;
    
    const edgeThreshold = 150;
    const isNearTop = cursorTop < edgeThreshold;
    const isNearBottom = cursorTop > viewportHeight - edgeThreshold;
    
    if (isNearTop || isNearBottom) {
      const newScrollTop = currentScrollTop + targetScrollTop;
      
      window.scrollTo({
        top: newScrollTop,
        behavior: 'smooth'
      });
    }
  }

  handleBeforeUnload(event) {
    if (this.isChanged) {
      event.preventDefault();
      event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return event.returnValue;
    }
  }
  
  // Check storage health and log what's working
  async checkStorageHealth() {
    console.log('[ZenNoteEditor] Checking storage health...');
    
    const results = {
      browserStorage: false,
      indexedDB: false,
      localStorage: false,
      sessionStorage: false,
      memoryStorage: false
    };
    
    // Check browser.storage.local
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      try {
        console.log('[ZenNoteEditor] Testing browser.storage.local...');
        await browser.storage.local.set({ 'test': 'test' });
        const result = await browser.storage.local.get('test');
        if (result.test === 'test') {
          await browser.storage.local.remove('test');
          results.browserStorage = true;
          console.log('✅ browser.storage.local: WORKING');
        } else {
          console.log('❌ browser.storage.local: FAILED - data not persisted');
        }
      } catch (e) {
        console.log('❌ browser.storage.local: FAILED -', e.message);
      }
    } else {
      console.log('❌ browser.storage.local: NOT AVAILABLE');
    }
    
    // Check IndexedDB
    try {
      console.log('[ZenNoteEditor] Testing IndexedDB...');
      
      // Always use version 2 for health check
      const version = 2;
      const request = indexedDB.open('ZenNotesDB', version);
      
      await new Promise((resolve, reject) => {
        request.onerror = () => reject(new Error('IndexedDB open failed'));
        request.onsuccess = () => resolve();
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('notes')) {
            const store = db.createObjectStore('notes', { keyPath: 'id' });
            console.log('[ZenNoteEditor] ✅ Created IndexedDB object store: notes (health check)');
          }
        };
      });
      
      // Test actual save/retrieve
      const testData = { id: 'test', title: 'Test Note', content: 'Test content' };
      const retrievedData = await this.testIndexedDB(testData);
      
      if (retrievedData && retrievedData.title === testData.title) {
        // Clean up test data
        await this.clearTestData('test');
        results.indexedDB = true;
        console.log('✅ IndexedDB: WORKING (save/retrieve verified)');
      } else {
        console.log('❌ IndexedDB: FAILED - data not retrieved correctly');
      }
    } catch (e) {
      console.log('❌ IndexedDB: FAILED -', e.message);
      
      // If IndexedDB is corrupted, try to reset it
      if (e.message.includes('object store not found') || e.message.includes('schema')) {
        console.log('[ZenNoteEditor] IndexedDB appears corrupted, attempting reset...');
        try {
          await this.resetIndexedDB();
          console.log('[ZenNoteEditor] IndexedDB reset successful, will retry on next save');
        } catch (resetError) {
          console.error('[ZenNoteEditor] IndexedDB reset failed:', resetError.message);
        }
      }
    }
    
    // Check localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
        results.localStorage = true;
        console.log('✅ localStorage: WORKING');
      } else {
        console.log('❌ localStorage: NOT AVAILABLE');
      }
    } catch (e) {
      console.log('❌ localStorage: FAILED -', e.message);
    }
    
    // Check sessionStorage
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('test', 'test');
        sessionStorage.removeItem('test');
        results.sessionStorage = true;
        console.log('✅ sessionStorage: WORKING');
      } else {
        console.log('❌ sessionStorage: NOT AVAILABLE');
      }
    } catch (e) {
      console.log('❌ sessionStorage: FAILED -', e.message);
    }
    
    // Check memory storage
    if (window.zenNotesStorage) {
      results.memoryStorage = true;
      console.log('✅ Memory storage: WORKING');
    } else {
      console.log('❌ Memory storage: NOT AVAILABLE');
    }
    
    const workingCount = Object.values(results).filter(Boolean).length;
    console.log(`[ZenNoteEditor] Storage health: ${workingCount}/5 storage methods working`);
    
    return results;
  }
  
  // Load from IndexedDB
  async loadFromIndexedDB() {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('ZenNotesDB', 2);
        
        request.onerror = () => reject(new Error('IndexedDB open failed'));
        
        request.onsuccess = (event) => {
          const db = event.target.result;
          try {
            // First, try to get the current note ID
            const idTransaction = db.transaction(['notes'], 'readonly');
            const idStore = idTransaction.objectStore('notes');
            
            const idRequest = idStore.get('zen-current-note-id');
            idRequest.onsuccess = () => {
              const idData = idRequest.result;
              if (!idData || !idData.value) {
                console.log('[ZenNoteEditor] No current note ID found in IndexedDB');
                resolve(null);
                return;
              }
              
              const noteId = idData.value;
              console.log('[ZenNoteEditor] Found current note ID in IndexedDB:', noteId);
              
              // Now load the actual note data
              const noteTransaction = db.transaction(['notes'], 'readonly');
              const noteStore = noteTransaction.objectStore('notes');
              
              const noteRequest = noteStore.get(noteId);
              noteRequest.onsuccess = () => {
                const noteData = noteRequest.result;
                if (noteData) {
                  noteData.source = 'IndexedDB';
                  resolve(noteData);
                } else {
                  console.log('[ZenNoteEditor] Note data not found for ID:', noteId);
                  resolve(null);
                }
              };
              noteRequest.onerror = () => reject(new Error('Failed to get note from IndexedDB'));
            };
            idRequest.onerror = () => reject(new Error('Failed to get note ID from IndexedDB'));
          } catch (e) {
            reject(e);
          }
        };
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('notes')) {
            const store = db.createObjectStore('notes', { keyPath: 'id' });
            console.log('[ZenNoteEditor] Created IndexedDB object store: notes (load method)');
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  async getAllNotesFromIndexedDB() {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('ZenNotesDB', 2);
        
        request.onerror = () => reject(new Error('IndexedDB open failed for getAllNotes'));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['notes'], 'readonly');
          const store = transaction.objectStore('notes');
          
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = () => {
            resolve(getAllRequest.result);
          };
          getAllRequest.onerror = () => reject(new Error('Failed to get all notes from IndexedDB'));
        };
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('notes')) {
            const store = db.createObjectStore('notes', { keyPath: 'id' });
            console.log('[ZenNoteEditor] Created IndexedDB object store: notes (getAllNotes method)');
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  async testIndexedDB(testData) {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('ZenNotesDB', 2);
        
        request.onerror = () => reject(new Error('IndexedDB open failed for test'));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['notes'], 'readwrite');
          const store = transaction.objectStore('notes');

          const putRequest = store.put(testData);
          putRequest.onsuccess = () => {
            const getRequest = store.get(testData.id);
            getRequest.onsuccess = () => {
              resolve(getRequest.result);
            };
            getRequest.onerror = () => reject(new Error('Failed to retrieve test data from IndexedDB'));
          };
          putRequest.onerror = () => reject(new Error('Failed to save test data to IndexedDB'));
        };
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('notes')) {
            const store = db.createObjectStore('notes', { keyPath: 'id' });
            console.log('[ZenNoteEditor] Created IndexedDB object store: notes (test method)');
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }
  
  async clearTestData(testId) {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('ZenNotesDB', 2);
        
        request.onerror = () => reject(new Error('IndexedDB open failed for cleanup'));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['notes'], 'readwrite');
          const store = transaction.objectStore('notes');

          const deleteRequest = store.delete(testId);
          deleteRequest.onsuccess = () => {
            resolve();
          };
          deleteRequest.onerror = () => reject(new Error('Failed to delete test data from IndexedDB'));
        };
      } catch (e) {
        reject(e);
      }
    });
  }
  
  // Clear and reset IndexedDB database (for troubleshooting)
  async resetIndexedDB() {
    return new Promise((resolve, reject) => {
      try {
        console.log('[ZenNoteEditor] Resetting IndexedDB database...');
        
        // Close any existing connections
        if (this.indexedDBConnection) {
          this.indexedDBConnection.close();
          this.indexedDBConnection = null;
        }
        
        // Delete the database completely
        const deleteRequest = indexedDB.deleteDatabase('ZenNotesDB');
        
        deleteRequest.onsuccess = () => {
          console.log('[ZenNoteEditor] IndexedDB database deleted successfully');
          resolve(true);
        };
        
        deleteRequest.onerror = () => {
          console.error('[ZenNoteEditor] Failed to delete IndexedDB database:', deleteRequest.error);
          reject(new Error('Failed to delete IndexedDB database'));
        };
        
        deleteRequest.onblocked = () => {
          console.warn('[ZenNoteEditor] IndexedDB delete blocked - another tab might have it open');
          reject(new Error('IndexedDB delete blocked by another tab'));
        };
        
      } catch (e) {
        console.error('[ZenNoteEditor] IndexedDB reset error:', e);
        reject(e);
      }
    });
  }
  
  // Manual database reset method (exposed globally for debugging)
  async forceResetDatabase() {
    try {
      console.log('[ZenNoteEditor] Force resetting IndexedDB database...');
      await this.resetIndexedDB();
      
      // Wait a moment for the delete to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Try to save a test note to verify the reset worked
      const testData = { id: 'test-reset', title: 'Test Reset', content: 'Testing database reset' };
      const success = await this.saveToIndexedDB(testData);
      
      if (success) {
        console.log('[ZenNoteEditor] ✅ Database reset successful - IndexedDB is now working');
        // Clean up test data
        await this.clearTestData('test-reset');
        return true;
      } else {
        console.log('[ZenNoteEditor] ❌ Database reset failed - IndexedDB still not working');
        return false;
      }
    } catch (error) {
      console.error('[ZenNoteEditor] Force reset failed:', error);
      return false;
    }
  }

  // Load from a JSON file
  async loadFromFile() {
    return new Promise((resolve, reject) => {
      try {
        // Create a file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        
        fileInput.onchange = (event) => {
          const file = event.target.files[0];
          if (!file) {
            resolve(null);
            return;
          }
          
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const noteData = JSON.parse(e.target.result);
              if (noteData && noteData.title && noteData.content) {
                noteData.source = 'File';
                console.log('[ZenNoteEditor] ✅ Successfully loaded note from file:', noteData.title);
                resolve(noteData);
              } else {
                console.warn('[ZenNoteEditor] Invalid note file format');
                resolve(null);
              }
            } catch (parseError) {
              console.error('[ZenNoteEditor] Failed to parse note file:', parseError);
              resolve(null);
            }
          };
          
          reader.onerror = () => {
            console.error('[ZenNoteEditor] Failed to read note file');
            resolve(null);
          };
          
          reader.readAsText(file);
        };
        
        // Trigger file selection
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
        
        // Clean up after a delay
        setTimeout(() => {
          if (fileInput.parentNode) {
            fileInput.parentNode.removeChild(fileInput);
          }
        }, 1000);
        
      } catch (e) {
        console.error('[ZenNoteEditor] File load setup failed:', e);
        resolve(null);
      }
    });
  }
}

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('[ZenNoteEditor] DOM loaded, initializing...');
  const editor = new ZenNoteEditor();
  editor.init();
  
  // Expose debugging methods globally
  window.zenNotesDebug = {
    forceResetDatabase: () => editor.forceResetDatabase(),
    checkStorageHealth: () => editor.checkStorageHealth(),
    resetIndexedDB: () => editor.resetIndexedDB(),
    loadFromFile: () => editor.loadFromFile(),
    saveToFile: (noteData) => editor.saveToFileStorage(noteData)
  };
  
  console.log('[ZenNoteEditor] Debug methods exposed globally: window.zenNotesDebug');
  console.log('[ZenNoteEditor] Use window.zenNotesDebug.forceResetDatabase() to reset the database');
  console.log('[ZenNoteEditor] Use window.zenNotesDebug.loadFromFile() to load a note from file');
  console.log('[ZenNoteEditor] Use window.zenNotesDebug.saveToFile(noteData) to save current note to file');
});
