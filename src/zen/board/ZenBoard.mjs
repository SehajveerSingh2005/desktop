/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  openChromeDB,
  createBoardInDB,
  listBoardsFromDB,
  appendCaptureToBoard,
} from "./chrome-db.mjs";

const ASSETS_FOLDER_NAME = "zen-board-assets";
const BOARD_URL = "chrome://browser/content/zen-board/board.html";

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "assetsFolder", () =>
  PathUtils.join(PathUtils.profileDir, ASSETS_FOLDER_NAME)
);

async function getNativeAssetsFolder() {
  await IOUtils.makeDirectory(lazy.assetsFolder, { ignoreExisting: true });
  return lazy.assetsFolder;
}

// Duplicated in modules/assets.mjs — cross-process boundary prevents sharing.
function mimeToExt(mimeType) {
  const MIME_MAP = {
    "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
    "image/gif": "gif", "image/webp": "webp", "image/avif": "avif",
    "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm",
    "video/ogg": "ogv", "video/quicktime": "mov",
  };
  return MIME_MAP[mimeType] || "bin";
}

async function saveAssetToFilesystem(blob) {
  const folder = await getNativeAssetsFolder();
  const ext = mimeToExt(blob.type);
  const filename = `${crypto.randomUUID()}.${ext}`;
  const destPath = PathUtils.join(folder, filename);
  await IOUtils.write(destPath, new Uint8Array(await blob.arrayBuffer()));
  return filename;
}

// ── Board deletion with orphaned asset cleanup ─────────────────────────────

async function deleteBoardFromDB(db, id) {
  const board = await new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readonly");
    const req = tx.objectStore("boards").get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });

  if (!board) {
    return;
  }

  const boardAssetFiles = new Set();
  for (const obj of board.scene || []) {
    if (obj._assetFile) {
      boardAssetFiles.add(obj._assetFile);
    }
  }

  await new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    const req = tx.objectStore("boards").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  if (boardAssetFiles.size === 0) {
    return;
  }

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

  for (const filename of boardAssetFiles) {
    if (!usedFiles.has(filename)) {
      try {
        await IOUtils.remove(PathUtils.join(lazy.assetsFolder, filename), {
          ignoreAbsent: true,
        });
      } catch (e) {
        console.warn("ZenBoard: Failed to delete orphaned asset", filename, e);
      }
    }
  }
}

// ── Add capture to board ────────────────────────────────────────────────────

function findBoardTab(gb, boardId) {
  if (!gb) {
    return null;
  }
  return Array.from(gb.tabs).find(t =>
    t.linkedBrowser?.currentURI?.spec?.includes(`id=${boardId}`)
  ) || null;
}

function getSpawnPosition(chromeWindow, existingTab) {
  if (existingTab?.linkedBrowser?.contentWindow) {
    const win = existingTab.linkedBrowser.contentWindow;
    try {
      if (win.getTransformedPoint && win.getState) {
        const { x, y } = win.getTransformedPoint(win.innerWidth / 2, win.innerHeight / 2);
        return { x, y };
      }
      return { x: win.innerWidth / 2, y: win.innerHeight / 2 };
    } catch {
      return { x: (win.innerWidth || 1280) / 2, y: (win.innerHeight || 800) / 2 };
    }
  }
  return {
    x: (chromeWindow.innerWidth || 1280) / 2,
    y: (chromeWindow.innerHeight || 800) / 2,
  };
}

function buildCaptureObj(spawnX, spawnY, region, sourceUrl, assetFilename) {
  return {
    type: "capture",
    id: crypto.randomUUID(),
    x: spawnX - (region?.width || 800) / 2,
    y: spawnY - (region?.height || 600) / 2,
    width: region?.width || 800,
    height: region?.height || 600,
    sourceUrl,
    sourceRegion: region ? {
      left: region.left || 0,
      top: region.top || 0,
      width: region.width,
      height: region.height,
      devicePixelRatio: region.devicePixelRatio || 1,
      viewportWidth: region.viewportWidth || 0,
      viewportHeight: region.viewportHeight || 0,
    } : null,
    _assetFile: assetFilename,
  };
}

