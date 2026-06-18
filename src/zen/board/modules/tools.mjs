// modules/tools.js

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
