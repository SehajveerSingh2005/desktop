/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Text as TextObject } from "../scene.mjs";
import { getTransformedPoint } from "../canvas.mjs";
import { findObjectAt } from "../interactions.mjs";
import { activateTextEditor, selectTool } from "../ui.mjs";
import { setState } from "../state.mjs";

export const text = {
  onMouseDown(e) {
    const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
    const hitObject = findObjectAt(x, y);

    // Switch to the select tool *before* activating the editor. This prevents a
    // race condition where `selectTool` would immediately call `deactivateTextEditor`
    // on the editor that was just created.
    selectTool("select");

    if (hitObject && hitObject instanceof TextObject) {
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
