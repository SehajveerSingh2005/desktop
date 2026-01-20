// modules/tool-handlers/text.js

import { Text } from '../scene.js';
import { getTransformedPoint } from '../canvas.js';
import { findObjectAt } from '../interactions.js';
import { activateTextEditor, selectTool } from '../ui.js';
import { setState } from '../state.js';

export const text = {
  onMouseDown(e) {
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    const hitObject = findObjectAt(x, y);

    // Switch to the select tool *before* activating the editor. This prevents a
    // race condition where `selectTool` would immediately call `deactivateTextEditor`
    // on the editor that was just created.
    selectTool('select');

    if (hitObject && hitObject instanceof Text) {
      // Clicked on existing text. Select it and activate the editor.
      setState({ selectedObjectId: hitObject.id });
      activateTextEditor(hitObject.x, hitObject.y, hitObject);
    } else {
      // Clicked on an empty area. Activate a new editor at this position.
      // The new object will be created and selected upon deactivation.
      setState({ selectedObjectId: null });
      activateTextEditor(x, y);
    }
  },
  onMouseMove() {},
  onMouseUp() {},
};
