// modules/tool-handlers/eraser.js

import { getTransformedPoint, ctx } from '../canvas.js';
import { scene, Path, Text, Rectangle, Ellipse } from '../scene.js';
import { getState, setState } from '../state.js';
import { redrawCanvas } from '../canvas.js';
import { deactivateTextEditor } from '../ui.js';

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
        for (const point of object.smoothedRelativePoints) {
          const distance = Math.hypot(point.x - localEraserX, point.y - localEraserY);
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
        scene.splice(i, 1);
        needsRedraw = true;
      }
    }
    if (needsRedraw) {
      redrawCanvas();
    }
  },
};
