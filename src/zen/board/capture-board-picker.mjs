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

// ── Filesystem helpers (write directly to profile/zen-board-assets) ─────
function mimeToExt(mimeType) {
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
  };
  return map[mimeType] || "bin";
}

async function saveAssetToFilesystem(blob) {
  const ASSETS_FOLDER_NAME = "zen-board-assets";
  const folder = PathUtils.join(PathUtils.profileDir, ASSETS_FOLDER_NAME);
  await IOUtils.makeDirectory(folder, { ignoreExisting: true });
  const ext = mimeToExt(blob.type);
  const filename = `${crypto.randomUUID()}.${ext}`;
  const destPath = PathUtils.join(folder, filename);
  await IOUtils.write(destPath, new Uint8Array(await blob.arrayBuffer()));
  return filename;
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

const ICON_BASE = "chrome://browser/content/zen-board/icons/";

function toolIcon(name) {
  const span = document.createElement("span");
  span.className = "tool-icon";
  span.style.maskImage = `url('${ICON_BASE}${name}.svg')`;
  return span;
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

  let untitledLabel = "Untitled Board";
  const [translated] = await document.l10n.formatValues([
    { id: "zen-board-untitled-board" },
  ]);
  if (translated) {
    untitledLabel = translated;
  }

  if (boards.length === 0) {
    emptyMsg.hidden = false;
  } else {
    boards.forEach(board => {
      const item = document.createElement("div");
      item.className = "board-item";
      const boardTitle = board.title === "Untitled Board"
        ? untitledLabel
        : board.title || untitledLabel;

      const iconEl = document.createElement("div");
      iconEl.className = "board-item-icon";
      iconEl.appendChild(toolIcon("board-grid"));

      const infoEl = document.createElement("div");
      infoEl.className = "board-item-info";
      const nameEl = document.createElement("div");
      nameEl.className = "board-item-name";
      nameEl.textContent = boardTitle;
      const dateEl = document.createElement("div");
      dateEl.className = "board-item-date";
      dateEl.textContent = formatDate(board.lastEdited);
      infoEl.appendChild(nameEl);
      infoEl.appendChild(dateEl);

      const arrowEl = document.createElement("div");
      arrowEl.className = "board-item-arrow";
      arrowEl.appendChild(toolIcon("chevron-right"));

      item.appendChild(iconEl);
      item.appendChild(infoEl);
      item.appendChild(arrowEl);
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
    const assetFilename = await saveAssetToFilesystem(blob);

    const boardRecord = await new Promise((resolve, reject) => {
      const tx = db.transaction("boards", "readonly");
      const req = tx.objectStore("boards").get(boardId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    const gb = chromeWindow?.gBrowser;
    const existingTab = gb ? Array.from(gb.tabs).find(t =>
      t.linkedBrowser?.currentURI?.spec?.includes(`id=${boardId}`)
    ) : null;

    let spawnX, spawnY;
    if (existingTab?.linkedBrowser?.contentWindow) {
      const win = existingTab.linkedBrowser.contentWindow;
      try {
        if (win.getTransformedPoint && win.getState && win.innerWidth > 0) {
          ({ x: spawnX, y: spawnY } = win.getTransformedPoint(win.innerWidth / 2, win.innerHeight / 2));
        } else {
          spawnX = (chromeWindow.innerWidth || 1280) / 2;
          spawnY = (chromeWindow.innerHeight || 800) / 2;
        }
      } catch {
        spawnX = (chromeWindow.innerWidth || 1280) / 2;
        spawnY = (chromeWindow.innerHeight || 800) / 2;
      }
    } else {
      spawnX = (chromeWindow.innerWidth || 1280) / 2;
      spawnY = (chromeWindow.innerHeight || 800) / 2;
    }

    if (boardRecord && boardRecord.scale) {
      spawnX = (spawnX - (boardRecord.offsetX || 0)) / boardRecord.scale;
      spawnY = (spawnY - (boardRecord.offsetY || 0)) / boardRecord.scale;
    }

    const captureObj = {
      type: "capture",
      id: crypto.randomUUID(),
      x: spawnX - (region?.width || 800) / 2,
      y: spawnY - (region?.height || 600) / 2,
      width: region?.width || 800,
      height: region?.height || 600,
      sourceUrl,
      sourceRegion: region,
      _assetFile: assetFilename,
    };

    await appendCaptureToBoard(db, boardId, captureObj);

    const boardUrl = `chrome://browser/content/zen-board/board.html?id=${boardId}`;

    if (gb) {
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
