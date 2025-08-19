// Zen Notes - Enhanced Editor with Tiptap Integration
class ZenNoteEditor {
  constructor() {
    this.tiptapEditor = null;
    this.titleInput = null;
    this.contentEditor = null;
    this.isChanged = false;
    this.autoSaveTimer = null;
    this.lastSavedContent = '';
    this.lastSavedTitle = '';
  }

  async init() {
    console.log('[ZenNoteEditor] Initializing...');
    
    // Wait for DOM elements
    await this.waitForElements();
    
    // Initialize Tiptap
    this.initTiptap();
    
    // Setup debug methods BEFORE loading notes
    this.setupDebugMethods();
    
    // Setup event listeners (including New Board button)
    this.setupEventListeners();
    
    // Setup slash menu
    this.setupSlashMenu();
    
    // Setup auto-save
    this.setupAutoSave();
    
    console.log('[ZenNoteEditor] Initialized successfully');
  }

  async waitForElements() {
    // Wait for Tiptap bundle to load
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    
    while (!window.ZenTiptap && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!window.ZenTiptap) {
      console.error('[ZenNoteEditor] Tiptap bundle not found - cannot proceed without it');
      return;
    }

    this.titleInput = document.getElementById('note-title');
    this.editorElement = document.getElementById('tiptap-editor');
    this.toolbar = document.getElementById('note-toolbar');
    
    if (!this.titleInput || !this.editorElement || !this.toolbar) {
      console.error('[ZenNoteEditor] Required elements not found');
      return;
    }
  }

