/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// ── Native filesystem asset storage ──────────────────────────────────────────
// Captures (and any other blobs) are stored as files in the user's profile
// directory instead of as blobs in IndexedDB.
// This avoids SHA-256 hashing in JavaScript (no ArrayBuffer allocation),
// keeps IndexedDB tiny, and enables direct file:// streaming.

const ASSETS_FOLDER_NAME = "zen-board-assets";
let _nativeAssetsFolder = null;

async function getNativeAssetsFolder() {
  if (_nativeAssetsFolder) {
    return _nativeAssetsFolder;
  }
  const folder = PathUtils.join(PathUtils.profileDir, ASSETS_FOLDER_NAME);
  await IOUtils.makeDirectory(folder, { ignoreExisting: true });
  _nativeAssetsFolder = folder;
  return folder;
}

function mimeToExt(mimeType) {
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[mimeType] || "bin";
}

/**
 * Write a Blob to the zen-board-assets folder. Returns the filename.
 *
 * @param {Blob} blob The blob to save.
 */
async function saveAssetToFilesystem(blob) {
  const folder = await getNativeAssetsFolder();
  const ext = mimeToExt(blob.type);
  const filename = `${crypto.randomUUID()}.${ext}`;
  const destPath = PathUtils.join(folder, filename);
  const buffer = await blob.arrayBuffer();
  await IOUtils.write(destPath, new Uint8Array(buffer));
  return filename;
}

/**
 * Append a capture record to a board's scene array directly in IndexedDB.
 * Uses the chrome-window's own indexedDB so it works before the board tab
 * exists (the capture picker runs in the chrome process).
 *
 * @param {IDBDatabase} db An open connection to the board database.
 * @param {string} boardId The board to append to.
 * @param {object} captureData The capture scene object to push.
 */
