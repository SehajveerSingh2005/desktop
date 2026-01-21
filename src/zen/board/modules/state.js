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
  offsetX: 0,
  offsetY: 0,
  currentColor: '#000000',
};

export function getState() {
  return state;
}

export function setState(newState) {
  Object.assign(state, newState);
}
