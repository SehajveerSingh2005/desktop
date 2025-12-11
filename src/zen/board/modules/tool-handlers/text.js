// modules/tool-handlers/text.js

import { Text } from '../scene.js';
import { getTransformedPoint } from '../canvas.js';
import { findObjectAt } from '../interactions.js';
import { activateTextEditor } from '../ui.js';

export const text = {
  onMouseDown(e) {
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    const hitObject = findObjectAt(x, y);
    if (hitObject && hitObject instanceof Text) {
      activateTextEditor(hitObject.x, hitObject.y, hitObject);
    } else {
      activateTextEditor(x, y);
    }
  },
  onMouseMove() {},
  onMouseUp() {},
};
