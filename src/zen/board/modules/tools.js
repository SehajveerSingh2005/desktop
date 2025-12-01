// modules/tools.js

import { canvas, ctx, redrawCanvas } from './canvas.js';
import { scene, addToScene, generateId, Path, Text } from './scene.js';

// =================================================================
// === State =======================================================
// =================================================================
export let currentTool = 'pen';
let isDrawing = false;
let currentDrawingPath = null;
let activeTextInput = null;

// =================================================================
// === Text Tool Implementation (Simplified) =======================
// =================================================================

function finalizeTextInput() {
  if (!activeTextInput) return;

  const textValue = activeTextInput.value.trim();
  if (textValue !== '') {
    const newTextObject = new Text(
      generateId(),
      textValue,
      parseFloat(activeTextInput.style.left),
      parseFloat(activeTextInput.style.top),
      '24px Arial',
      '#000'
    );
    addToScene(newTextObject);
    redrawCanvas();
  }

  if (activeTextInput.parentNode) {
    activeTextInput.parentNode.removeChild(activeTextInput);
  }
  activeTextInput = null;
  canvas.style.pointerEvents = 'auto';
}

function placeTextInput(x, y) {
  // If an old textbox exists, finalize it before creating a new one.
  if (activeTextInput) {
    finalizeTextInput();
  }
  
  canvas.style.pointerEvents = 'none';

  activeTextInput = document.createElement('textarea');
  const input = activeTextInput;
  
  input.style.position = 'absolute';
  input.style.left = `${x}px`;
  input.style.top = `${y}px`;
  input.style.font = '24px Arial';
  input.style.color = '#000';
  input.style.background = 'transparent';
  input.style.border = '1px dashed #007bff';
  input.style.outline = 'none';
  input.style.resize = 'none';
  input.style.overflow = 'hidden';
  input.style.whiteSpace = 'pre';
  input.style.minHeight = '28px';
  input.style.lineHeight = '1.2';
  input.style.padding = '2px';
  input.style.margin = '0';
  input.classList.add('canvas-text-input');

  document.body.appendChild(input);
  input.focus();

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
    input.style.width = 'auto';
    input.style.width = `${input.scrollWidth}px`;
  }
  input.addEventListener('input', autoResize);
  autoResize();

  // We only finalize on Enter or by switching tools/clicking elsewhere.
  // The 'blur' listener is removed.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finalizeTextInput();
    }
  });
}

// =================================================================
// === Tool Handlers ===============================================
// =================================================================

export const toolHandlers = {
  pen: {
    onMouseDown(e) {
      isDrawing = true;
      ctx.globalCompositeOperation = 'source-over';
      currentDrawingPath = new Path(generateId(), ctx.strokeStyle, ctx.lineWidth);
      currentDrawingPath.addPoint(e.offsetX, e.offsetY);
      addToScene(currentDrawingPath);
    },
    onMouseMove(e) {
      if (!isDrawing || !currentDrawingPath) return;
      currentDrawingPath.addPoint(e.offsetX, e.offsetY);
      redrawCanvas();
    },
    onMouseUp() {
      if (isDrawing) {
        redrawCanvas();
        isDrawing = false;
        currentDrawingPath = null;
      }
    },
  },
  eraser: {
    onMouseDown(e) {
      isDrawing = true;
      this.erase(e);
    },
    onMouseMove(e) {
      if (!isDrawing) return;
      this.erase(e);
    },
    onMouseUp() {
      isDrawing = false;
    },
    erase(e) {
      const eraserRadius = 10;
      let needsRedraw = false;
      for (let i = scene.length - 1; i >= 0; i--) {
        const object = scene[i];
        let hit = false;
        if (object instanceof Path) {
          for (const point of object.points) {
            const distance = Math.hypot(point.x - e.offsetX, point.y - e.offsetY);
            if (distance < eraserRadius + object.lineWidth / 2) {
              hit = true;
              break;
            }
          }
        } else if (object instanceof Text) {
          ctx.font = object.font;
          const textWidth = ctx.measureText(object.text).width;
          const textHeight = parseFloat(object.font);
          if (
            e.offsetX > object.x && e.offsetX < object.x + textWidth &&
            e.offsetY > object.y && e.offsetY < object.y + textHeight
          ) {
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
  },
  text: {
    onMouseDown(e) {
      placeTextInput(e.offsetX, e.offsetY);
    },
    onMouseMove() { /* Do nothing */ },
    onMouseUp() { /* Do nothing */ },
  },
};

// =================================================================
// === Tool Selection ==============================================
// =================================================================

export function selectTool(toolName) {
  // Finalize text input if switching away from the text tool
  if (activeTextInput && toolName !== 'text') {
      finalizeTextInput();
  }

  currentTool = toolName;
  document.querySelectorAll('.tool-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`${toolName}-tool`).classList.add('active');
}