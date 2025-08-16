// Zen Canvas - Excalidraw Integration
class ZenCanvasEditor {
  constructor() {
    this.titleInput = null;
    this.excalidrawContainer = null;
    this.toolbar = null;
    this.excalidrawApp = null;
    this.isChanged = false;
    this.autoSaveTimer = null;
    this.lastSavedContent = '';
    this.lastSavedTitle = '';
  }

  async init() {
    console.log('[ZenCanvasEditor] Initializing...');

    this.titleInput = document.getElementById('canvas-title');
    this.excalidrawContainer = document.getElementById('excalidraw-container');
    this.toolbar = document.getElementById('canvas-toolbar');
    
    if (!this.titleInput || !this.excalidrawContainer || !this.toolbar) {
      console.error('[ZenCanvasEditor] Required elements not found');
      return;
    }

    // Wait for Excalidraw to be available
    await this.waitForExcalidraw();
    
    // Initialize Excalidraw
    this.initExcalidraw();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Load any saved content
    this.loadContent();
    
    console.log('[ZenCanvasEditor] Initialized successfully');
  }

  async waitForExcalidraw() {
    // Wait for Excalidraw to be loaded
    let attempts = 0;
    const maxAttempts = 50;
    
    while (attempts < maxAttempts) {
      if (window.Excalidraw) {
        console.log('[ZenCanvasEditor] Excalidraw loaded successfully');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    throw new Error('Excalidraw failed to load');
  }

  initExcalidraw() {
    try {
      // Clear container
      this.excalidrawContainer.innerHTML = '';
      
      // Create Excalidraw app
      this.excalidrawApp = new window.Excalidraw({
        target: this.excalidrawContainer,
        props: {
          initialData: {
            elements: [],
            appState: {
              viewBackgroundColor: 'rgba(255, 255, 255, 0.05)',
              theme: 'dark'
            }
          },
          onChange: (elements, appState) => {
            this.handleExcalidrawChange(elements, appState);
          }
        }
      });
      
      console.log('[ZenCanvasEditor] Excalidraw initialized');
    } catch (error) {
      console.error('[ZenCanvasEditor] Failed to initialize Excalidraw:', error);
      // Fallback to simple message
      this.excalidrawContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: rgba(255,255,255,0.7);">
          <div style="text-align: center;">
            <h3>Canvas Loading...</h3>
            <p>If this persists, please refresh the page.</p>
          </div>
        </div>
      `;
    }
  }

  handleExcalidrawChange(elements, appState) {
    this.isChanged = true;
    this.autoSave();
  }

  setupEventListeners() {
    // Title input events
    this.titleInput.addEventListener('input', (e) => this.handleTitleChange(e));
    
    // New note button event
    const newNoteBtn = document.getElementById('new-note-btn');
    if (newNoteBtn) {
      newNoteBtn.addEventListener('click', (e) => this.handleNewNote(e));
    }
    
    // Before unload warning
    window.addEventListener('beforeunload', (e) => this.handleBeforeUnload(e));
    
    // Window resize
    window.addEventListener('resize', () => this.handleResize());
  }

  handleTitleChange(e) {
    this.isChanged = true;
    this.autoSave();
  }

  handleNewNote(e) {
    e.preventDefault();
    this.switchToNotes();
  }

  switchToNotes() {
    try {
      // Use the correct URL format - same as notes: zen-notes (with hyphen)
      const notesUrl = 'chrome://browser/content/zen-notes/note.xhtml';
      
      // Use the same pattern that works for notes
      if (typeof window !== 'undefined' && window.gBrowser) {
        let triggeringPrincipal;
        try {
          triggeringPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
        } catch (e) {
          triggeringPrincipal = null;
        }
        
        const newTab = window.gBrowser.addTab(notesUrl, {
          triggeringPrincipal: triggeringPrincipal
        });
        
        window.gBrowser.selectedTab = newTab;
        console.log('[ZenCanvasEditor] Notes tab opened:', notesUrl);
      } else {
        // Fallback for other contexts
        window.open(notesUrl, '_blank');
      }
      
    } catch (error) {
      console.error('[ZenCanvasEditor] Error switching to notes:', error);
      // Fallback: just navigate
      window.location.href = 'chrome://browser/content/zen-notes/note.xhtml';
    }
  }

  handleBeforeUnload(e) {
    if (this.isChanged) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  handleResize() {
    if (this.excalidrawApp && this.excalidrawApp.refresh) {
      this.excalidrawApp.refresh();
    }
  }

  autoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setTimeout(() => {
      this.saveContent();
    }, 1000);
  }

  saveContent() {
    try {
      const content = {
        title: this.titleInput.value || 'Untitled Board',
        timestamp: Date.now()
      };
      
      if (this.excalidrawApp && this.excalidrawApp.getSceneData) {
        const sceneData = this.excalidrawApp.getSceneData();
        content.sceneData = sceneData;
      }
      
      localStorage.setItem('zen-canvas-content', JSON.stringify(content));
      this.lastSavedContent = JSON.stringify(content);
      this.lastSavedTitle = content.title;
      this.isChanged = false;
      
      this.updateSavingStatus('Saved');
      console.log('[ZenCanvasEditor] Content saved');
    } catch (error) {
      console.error('[ZenCanvasEditor] Failed to save content:', error);
      this.updateSavingStatus('Save failed');
    }
  }

  loadContent() {
    try {
      const saved = localStorage.getItem('zen-canvas-content');
      if (saved) {
        const content = JSON.parse(saved);
        
        if (content.title) {
          this.titleInput.value = content.title;
        }
        
        if (content.sceneData && this.excalidrawApp && this.excalidrawApp.updateScene) {
          this.excalidrawApp.updateScene(content.sceneData);
        }
        
        this.lastSavedContent = saved;
        this.lastSavedTitle = content.title || '';
        this.isChanged = false;
        
        console.log('[ZenCanvasEditor] Content loaded');
      }
    } catch (error) {
      console.error('[ZenCanvasEditor] Failed to load content:', error);
    }
  }

  updateSavingStatus(status) {
    const savingStatus = document.getElementById('saving-status');
    const savedStatus = document.getElementById('saved-status');
    
    if (savingStatus && savedStatus) {
      if (status === 'Saving...') {
        savingStatus.style.display = 'inline';
        savedStatus.style.display = 'none';
      } else if (status === 'Saved') {
        savingStatus.style.display = 'none';
        savedStatus.style.display = 'inline';
        
        // Hide saved status after 2 seconds
        setTimeout(() => {
          savedStatus.style.display = 'none';
        }, 2000);
      } else {
        savingStatus.style.display = 'none';
        savedStatus.style.display = 'none';
      }
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ZenCanvasEditor();
  });
} else {
  new ZenCanvasEditor();
}
