// capture-board-picker.js
// Runs inside capture-board-picker.html (chrome popup context).
// Receives the capture blob + sourceUrl via window.arguments[0] from ZenBoard.mjs.

(function () {
  'use strict';

  const DB_NAME = 'zen-board-db';
  const DB_VERSION = 2;

  // ── IDB helpers ────────────────────────────────────────────────
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function hashBlob(blob) {
    const buf = await blob.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function storeAsset(db, blob) {
    const hash = await hashBlob(blob);
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      const store = tx.objectStore('assets');
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
    });
  }

  async function listBoards(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('boards', 'readonly');
      const req = tx.objectStore('boards').getAll();
      req.onsuccess = () => {
        const boards = req.result.map(({ id, title, lastEdited }) => ({ id, title, lastEdited }));
        boards.sort((a, b) => b.lastEdited - a.lastEdited);
        resolve(boards);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function createBoard(db, title) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('boards', 'readwrite');
      const store = tx.objectStore('boards');
      const board = { id, title, isTransparent: true, lastEdited: Date.now(), scene: [] };
      const req = store.put(board);
      req.onsuccess = () => resolve(id);
      req.onerror = () => reject(req.error);
    });
  }

  async function appendCaptureToBoard(db, boardId, captureData) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('boards', 'readwrite');
      const store = tx.objectStore('boards');
      const getReq = store.get(boardId);
      getReq.onsuccess = () => {
        const board = getReq.result;
        if (!board) { reject(new Error('Board not found')); return; }
        board.lastEdited = Date.now();
        board.scene = board.scene || [];
        board.scene.push(captureData);
        const putReq = store.put(board);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // ── UI helpers ──────────────────────────────────────────────────
  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

  // ── Main ────────────────────────────────────────────────────────
  window.zenPickerInit = async function init() {
    console.error("ZenBoard Picker: Dialog HTML loaded and init() called!");
    // Get data passed from ZenBoard.mjs through window.arguments or global property
    const args = window.arguments?.[0] || window.zenPickerArgs;
    if (!args?.blob || !args?.sourceUrl) {
      console.error('ZenBoard Picker: No capture data provided');
      return;
    }

    const { blob, sourceUrl, region } = args;
    // When in a panel browser, window.opener is null, but we can access it via docShell.
    const chromeWindow = window.opener || window.docShell?.chromeEventHandler?.ownerGlobal;

    let db;
    try {
      db = await openDB();
    } catch (e) {
      console.error('ZenBoard Picker: Failed to open DB', e);
      return;
    }

    // Render existing boards
    const boardsList = document.getElementById('boards-list');
    const emptyMsg = document.getElementById('boards-empty');
    let boards = [];
    try {
      boards = await listBoards(db);
    } catch (e) {
      console.error('ZenBoard Picker: Failed to list boards', e);
    }

    if (boards.length === 0) {
      emptyMsg.hidden = false;
    } else {
      boards.forEach(board => {
        const item = document.createElement('div');
        item.className = 'board-item';
        item.innerHTML = `
          <div class="board-item-icon">${boardItemIcon()}</div>
          <div class="board-item-info">
            <div class="board-item-name">${escapeHTML(board.title || 'Untitled Board')}</div>
            <div class="board-item-date">${formatDate(board.lastEdited)}</div>
          </div>
          <div class="board-item-arrow">${arrowIcon()}</div>
        `;
        item.addEventListener('click', () => addToBoard(db, board.id, board.title, blob, sourceUrl, region, chromeWindow));
        boardsList.appendChild(item);
      });
    }

    // New board input
    const input = document.getElementById('new-board-name');
    const createBtn = document.getElementById('create-board-btn');

    input.focus();

    const doCreate = async () => {
      const name = input.value.trim() || 'Untitled Board';
      createBtn.disabled = true;
      try {
        const boardId = await createBoard(db, name);
        await addToBoard(db, boardId, name, blob, sourceUrl, region, chromeWindow);
      } catch (e) {
        console.error('ZenBoard Picker: Failed to create board', e);
        createBtn.disabled = false;
      }
    };

    createBtn.addEventListener('click', doCreate);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') doCreate();
    });
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function addToBoard(db, boardId, boardTitle, blob, sourceUrl, region, chromeWindow) {
    try {
      // Store the image asset in IDB
      const hash = await storeAsset(db, blob);

      // Add the capture object (centered relative to origin)
      const captureObj = {
        type: "capture",
        id: crypto.randomUUID(),
        x: -(region?.width || 800) / 2,
        y: -(region?.height || 600) / 2,
        width: region?.width || 800,
        height: region?.height || 600,
        sourceUrl: sourceUrl,
        sourceRegion: region,
        _assetHash: hash,
      };

      await appendCaptureToBoard(db, boardId, captureObj);

      // Notify the board tab (if open) to refresh, then open/focus it
      const boardUrl = `chrome://browser/content/zen-board/board.html?id=${boardId}`;

      if (chromeWindow?.gBrowser) {
        const gb = chromeWindow.gBrowser;
        // Check if a tab with this board is already open
        const existingTab = Array.from(gb.tabs).find(t => {
          try { return t.linkedBrowser?.currentURI?.spec?.includes(`id=${boardId}`); } catch { return false; }
        });

        if (existingTab) {
          gb.selectedTab = existingTab;
          // Dispatch a reload event to the board tab so it picks up the new object
          existingTab.linkedBrowser.contentWindow?.dispatchEvent(
            new existingTab.linkedBrowser.contentWindow.CustomEvent('ZenBoardCaptureAdded', { detail: { boardId } })
          );
        } else {
          const tab = gb.addTrustedTab(boardUrl, {
            triggeringPrincipal: chromeWindow.Services.scriptSecurityManager.getSystemPrincipal(),
            _forZenEmptyTab: true,
          });
          tab.removeAttribute('zen-empty-tab');
          tab.setAttribute('zen-board-tab', 'true');
          gb.selectedTab = tab;
        }
      }

      // Close the panel or window
      if (window.zenPickerPanel) {
        window.zenPickerPanel.hidePopup();
      } else {
        window.close();
      }
    } catch (e) {
      console.error('ZenBoard Picker: Failed to add to board', e);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    // Only auto-init if arguments are already available (openDialog)
    if (window.arguments && window.arguments[0]) {
      window.zenPickerInit();
    }
  });
})();
