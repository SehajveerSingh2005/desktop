/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// ── Native filesystem asset storage ──────────────────────────────────────────
// Captures (and any other blobs) are stored as files in the user's profile
// directory instead of as blobs in IndexedDB.
// This avoids SHA-256 hashing in JavaScript (no ArrayBuffer allocation),
// keeps IndexedDB tiny, and enables direct file:// streaming.

const ASSETS_FOLDER_NAME = 'zen-board-assets';
const DB_NAME = 'zen-board-db';
let _nativeAssetsFolder = null;

async function getNativeAssetsFolder() {
    if (_nativeAssetsFolder) return _nativeAssetsFolder;
    const folder = PathUtils.join(PathUtils.profileDir, ASSETS_FOLDER_NAME);
    await IOUtils.makeDirectory(folder, { ignoreExisting: true });
    _nativeAssetsFolder = folder;
    return folder;
}

function mimeToExt(mimeType) {
    const map = {
        'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
        'image/gif': 'gif', 'image/webp': 'webp',
        'video/mp4': 'mp4', 'video/webm': 'webm',
    };
    return map[mimeType] || 'bin';
}

/**
 * Write a Blob to the zen-board-assets folder. Returns the filename.
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

function openDB(win) {
    return new Promise((resolve, reject) => {
        const req = win.indexedDB.open(DB_NAME, 2);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function listBoards(db) {
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

function createBoard(db, title) {
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


function appendCaptureToBoard(db, boardId, captureData) {
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

async function doAddToBoard(chromeWindow, boardId, boardTitle, blob, sourceUrl, region) {
    try {
        const db = await openDB(chromeWindow);
        // Save the capture PNG to the native filesystem (no hashing, no IDB blob storage)
        const assetFilename = await saveAssetToFilesystem(blob);

        const gb = chromeWindow.gBrowser;
        const existingTab = gb ? Array.from(gb.tabs).find(t => {
            try { return t.linkedBrowser?.currentURI?.spec?.includes(`id=${boardId}`); } catch { return false; }
        }) : null;

        let spawnX = 0;
        let spawnY = 0;
        if (existingTab && existingTab.linkedBrowser?.contentWindow) {
            const win = existingTab.linkedBrowser.contentWindow;
            try {
                if (win.getTransformedPoint && win.getState) {
                    const { x, y } = win.getTransformedPoint(win.innerWidth / 2, win.innerHeight / 2);
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
            sourceUrl: sourceUrl,
            sourceRegion: region ? {
                left: region.left || 0,
                top: region.top || 0,
                width: region.width,
                height: region.height,
                devicePixelRatio: region.devicePixelRatio || 1,
                viewportWidth: region.viewportWidth || 0,
                viewportHeight: region.viewportHeight || 0
            } : null,
            _assetFile: assetFilename,  // filesystem reference (new)
            _assetHash: null,           // IDB reference (legacy, unused)
        };
        await appendCaptureToBoard(db, boardId, captureObj);




        // Open or notify the tab
        const boardUrl = `chrome://browser/content/zen-board/board.html?id=${boardId}`;
        if (!gb) return;

        if (existingTab) {
            gb.selectedTab = existingTab;
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
    } catch (e) {
        console.error('ZenBoard: Add to Board failed', e);
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
        if (topic !== "http-on-examine-response" &&
            topic !== "http-on-examine-merged-response" &&
            topic !== "http-on-examine-cached-response" &&
            topic !== "http-on-modify-request") return;
        try {
            const channel = subject.QueryInterface(Components.interfaces.nsIHttpChannel);
            const loadInfo = channel.loadInfo;
            if (!loadInfo) return;

            const policyType = loadInfo.externalContentPolicyType;
            const nsICP = Components.interfaces.nsIContentPolicy;
            if (policyType !== nsICP.TYPE_SUBDOCUMENT && policyType !== nsICP.TYPE_DOCUMENT) return;

            // ── BROAD DEBUG ────────────────────────────────────────────────────────
            const uriSpec = channel.URI?.spec ?? "";
            if ((uriSpec.startsWith("https://") || uriSpec.startsWith("http://")) &&
                zenBoardLiveEmbedBCIds.size > 0) {
                const _dbgBcId = Number(loadInfo.browsingContextID);
                // Log REQUESTS (http-on-modify-request) separately from responses
                if (topic === "http-on-modify-request") {
                    console.error("[ZenBoard REQUEST]", uriSpec.slice(0, 70),
                        "type:", policyType,
                        "bcId:", _dbgBcId, "registered:", zenBoardLiveEmbedBCIds.has(_dbgBcId));
                } else {
                    console.error("[ZenBoard XFO probe]", uriSpec.slice(0, 70),
                        "topic:", topic, "type:", policyType,
                        "(SUBDOC=", nsICP.TYPE_SUBDOCUMENT, "DOC=", nsICP.TYPE_DOCUMENT, ")",
                        "bcId:", _dbgBcId,
                        "registered:", zenBoardLiveEmbedBCIds.has(_dbgBcId),
                        "setIds:", [...zenBoardLiveEmbedBCIds]);
                }
            }
            // ── END DEBUG ────────────────────────────────────────────────────────

            // Skip the rest for requests (we only strip headers on responses)
            if (topic === "http-on-modify-request") return;

            // ── Identify whether the load belongs to the Zen Board ──────────
            // Path A — BC ID registration:
            //   Convert to Number on BOTH sides — browsingContextID can be a
            //   64-bit uint that JS may represent as a different numeric type.
            const loadBCId = Number(loadInfo.browsingContextID);
            const isRegisteredEmbed = zenBoardLiveEmbedBCIds.has(loadBCId);

            // Path B — topmost BC document is board.html (regular iframe in board):
            const topDocURI = loadInfo.browsingContext?.top?.currentWindowGlobal?.documentURI?.spec;
            // Path C — loading principal URI matches board page:
            const loadingSpec = loadInfo.loadingPrincipal?.URI?.spec;
            // Path D — embedder element's owner document URL:
            const embedderDocURL = loadInfo.browsingContext?.embedderElement?.ownerDocument?.URL;
            // Path E — loading principal is system principal (→ the parent is a
            //   privileged chrome:// document that intentionally embedded this iframe):
            const isSystemPrincipalParent = !!(loadInfo.loadingPrincipal?.isSystemPrincipal);

            const BOARD_URL = "chrome://browser/content/zen-board/board.html";
            const isZenBoard =
                isRegisteredEmbed ||
                (topDocURI && topDocURI.startsWith(BOARD_URL)) ||
                (loadingSpec && loadingSpec.startsWith(BOARD_URL)) ||
                (embedderDocURL && embedderDocURL.startsWith(BOARD_URL));

            if (isZenBoard || isSystemPrincipalParent) {
                try { channel.setResponseHeader("X-Frame-Options", "", false); } catch (e) { }
                try {
                    const csp = channel.getResponseHeader("Content-Security-Policy");
                    if (csp) {
                        channel.setResponseHeader("Content-Security-Policy", "", false);
                    }
                } catch (e) { }
            }
        } catch (e) { }
    }
};

let xfoObserverRegistered = false;
function registerObserver(services) {
    if (xfoObserverRegistered) return;
    try {
        services.obs.addObserver(ZenBoardXFOObserver, "http-on-examine-response", false);
        services.obs.addObserver(ZenBoardXFOObserver, "http-on-examine-merged-response", false);
        services.obs.addObserver(ZenBoardXFOObserver, "http-on-examine-cached-response", false);
        services.obs.addObserver(ZenBoardXFOObserver, "http-on-modify-request", false);
        xfoObserverRegistered = true;
    } catch (e) { }
}

export class ZenBoard {
    openZenBoard(win) {
        if (!win || !win.gBrowser) {
            console.error("ZenBoard: Invalid window provided");
            return;
        }
        registerObserver(win.Services);
        const url = "chrome://browser/content/zen-board/board.html";
        const tab = win.gBrowser.addTrustedTab(url, {
            triggeringPrincipal: win.Services.scriptSecurityManager.getSystemPrincipal(),
            _forZenEmptyTab: true,
        });
        tab.removeAttribute('zen-empty-tab');
        tab.setAttribute('zen-board-tab', 'true');
        win.gBrowser.selectedTab = tab;
    }

    /**
     * Called by the board page (capture-controls.js) when a live-embed <xul:browser>
     * is created. Stores the browsing context ID so the HTTP observer can strip
     * X-Frame-Options / CSP headers for that specific load.
     * @param {number} bcId  The browsingContext.id of the injected browser element.
     */
    registerLiveEmbedBC(bcId) {
        if (bcId != null) zenBoardLiveEmbedBCIds.add(Number(bcId));
    }

    /**
     * Register a listener on the given chrome window for the ZenBoard:CaptureReady
     * event dispatched by ScreenshotsUtils when the user clicks "Add to Board".
     * Opens the board picker popup as a dialog.
     *
     * @param {Window} chromeWindow The browser chrome window to attach to.
     */
    listenForCapture(chromeWindow) {
        if (!chromeWindow) return;

        // Register observer safely using the guaranteed chromeWindow.Services object
        registerObserver(chromeWindow.Services);

        // Avoid double registration
        if (chromeWindow._zenBoardCaptureListenerAdded) return;
        chromeWindow._zenBoardCaptureListenerAdded = true;

        const handler = async (event) => {
            const { blob, sourceUrl, region, anchor } = event.detail;
            if (!blob) return;
            console.error("ZenBoard: Captured event received!", { sourceUrl, region });

            const doc = chromeWindow.document;
            let popupSet = doc.getElementById("mainPopupSet");
            if (!popupSet) return;

            // Re-use or create the menupopup
            let menupopup = doc.getElementById("zen-board-capture-menupopup");
            if (menupopup) { menupopup.remove(); }

            menupopup = doc.createXULElement("menupopup");
            menupopup.setAttribute("id", "zen-board-capture-menupopup");
            menupopup.setAttribute("style", "max-height: 400px; overflow-y: auto;");

            // Fetch boards directly
            let db = await openDB(chromeWindow);
            let boards = await listBoards(db);

            let untitledLabel = "Untitled Board";
            let createLabel = "Create New Board...";
            try {
                const translated = chromeWindow.document.l10n.formatValuesSync([
                    { id: "zen-board-untitled-board" },
                    { id: "zen-board-create-new-board" }
                ]);
                if (translated) {
                    if (translated[0]) untitledLabel = translated[0];
                    if (translated[1]) createLabel = translated[1];
                }
            } catch (e) {
                console.error("ZenBoard: Failed to translate popup labels", e);
            }

            if (boards.length > 0) {
                for (const board of boards) {
                    let item = doc.createXULElement("menuitem");
                    item.setAttribute("class", "menuitem-iconic");
                    let boardTitle = board.title || 'Untitled Board';
                    if (boardTitle === 'Untitled Board') {
                        boardTitle = untitledLabel;
                    }
                    item.setAttribute("label", boardTitle);
                    // Use a generic icon, like the page icon
                    item.setAttribute("image", "chrome://browser/skin/zen-icons/canvas.svg");
                    item.addEventListener("command", () => {
                        doAddToBoard(chromeWindow, board.id, board.title, blob, sourceUrl, region);
                    });
                    menupopup.appendChild(item);
                }
                menupopup.appendChild(doc.createXULElement("menuseparator"));
            }

            let createItem = doc.createXULElement("menuitem");
            createItem.setAttribute("label", createLabel);
            createItem.setAttribute("class", "menuitem-iconic");
            createItem.setAttribute("image", "chrome://browser/skin/zen-icons/plus.svg");
            createItem.addEventListener("command", async () => {
                try {
                    const id = await createBoard(db, "Untitled Board");
                    doAddToBoard(chromeWindow, id, "Untitled Board", blob, sourceUrl, region);
                } catch (e) { console.error(e); }
            });
            menupopup.appendChild(createItem);

            popupSet.appendChild(menupopup);

            // Open near the anchor point!
            const x = anchor ? anchor.x : (chromeWindow.screenX + chromeWindow.outerWidth / 2);
            const y = anchor ? anchor.y : (chromeWindow.screenY + chromeWindow.outerHeight / 2);
            menupopup.openPopupAtScreen(x, y, true);
        };

        const tabCloseHandler = async (event) => {
            const tab = event.target;
            const linkedBrowser = tab.linkedBrowser;
            const urlSpec = linkedBrowser?.currentURI?.spec;
            if (urlSpec && urlSpec.startsWith("chrome://browser/content/zen-board/board.html")) {
                if (chromeWindow.closed || chromeWindow.gBrowser.closing) {
                    return;
                }

                const url = new URL(urlSpec);
                const boardId = url.searchParams.get("id");
                if (boardId) {
                    let isStillOpen = false;
                    const windows = Services.wm.getEnumerator("navigator:browser");
                    while (windows.hasMoreElements()) {
                        const win = windows.getNext();
                        const gb = win.gBrowser;
                        if (gb) {
                            for (const otherTab of gb.tabs) {
                                if (otherTab !== tab) {
                                    const otherUrl = otherTab.linkedBrowser?.currentURI?.spec;
                                    if (otherUrl && otherUrl.startsWith("chrome://browser/content/zen-board/board.html")) {
                                        const otherBoardId = new URL(otherUrl).searchParams.get("id");
                                        if (otherBoardId === boardId) {
                                            isStillOpen = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if (isStillOpen) break;
                    }

                    if (isStillOpen) return;

                    // Safety Check: Check if the board is bookmarked!
                    try {
                        const placesUtils = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs").PlacesUtils;
                        const boardUrl = `chrome://browser/content/zen-board/board.html?id=${boardId}`;
                        const isBookmarked = await placesUtils.bookmarks.fetch({ url: boardUrl }).then(bm => !!bm);
                        if (isBookmarked) {
                            console.error(`ZenBoard: Board ${boardId} is bookmarked, skipping deletion.`);
                            return;
                        }
                    } catch (bookmarkErr) {
                        console.error("ZenBoard: Failed to check bookmarks", bookmarkErr);
                    }

                    // Delete the board from IndexedDB!
                    try {
                        const db = await openDB(chromeWindow);
                        const tx = db.transaction('boards', 'readwrite');
                        const store = tx.objectStore('boards');
                        store.delete(boardId);
                        console.error(`ZenBoard: Deleted closed board ${boardId} from IDB`);
                    } catch (e) {
                        console.error("ZenBoard: Failed to delete board on tab close", e);
                    }
                }
            }
        };

        chromeWindow.addEventListener("ZenBoard:CaptureReady", handler);
        if (chromeWindow.gBrowser && chromeWindow.gBrowser.tabContainer) {
            chromeWindow.gBrowser.tabContainer.addEventListener("TabClose", tabCloseHandler);
        }

        // Clean up when the window is closed
        chromeWindow.addEventListener("unload", () => {
            chromeWindow.removeEventListener("ZenBoard:CaptureReady", handler);
            if (chromeWindow.gBrowser && chromeWindow.gBrowser.tabContainer) {
                chromeWindow.gBrowser.tabContainer.removeEventListener("TabClose", tabCloseHandler);
            }
            delete chromeWindow._zenBoardCaptureListenerAdded;
        }, { once: true });
    }
}

// Ensure the global instance is available if this script is loaded as a script
if (typeof window !== "undefined") {
    window.gZenBoard = new ZenBoard();
}
