// modules/tool-handlers/eraser.js

import { getTransformedPoint, ctx } from '../canvas.mjs';
import { scene, removeFromScene, Path, Text, Rectangle, Ellipse } from '../scene.mjs';
import { getState, setState } from '../state.mjs';
import { redrawCanvas } from '../canvas.mjs';
import { deactivateTextEditor } from '../ui.mjs';
import { hideVideoControls } from '../video-controls.mjs';
import { hideCaptureControls } from '../capture-controls.mjs';

export const eraser = {
  onMouseDown(e) {
    deactivateTextEditor();
    setState({ isDrawing: true });
    this.erase(e);
  },
  onMouseMove(e) {
    const { isDrawing } = getState();
    if (!isDrawing) return;
    this.erase(e);
  },
  onMouseUp() {
    setState({ isDrawing: false });
  },
  erase(e) {
    const { scale } = getState();
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    const eraserRadius = 10 / scale;
    let needsRedraw = false;
    for (let i = scene.length - 1; i >= 0; i--) {
      const object = scene[i];
      if (!object.visible) continue;
      let hit = false;
      if (object instanceof Path) {
        const localEraserX = x - object.x;
        const localEraserY = y - object.y;
        const pts = object.smoothedRelativePoints;
        for (let j = 0; j < pts.length; j += 2) {
          const distance = Math.hypot(pts[j] - localEraserX, pts[j+1] - localEraserY);
          if (distance < eraserRadius + object.lineWidth / 2) {
            hit = true;
            break;
          }
        }
      } else {
        // Generic bounding box check for Shapes, Text, Images, Videos
        const box = object.getBoundingBox(ctx);
        if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) {
          hit = true;
        }
      }
      if (hit) {
        const { selectedObjectId } = getState();
        if (selectedObjectId === object.id) {
          setState({ selectedObjectId: null });
          hideVideoControls();
          hideCaptureControls();
        }
        removeFromScene(object.id);
        needsRedraw = true;
      }
    }
    if (needsRedraw) {
      redrawCanvas();
    }
  },
};
