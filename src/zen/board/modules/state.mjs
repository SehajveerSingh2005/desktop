/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const state = {
  currentTool: "select",
  selectedObjectId: null,
  currentBrushSize: 5,
  isDrawing: false,
  isPanning: false,
  isDraggingObject: false,
  isResizingObject: false,
  resizeHandle: null, // 'nw', 'ne', 'sw', 'se'
  resizeAnchorX: 0,
  resizeAnchorY: 0,
  resizeInitialFontSize: 0,
  currentDrawingObject: null,
  editingTextObject: null,
  isInitialized: false,
  currentShapeType: "rectangle",
  isShapeFilled: false,
  dragStartX: 0,
  dragStartY: 0,
  isPotentialDrag: false, // For text editor dragging
  isDraggingText: false,
  fontFamilies: ["Roboto", "Archivo Black", "Instrument Serif", "Maple Mono"],
  currentFontIndex: 0,
  currentFontSize: 24,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  currentColor: "#000000",
  // ── Persistence ──────────────────────────────────────────────────────────
  boardId: null, // UUID linking this tab to a board in zen-boards.json
  boardTitle: "Untitled Board",
  isTransparent: true, // Whether the board background should be transparent
};

export function getState() {
  return state;
}

export function setState(newState) {
  Object.assign(state, newState);
}

// ── Scene generation counter ─────────────────────────────────────────────────
// Lightweight dirty-flag for history.js to avoid JSON.stringify on every push.
// scene.js and the drawing tools bump this whenever they mutate scene data.
let _sceneGeneration = 0;
export function bumpSceneGeneration() {
  _sceneGeneration++;
}
export function getSceneGeneration() {
  return _sceneGeneration;
}

// ── Autosave ─────────────────────────────────────────────────────────────────
// Moved here from board.mjs to break the circular dependency:
//   history.mjs → board.mjs → history.mjs
// These are imported by history.mjs, capture-controls.mjs, ui.mjs, and board.mjs.
let _saveTimer = null;

export function triggerSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const { isDrawing, isPanning, isDraggingObject, isResizingObject } =
      getState();
    if (isDrawing || isPanning || isDraggingObject || isResizingObject) {
      triggerSave();
      return;
    }
    triggerSaveImmediate();
  }, 1000);
}

export async function triggerSaveImmediate() {
  clearTimeout(_saveTimer);
  const { boardId, boardTitle, isTransparent, scale, offsetX, offsetY } =
    getState();
  if (!boardId) {
    return;
  }
  try {
    const { saveBoard } = await import("./storage.mjs");
    const { scene } = await import("./scene.mjs");
    await saveBoard(
      boardId,
      boardTitle,
      isTransparent,
      scale,
      offsetX,
      offsetY,
      [...scene]
    );
  } catch (e) {
    console.error("ZenBoard: Immediate save failed", e);
  }
}
