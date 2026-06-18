/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getTransformedPoint } from '../canvas.mjs';
import { addToScene, generateId, Path } from '../scene.mjs';
import { getState, setState } from '../state.mjs';
import { redrawCanvas } from '../canvas.mjs';
import { deactivateTextEditor } from '../ui.mjs';

export const pen = {
  onMouseDown(e) {
    deactivateTextEditor();
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    const { currentBrushSize, scale, currentColor } = getState();
    setState({ isDrawing: true });
    const newPath = new Path(generateId(), currentColor, currentBrushSize / scale, x, y);
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
