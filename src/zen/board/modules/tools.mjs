/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { pen } from './tool-handlers/pen.mjs';
import { select } from './tool-handlers/select.mjs';
import { eraser } from './tool-handlers/eraser.mjs';
import { text } from './tool-handlers/text.mjs';
import { shape } from './tool-handlers/shape.mjs';

export const toolHandlers = {
  pen,
  select,
  eraser,
  text,
  shape,
};
