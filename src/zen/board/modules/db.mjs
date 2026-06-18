/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Centralized IndexedDB wrapper for Zen Board persistence.
// Schema:
//   boards   - { id, title, lastEdited, isTransparent, scene (JSON) }
//   assets   - { hash (SHA-256 hex), blob }

const DB_NAME = "zen-board-db";
const DB_VERSION = 2;

let dbPromise = null;

function openDB() {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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
  return dbPromise;
}

// ── SHA-256 hash of a Blob (returns hex string) ──────────────────────────
async function hashBlob(blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Assets ────────────────────────────────────────────────────────────────

/**
 * Store a Blob in the assets store (idempotent by hash).
 * Returns the hash string (used as the asset key reference in board JSON).
 *
 * @param {Blob} blob The blob to store.
 */
export async function storeAsset(blob) {
  const hash = await hashBlob(blob);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readwrite");
    const store = tx.objectStore("assets");
    const getReq = store.get(hash);
    getReq.onsuccess = () => {
      if (!getReq.result) {
        // Not stored yet — add it
        const putReq = store.put({ hash, blob });
        putReq.onsuccess = () => resolve(hash);
        putReq.onerror = () => reject(putReq.error);
      } else {
        // Already stored (de-duplication)
        resolve(hash);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Retrieve a Blob by hash. Returns null if not found.
 *
 * @param {string} hash The hash string.
 */
export async function getAsset(hash) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readonly");
    const store = tx.objectStore("assets");
    const req = store.get(hash);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete an asset by hash if it exists.
 *
 * @param {string} hash The hash string.
 */
export async function deleteAsset(hash) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readwrite");
    const store = tx.objectStore("assets");
    const req = store.delete(hash);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Boards ────────────────────────────────────────────────────────────────

/**
 * Create a new blank board. Returns the new board ID.
 *
 * @param {object} [options] The options object.
 * @param {string} [options.title] The board title.
 * @param {boolean} [options.isTransparent] Whether the board is transparent.
 */
export async function createBoard({
  title = "Untitled Board",
  isTransparent = true,
} = {}) {
  const id = crypto.randomUUID();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    const store = tx.objectStore("boards");
    const board = {
      id,
      title,
      isTransparent,
      lastEdited: Date.now(),
      scene: [],
    };
    const req = store.put(board);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Load a board by ID. Returns the board object or null.
 *
 * @param {string} id The board ID.
 */
export async function loadBoard(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readonly");
    const store = tx.objectStore("boards");
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save the full board state.
 *
 * @param {string} id
 * @param {string} title
 * @param {boolean} isTransparent
 * @param {number} scale
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {Array}   serializedScene — already-serialized, asset refs resolved
 */
export async function saveBoard(
  id,
  title,
  isTransparent,
  scale,
  offsetX,
  offsetY,
  serializedScene
) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    const store = tx.objectStore("boards");
    const board = {
      id,
      title,
      isTransparent,
      scale,
      offsetX,
      offsetY,
      lastEdited: Date.now(),
      scene: serializedScene,
    };
    const req = store.put(board);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * List all boards (metadata only, no scene data). Sorted newest-first.
 */
export async function listBoards() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readonly");
    const store = tx.objectStore("boards");
    const req = store.getAll();
    req.onsuccess = () => {
      const boards = req.result.map(
        ({ id, title, isTransparent, lastEdited }) => ({
          id,
          title,
          isTransparent,
          lastEdited,
        })
      );
      boards.sort((a, b) => b.lastEdited - a.lastEdited);
      resolve(boards);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a board and any assets that are no longer referenced by other boards.
 *
 * @param {string} id The board ID.
 */
export async function deleteBoard(id) {
  // First, load the board to get its asset hashes
  const db = await openDB();
  const board = await loadBoard(id);
  if (!board) {
    return;
  }

  // Collect all asset hashes within this board's scene
  const boardAssetHashes = new Set();
  for (const obj of board.scene || []) {
    if (obj._assetHash) {
      boardAssetHashes.add(obj._assetHash);
    }
  }

  // Delete the board record
  await new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readwrite");
    const req = tx.objectStore("boards").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  if (boardAssetHashes.size === 0) {
    return;
  }

  // Check if any remaining board uses those hashes
  const remaining = await new Promise((resolve, reject) => {
    const tx = db.transaction("boards", "readonly");
    const req = tx.objectStore("boards").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const usedHashes = new Set();
  for (const b of remaining) {
    for (const obj of b.scene || []) {
      if (obj._assetHash) {
        usedHashes.add(obj._assetHash);
      }
    }
  }

  // Delete orphaned assets
  for (const hash of boardAssetHashes) {
    if (!usedHashes.has(hash)) {
      await deleteAsset(hash);
    }
  }
}
