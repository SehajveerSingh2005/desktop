// modules/tool-handlers/pen.js

import { getTransformedPoint } from '../canvas.js';
import { addToScene, generateId, Path } from '../scene.js';
import { getState, setState } from '../state.js';
import { redrawCanvas } from '../canvas.js';
import { deactivateTextEditor } from '../ui.js';

export const pen = {
  onMouseDown(e) {
    deactivateTextEditor();
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    const { currentBrushSize, scale } = getState();
    setState({ isDrawing: true });
    const newPath = new Path(generateId(), '#000', currentBrushSize / scale, x, y);
    setState({ currentDrawingObject: newPath });
    addToScene(newPath);
  },
  onMouseMove(e) {
    const { isDrawing, currentDrawingObject } = getState();
    if (!isDrawing || !currentDrawingObject) return;
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    currentDrawingObject.addPoint(x, y);
    redrawCanvas();
  },
  onMouseUp() {
    const { isDrawing } = getState();
    if (isDrawing) {
      redrawCanvas();
      setState({ isDrawing: false, currentDrawingObject: null });
    }
  },
};
