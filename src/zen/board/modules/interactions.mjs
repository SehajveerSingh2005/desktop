/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { scene } from "./scene.mjs";
import { ctx } from "./canvas.mjs";

export function findObjectAt(x, y) {
  for (let i = scene.length - 1; i >= 0; i--) {
    const object = scene[i];
    if (object.visible) {
      const box = object.getBoundingBox(ctx);
      if (
        x > box.x &&
        x < box.x + box.width &&
        y > box.y &&
        y < box.y + box.height
      ) {
        return object;
      }
    }
  }
  return null;
}
