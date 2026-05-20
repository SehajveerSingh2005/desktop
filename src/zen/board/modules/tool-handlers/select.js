// modules/tool-handlers/select.js

import { scene, Text } from '../scene.js';
import { canvas, ctx, getTransformedPoint, setTransform } from '../canvas.js';
import { getState, setState } from '../state.js';
import { redrawCanvas } from '../canvas.js';
import { deactivateTextEditor, activateTextEditor, updateTextEditorPosition } from '../ui.js';
import { findObjectAt } from '../interactions.js';
import { showVideoControls, hideVideoControls, updateVideoControlsPosition } from '../video-controls.js';
import { showCaptureControls, hideCaptureControls, updateCaptureControlsPosition } from '../capture-controls.js';

export const select = {
  onMouseDown(e) {
    // To robustly handle all "click outside" events, we unconditionally
    // deactivate any active text editor at the start of any canvas click.
    if (getState().editingTextObject) {
      deactivateTextEditor();
    }

    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    const { selectedObjectId, scale } = getState();

    // Check for resize handles if an object is selected
    if (selectedObjectId) {
      const obj = scene.find(o => o.id === selectedObjectId);
      if (obj && obj.type !== 'text') {
        const box = obj.getBoundingBox(ctx);
        const handleSize = 12 / scale; // Slightly larger hit area than visual size
        const corners = {
          nw: { x: box.x, y: box.y },
          ne: { x: box.x + box.width, y: box.y },
          sw: { x: box.x, y: box.y + box.height },
          se: { x: box.x + box.width, y: box.y + box.height }
        };

        for (const [id, pos] of Object.entries(corners)) {
          if (Math.abs(x - pos.x) < handleSize / 2 && Math.abs(y - pos.y) < handleSize / 2) {
            let anchorX, anchorY;
            if (id === 'nw') { anchorX = box.x + box.width; anchorY = box.y + box.height; }
            else if (id === 'ne') { anchorX = box.x; anchorY = box.y + box.height; }
            else if (id === 'sw') { anchorX = box.x + box.width; anchorY = box.y; }
            else if (id === 'se') { anchorX = box.x; anchorY = box.y; }

            let initialFontSize = 0;
            if (obj instanceof Text) {
              const fontParts = obj.font.match(/(\d+(?:\.\d+)?)px/);
              if (fontParts) initialFontSize = parseFloat(fontParts[1]);
            }

            setState({
              isResizingObject: true,
              resizeHandle: id,
              resizeAnchorX: anchorX,
              resizeAnchorY: anchorY,
              resizeInitialFontSize: initialFontSize,
              dragStartX: e.clientX,
              dragStartY: e.clientY
            });
            return;
          }
        }
      }
    }

    const hitObject = findObjectAt(x, y);

    if (hitObject) {
      // A) Clicked on an object. Select it and prepare for dragging.
      setState({ selectedObjectId: hitObject.id, isDraggingObject: true });
      setState({ dragStartX: e.clientX, dragStartY: e.clientY });
      canvas.style.cursor = 'move';

      // If the clicked object is a text object, re-activate the editor.
      // This preserves the workflow where clicking a text object allows editing.
      // If the clicked object is a text object, re-activate the editor.
      if (hitObject instanceof Text) {
        activateTextEditor(hitObject.x, hitObject.y, hitObject);
      }

      // Handle Video Controls
      if (hitObject.type === 'video') {
        showVideoControls(hitObject);
        hideCaptureControls();
      } else if (hitObject.type === 'capture' || hitObject.type === 'live-embed') {
        showCaptureControls(hitObject);
        hideVideoControls();
      } else {
        hideVideoControls();
        hideCaptureControls();
      }
    } else {
      // B) Clicked on empty space. Deselect everything and start panning.
      setState({ selectedObjectId: null, isPanning: true });
      setState({ dragStartX: e.clientX, dragStartY: e.clientY });
      canvas.style.cursor = 'grabbing';
      hideVideoControls();
      hideCaptureControls();
    }
    redrawCanvas();
  },
  onMouseMove(e) {
    const { isDraggingObject, isPanning, isResizingObject } = getState();

    if (isResizingObject) {
      const { selectedObjectId, resizeHandle, resizeAnchorX, resizeAnchorY, editingTextObject } = getState();
      const selectedObject = scene.find(obj => obj.id === selectedObjectId);
      if (selectedObject) {
        // Get current mouse position in world coordinates
        const { x: worldX, y: worldY } = getTransformedPoint(e.offsetX, e.offsetY);

        selectedObject.resize(resizeHandle, worldX, worldY, resizeAnchorX, resizeAnchorY);

        if (editingTextObject && selectedObject.id === editingTextObject.id) {
          updateTextEditorPosition();
        }
        updateVideoControlsPosition();
        updateCaptureControlsPosition();
        redrawCanvas();
      }
    } else if (isDraggingObject) {
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
        updateVideoControlsPosition();
        updateCaptureControlsPosition();
        redrawCanvas();
      }
    } else if (isPanning) {
      const { dragStartX, dragStartY, scale, offsetX, offsetY } = getState();
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      setTransform(scale, offsetX + dx, offsetY + dy);
      setState({ dragStartX: e.clientX, dragStartY: e.clientY });
      updateVideoControlsPosition();
      updateCaptureControlsPosition();
      redrawCanvas();
    } else {
      // If not dragging or panning, change cursor on hover.
      const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
      const { selectedObjectId, scale } = getState();

      // Check for handles first
      if (selectedObjectId) {
        const obj = scene.find(o => o.id === selectedObjectId);
        if (obj) {
          if (obj.type === 'video') {
            // Pass
          }

          if (obj.type !== 'text') {
            const box = obj.getBoundingBox(ctx);
            const handleSize = 12 / scale;
            const corners = {
              nw: { x: box.x, y: box.y, cursor: 'nwse-resize' },
              ne: { x: box.x + box.width, y: box.y, cursor: 'nesw-resize' },
              sw: { x: box.x, y: box.y + box.height, cursor: 'nesw-resize' },
              se: { x: box.x + box.width, y: box.y + box.height, cursor: 'nwse-resize' }
            };

            for (const corner of Object.values(corners)) {
              if (Math.abs(x - corner.x) < handleSize / 2 && Math.abs(y - corner.y) < handleSize / 2) {
                canvas.style.cursor = corner.cursor;
                return;
              }
            }
          }
        }

      }
    }

    // Default cursor behavior if no handles or controls hovered
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    const hitObject = findObjectAt(x, y);
    canvas.style.cursor = hitObject ? 'move' : 'grab';
  },

  onMouseUp() {
    setState({ isPanning: false, isDraggingObject: false, isResizingObject: false, resizeHandle: null });
    updateVideoControlsPosition();
    updateCaptureControlsPosition();
    // The cursor will be updated by the next mousemove event.
  },
};
