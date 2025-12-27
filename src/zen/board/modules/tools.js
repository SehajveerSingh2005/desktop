// modules/tools.js

import { pen } from './tool-handlers/pen.js';
import { select } from './tool-handlers/select.js';
import { eraser } from './tool-handlers/eraser.js';
import { text } from './tool-handlers/text.js';
import { shape } from './tool-handlers/shape.js';

export const toolHandlers = {
  pen,
  select,
  eraser,
  text,
  shape,
};
