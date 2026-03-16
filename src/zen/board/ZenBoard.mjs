/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class ZenBoard {
    openZenBoard(window) {
        if (!window || !window.gBrowser) {
            console.error("ZenBoard: Invalid window provided");
            return;
        }
        const url = "chrome://browser/content/zen-board/board.html";
        const tab = window.gBrowser.addTrustedTab(url, {
            triggeringPrincipal: window.Services.scriptSecurityManager.getSystemPrincipal(),
            _forZenEmptyTab: true
        });
        // Remove zen-empty-tab so workspace logic treats this as a normal tab,
        // but keep zen-board-tab so session restore knows to use a transparent browser.
        tab.removeAttribute("zen-empty-tab");
        tab.setAttribute("zen-board-tab", "true");
        window.gBrowser.selectedTab = tab;
    }
}

// Ensure the global instance is available if this script is loaded as a script
if (typeof window !== "undefined") {
    window.gZenBoard = new ZenBoard();
}
