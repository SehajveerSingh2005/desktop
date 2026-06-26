/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Runs inside capture-board-picker.html (chrome popup context).
// Receives the capture blob + sourceUrl via window.arguments[0] from ZenBoard.mjs.

import {
  openChromeDB,
  listBoardsFromDB,
  createBoardInDB,
  appendCaptureToBoard,
} from "./chrome-db.mjs";

// ── IDB helpers (legacy blob storage, used by picker) ──────────────────
function hashBlob(blob) {
  return blob.arrayBuffer()
    .then(buf => crypto.subtle.digest("SHA-256", buf))
    .then(hashBuf => Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join(""));
}

function storeAsset(db, blob) {
  return hashBlob(blob).then(hash =>
    new Promise((resolve, reject) => {
      const tx = db.transaction("assets", "readwrite");
      const store = tx.objectStore("assets");
      const get = store.get(hash);
      get.onsuccess = () => {
        if (!get.result) {
          const put = store.put({ hash, blob });
          put.onsuccess = () => resolve(hash);
          put.onerror = () => reject(put.error);
        } else {
          resolve(hash);
        }
      };
      get.onerror = () => reject(get.error);
    })
  );
}

// ── UI helpers ──────────────────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) {
    return "";
  }
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function boardItemIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
    <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
    <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
    <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2"/>
  </svg>`;
}

function arrowIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Main ────────────────────────────────────────────────────────────────
window.zenPickerInit = async function init() {
  const args = window.arguments?.[0] || window.zenPickerArgs;
  if (!args?.blob || !args?.sourceUrl) {
    console.error("ZenBoard Picker: No capture data provided");
    return;
  }

  const { blob, sourceUrl, region } = args;
  const chromeWindow =
    window.opener || window.docShell?.chromeEventHandler?.ownerDocument?.defaultView;

  let db;
  try {
    db = await openChromeDB(window);
  } catch (e) {
    console.error("ZenBoard Picker: Failed to open DB", e);
    return;
  }

  const boardsList = document.getElementById("boards-list");
  const emptyMsg = document.getElementById("boards-empty");
  let boards = [];
  try {
    boards = await listBoardsFromDB(db);
  } catch (e) {
    console.error("ZenBoard Picker: Failed to list boards", e);
  }

  if (boards.length === 0) {
    emptyMsg.hidden = false;
  } else {
    boards.forEach(board => {
      const item = document.createElement("div");
      item.className = "board-item";
      // eslint-disable-next-line no-unsanitized/property
      item.innerHTML = `
        <div class="board-item-icon">${boardItemIcon()}</div>
        <div class="board-item-info">
          <div class="board-item-name">${escapeHTML(board.title || "Untitled Board")}</div>
          <div class="board-item-date">${formatDate(board.lastEdited)}</div>
        </div>
        <div class="board-item-arrow">${arrowIcon()}</div>
      `;
      item.addEventListener("click", () =>
        addToBoard(db, board.id, board.title, blob, sourceUrl, region, chromeWindow)
      );
      boardsList.appendChild(item);
    });
  }

  const input = document.getElementById("new-board-name");
  const createBtn = document.getElementById("create-board-btn");

  input.focus();

  const doCreate = async () => {
    const boardName = input.value.trim() || "Untitled Board";
    createBtn.disabled = true;
    try {
      const boardId = await createBoardInDB(db, boardName);
      await addToBoard(db, boardId, boardName, blob, sourceUrl, region, chromeWindow);
    } catch (e) {
      console.error("ZenBoard Picker: Failed to create board", e);
      createBtn.disabled = false;
    }
  };

  createBtn.addEventListener("click", doCreate);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      doCreate();
    }
  });
};

async function addToBoard(db, boardId, boardTitle, blob, sourceUrl, region, chromeWindow) {
  try {
    const hash = await storeAsset(db, blob);

    const captureObj = {
      type: "capture",
      id: crypto.randomUUID(),
      x: -(region?.width || 800) / 2,
      y: -(region?.height || 600) / 2,
      width: region?.width || 800,
      height: region?.height || 600,
      sourceUrl,
      sourceRegion: region,
      _assetHash: hash,
    };

    await appendCaptureToBoard(db, boardId, captureObj);

    const boardUrl = `chrome://browser/content/zen-board/board.html?id=${boardId}`;

    if (chromeWindow?.gBrowser) {
      const gb = chromeWindow.gBrowser;
      const existingTab = Array.from(gb.tabs).find(t => {
        try {
          return t.linkedBrowser?.currentURI?.spec?.includes(`id=${boardId}`);
        } catch {
          return false;
        }
      });

      if (existingTab) {
        gb.selectedTab = existingTab;
        existingTab.linkedBrowser.contentWindow?.dispatchEvent(
          new existingTab.linkedBrowser.contentWindow.CustomEvent(
            "ZenBoardCaptureAdded",
            { detail: { boardId } }
          )
        );
      } else {
        const tab = gb.addTrustedTab(boardUrl, {
          triggeringPrincipal:
            chromeWindow.Services.scriptSecurityManager.getSystemPrincipal(),
          _forZenEmptyTab: true,
        });
        tab.removeAttribute("zen-empty-tab");
        tab.setAttribute("zen-board-tab", "true");
        tab.setAttribute("zen-board-id", boardId);
        gb.selectedTab = tab;
      }
    }

    if (window.zenPickerPanel) {
      window.zenPickerPanel.hidePopup();
    } else {
      window.close();
    }
  } catch (e) {
    console.error("ZenBoard Picker: Failed to add to board", e);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  if (window.arguments && window.arguments[0]) {
    window.zenPickerInit();
  }
});
