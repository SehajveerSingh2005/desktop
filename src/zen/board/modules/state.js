// state.js

const state = {
  currentTool: 'select',
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
  currentShapeType: 'rectangle',
  isShapeFilled: false,
  dragStartX: 0,
  dragStartY: 0,
  isPotentialDrag: false, // For text editor dragging
  isDraggingText: false,
  fontFamilies: ['Roboto', 'Archivo Black', 'Instrument Serif', 'Maple Mono'],
  currentFontIndex: 0,
  currentFontSize: 24,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  currentColor: '#000000',
  // ── Persistence ──────────────────────────────────────────────────────────
  boardId: null,          // UUID linking this tab to a board in IndexedDB
  boardTitle: 'Untitled Board',
  isTransparent: true,    // Whether the board background should be transparent
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
export function bumpSceneGeneration() { _sceneGeneration++; }
export function getSceneGeneration() { return _sceneGeneration; }