function appendCaptureToBoard(db, boardId, captureData) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    const store = tx.objectStore("boards");
    const getReq = store.get(boardId);
    getReq.onsuccess = () => {
      const board = getReq.result;
      if (!board) {
        reject(new Error("Board not found"));
        return;
      }
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

/**
 * Open the board IndexedDB using the chrome window's own indexedDB instance.
 * We cannot use db.mjs here because that module uses the content-process
 * indexedDB global; this chrome-side code needs to go through the chrome
 * window's own indexedDB for the appendCaptureToBoard helper.
 */
function openChromeDB(win) {
  return new Promise((resolve, reject) => {
    const req = win.indexedDB.open("zen-board-db", 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("boards")) {
        db.createObjectStore("boards", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("assets")) {
        db.createObjectStore("assets", { keyPath: "hash" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * List all boards from a chrome-side DB connection, sorted newest-first.
 *
 * @param {IDBDatabase} db An open connection to the board database.
 */
function listBoardsFromDB(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readonly");
    const req = tx.objectStore("boards").getAll();
    req.onsuccess = () => {
      const boards = req.result.map(({ id, title, lastEdited }) => ({
        id,
        title,
        lastEdited,
      }));
      boards.sort((a, b) => b.lastEdited - a.lastEdited);
      resolve(boards);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Create a new blank board via a chrome-side DB connection.
 * Returns the new board's UUID.
 *
 * @param {IDBDatabase} db An open connection to the board database.
 * @param {string} title The initial board title.
 */
function createBoardInDB(db, title) {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    const store = tx.objectStore("boards");
    const board = {
      id,
      title,
      isTransparent: true,
      lastEdited: Date.now(),
      scene: [],
    };
    const req = store.put(board);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a board record and its asset files using a chrome-side DB opened
 * against the CONTENT window's IndexedDB. This is necessary because the board
 * data lives in the content page's IDB (chrome://browser/content/zen-board/)
 * and the chrome process cannot reach it via its own global indexedDB.
 *
 * @param {IDBDatabase} db A DB opened via contentWindow.indexedDB.
 * @param {string} id The board UUID to delete.
 */
async function deleteBoardFromDB(db, id) {
  // Load the board to gather its asset file references
  const board = await new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readonly");
    const req = tx.objectStore("boards").get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });

  if (!board) {
    return; // Already gone
  }

  // Collect filesystem asset filenames referenced by this board's scene
  const boardAssetFiles = new Set();
  for (const obj of board.scene || []) {
    if (obj._assetFile) {
      boardAssetFiles.add(obj._assetFile);
    }
  }

  // Delete the board record
  await new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    const req = tx.objectStore("boards").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  if (boardAssetFiles.size === 0) {
    return;
  }

  // Check remaining boards to avoid deleting shared assets
  const remaining = await new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readonly");
    const req = tx.objectStore("boards").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const usedFiles = new Set();
  for (const b of remaining) {
    for (const obj of b.scene || []) {
      if (obj._assetFile) {
        usedFiles.add(obj._assetFile);
      }
    }
  }

  // Delete orphaned filesystem assets
  const assetsFolder = PathUtils.join(PathUtils.profileDir, "zen-board-assets");
  for (const filename of boardAssetFiles) {
    if (!usedFiles.has(filename)) {
      try {
        await IOUtils.remove(PathUtils.join(assetsFolder, filename), {
          ignoreAbsent: true,
        });
      } catch (e) {
        console.warn("ZenBoard: Failed to delete orphaned asset", filename, e);
      }
    }
  }
}

async function doAddToBoard(
  chromeWindow,
  boardId,
  boardTitle,
  blob,
  sourceUrl,
  region
) {
  try {
    const db = await openChromeDB(chromeWindow);
    // Save the capture PNG to the native filesystem (no hashing, no IDB blob storage)
    const assetFilename = await saveAssetToFilesystem(blob);

    const gb = chromeWindow.gBrowser;
    const existingTab = gb
      ? Array.from(gb.tabs).find(t => {
          try {
            return t.linkedBrowser?.currentURI?.spec?.includes(`id=${boardId}`);
          } catch {
            return false;
          }
        })
      : null;

    let spawnX = 0;
    let spawnY = 0;
    if (existingTab && existingTab.linkedBrowser?.contentWindow) {
      const win = existingTab.linkedBrowser.contentWindow;
      try {
        if (win.getTransformedPoint && win.getState) {
          const { x, y } = win.getTransformedPoint(
            win.innerWidth / 2,
            win.innerHeight / 2
          );
          spawnX = x;
          spawnY = y;
        } else {
          spawnX = win.innerWidth / 2;
          spawnY = win.innerHeight / 2;
        }
      } catch (e) {
        spawnX = (win.innerWidth || 1280) / 2;
        spawnY = (win.innerHeight || 800) / 2;
      }
    } else {
      spawnX = (chromeWindow.innerWidth || 1280) / 2;
      spawnY = (chromeWindow.innerHeight || 800) / 2;
    }

    const captureObj = {
      type: "capture",
      id: crypto.randomUUID(),
      x: spawnX - (region?.width || 800) / 2,
      y: spawnY - (region?.height || 600) / 2,
      width: region?.width || 800,
      height: region?.height || 600,
      sourceUrl,
      sourceRegion: region
        ? {
            left: region.left || 0,
            top: region.top || 0,
            width: region.width,
            height: region.height,
            devicePixelRatio: region.devicePixelRatio || 1,
            viewportWidth: region.viewportWidth || 0,
            viewportHeight: region.viewportHeight || 0,
          }
        : null,
      _assetFile: assetFilename, // filesystem reference (new)
      _assetHash: null, // IDB reference (legacy, unused)
    };
    await appendCaptureToBoard(db, boardId, captureObj);

    // Open or notify the tab
    const boardUrl = `chrome://browser/content/zen-board/board.html?id=${boardId}`;
    if (!gb) {
      return;
    }

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
      gb.pinTab(tab);
      gb.selectedTab = tab;
    }
  } catch (e) {
    console.error("ZenBoard: Add to Board failed", e);
  }
}

// BC IDs of <xul:browser> elements created inside Zen Board pages for live embeds.
// The board page registers IDs here immediately after appendChild so the observer
// can positively identify the HTTP load without relying on embedderElement access
// (which may be null/inaccessible across process boundaries at observer-fire time).
const zenBoardLiveEmbedBCIds = new Set();

const ZenBoardXFOObserver = {
  // eslint-disable-next-line complexity
  observe(subject, topic, _data) {
    if (
      topic !== "http-on-examine-response" &&
      topic !== "http-on-examine-merged-response" &&
      topic !== "http-on-examine-cached-response" &&
      topic !== "http-on-modify-request"
    ) {
      return;
    }
    try {
      const channel = subject.QueryInterface(Ci.nsIHttpChannel);
      const loadInfo = channel.loadInfo;
      if (!loadInfo) {
        return;
      }

      const policyType = loadInfo.externalContentPolicyType;
      const nsICP = Ci.nsIContentPolicy;
      if (
        policyType !== nsICP.TYPE_SUBDOCUMENT &&
        policyType !== nsICP.TYPE_DOCUMENT
      ) {
        return;
      }

      const uriSpec = channel.URI?.spec ?? "";

      // Skip the rest for requests (we only strip headers on responses)
      if (topic === "http-on-modify-request") {
        return;
      }

      // ── Identify whether the load belongs to the Zen Board ──────────
      // Path A — BC ID registration:
      //   Convert to Number on BOTH sides — browsingContextID can be a
      //   64-bit uint that JS may represent as a different numeric type.
      const loadBCId = Number(loadInfo.browsingContextID);
      const isRegisteredEmbed = zenBoardLiveEmbedBCIds.has(loadBCId);

      // Path B — topmost BC document is board.html (regular iframe in board):
      const topDocURI =
        loadInfo.browsingContext?.top?.currentWindowGlobal?.documentURI?.spec;
      // Path C — loading principal URI matches board page:
      const loadingSpec = loadInfo.loadingPrincipal?.URI?.spec;
      // Path D — embedder element's owner document URL:
      const embedderDocURL =
        loadInfo.browsingContext?.embedderElement?.ownerDocument?.URL;
      // Path E is intentionally omitted: stripping XFO/CSP for any
      // system-principal parent would be an overly broad security bypass.

      const BOARD_URL = "chrome://browser/content/zen-board/board.html";
      const isZenBoard =
        isRegisteredEmbed ||
        (topDocURI && topDocURI.startsWith(BOARD_URL)) ||
        (loadingSpec && loadingSpec.startsWith(BOARD_URL)) ||
        (embedderDocURL && embedderDocURL.startsWith(BOARD_URL));

      if (isZenBoard) {
        try {
          channel.setResponseHeader("X-Frame-Options", "", false);
        } catch (e) {}
        try {
          const csp = channel.getResponseHeader("Content-Security-Policy");
          if (csp) {
            channel.setResponseHeader("Content-Security-Policy", "", false);
          }
        } catch (e) {}
      }
    } catch (e) {}
  },
};

let xfoObserverRegistered = false;
function registerObserver(services) {
  if (xfoObserverRegistered) {
    return;
  }
  try {
    services.obs.addObserver(ZenBoardXFOObserver, "http-on-examine-response");
    services.obs.addObserver(
      ZenBoardXFOObserver,
      "http-on-examine-merged-response"
    );
    services.obs.addObserver(
      ZenBoardXFOObserver,
      "http-on-examine-cached-response"
    );
    services.obs.addObserver(ZenBoardXFOObserver, "http-on-modify-request");
    xfoObserverRegistered = true;
  } catch (e) {}
}

export class ZenBoard {
  async openZenBoard(win) {
    if (!win || !win.gBrowser) {
      console.error("ZenBoard: Invalid window provided");
      return;
    }
    registerObserver(win.Services);

    let boardId;
    try {
      const db = await openChromeDB(win);
      boardId = await createBoardInDB(db, "Untitled Board");
      db.close();
    } catch (e) {
      console.error("[ZenBoard] Failed to create new board in openZenBoard", e);
      boardId = crypto.randomUUID(); // Fallback UUID
    }

    const url = `chrome://browser/content/zen-board/board.html?id=${boardId}`;
    const tab = win.gBrowser.addTrustedTab(url, {
      triggeringPrincipal:
        win.Services.scriptSecurityManager.getSystemPrincipal(),
      _forZenEmptyTab: true,
    });
    tab.removeAttribute("zen-empty-tab");
    tab.setAttribute("zen-board-tab", "true");
    tab.setAttribute("zen-board-id", boardId);
    win.gBrowser.pinTab(tab);
    win.gBrowser.selectedTab = tab;
  }

  /**
   * Called by the board page (capture-controls.js) when a live-embed <xul:browser>
   * is created. Stores the browsing context ID so the HTTP observer can strip
   * X-Frame-Options / CSP headers for that specific load.
   *
   * @param {number} bcId  The browsingContext.id of the injected browser element.
   */
  registerLiveEmbedBC(bcId) {
    if (bcId != null) {
      zenBoardLiveEmbedBCIds.add(Number(bcId));
    }
  }

  /**
   * Register a listener on the given chrome window for the ZenBoard:CaptureReady
   * event dispatched by ScreenshotsUtils when the user clicks "Add to Board".
   * Opens the board picker popup as a dialog.
   *
   * @param {Window} chromeWindow The browser chrome window to attach to.
   */
  listenForCapture(chromeWindow) {
    if (!chromeWindow) {
      return;
    }

    // Register observer safely using the guaranteed chromeWindow.Services object
    registerObserver(chromeWindow.Services);

    // Avoid double registration
    if (chromeWindow._zenBoardCaptureListenerAdded) {
      return;
    }
    chromeWindow._zenBoardCaptureListenerAdded = true;

    const handler = async event => {
      const { blob, sourceUrl, region, anchor } = event.detail;
      if (!blob) {
        return;
      }

      const doc = chromeWindow.document;
      let popupSet = doc.getElementById("mainPopupSet");
      if (!popupSet) {
        return;
      }

      // Re-use or create the menupopup
      let menupopup = doc.getElementById("zen-board-capture-menupopup");
      if (menupopup) {
        menupopup.remove();
      }

      menupopup = doc.createXULElement("menupopup");
      menupopup.setAttribute("id", "zen-board-capture-menupopup");
      menupopup.setAttribute("style", "max-height: 400px; overflow-y: auto;");

      // Fetch boards (using chrome-side DB so this works before any board tab
      // is open — the capture picker runs entirely in the chrome process).
      const db = await openChromeDB(chromeWindow);
      const boards = await listBoardsFromDB(db);
      db.close();

      let untitledLabel = "Untitled Board";
      let createLabel = "Create New Board...";
      try {
        const translated = await chromeWindow.document.l10n.formatValues([
          { id: "zen-board-untitled-board" },
          { id: "zen-board-create-new-board" },
        ]);
        if (translated) {
          if (translated[0]) {
            untitledLabel = translated[0];
          }
          if (translated[1]) {
            createLabel = translated[1];
          }
        }
      } catch (e) {
        console.error("ZenBoard: Failed to translate popup labels", e);
      }

      if (boards.length) {
        for (const board of boards) {
          let item = doc.createXULElement("menuitem");
          item.setAttribute("class", "menuitem-iconic");
          let boardTitle = board.title || "Untitled Board";
          if (boardTitle === "Untitled Board") {
            boardTitle = untitledLabel;
          }
          item.setAttribute("label", boardTitle);
          // Use a generic icon, like the page icon
          item.setAttribute(
            "image",
            "chrome://browser/skin/zen-icons/canvas.svg"
          );
          item.addEventListener("command", () => {
            doAddToBoard(
              chromeWindow,
              board.id,
              board.title,
              blob,
              sourceUrl,
              region
            );
          });
          menupopup.appendChild(item);
        }
        menupopup.appendChild(doc.createXULElement("menuseparator"));
      }

      let createItem = doc.createXULElement("menuitem");
      createItem.setAttribute("label", createLabel);
      createItem.setAttribute("class", "menuitem-iconic");
      createItem.setAttribute(
        "image",
        "chrome://browser/skin/zen-icons/plus.svg"
      );
      createItem.addEventListener("command", async () => {
        try {
          const newDb = await openChromeDB(chromeWindow);
          const id = await createBoardInDB(newDb, "Untitled Board");
          newDb.close();
          doAddToBoard(
            chromeWindow,
            id,
            "Untitled Board",
            blob,
            sourceUrl,
            region
          );
        } catch (e) {
          console.error(e);
        }
      });
      menupopup.appendChild(createItem);

      popupSet.appendChild(menupopup);

      // Open near the anchor point!
      const x = anchor
        ? anchor.x
        : chromeWindow.screenX + chromeWindow.outerWidth / 2;
      const y = anchor
        ? anchor.y
        : chromeWindow.screenY + chromeWindow.outerHeight / 2;
      menupopup.openPopupAtScreen(x, y, true);
    };

    const tabCloseHandler = async event => {
      const tab = event.target;
      const linkedBrowser = tab.linkedBrowser;
      const urlSpec = linkedBrowser?.currentURI?.spec;

      // Retrieve the board ID using multiple fallbacks.
      // We check:
      // 1. The tab element's "zen-board-id" attribute
      // 2. The linkedBrowser element's "zen-board-id" attribute (updated by board.mjs in e10s content process)
      // 3. The query parameters of the tab's current URI
      let boardId = tab.getAttribute("zen-board-id") ||
                    linkedBrowser?.getAttribute("zen-board-id");
      
      if (!boardId && urlSpec) {
        try {
          const url = new URL(urlSpec);
          boardId = url.searchParams.get("id");
        } catch (e) {
          const match = urlSpec.match(/[?&]id=([^&#]+)/);
          if (match) {
            boardId = decodeURIComponent(match[1]);
          }
        }
      }

      const isBoardTab =
        tab.hasAttribute("zen-board-tab") ||
        linkedBrowser?.hasAttribute("zen-board-tab") ||
        (urlSpec &&
          urlSpec.startsWith(
            "chrome://browser/content/zen-board/board.html"
          ));

      if (!isBoardTab || !boardId) {
        return;
      }

      if (chromeWindow.closed || chromeWindow.gBrowser.closing) {
        return;
      }

      // Check if this board is still open in another tab or window
      let isStillOpen = false;
      const windows = Services.wm.getEnumerator("navigator:browser");
      while (windows.hasMoreElements()) {
        const win = windows.getNext();
        const gb = win.gBrowser;
        if (gb) {
          for (const otherTab of gb.tabs) {
            if (otherTab === tab) {
              continue;
            }
            const otherUrl = otherTab.linkedBrowser?.currentURI?.spec;
            let otherBoardId = otherTab.getAttribute("zen-board-id") ||
                               otherTab.linkedBrowser?.getAttribute("zen-board-id");
            if (!otherBoardId && otherUrl) {
              try {
                const url = new URL(otherUrl);
                otherBoardId = url.searchParams.get("id");
              } catch (e) {
                const match = otherUrl.match(/[?&]id=([^&#]+)/);
                if (match) {
                  otherBoardId = decodeURIComponent(match[1]);
                }
              }
            }
            if (otherBoardId === boardId) {
              isStillOpen = true;
              break;
            }
          }
        }
        if (isStillOpen) {
          break;
        }
      }

      if (isStillOpen) {
        return;
      }

      // Safety check: don't delete bookmarked boards
      try {
        const placesUtils = ChromeUtils.importESModule(
          "resource://gre/modules/PlacesUtils.sys.mjs"
        ).PlacesUtils;
        const boardUrl = `chrome://browser/content/zen-board/board.html?id=${boardId}`;
        const isBookmarked = await placesUtils.bookmarks
          .fetch({ url: boardUrl })
          .then(bm => !!bm)
          .catch(() => false);
        
        if (isBookmarked) {
          return;
        }
      } catch (bookmarkErr) {
        console.error("[ZenBoard] Failed to check bookmarks", bookmarkErr);
      }

      // Delete the board using the chrome window's indexedDB.
      try {
        const db = await openChromeDB(chromeWindow);
        await deleteBoardFromDB(db, boardId);
        db.close();
      } catch (e) {
        console.error("[ZenBoard] Failed to delete board on tab close", e);
      }
    };

    const updateUrlbarAttribute = tab => {
      const selectedTab = chromeWindow.gBrowser?.selectedTab;
      if (!tab || tab !== selectedTab) {
        return;
      }
      const urlSpec = tab.linkedBrowser?.currentURI?.spec;
      const isBoardTab = tab.hasAttribute("zen-board-tab") ||
                         tab.linkedBrowser?.hasAttribute("zen-board-tab") ||
                         urlSpec?.startsWith("chrome://browser/content/zen-board/board.html");

      chromeWindow.document.getElementById("urlbar")?.toggleAttribute("zen-board-active", !!isBoardTab);
    };

    const tabSelectHandler = event => updateUrlbarAttribute(event.target);
    const tabAttrModifiedHandler = event => updateUrlbarAttribute(event.target);

    const progressListener = {
      onLocationChange(aBrowser) {
        if (aBrowser === chromeWindow.gBrowser?.selectedBrowser) {
          updateUrlbarAttribute(chromeWindow.gBrowser.selectedTab);
        }
      },
    };

    // Wrap urlbar trim function to handle board URLs
    let currentTrim = null;
    let boardLabel = "Board";
    if (chromeWindow.document.l10n) {
      chromeWindow.document.l10n.formatValues([{ id: "zen-board-urlbar-label" }])
        .then(translated => {
          if (translated?.[0]) {
            boardLabel = translated[0];
          }
        })
        .catch(e => console.error("Failed to translate zen-board-urlbar-label:", e));
    }

    if (chromeWindow.gURLBar && !chromeWindow.gURLBar._zenBoardTrimWrapped) {
      chromeWindow.gURLBar._zenBoardTrimWrapped = true;
      currentTrim = chromeWindow.gURLBar._zenTrimURL;
      Object.defineProperty(chromeWindow.gURLBar, "_zenTrimURL", {
        get() {
          return function(aURL) {
            if (aURL?.startsWith("chrome://browser/content/zen-board/board.html")) {
              return boardLabel;
            }
            return currentTrim ? currentTrim.call(this, aURL) : aURL;
          };
        },
        set(val) {
          currentTrim = val;
        },
        configurable: true,
      });
    }

    // Wrap copy actions to protect board URLs from leakage
    let originalCopy = null;
    let originalCopyMarkdown = null;
    if (chromeWindow.gZenCommonActions && !chromeWindow.gZenCommonActions._zenBoardCopyWrapped) {
      chromeWindow.gZenCommonActions._zenBoardCopyWrapped = true;
      originalCopy = chromeWindow.gZenCommonActions.copyCurrentURLToClipboard;
      originalCopyMarkdown = chromeWindow.gZenCommonActions.copyCurrentURLAsMarkdownToClipboard;

      chromeWindow.gZenCommonActions.copyCurrentURLToClipboard = function() {
        const [currentUrl] = chromeWindow.gURLBar.zenStrippedURI;
        if (currentUrl?.displaySpec?.startsWith("chrome://browser/content/zen-board/board.html")) {
          return;
        }
        originalCopy.apply(this);
      };

      chromeWindow.gZenCommonActions.copyCurrentURLAsMarkdownToClipboard = function() {
        const [currentUrl] = chromeWindow.gURLBar.zenStrippedURI;
        if (currentUrl?.displaySpec?.startsWith("chrome://browser/content/zen-board/board.html")) {
          return;
        }
        originalCopyMarkdown.apply(this);
      };
    }

    const focusHandler = () => {
      if (chromeWindow.gURLBar?.hasAttribute("zen-board-active")) {
        chromeWindow.gURLBar._setValue("", {
          untrimmedValue: chromeWindow.gURLBar._untrimmedValue,
        });
      }
    };

    chromeWindow.addEventListener("ZenBoard:CaptureReady", handler);
    chromeWindow.addEventListener("TabClose", tabCloseHandler);
    chromeWindow.addEventListener("TabSelect", tabSelectHandler);
    chromeWindow.addEventListener("TabAttrModified", tabAttrModifiedHandler);
    chromeWindow.gBrowser?.addTabsProgressListener(progressListener);
    chromeWindow.gURLBar?.inputField?.addEventListener("focus", focusHandler);

    // Initial check
    if (chromeWindow.gBrowser?.selectedTab) {
      updateUrlbarAttribute(chromeWindow.gBrowser.selectedTab);
    }

    // Clean up when the window is closed
    chromeWindow.addEventListener(
      "unload",
      () => {
        chromeWindow.removeEventListener("ZenBoard:CaptureReady", handler);
        chromeWindow.removeEventListener("TabClose", tabCloseHandler);
        chromeWindow.removeEventListener("TabSelect", tabSelectHandler);
        chromeWindow.removeEventListener("TabAttrModified", tabAttrModifiedHandler);
        chromeWindow.gBrowser?.removeTabsProgressListener(progressListener);
        chromeWindow.gURLBar?.inputField?.removeEventListener("focus", focusHandler);
        if (chromeWindow.gURLBar && chromeWindow.gURLBar._zenBoardTrimWrapped) {
          delete chromeWindow.gURLBar._zenTrimURL;
          chromeWindow.gURLBar._zenTrimURL = currentTrim;
          delete chromeWindow.gURLBar._zenBoardTrimWrapped;
        }
        if (chromeWindow.gZenCommonActions && chromeWindow.gZenCommonActions._zenBoardCopyWrapped) {
          chromeWindow.gZenCommonActions.copyCurrentURLToClipboard = originalCopy;
          chromeWindow.gZenCommonActions.copyCurrentURLAsMarkdownToClipboard = originalCopyMarkdown;
          delete chromeWindow.gZenCommonActions._zenBoardCopyWrapped;
        }
        delete chromeWindow._zenBoardCaptureListenerAdded;
      },
      { once: true }
    );
  }
}

// Ensure the global instance is available if this script is loaded as a script
if (typeof window !== "undefined") {
  window.gZenBoard = new ZenBoard();
}
