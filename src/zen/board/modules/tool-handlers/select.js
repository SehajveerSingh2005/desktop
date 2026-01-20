// modules/tool-handlers/select.js

import { scene, Text } from '../scene.js';
import { canvas, getTransformedPoint, setTransform } from '../canvas.js';
import { getState, setState } from '../state.js';
import { redrawCanvas } from '../canvas.js';
import { deactivateTextEditor, activateTextEditor, updateTextEditorPosition } from '../ui.js';
import { findObjectAt } from '../interactions.js';

export const select = {
  onMouseDown(e) {
    // To robustly handle all "click outside" events, we unconditionally
    // deactivate any active text editor at the start of any canvas click.
    if (getState().editingTextObject) {
      deactivateTextEditor();
    }

    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    const hitObject = findObjectAt(x, y);

    if (hitObject) {
      // A) Clicked on an object. Select it and prepare for dragging.
      setState({ selectedObjectId: hitObject.id, isDraggingObject: true });
      setState({ dragStartX: e.clientX, dragStartY: e.clientY });
      canvas.style.cursor = 'move';
      
      // If the clicked object is a text object, re-activate the editor.
      // This preserves the workflow where clicking a text object allows editing.
      if (hitObject instanceof Text) {
        activateTextEditor(hitObject.x, hitObject.y, hitObject);
      }
    } else {
      // B) Clicked on empty space. Deselect everything and start panning.
      setState({ selectedObjectId: null, isPanning: true });
      setState({ dragStartX: e.clientX, dragStartY: e.clientY });
      canvas.style.cursor = 'grabbing';
    }
    redrawCanvas();
  },
  onMouseMove(e) {
    const { isDraggingObject, isPanning } = getState();

    if (isDraggingObject) {
      const { selectedObjectId, editingTextObject, dragStartX, dragStartY, scale } = getState();
      const selectedObject = scene.find(obj => obj.id === selectedObjectId);
      if (selectedObject) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        selectedObject.move(dx / scale, dy / scale);
        setState({ dragStartX: e.clientX, dragStartY: e.clientY });
        
        if (editingTextObject && selectedObject.id === editingTextObject.id) {
          updateTextEditorPosition();
        }
        redrawCanvas();
      }
    } else if (isPanning) {
      const { dragStartX, dragStartY, scale, offsetX, offsetY } = getState();
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      setTransform(scale, offsetX + dx, offsetY + dy);
      setState({ dragStartX: e.clientX, dragStartY: e.clientY });
      redrawCanvas();
    } else {
      // If not dragging or panning, change cursor on hover.
      const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
      const hitObject = findObjectAt(x, y);
      canvas.style.cursor = hitObject ? 'move' : 'grab';
    }
  },
  onMouseUp() {
    setState({ isPanning: false, isDraggingObject: false });
    // The cursor will be updated by the next mousemove event.
  },
};
