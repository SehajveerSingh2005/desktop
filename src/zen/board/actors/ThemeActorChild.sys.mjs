// src/zen/board/actors/ThemeActorChild.sys.mjs

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

export class ThemeActorChild extends JSWindowActorChild {
  constructor() {
    super();
  }

  async handleEvent(event) {
    switch (event.type) {
      case 'DOMContentLoaded':
        this.onDOMContentLoaded();
        break;
    }
  }
  
  async onDOMContentLoaded() {
    const color = await this.sendQuery('Theme:GetColor');
    this.applyTheme(color);
  }

  async receiveMessage(message) {
    // This is not expected to be called in the current implementation,
    // but kept for future async messages from the parent.
  }

  applyTheme(color) {
    if (color && this.contentWindow.document.documentElement) {
      this.contentWindow.document.documentElement.style.setProperty('--board-accent-color', color);
    }
  }
}
