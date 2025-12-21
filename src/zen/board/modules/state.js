// state.js

const state = {
  currentTool: 'select',
  selectedObjectId: null,
  currentBrushSize: 5,
  isDrawing: false,
  isPanning: false,
  isDraggingObject: false,
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
};

export function getState() {
  return state;
}

export function setState(newState) {
  Object.assign(state, newState);
}
