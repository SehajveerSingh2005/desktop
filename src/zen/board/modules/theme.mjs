/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { invalidateAccentColorCache } from "./canvas.mjs";

const DEFAULT_OPACITY = 0.5;

export function applyTransparency(isTransparent) {
  const chromeWindow = window.docShell?.chromeEventHandler?.ownerDocument?.defaultView;
  let opacity = DEFAULT_OPACITY;
  if (isTransparent) {
    try {
      const prefVal = chromeWindow?.Services?.prefs?.getStringPref("zen.board.background-opacity");
      opacity = parseFloat(prefVal ?? String(DEFAULT_OPACITY));
      if (isNaN(opacity)) {
        opacity = DEFAULT_OPACITY;
      }
    } catch (e) {
      opacity = DEFAULT_OPACITY;
    }
  } else {
    opacity = 1.0;
  }
  document.documentElement.style.setProperty("--board-bg-opacity", opacity);
}

export async function initTheme() {
  try {
    const chromeWindow = window.docShell?.chromeEventHandler?.ownerDocument?.defaultView;
    if (!chromeWindow) {
      return;
    }

    const themePicker = chromeWindow.gZenThemePicker;
    const workspaces = chromeWindow.gZenWorkspaces;
    if (!themePicker || !workspaces) {
      return;
    }

    const activeWorkspace = await workspaces.getActiveWorkspace();
    if (!activeWorkspace) {
      return;
    }

    const { primaryColor } = themePicker.getGradientForWorkspace(activeWorkspace);
    if (primaryColor) {
      document.documentElement.style.setProperty("--board-accent-color", primaryColor);
    }

    if (!window._zenThemeListenersAdded) {
      const onThemeChange = () => {
        invalidateAccentColorCache();
        initTheme();
      };
      chromeWindow.addEventListener("ZenGradientCacheChanged", onThemeChange);
      chromeWindow.addEventListener("ZenWorkspacesUIUpdate", onThemeChange);
      window.addEventListener(
        "pagehide",
        () => {
          chromeWindow.removeEventListener("ZenGradientCacheChanged", onThemeChange);
          chromeWindow.removeEventListener("ZenWorkspacesUIUpdate", onThemeChange);
        },
        { once: true }
      );
      window._zenThemeListenersAdded = true;
    }
  } catch (e) {
    console.error("ZenBoard: Failed to init theme", e);
  }
}