  async initTiptap() {
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
      
      // Wait for Tiptap to be fully ready before proceeding
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Additional check to ensure editor is fully ready
      if (this.tiptapEditor && this.tiptapEditor.commands && this.tiptapEditor.getHTML) {
        console.log('[ZenNoteEditor] Tiptap editor is fully ready');
        
        setTimeout(() => {
          if (this.tiptapEditor && this.tiptapEditor.commands) {
            this.tiptapEditor.commands.focus('start');
          }
        }, 100);
        
        this.setupAutoScroll();
        
        // Initialize storage and load saved note data
        await this.initializeNoteData();
      } else {
        console.warn('[ZenNoteEditor] Tiptap editor not fully ready, retrying...');
        // Retry after a delay
        setTimeout(async () => {
          if (this.tiptapEditor && this.tiptapEditor.commands && this.tiptapEditor.getHTML) {
            console.log('[ZenNoteEditor] Tiptap editor is now ready on retry');
            this.setupAutoScroll();
            await this.initializeNoteData();
          }
        }, 1000);
      }
      
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
    
    // Manual save button event
    const manualSaveBtn = document.getElementById('manual-save-btn');
    if (manualSaveBtn) {
      manualSaveBtn.addEventListener('click', (e) => this.handleManualSave(e));
    }
    
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

  handleManualSave(event) {
    event.preventDefault();
    
    console.log('[ZenNoteEditor] Manual save requested');
    
    // Force save immediately
    this.performAutoSave();
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
    
    // Additional safety check: ensure editor is fully initialized
    if (!this.tiptapEditor.getHTML || typeof this.tiptapEditor.getHTML !== 'function') {
      console.warn('[ZenNoteEditor] Tiptap editor not fully initialized - getHTML method not available');
      return null;
    }
    
    try {
      const currentContent = this.tiptapEditor.getHTML();
      const currentTitle = this.titleInput.value.trim();
      
      console.log('[ZenNoteEditor] Preparing to save note:', { 
        title: currentTitle, 
        contentLength: currentContent ? currentContent.length : 'undefined',
        editorReady: !!this.tiptapEditor,
        commandsReady: !!this.tiptapEditor.commands,
        getHTMLReady: !!this.tiptapEditor.getHTML
      });
      
      const noteData = {
        title: currentTitle,
        content: currentContent || '',
        lastModified: new Date().toISOString(),
        id: this.getNoteId()
      };

      console.log('[ZenNoteEditor] Saving note:', { id: noteData.id, title: noteData.title, contentLength: noteData.content.length });
      
      // Save to IndexedDB
      const saved = await this.saveToIndexedDB(noteData);
      if (saved) {
        console.log('[ZenNoteEditor] ✅ Successfully saved to IndexedDB');
        return noteData;
      } else {
        console.error('[ZenNoteEditor] ❌ Failed to save to IndexedDB');
        return null;
      }
      
    } catch (error) {
      console.error('[ZenNoteEditor] Save failed completely:', error);
      return null;
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
  
  // Load from IndexedDB
  async loadFromIndexedDB() {
    return new Promise((resolve, reject) => {
      try {
        console.log('[ZenNoteEditor] Opening IndexedDB...');
        
        const request = indexedDB.open('ZenNotesDB', 2);
        
        request.onerror = (event) => {
          console.error('[ZenNoteEditor] IndexedDB open failed:', event.target.error);
          reject(new Error('IndexedDB open failed: ' + event.target.error.message));
        };
        
        request.onsuccess = (event) => {
          const db = event.target.result;
          console.log('[ZenNoteEditor] IndexedDB opened successfully');
          
          try {
            // Check if the object store exists
            if (!db.objectStoreNames.contains('notes')) {
              console.error('[ZenNoteEditor] Object store "notes" not found');
              reject(new Error('Object store "notes" not found'));
              return;
            }
            
            // Get all notes and find the most recent one (ignore zen-current-note-id)
            const transaction = db.transaction(['notes'], 'readonly');
            const store = transaction.objectStore('notes');
            
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => {
              const allNotes = getAllRequest.result;
              console.log('[ZenNoteEditor] Found', allNotes.length, 'items in IndexedDB');
              
              // Filter out the zen-current-note-id entry and find actual notes
              const actualNotes = allNotes.filter(note => note.id && note.id !== 'zen-current-note-id');
              
              if (actualNotes.length > 0) {
                // Find the most recently modified note
                const mostRecentNote = actualNotes.reduce((latest, current) => {
                  const latestTime = latest.lastModified ? new Date(latest.lastModified).getTime() : 0;
                  const currentTime = current.lastModified ? new Date(current.lastModified).getTime() : 0;
                  return currentTime > latestTime ? current : latest;
                });
                
                console.log('[ZenNoteEditor] ✅ Found most recent note:', { 
                  id: mostRecentNote.id, 
                  title: mostRecentNote.title, 
                  lastModified: mostRecentNote.lastModified 
                });
                
                resolve(mostRecentNote);
              } else {
                console.log('[ZenNoteEditor] No actual notes found in IndexedDB');
                resolve(null);
              }
            };
            
            getAllRequest.onerror = (event) => {
              console.error('[ZenNoteEditor] Failed to get all notes from IndexedDB:', event.target.error);
              reject(new Error('Failed to get all notes from IndexedDB: ' + event.target.error.message));
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
        
      } catch (e) {
        console.error('[ZenNoteEditor] IndexedDB setup error:', e);
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
        if (this.db) {
          this.db.close();
          this.db = null;
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

  setupAutoSave() {
    // Auto-save every 2 seconds when content changes
    this.autoSaveTimer = setInterval(() => {
      if (this.isChanged) {
        this.saveNote();
      }
    }, 2000);
  }

  openNoteCreation() {
    console.log('[ZenNotes] openNoteCreation called');
    
    // Generate a UNIQUE note ID for each new note
    const uniqueId = `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store this as the current note ID
    this.currentNoteId = uniqueId;
    
    // Open the note in a new tab with NEW parameter and UNIQUE ID
    const noteUrl = `chrome://browser/content/zen-notes/note.xhtml?new=true&id=${uniqueId}`;
    console.log('[ZenNotes] Note tab opened with unique ID:', noteUrl);
    
    // Use gBrowser.addTab for consistency
    if (window.gBrowser && window.gBrowser.addTab) {
      window.gBrowser.addTab(noteUrl);
    } else {
      // Fallback to browser.tabs.create
      if (browser && browser.tabs && browser.tabs.create) {
        browser.tabs.create({ url: noteUrl });
      }
    }
  }

  setupDebugMethods() {
    // Create the debug object
    if (!window.zenNotesDebug) {
      window.zenNotesDebug = {};
    }
    
    // Expose debug methods
    window.zenNotesDebug.forceResetDatabase = () => this.forceResetDatabase();
    window.zenNotesDebug.checkStorageHealth = () => this.checkStorageHealth();
    window.zenNotesDebug.getAllNotes = () => this.getAllNotesFromIndexedDB();
    window.zenNotesDebug.testTiptapState = () => this.testTiptapState();
    window.zenNotesDebug.testManualSave = () => this.testManualSave();
    window.zenNotesDebug.showAllNotes = () => this.showAllNotes();
    
    console.log('[ZenNoteEditor] Debug methods exposed globally: window.zenNotesDebug');
    console.log('[ZenNoteEditor] Use window.zenNotesDebug.forceResetDatabase() to reset the database');
    console.log('[ZenNoteEditor] Use window.zenNotesDebug.checkStorageHealth() to check IndexedDB health');
    console.log('[ZenNoteEditor] Use window.zenNotesDebug.getAllNotes() to see all stored notes');
    console.log('[ZenNoteEditor] Use window.zenNotesDebug.testTiptapState() to test Tiptap editor state');
    console.log('[ZenNoteEditor] Use window.zenNotesDebug.testManualSave() to test manual saving');
  }

  forceResetDatabase() {
    console.log('[ZenNoteEditor] Force resetting IndexedDB...');
    
    // Close any existing connections
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    
    // Delete the database completely
    const deleteRequest = indexedDB.deleteDatabase('ZenNotesDB');
    deleteRequest.onsuccess = () => {
      console.log('[ZenNoteEditor] ✅ IndexedDB deleted successfully');
      
      // Clear memory storage
      if (window.zenNotesStorage) {
        window.zenNotesStorage.clear();
      }
      
      // Clear localStorage
      try {
        localStorage.removeItem('zen-current-note-id');
        localStorage.removeItem('zen-note-note-mv7cmq');
      } catch (e) {
        console.warn('[ZenNoteEditor] Could not clear localStorage:', e);
      }
      
      console.log('[ZenNoteEditor] All storage cleared. Refresh the page to start fresh.');
    };
    deleteRequest.onerror = () => {
      console.error('[ZenNoteEditor] Failed to delete IndexedDB');
    };
  }

  loadFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const content = await file.text();
          const noteData = JSON.parse(content);
          
          if (this.tiptapEditor && this.tiptapEditor.commands) {
            this.tiptapEditor.commands.setContent(noteData.content || '');
          }
          if (this.titleInput && noteData.title) {
            this.titleInput.value = noteData.title;
            this.updateTabTitle();
          }
          
          console.log('[ZenNoteEditor] Note loaded from file:', noteData.title);
        } catch (error) {
          console.error('[ZenNoteEditor] Failed to load file:', error);
        }
      }
    };
    
    input.click();
  }

  saveToFile(noteData = null) {
    if (!noteData) {
      noteData = {
        id: this.currentNoteId || 'note-unknown',
        title: this.titleInput?.value || 'Untitled Note',
        content: this.tiptapEditor?.getHTML() || '',
        timestamp: Date.now()
      };
    }
    
    const blob = new Blob([JSON.stringify(noteData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${noteData.title || 'note'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('[ZenNoteEditor] Note saved to file:', noteData.title);
  }

  testTiptapState() {
    if (!this.tiptapEditor) {
      console.warn('[ZenNoteEditor] Tiptap editor not initialized.');
      return;
    }

    const state = this.tiptapEditor.state;
    const selection = state.selection;
    const doc = state.doc;
    const tr = state.tr;

    console.log('[ZenNoteEditor] Tiptap Editor State:');
    console.log('  - Selection:', {
      from: selection.from,
      to: selection.to,
      main: selection.main.toString()
    });
    console.log('  - Document size:', doc.content.size);
    console.log('  - Transaction size:', tr.steps.length);
    console.log('  - Transaction steps:', tr.steps.map(step => step.type));
    console.log('  - Transaction origin:', tr.origin);
    console.log('  - Transaction steps:', tr.steps.map(step => step.type));
    console.log('  - Transaction origin:', tr.origin);
  }

  testManualSave() {
    console.log('[ZenNoteEditor] Testing manual save...');
    
    if (!this.tiptapEditor) {
      console.error('[ZenNoteEditor] Tiptap editor not available');
      return;
    }
    
    if (!this.tiptapEditor.getHTML) {
      console.error('[ZenNoteEditor] getHTML method not available');
      return;
    }
    
    try {
      const content = this.tiptapEditor.getHTML();
      const title = this.titleInput ? this.titleInput.value.trim() : 'No title input';
      
      console.log('[ZenNoteEditor] Manual save test results:');
      console.log('  - Title:', title);
      console.log('  - Content length:', content ? content.length : 'undefined');
      console.log('  - Content preview:', content ? content.substring(0, 100) + '...' : 'No content');
      console.log('  - Editor ready:', !!this.tiptapEditor);
      console.log('  - Commands ready:', !!this.tiptapEditor.commands);
      console.log('  - getHTML ready:', !!this.tiptapEditor.getHTML);
      
      // Try to save
      this.saveNote().then(result => {
        console.log('[ZenNoteEditor] Manual save test completed:', result);
      }).catch(error => {
        console.error('[ZenNoteEditor] Manual save test failed:', error);
      });
      
    } catch (error) {
      console.error('[ZenNoteEditor] Manual save test error:', error);
    }
  }

  async testStorageLoading() {
    console.log('[ZenNoteEditor] Testing storage loading...');
    let loadedNote = null;
    let loadedFrom = 'unknown';

    // Test IndexedDB
    try {
      console.log('[ZenNoteEditor] Testing IndexedDB load...');
      loadedNote = await this.loadFromIndexedDB();
      loadedFrom = 'IndexedDB';
      if (loadedNote) {
        console.log('[ZenNoteEditor] ✅ Loaded from IndexedDB:', { title: loadedNote.title, contentLength: loadedNote.content?.length || 0 });
      } else {
        console.warn('[ZenNoteEditor] Failed to load from IndexedDB');
      }
    } catch (e) {
      console.warn('[ZenNoteEditor] IndexedDB load failed:', e.message);
    }

    // Test browser.storage.local
    if (!loadedNote) {
      try {
        console.log('[ZenNoteEditor] Testing browser.storage.local load...');
        const result = await browser.storage.local.get('zen-current-note-id');
        if (result['zen-current-note-id']) {
          const noteId = result['zen-current-note-id'];
          const noteResult = await browser.storage.local.get(`zen-note-${noteId}`);
          if (noteResult[`zen-note-${noteId}`]) {
            loadedNote = noteResult[`zen-note-${noteId}`];
            loadedFrom = 'browser.storage.local';
            console.log('[ZenNoteEditor] ✅ Loaded from browser.storage.local:', { title: loadedNote.title, contentLength: loadedNote.content?.length || 0 });
          }
        }
      } catch (e) {
        console.warn('[ZenNoteEditor] browser.storage.local load failed:', e.message);
      }
    }

    // Test localStorage
    if (!loadedNote) {
      try {
        console.log('[ZenNoteEditor] Testing localStorage load...');
        const noteId = localStorage.getItem('zen-current-note-id');
        if (noteId) {
          const noteJson = localStorage.getItem(`zen-note-${noteId}`);
          if (noteJson) {
            loadedNote = JSON.parse(noteJson);
            loadedFrom = 'localStorage';
            console.log('[ZenNoteEditor] ✅ Loaded from localStorage:', { title: loadedNote.title, contentLength: loadedNote.content?.length || 0 });
          }
        }
      } catch (e) {
        console.warn('[ZenNoteEditor] localStorage load failed:', e.message);
      }
    }

    // Test memory storage
    if (!loadedNote) {
      try {
        console.log('[ZenNoteEditor] Testing memory storage load...');
        const noteId = window.zenNotesStorage.get('zen-current-note-id');
        if (noteId) {
          const storedNote = window.zenNotesStorage.get(noteId);
          if (storedNote) {
            loadedNote = storedNote;
            loadedFrom = 'memoryStorage';
            console.log('[ZenNoteEditor] ✅ Loaded from memory storage:', { title: loadedNote.title, contentLength: loadedNote.content?.length || 0 });
          }
        }
      } catch (e) {
        console.warn('[ZenNoteEditor] Memory storage load failed:', e.message);
      }
    }

    if (!loadedNote) {
      console.log('[ZenNoteEditor] ❌ Failed to load note from any storage method.');
    } else {
      console.log('[ZenNoteEditor] Note loaded successfully from:', loadedFrom);
    }
    }
  
  // Load a specific note by ID from IndexedDB
  async loadNoteById(noteId) {
    return new Promise((resolve, reject) => {
      try {
        console.log('[ZenNoteEditor] Loading note by ID:', noteId);
        
        const request = indexedDB.open('ZenNotesDB', 2);
        
        request.onerror = () => reject(new Error('IndexedDB open failed for loadNoteById'));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['notes'], 'readonly');
          const store = transaction.objectStore('notes');
          
          const getRequest = store.get(noteId);
          getRequest.onsuccess = () => {
            const noteData = getRequest.result;
            if (noteData) {
              console.log('[ZenNoteEditor] ✅ Successfully loaded note by ID:', noteData.title);
              resolve(noteData);
            } else {
              console.log('[ZenNoteEditor] ❌ No note found with ID:', noteId);
              resolve(null);
            }
          };
          getRequest.onerror = () => reject(new Error('Failed to get note by ID'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // Delete a note from IndexedDB
  async deleteNote(noteId) {
    return new Promise((resolve, reject) => {
      try {
        console.log('[ZenNoteEditor] Deleting note:', noteId);
        
        const request = indexedDB.open('ZenNotesDB', 2);
        
        request.onerror = () => reject(new Error('IndexedDB open failed for deleteNote'));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['notes'], 'readwrite');
          const store = transaction.objectStore('notes');
          
          const deleteRequest = store.delete(noteId);
          deleteRequest.onsuccess = () => {
            console.log('[ZenNoteEditor] ✅ Note deleted successfully:', noteId);
            resolve(true);
          };
          deleteRequest.onerror = () => reject(new Error('Failed to delete note'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  getNoteId() {
    console.log('[ZenNoteEditor] getNoteId called');
    console.log('[ZenNoteEditor] this.currentNoteId:', this.currentNoteId);
    
    // Use the currentNoteId from URL parameters (for new notes)
    if (this.currentNoteId) {
      console.log('[ZenNoteEditor] Using current note ID from URL:', this.currentNoteId);
      return this.currentNoteId;
    }
    
    // If no currentNoteId, generate a new one
    const newId = `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[ZenNoteEditor] Generated new note ID:', newId);
    return newId;
    }
  
  // Initialize note data by checking storage health and loading saved note
  async initializeNoteData() {
    try {
      // Check storage health first
      await this.checkStorageHealth();
      
      // Load any saved note data after storage is confirmed working
      await this.loadSavedNote();
    } catch (error) {
      console.error('[ZenNoteEditor] Failed to initialize note data:', error);
      // Create fresh note as fallback
      this.createFreshNote();
    }
  }
  
  async loadSavedNote() {
    try {
      console.log('[ZenNoteEditor] Loading saved note...');
      
      // Get note ID from URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const noteId = urlParams.get('id');
      
      if (noteId) {
        console.log('[ZenNoteEditor] Found note ID in URL:', noteId);
        this.currentNoteId = noteId;
        
        // Try to load existing note with this ID first
        try {
          const existingNote = await this.loadNoteById(noteId);
          if (existingNote) {
            console.log('[ZenNoteEditor] ✅ Loaded existing note:', existingNote.title);
            
            // Load the saved content
            if (existingNote.title) {
              this.titleInput.value = existingNote.title;
              this.updateTabTitle();
            }
            
            if (existingNote.content && this.tiptapEditor && this.tiptapEditor.commands) {
              this.tiptapEditor.commands.setContent(existingNote.content);
            }
            
            this.lastSavedContent = existingNote.content || '';
            this.lastSavedTitle = existingNote.title || '';
            this.isChanged = false;
            return;
          }
        } catch (e) {
          console.log('[ZenNoteEditor] No existing note found, creating new one');
        }
        
        // If no existing note found, create fresh note with the ID
        console.log('[ZenNoteEditor] Creating fresh note with ID:', noteId);
        this.createFreshNote(noteId);
        return;
      }
      
      // Try to load from IndexedDB
      try {
        console.log('[ZenNoteEditor] Attempting to load from IndexedDB...');
        const noteData = await this.loadFromIndexedDB();
        if (noteData) {
          console.log('[ZenNoteEditor] ✅ Successfully loaded from IndexedDB:', { title: noteData.title, contentLength: noteData.content?.length || 0 });
          
          // Set the currentNoteId to the loaded note's ID
          this.currentNoteId = noteData.id;
          console.log('[ZenNoteEditor] Set currentNoteId to loaded note ID:', this.currentNoteId);
          
          // Load the saved content
          if (noteData.title) {
            this.titleInput.value = noteData.title;
            this.updateTabTitle();
            console.log('[ZenNoteEditor] Title loaded:', noteData.title);
          }
          
          if (noteData.content && this.tiptapEditor && this.tiptapEditor.commands) {
            console.log('[ZenNoteEditor] Loading content into Tiptap editor...');
            this.tiptapEditor.commands.setContent(noteData.content);
            console.log('[ZenNoteEditor] Content loaded into Tiptap editor');
          } else if (noteData.content) {
            console.warn('[ZenNoteEditor] Content available but Tiptap editor not ready, will retry...');
            // Retry loading content after a delay if Tiptap is not ready
            setTimeout(() => {
              if (this.tiptapEditor && this.tiptapEditor.commands) {
                console.log('[ZenNoteEditor] Retrying content load into Tiptap editor...');
                this.tiptapEditor.commands.setContent(noteData.content);
                console.log('[ZenNoteEditor] Content loaded into Tiptap editor on retry');
              } else {
                console.error('[ZenNoteEditor] Tiptap editor still not ready after retry');
              }
            }, 1000);
          }
          
          // Update saved state
          this.lastSavedContent = noteData.content || '';
          this.lastSavedTitle = noteData.title || '';
          this.isChanged = false;
          
          console.log('[ZenNoteEditor] Note loaded successfully:', {
            title: noteData.title,
            contentLength: noteData.content?.length || 0,
            noteId: noteData.id
          });
        } else {
          console.log('[ZenNoteEditor] No saved note found, starting with empty note');
          this.createFreshNote();
        }
      } catch (e) {
        console.warn('[ZenNoteEditor] IndexedDB load failed:', e.message);
        this.createFreshNote();
      }
      
    } catch (error) {
      console.error('[ZenNoteEditor] Failed to load saved note:', error);
      this.createFreshNote();
    }
  }

  createFreshNote(noteId = null) {
    // Generate new note ID if not provided
    const newId = noteId || `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.currentNoteId = newId;
    
    console.log('[ZenNoteEditor] createFreshNote called with ID:', newId);
    console.log('[ZenNoteEditor] this.currentNoteId set to:', this.currentNoteId);
    
    // Clear the editor
    if (this.tiptapEditor && this.tiptapEditor.commands) {
      this.tiptapEditor.commands.setContent('');
      // Focus on the beginning of the document, not 'title'
      this.tiptapEditor.commands.focus('start');
    }
    
    // Only clear title if this is a completely new note (no noteId provided)
    if (!noteId && this.titleInput) {
      this.titleInput.value = '';
      this.updateTabTitle();
    }
    
    // Reset saved state
    this.lastSavedContent = '';
    this.lastSavedTitle = '';
    this.isChanged = false;
    
    console.log('[ZenNoteEditor] Created fresh note with ID:', newId);
  }

  updateTabTitle() {
    const title = this.titleInput.value.trim();
    if (title) {
      document.title = `${title}`;
    } else {
      document.title = 'New Note';
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

  // Check storage health and log what's working
  async checkStorageHealth() {
    console.log('[ZenNoteEditor] Checking IndexedDB health...');
    
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
        console.log('✅ IndexedDB: WORKING (save/retrieve verified)');
        return true;
      } else {
        console.log('❌ IndexedDB: FAILED - data not retrieved correctly');
        return false;
      }
    } catch (e) {
      console.log('❌ IndexedDB: FAILED -', e.message);
      
      // If IndexedDB is corrupted, try to reset it
      if (e.message.includes('object store not found') || e.message.includes('schema')) {
        console.log('[ZenNoteEditor] IndexedDB appears corrupted, attempting reset...');
        try {
          await this.resetIndexedDB();
          console.log('[ZenNoteEditor] IndexedDB reset successful, will retry on next save');
          return true;
        } catch (resetError) {
          console.error('[ZenNoteEditor] IndexedDB reset failed:', resetError.message);
          return false;
        }
      }
      return false;
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
      
      // Clear previous selections and select the first item
      const items = slashMenu.querySelectorAll('.slash-item');
      items.forEach(item => item.classList.remove('selected'));
      if (items.length > 0) {
        items[0].classList.add('selected');
      }
      
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
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.navigateSlashMenu('down');
        return true;
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.navigateSlashMenu('up');
        return true;
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.executeSelectedSlashCommand();
        return true;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.hideSlashMenu();
        return true;
      }
    }
    return false;
  }
  
  navigateSlashMenu(direction) {
    const slashMenu = document.getElementById('slash-menu');
    if (!slashMenu) return;
    
    const items = slashMenu.querySelectorAll('.slash-item');
    const currentSelected = slashMenu.querySelector('.slash-item.selected');
    let currentIndex = currentSelected ? Array.from(items).indexOf(currentSelected) : -1;
    
    // Remove current selection
    if (currentSelected) {
      currentSelected.classList.remove('selected');
    }
    
    // Calculate new index
    if (direction === 'down') {
      currentIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    } else if (direction === 'up') {
      currentIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    }
    
    // Add new selection
    if (items[currentIndex]) {
      items[currentIndex].classList.add('selected');
    }
  }
  
  executeSelectedSlashCommand() {
    const slashMenu = document.getElementById('slash-menu');
    if (!slashMenu) return;
    
    const selectedItem = slashMenu.querySelector('.slash-item.selected');
    if (selectedItem && selectedItem.dataset.command) {
      this.executeSlashCommand(selectedItem.dataset.command);
    }
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
    // Save current note before closing if there are changes
    if (this.isChanged) {
      this.performAutoSave();
    }
    
    // Delete the note from storage when tab closes (as per user requirement)
    if (this.currentNoteId) {
      try {
        this.deleteNote(this.currentNoteId);
        console.log('[ZenNoteEditor] Note will be deleted on tab close:', this.currentNoteId);
      } catch (error) {
        console.error('[ZenNoteEditor] Failed to delete note on tab close:', error);
      }
    }
  }

  // Debug method to show all notes in console
  async showAllNotes() {
    try {
      console.log('[ZenNoteEditor] Fetching all notes from IndexedDB...');
      const allNotes = await this.getAllNotesFromIndexedDB();
      
      if (allNotes && allNotes.length > 0) {
        console.log('[ZenNoteEditor] 📝 All stored notes:');
        allNotes.forEach((note, index) => {
          console.log(`  ${index + 1}. ID: ${note.id}`);
          console.log(`     Title: ${note.title || 'Untitled'}`);
          console.log(`     Content Length: ${note.content ? note.content.length : 0} characters`);
          console.log(`     Last Modified: ${note.lastModified || 'Unknown'}`);
          console.log(`     Content Preview: ${note.content ? note.content.substring(0, 100) + '...' : 'No content'}`);
          console.log('     ---');
        });
      } else {
        console.log('[ZenNoteEditor] No notes found in IndexedDB');
      }
    } catch (error) {
      console.error('[ZenNoteEditor] Failed to fetch all notes:', error);
    }
  }

  testManualSave() {
    console.log('[ZenNoteEditor] Testing manual save...');
    
    if (!this.tiptapEditor) {
      console.error('[ZenNoteEditor] Tiptap editor not available');
      return;
    }
    
    if (!this.tiptapEditor.getHTML) {
      console.error('[ZenNoteEditor] getHTML method not available');
      return;
    }
    
    try {
      const content = this.tiptapEditor.getHTML();
      const title = this.titleInput ? this.titleInput.value.trim() : 'No title input';
      
      console.log('[ZenNoteEditor] Manual save test results:');
      console.log('  - Title:', title);
      console.log('  - Content length:', content ? content.length : 'undefined');
      console.log('  - Content preview:', content ? content.substring(0, 100) + '...' : 'No content');
      console.log('  - Editor ready:', !!this.tiptapEditor);
      console.log('  - Commands ready:', !!this.tiptapEditor.commands);
      console.log('  - getHTML ready:', !!this.tiptapEditor.getHTML);
      
      // Try to save
      this.saveNote().then(result => {
        console.log('[ZenNoteEditor] Manual save test completed:', result);
      }).catch(error => {
        console.error('[ZenNoteEditor] Manual save test failed:', error);
      });
      
    } catch (error) {
      console.error('[ZenNoteEditor] Manual save test error:', error);
    }
  }
}

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('[ZenNoteEditor] DOM loaded, initializing...');
  const editor = new ZenNoteEditor();
  editor.init();
});
