// modules/tool-handlers/shape.js

import { getTransformedPoint } from '../canvas.js';
import { addToScene, generateId, Rectangle, Ellipse } from '../scene.js';
import { getState, setState } from '../state.js';
import { redrawCanvas } from '../canvas.js';
import { deactivateTextEditor } from '../ui.js';

export const shape = {
  onMouseDown(e) {
    deactivateTextEditor();
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    setState({ isDrawing: true, dragStartX: x, dragStartY: y });

    const { currentShapeType, currentBrushSize, scale, isShapeFilled } = getState();

    const sharedProps = [
      generateId(), x, y, 0, 0,
      '#000', currentBrushSize / scale,
      isShapeFilled, '#000'
    ];

    let newShape;
    if (currentShapeType === 'rectangle') {
      newShape = new Rectangle(...sharedProps);
    } else {
      newShape = new Ellipse(...sharedProps);
    }
    setState({ currentDrawingObject: newShape });
    addToScene(newShape);
  },
  onMouseMove(e) {
    const { isDrawing, currentDrawingObject, dragStartX, dragStartY } = getState();
    if (!isDrawing || !currentDrawingObject) return;
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    
    let endX = x;
    let endY = y;

    if (e.ctrlKey) {
      const dx = endX - dragStartX;
      const dy = endY - dragStartY;
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      endX = dragStartX + side * Math.sign(dx);
      endY = dragStartY + side * Math.sign(dy);
    }
    
    currentDrawingObject.x = Math.min(dragStartX, endX);
    currentDrawingObject.y = Math.min(dragStartY, endY);
    currentDrawingObject.width = Math.abs(dragStartX - endX);
    currentDrawingObject.height = Math.abs(dragStartY - endY);

    redrawCanvas();
  },
  onMouseUp() {
    const { isDrawing } = getState();
    if (isDrawing) {
      setState({ isDrawing: false, currentDrawingObject: null });
      redrawCanvas();
    }
  },
};
