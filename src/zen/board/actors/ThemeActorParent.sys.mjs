// src/zen/board/actors/ThemeActorParent.sys.mjs

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

export class ThemeActorParent extends JSWindowActorParent {
  constructor() {
    super();
  }

  async receiveMessage(message) {
    switch (message.name) {
      case 'Theme:GetColor':
        return await this.getThemeAccentColor();
      default:
        return null;
    }
  }

  async getThemeAccentColor() {
    const window = this.browsingContext.topChromeWindow;
    if (!window) {
      return null;
    }

    const { gZenThemePicker, gZenWorkspaces } = window;

    if (!gZenThemePicker || !gZenWorkspaces) {
      return null;
    }

    try {
      const activeWorkspace = await gZenWorkspaces.getActiveWorkspace();
      if (!activeWorkspace) {
        return null;
      }

      const { primaryColor } = gZenThemePicker.getGradientForWorkspace(activeWorkspace);
      return primaryColor || null;

    } catch (e) {
      console.error('ThemeActorParent: Error getting theme accent color:', e);
      return null;
    }
  }
}
