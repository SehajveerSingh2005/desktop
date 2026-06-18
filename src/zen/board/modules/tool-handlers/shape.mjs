/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getTransformedPoint, redrawCanvas } from "../canvas.mjs";
import { addToScene, generateId, Rectangle, Ellipse } from "../scene.mjs";
import { getState, setState } from "../state.mjs";
import { deactivateTextEditor, selectTool } from "../ui.mjs";

export const shape = {
  onMouseDown(e) {
    deactivateTextEditor();
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    setState({ isDrawing: true, dragStartX: x, dragStartY: y });

    const {
      currentShapeType,
      currentBrushSize,
      scale,
      isShapeFilled,
      currentColor,
    } = getState();

    const sharedProps = [
      generateId(),
      x,
      y,
      0,
      0,
      currentColor,
      currentBrushSize / scale,
      isShapeFilled,
      currentColor,
    ];

    let newShape;
    if (currentShapeType === "rectangle") {
      newShape = new Rectangle(...sharedProps);
    } else {
      newShape = new Ellipse(...sharedProps);
    }
    setState({ currentDrawingObject: newShape });
    addToScene(newShape);
  },
  onMouseMove(e) {
    const { isDrawing, currentDrawingObject, dragStartX, dragStartY } =
      getState();
    if (!isDrawing || !currentDrawingObject) {
      return;
    }
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
    const { isDrawing, currentDrawingObject } = getState();
    if (isDrawing) {
      if (currentDrawingObject) {
        setState({ selectedObjectId: currentDrawingObject.id });
      }
      setState({ isDrawing: false, currentDrawingObject: null });
      selectTool("select");
    }
  },
};
