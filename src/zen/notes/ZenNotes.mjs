// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Zen Notes Module
class ZenNotes {
  constructor() {
    console.log('[ZenNotes] Constructor called');
  }

  init() {
    console.log('[ZenNotes] Initialized successfully');
  }

  openNoteCreation() {
    console.log('[ZenNotes] openNoteCreation called');
    
    // Generate a UNIQUE note ID for each new note
    const uniqueId = `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Open the note in a new tab with NEW parameter and UNIQUE ID
    const noteURL = `chrome://browser/content/zen-notes/note.xhtml?new=true&id=${uniqueId}`;
    
    try {
      let triggeringPrincipal;
      try {
        triggeringPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
      } catch (e) {
        triggeringPrincipal = null;
      }
      
      const newTab = window.gBrowser.addTab(noteURL, {
        triggeringPrincipal: triggeringPrincipal
      });
      
      window.gBrowser.selectedTab = newTab;
      console.log('[ZenNotes] Note tab opened with unique ID:', noteURL);
    } catch (error) {
      console.error('[ZenNotes] Failed to open note:', error);
    }
  }
}

// Create global instance
window.gZenNotes = new ZenNotes();
console.log('[ZenNotes] Module loaded, gZenNotes created');