function pinNewBoardTab(gb, chromeWindow, boardUrl, boardId) {
  const tab = gb.addTrustedTab(boardUrl, {
    triggeringPrincipal: chromeWindow.Services.scriptSecurityManager.getSystemPrincipal(),
    _forZenEmptyTab: true,
  });
  tab.removeAttribute("zen-empty-tab");
  tab.setAttribute("zen-board-tab", "true");
  tab.setAttribute("zen-board-id", boardId);
  gb.pinTab(tab);
  gb.selectedTab = tab;
}

async function doAddToBoard(chromeWindow, boardId, boardTitle, blob, sourceUrl, region) {
  try {
    const db = await openChromeDB(chromeWindow);
    const assetFilename = await saveAssetToFilesystem(blob);

    const gb = chromeWindow.gBrowser;
    const existingTab = findBoardTab(gb, boardId);
    const { x: spawnX, y: spawnY } = getSpawnPosition(chromeWindow, existingTab);

    const captureObj = buildCaptureObj(spawnX, spawnY, region, sourceUrl, assetFilename);
    await appendCaptureToBoard(db, boardId, captureObj);

    if (!gb) {
      return;
    }

    const boardUrl = `${BOARD_URL}?id=${boardId}`;
    if (existingTab) {
      gb.selectedTab = existingTab;
      existingTab.linkedBrowser.contentWindow?.dispatchEvent(
        new existingTab.linkedBrowser.contentWindow.CustomEvent(
          "ZenBoardCaptureAdded",
          { detail: { boardId } }
        )
      );
    } else {
      pinNewBoardTab(gb, chromeWindow, boardUrl, boardId);
    }
  } catch (e) {
    console.error("ZenBoard: Add to Board failed", e);
  }
}

// ── XFO/CSP observer for live embeds ────────────────────────────────────────

const zenBoardLiveEmbedBCIds = new Set();

function isZenBoardLoad(loadInfo) {
  if (!loadInfo) {
    return false;
  }

  const policyType = loadInfo.externalContentPolicyType;
  if (
    policyType !== Ci.nsIContentPolicy.TYPE_SUBDOCUMENT &&
    policyType !== Ci.nsIContentPolicy.TYPE_DOCUMENT
  ) {
    return false;
  }

  const loadBCId = Number(loadInfo.browsingContextID);
  if (zenBoardLiveEmbedBCIds.has(loadBCId)) {
    return true;
  }

  const topDocURI = loadInfo.browsingContext?.top?.currentWindowGlobal?.documentURI?.spec;
  if (topDocURI?.startsWith(BOARD_URL)) {
    return true;
  }

  const loadingSpec = loadInfo.loadingPrincipal?.URI?.spec;
  if (loadingSpec?.startsWith(BOARD_URL)) {
    return true;
  }

  const embedderDocURL = loadInfo.browsingContext?.embedderElement?.ownerDocument?.URL;
  if (embedderDocURL?.startsWith(BOARD_URL)) {
    return true;
  }

  return false;
}

const ZenBoardXFOObserver = {
  observe(subject, topic, _data) {
    if (
      topic !== "http-on-examine-response" &&
      topic !== "http-on-examine-merged-response" &&
      topic !== "http-on-examine-cached-response"
    ) {
      return;
    }

    try {
      const channel = subject.QueryInterface(Ci.nsIHttpChannel);
      if (!isZenBoardLoad(channel.loadInfo)) {
        return;
      }

      const uriSpec = channel.URI?.spec ?? "";
      try {
        channel.setResponseHeader("X-Frame-Options", "", false);
      } catch (e) {
        console.warn("ZenBoard: Failed to strip X-Frame-Options", uriSpec, e);
      }
      try {
        channel.setResponseHeader("Content-Security-Policy", "", false);
        channel.setResponseHeader("Content-Security-Policy-Report-Only", "", false);
      } catch (e) {
        console.warn("ZenBoard: Failed to strip CSP headers", uriSpec, e);
      }
    } catch (e) {
      console.warn("ZenBoard: XFO observer error", topic, e);
    }
  },
};

