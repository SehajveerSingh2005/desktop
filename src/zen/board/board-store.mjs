/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Centralized JSON-file storage for Zen Board persistence.
// Replaces IndexedDB (db.mjs + chrome-db.mjs) with a single JSON file.
// Used by both chrome and content processes via IOUtils/PathUtils.
//
// Storage layout:
//   <profile>/zen-boards.json       — board metadata + scene JSON
//   <profile>/zen-board-assets/     — images, videos, captures (filesystem)

const STORE_FILENAME = "zen-boards.json";
const ASSETS_FOLDER_NAME = "zen-board-assets";

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "storePath", () =>
  PathUtils.join(PathUtils.profileDir, STORE_FILENAME)
);
ChromeUtils.defineLazyGetter(lazy, "assetsFolder", () =>
  PathUtils.join(PathUtils.profileDir, ASSETS_FOLDER_NAME)
);

// ── Write serialization ────────────────────────────────────────────────────
// Prevents concurrent write races between chrome and content processes.
let _writeQueue = Promise.resolve();

// ── Low-level read/write ───────────────────────────────────────────────────

async function readStore() {
  if (!(await IOUtils.exists(lazy.storePath))) {
    return { boards: [] };
  }
  try {
    const data = await IOUtils.readJSON(lazy.storePath);
    if (!data || !Array.isArray(data.boards)) {
      return { boards: [] };
    }
    return data;
  } catch (e) {
    console.warn("ZenBoard: Failed to read board store, resetting", e);
    return { boards: [] };
  }
}

async function writeStore(data) {
  await IOUtils.writeJSON(lazy.storePath, data, {
    tmpPath: `${lazy.storePath}.tmp`,
  });
}

// ── First-run cleanup ──────────────────────────────────────────────────────
// Remove old IndexedDB database on first run after migration.

let _cleanupDone = false;
async function cleanupOldIDB() {
  if (_cleanupDone) {
    return;
  }
  _cleanupDone = true;
  if (await IOUtils.exists(lazy.storePath)) {
    return;
  }
  try {
    indexedDB.deleteDatabase("zen-board-db");
    console.info("ZenBoard: Cleaned up old IndexedDB database");
  } catch (e) {
    console.warn("ZenBoard: Failed to clean up old IndexedDB", e);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * List all boards (metadata only, no scene data). Sorted newest-first.
 */
export async function listBoards() {
  await cleanupOldIDB();
  const { boards } = await readStore();
  return boards
    .map(({ id, title, lastEdited }) => ({ id, title, lastEdited }))
    .sort((a, b) => (b.lastEdited || 0) - (a.lastEdited || 0));
}

/**
 * Get a single board by ID. Returns the full board object or null.
 */
export async function getBoard(id) {
  const { boards } = await readStore();
  return boards.find(b => b.id === id) || null;
}

/**
 * Create a new blank board. Returns the new board's UUID.
 */
export async function createBoard(title = "Untitled Board") {
  const id = crypto.randomUUID();
  const data = await readStore();
  data.boards.push({
    id,
    title,
    isTransparent: true,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    lastEdited: Date.now(),
    scene: [],
  });
  await writeStore(data);
  return id;
}

/**
 * Save the full board state.
 */
export async function saveBoard(board) {
  const data = await readStore();
  const idx = data.boards.findIndex(b => b.id === board.id);
  if (idx === -1) {
    data.boards.push(board);
  } else {
    data.boards[idx] = board;
  }
  await writeStore(data);
}

/**
 * Delete a board and clean up orphaned assets from the filesystem.
 */
export async function deleteBoard(id) {
  const data = await readStore();
  const board = data.boards.find(b => b.id === id);
  if (!board) {
    return;
  }

  const boardAssetFiles = new Set();
  for (const obj of board.scene || []) {
    if (obj._assetFile) {
      boardAssetFiles.add(obj._assetFile);
    }
  }

  data.boards = data.boards.filter(b => b.id !== id);
  await writeStore(data);

  if (boardAssetFiles.size === 0) {
    return;
  }

  const usedFiles = new Set();
  for (const b of data.boards) {
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

/**
 * Append a capture object to a board's scene array.
 * Serialized via the write queue to prevent concurrent read-modify-write races.
 */
export async function appendCapture(boardId, captureData) {
  _writeQueue = _writeQueue.then(async () => {
    const data = await readStore();
    const board = data.boards.find(b => b.id === boardId);
    if (!board) {
      throw new Error("Board not found");
    }
    board.lastEdited = Date.now();
    board.scene = board.scene || [];
    board.scene.push(captureData);
    await writeStore(data);
  }).catch(e => {
    console.error("ZenBoard: Queued capture append failed", e);
  });
  return _writeQueue;
}
