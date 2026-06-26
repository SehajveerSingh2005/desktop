/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Shared IndexedDB helpers for the chrome process.
// Used by ZenBoard.mjs (parent chrome) and capture-board-picker.mjs (popup).
// The content-process equivalent lives in modules/db.mjs.

const DB_NAME = "zen-board-db";
const DB_VERSION = 2;

/**
 * Open the board IndexedDB using a given window's indexedDB instance.
 */
export function openChromeDB(win) {
  return new Promise((resolve, reject) => {
    const req = win.indexedDB.open(DB_NAME, DB_VERSION);
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
 * List all boards sorted newest-first (metadata only).
 */
export function listBoardsFromDB(db) {
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
 * Create a new blank board. Returns the new board's UUID.
 */
export function createBoardInDB(db, title) {
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
 * Append a capture record to a board's scene array.
 * Serialized via a promise chain to prevent concurrent read-modify-write races.
 */
let _mutationQueue = Promise.resolve();

export function appendCaptureToBoard(db, boardId, captureData) {
  _mutationQueue = _mutationQueue.then(async () => {
    const board = await new Promise((resolve, reject) => {
      const tx = db.transaction("boards", "readwrite");
      const getReq = tx.objectStore("boards").get(boardId);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
      tx.onabort = () => reject(tx.error);
    });

    if (!board) {
      throw new Error("Board not found");
    }

    board.lastEdited = Date.now();
    board.scene = board.scene || [];
    board.scene.push(captureData);

    await new Promise((resolve, reject) => {
      const tx = db.transaction("boards", "readwrite");
      const putReq = tx.objectStore("boards").put(board);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
      tx.onabort = () => reject(tx.error);
    });
  }).catch(e => {
    console.error("ZenBoard: Queued mutation failed", e);
  });
  return _mutationQueue;
}