let xfoObserverRegistered = false;
function registerObserver(services) {
  if (xfoObserverRegistered) {
    return;
  }
  try {
    services.obs.addObserver(ZenBoardXFOObserver, "http-on-examine-response");
    services.obs.addObserver(ZenBoardXFOObserver, "http-on-examine-merged-response");
    services.obs.addObserver(ZenBoardXFOObserver, "http-on-examine-cached-response");
    xfoObserverRegistered = true;
  } catch (e) {
    console.warn("ZenBoard: Failed to register XFO observer", e);
  }
}

// ── Tab helpers ─────────────────────────────────────────────────────────────

function getBoardIdFromTab(tab) {
  const linkedBrowser = tab.linkedBrowser;
  let boardId = tab.getAttribute("zen-board-id") ||
                linkedBrowser?.getAttribute("zen-board-id");

  if (!boardId) {
    const urlSpec = linkedBrowser?.currentURI?.spec;
    if (urlSpec) {
      try {
        boardId = new URL(urlSpec).searchParams.get("id");
      } catch {
        const match = urlSpec.match(/[?&]id=([^&#]+)/);
        if (match) {
          boardId = decodeURIComponent(match[1]);
        }
      }
    }
  }
  return boardId;
}

function isBoardTab(tab) {
  const linkedBrowser = tab.linkedBrowser;
  if (tab.hasAttribute("zen-board-tab") || linkedBrowser?.hasAttribute("zen-board-tab")) {
    return true;
  }
  const urlSpec = linkedBrowser?.currentURI?.spec;
  return urlSpec?.startsWith(BOARD_URL) || false;
}

function isBoardOpenElsewhere(chromeWindow, closedTab, boardId) {
  const windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    const win = windows.getNext();
    const gb = win.gBrowser;
    if (!gb) {
      continue;
    }
    for (const otherTab of gb.tabs) {
      if (otherTab === closedTab) {
        continue;
      }
      if (getBoardIdFromTab(otherTab) === boardId) {
        return true;
      }
    }
  }
  return false;
}

async function isBoardBookmarked(boardId) {
  try {
    const placesUtils = ChromeUtils.importESModule(
      "resource://gre/modules/PlacesUtils.sys.mjs"
    ).PlacesUtils;
    const boardUrl = `${BOARD_URL}?id=${boardId}`;
    return await placesUtils.bookmarks
      .fetch({ url: boardUrl })
      .then(bm => !!bm)
      .catch(() => false);
  } catch {
    return false;
  }
}

// ── ZenBoard class ──────────────────────────────────────────────────────────

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
      return;
    }

    const url = `${BOARD_URL}?id=${boardId}`;
    const tab = win.gBrowser.addTrustedTab(url, {
      triggeringPrincipal: win.Services.scriptSecurityManager.getSystemPrincipal(),
      _forZenEmptyTab: true,
    });
    tab.removeAttribute("zen-empty-tab");
    tab.setAttribute("zen-board-tab", "true");
    tab.setAttribute("zen-board-id", boardId);
    win.gBrowser.pinTab(tab);
    win.gBrowser.selectedTab = tab;
  }

  registerLiveEmbedBC(bcId) {
    if (bcId != null) {
      zenBoardLiveEmbedBCIds.add(Number(bcId));
    }
  }

  unregisterLiveEmbedBC(bcId) {
    if (bcId != null) {
      zenBoardLiveEmbedBCIds.delete(Number(bcId));
    }
  }

  listenForCapture(chromeWindow) {
    if (!chromeWindow) {
      return;
    }

    registerObserver(chromeWindow.Services);

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
      const popupSet = doc.getElementById("mainPopupSet");
      if (!popupSet) {
        return;
      }

      let menupopup = doc.getElementById("zen-board-capture-menupopup");
      if (menupopup) {
        menupopup.remove();
      }

      menupopup = doc.createXULElement("menupopup");
      menupopup.setAttribute("id", "zen-board-capture-menupopup");
      menupopup.setAttribute("style", "max-height: 400px; overflow-y: auto;");

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
        if (translated?.[0]) {
          untitledLabel = translated[0];
        }
        if (translated?.[1]) {
          createLabel = translated[1];
        }
      } catch (e) {
        console.error("ZenBoard: Failed to translate popup labels", e);
      }

      if (boards.length) {
        for (const board of boards) {
          const item = doc.createXULElement("menuitem");
          item.setAttribute("class", "menuitem-iconic");
          const boardTitle = board.title === "Untitled Board"
            ? untitledLabel
            : board.title || untitledLabel;
          item.setAttribute("label", boardTitle);
          item.setAttribute("image", "chrome://browser/skin/zen-icons/canvas.svg");
          item.addEventListener("command", () => {
            doAddToBoard(chromeWindow, board.id, board.title, blob, sourceUrl, region);
          });
          menupopup.appendChild(item);
        }
        menupopup.appendChild(doc.createXULElement("menuseparator"));
      }

      const createItem = doc.createXULElement("menuitem");
      createItem.setAttribute("label", createLabel);
      createItem.setAttribute("class", "menuitem-iconic");
      createItem.setAttribute("image", "chrome://browser/skin/zen-icons/plus.svg");
      createItem.addEventListener("command", async () => {
        try {
          const newDb = await openChromeDB(chromeWindow);
          const id = await createBoardInDB(newDb, "Untitled Board");
          newDb.close();
          doAddToBoard(chromeWindow, id, "Untitled Board", blob, sourceUrl, region);
        } catch (e) {
          console.error("ZenBoard: Failed to create board from popup", e);
        }
      });
      menupopup.appendChild(createItem);

      popupSet.appendChild(menupopup);

      const x = anchor?.x ?? chromeWindow.screenX + chromeWindow.outerWidth / 2;
      const y = anchor?.y ?? chromeWindow.screenY + chromeWindow.outerHeight / 2;
      menupopup.openPopupAtScreen(x, y, true);
    };

    const tabCloseHandler = async event => {
      const tab = event.target;
      if (!isBoardTab(tab)) {
        return;
      }

      const boardId = getBoardIdFromTab(tab);
      if (!boardId) {
        return;
      }

      if (chromeWindow.closed || chromeWindow.gBrowser.closing) {
        return;
      }

      if (isBoardOpenElsewhere(chromeWindow, tab, boardId)) {
        return;
      }

      if (await isBoardBookmarked(boardId)) {
        return;
      }

      try {
        const db = await openChromeDB(chromeWindow);
        await deleteBoardFromDB(db, boardId);
        db.close();
      } catch (e) {
        console.error("[ZenBoard] Failed to delete board on tab close", e);
      }
    };

    const updateUrlbarAttribute = tab => {
      const selectedTab = chromeWindow.gBrowser.selectedTab;
      if (!tab || tab !== selectedTab) {
        return;
      }
      const isBoard = isBoardTab(tab);
      chromeWindow.document.getElementById("urlbar")?.toggleAttribute("zen-board-active", isBoard);
    };

    const tabSelectHandler = event => updateUrlbarAttribute(event.target);
    const tabAttrModifiedHandler = event => updateUrlbarAttribute(event.target);

    const progressListener = {
      onLocationChange(aBrowser) {
        if (aBrowser === chromeWindow.gBrowser.selectedBrowser) {
          updateUrlbarAttribute(chromeWindow.gBrowser.selectedTab);
        }
      },
    };

    // Wrap urlbar trim to hide chrome:// board URLs
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
          return function (aURL) {
            if (aURL?.startsWith(BOARD_URL)) {
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

    // Wrap copy actions to prevent leaking chrome:// board URLs
    let originalCopy = null;
    let originalCopyMarkdown = null;
    if (chromeWindow.gZenCommonActions && !chromeWindow.gZenCommonActions._zenBoardCopyWrapped) {
      chromeWindow.gZenCommonActions._zenBoardCopyWrapped = true;
      originalCopy = chromeWindow.gZenCommonActions.copyCurrentURLToClipboard;
      originalCopyMarkdown = chromeWindow.gZenCommonActions.copyCurrentURLAsMarkdownToClipboard;

      chromeWindow.gZenCommonActions.copyCurrentURLToClipboard = function () {
        const [currentUrl] = chromeWindow.gURLBar.zenStrippedURI;
        if (currentUrl?.displaySpec?.startsWith(BOARD_URL)) {
          return;
        }
        originalCopy.apply(this);
      };

      chromeWindow.gZenCommonActions.copyCurrentURLAsMarkdownToClipboard = function () {
        const [currentUrl] = chromeWindow.gURLBar.zenStrippedURI;
        if (currentUrl?.displaySpec?.startsWith(BOARD_URL)) {
          return;
        }
        originalCopyMarkdown.apply(this);
      };
    }

    const focusHandler = () => {
      if (chromeWindow.gURLBar.hasAttribute("zen-board-active")) {
        chromeWindow.gURLBar._setValue("", {
          untrimmedValue: chromeWindow.gURLBar._untrimmedValue,
        });
      }
    };

    chromeWindow.addEventListener("ZenBoard:CaptureReady", handler);
    chromeWindow.addEventListener("TabClose", tabCloseHandler);
    chromeWindow.addEventListener("TabSelect", tabSelectHandler);
    chromeWindow.addEventListener("TabAttrModified", tabAttrModifiedHandler);
    if (chromeWindow.gBrowser) {
      chromeWindow.gBrowser.addTabsProgressListener(progressListener);
      chromeWindow.gURLBar.inputField?.addEventListener("focus", focusHandler);

      if (chromeWindow.gBrowser.selectedTab) {
        updateUrlbarAttribute(chromeWindow.gBrowser.selectedTab);
      }
    }

    chromeWindow.addEventListener("unload", () => {
      chromeWindow.removeEventListener("ZenBoard:CaptureReady", handler);
      chromeWindow.removeEventListener("TabClose", tabCloseHandler);
      chromeWindow.removeEventListener("TabSelect", tabSelectHandler);
      chromeWindow.removeEventListener("TabAttrModified", tabAttrModifiedHandler);
      chromeWindow.gBrowser?.removeTabsProgressListener(progressListener);
      chromeWindow.gURLBar?.inputField?.removeEventListener("focus", focusHandler);
      if (chromeWindow.gURLBar?._zenBoardTrimWrapped) {
        delete chromeWindow.gURLBar._zenTrimURL;
        chromeWindow.gURLBar._zenTrimURL = currentTrim;
        delete chromeWindow.gURLBar._zenBoardTrimWrapped;
      }
      if (chromeWindow.gZenCommonActions?._zenBoardCopyWrapped) {
        chromeWindow.gZenCommonActions.copyCurrentURLToClipboard = originalCopy;
        chromeWindow.gZenCommonActions.copyCurrentURLAsMarkdownToClipboard = originalCopyMarkdown;
        delete chromeWindow.gZenCommonActions._zenBoardCopyWrapped;
      }
      delete chromeWindow._zenBoardCaptureListenerAdded;
    }, { once: true });
  }
}

if (typeof window !== "undefined") {
  window.gZenBoard = new ZenBoard();
}
