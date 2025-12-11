// modules/tool-handlers/select.js

import { scene } from '../scene.js';
import { canvas, getTransformedPoint, setTransform } from '../canvas.js';
import { getState, setState } from '../state.js';
import { redrawCanvas } from '../canvas.js';
import { deactivateTextEditor } from '../ui.js';
import { findObjectAt } from '../interactions.js';

export const select = {
  onMouseDown(e) {
    deactivateTextEditor();
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    const hitObject = findObjectAt(x, y);
    if (hitObject) {
      setState({ selectedObjectId: hitObject.id, isDraggingObject: true });
      setState({ dragStartX: e.clientX, dragStartY: e.clientY });
      canvas.style.cursor = 'move';
    } else {
      setState({ selectedObjectId: null, isPanning: true });
      setState({ dragStartX: e.clientX, dragStartY: e.clientY });
      canvas.style.cursor = 'grabbing';
    }
    redrawCanvas();
  },
  onMouseMove(e) {
    const { isDraggingObject, selectedObjectId, isPanning, dragStartX, dragStartY, scale, offsetX, offsetY } = getState();
    if (isDraggingObject) {
      const selectedObject = scene.find(obj => obj.id === selectedObjectId);
      if (selectedObject) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        selectedObject.move(dx / scale, dy / scale);
        setState({ dragStartX: e.clientX, dragStartY: e.clientY });
        redrawCanvas();
      }
    } else if (isPanning) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      setTransform(scale, offsetX + dx, offsetY + dy);
      setState({ dragStartX: e.clientX, dragStartY: e.clientY });
      redrawCanvas();
    }
  },
  onMouseUp() {
    setState({ isPanning: false, isDraggingObject: false });
    canvas.style.cursor = 'grab';
  },
};
