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
    
    try {
      const noteURL = 'chrome://browser/content/zen-notes/note.xhtml';
      
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
      console.log('[ZenNotes] Note tab opened:', noteURL);
    } catch (error) {
      console.error('[ZenNotes] Failed to open note:', error);
    }
  }
}

// Create global instance
window.gZenNotes = new ZenNotes();
console.log('[ZenNotes] Module loaded, gZenNotes created');
