// This is the full, corrected content for tools.js

import { canvas, ctx, redrawCanvas, getTransformedPoint, setTransform, scale, offsetX, offsetY } from './canvas.js';
import { scene, addToScene, generateId, Path, Text } from './scene.js';

// DOM Elements, to be initialized later
let penOptionsPanel, brushSizeSlider, textEditor, zoomDisplay;

// State
export let currentTool = 'select';
export let selectedObjectId = null;
let currentBrushSize = 5;
let isDrawing = false;
let isPanning = false;
let isDraggingObject = false;
let currentDrawingPath = null;
let editingTextObject = null;

let dragStartX = 0;
let dragStartY = 0;

// Textarea Dragging State
let isDraggingText = false;
let initialTextLeft = 0;
let initialTextTop = 0;

export function initTools() {
  penOptionsPanel = document.getElementById('pen-options');
  brushSizeSlider = document.getElementById('brush-size');
  textEditor = document.getElementById('text-editor');
  zoomDisplay = document.getElementById('zoom-display');
  
  currentBrushSize = parseFloat(brushSizeSlider.value);

  brushSizeSlider.addEventListener('input', (e) => {
    currentBrushSize = parseFloat(e.target.value);
  });
  
  textEditor.addEventListener('input', autoResizeTextEditor);
  
  textEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        deactivateTextEditor();
    }
  });
}

export function findObjectAt(x, y) {
  for (let i = scene.length - 1; i >= 0; i--) {
    const object = scene[i];
    if (object.visible) {
      const box = object.getBoundingBox(ctx);
      if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) {
        return object;
      }
    }
  }
  return null;
}

export function activateTextEditor(x, y, existingObject = null) {
  deactivateTextEditor();
  editingTextObject = existingObject;

  if (existingObject) {
    existingObject.visible = false;
    redrawCanvas();
  }
  const screenX = (existingObject ? existingObject.x : x) * scale + offsetX;
  const screenY = (existingObject ? existingObject.y : y) * scale + offsetY;
  
  textEditor.value = existingObject ? existingObject.text : '';
  textEditor.style.left = `${screenX}px`;
  textEditor.style.top = `${screenY}px`;
  textEditor.style.visibility = 'visible';
  textEditor.style.transform = `scale(${scale})`;
  
  setTimeout(() => textEditor.focus(), 0);
  autoResizeTextEditor();
  
  textEditor.addEventListener('mousedown', onTextareaMouseDown);
  window.addEventListener('mousemove', onTextareaMouseMove);
  window.addEventListener('mouseup', onTextareaMouseUp);
}

function deactivateTextEditor() {
    if (!textEditor || textEditor.style.visibility === 'hidden') return;
    
    const newText = textEditor.value.trim();
    const newX = (parseFloat(textEditor.style.left) - offsetX) / scale;
    const newY = (parseFloat(textEditor.style.top) - offsetY) / scale;

    if (editingTextObject) {
        if (newText === '') {
            const index = scene.findIndex(obj => obj.id === editingTextObject.id);
            if (index > -1) scene.splice(index, 1);
        } else {
            editingTextObject.text = newText;
            editingTextObject.x = newX;
            editingTextObject.y = newY;
            editingTextObject.visible = true;
        }
    } else if (newText !== '') {
        const newTextObject = new Text(generateId(), newText, newX, newY, '24px Arial', '#000');
        addToScene(newTextObject);
    }

    textEditor.value = '';
    textEditor.style.visibility = 'hidden';
    editingTextObject = null;
    textEditor.removeEventListener('mousedown', onTextareaMouseDown);
    window.removeEventListener('mousemove', onTextareaMouseMove);
    window.removeEventListener('mouseup', onTextareaMouseUp);
    redrawCanvas();
}
function onTextareaMouseDown(e) {
  isDraggingText = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  initialTextLeft = parseFloat(textEditor.style.left);
  initialTextTop = parseFloat(textEditor.style.top);
  textEditor.style.cursor = 'grab';
}
function onTextareaMouseMove(e) {
  if (!isDraggingText) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  textEditor.style.left = `${initialTextLeft + dx}px`;
  textEditor.style.top = `${initialTextTop + dy}px`;
}
function onTextareaMouseUp() {
  if (isDraggingText) {
    isDraggingText = false;
    textEditor.style.cursor = 'default';
  }
}
function autoResizeTextEditor() {
    textEditor.style.height = 'auto';
    textEditor.style.height = `${textEditor.scrollHeight}px`;
    textEditor.style.width = 'auto';
    textEditor.style.width = `${textEditor.scrollWidth}px`;
}

export const toolHandlers = {
  select: {
    onMouseDown(e) {
      deactivateTextEditor();
      const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
      const hitObject = findObjectAt(x, y);
      if (hitObject) {
        selectedObjectId = hitObject.id;
        isDraggingObject = true;
        dragStartX = e.clientX; // Use screen coordinates for drag reference
        dragStartY = e.clientY;
        canvas.style.cursor = 'move';
      } else {
        selectedObjectId = null;
        isPanning = true;
        dragStartX = e.clientX; // Use screen coordinates for pan reference
        dragStartY = e.clientY;
        canvas.style.cursor = 'grabbing';
      }
      redrawCanvas();
    },
    onMouseMove(e) {
      if (isDraggingObject) {
        const selectedObject = scene.find(obj => obj.id === selectedObjectId);
        if (selectedObject) {
          // Calculate delta in screen space
          const dx = e.clientX - dragStartX;
          const dy = e.clientY - dragStartY;
          
          // Apply the scaled delta to the object
          selectedObject.move(dx / scale, dy / scale);

          // Update the start position for the next frame
          dragStartX = e.clientX;
          dragStartY = e.clientY;

          redrawCanvas();
        }
      } else if (isPanning) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        setTransform(scale, offsetX + dx, offsetY + dy);
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        redrawCanvas();
      }
    },
    onMouseUp() {
      isPanning = false;
      isDraggingObject = false;
      canvas.style.cursor = 'grab';
    },
  },
  pen: {
    onMouseDown(e) {
      deactivateTextEditor();
      const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
      isDrawing = true;
      // Create the Path with its starting origin
      currentDrawingPath = new Path(generateId(), '#000', currentBrushSize / scale, x, y);
      addToScene(currentDrawingPath);
    },
    onMouseMove(e) {
      if (!isDrawing || !currentDrawingPath) return;
      const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
      currentDrawingPath.addPoint(x, y);
      redrawCanvas();
    },
    onMouseUp() {
      if (isDrawing) {
        // No redraw needed here if it's in onMouseMove, but let's keep it for single-click dots
        redrawCanvas();
        isDrawing = false;
        currentDrawingPath = null;
      }
    },
  },
  eraser: {
    onMouseDown(e) {
      deactivateTextEditor();
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
      const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
      const eraserRadius = 10 / scale;
      let needsRedraw = false;
      for (let i = scene.length - 1; i >= 0; i--) {
        const object = scene[i];
        if (!object.visible) continue;
        let hit = false;
        if (object instanceof Path) {
          // The points are now relative to the object's origin.
          // We must check them by transforming the eraser's world coordinates
          // into the object's local coordinates.
          const localEraserX = x - object.x;
          const localEraserY = y - object.y;
          // Use object.smoothedRelativePoints for hit detection, as that's what's rendered
          for (const point of object.smoothedRelativePoints) {
            const distance = Math.hypot(point.x - localEraserX, point.y - localEraserY);
            if (distance < eraserRadius + object.lineWidth / 2) {
              hit = true;
              break;
            }
          }
        } else if (object instanceof Text) {
          const box = object.getBoundingBox(ctx);
          if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) {
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
  },
};

export function selectTool(toolName) {
  if (currentTool === 'text' && toolName !== 'text') {
    deactivateTextEditor();
  }
  if (toolName === 'pen' && currentTool === 'pen') {
    if(penOptionsPanel) penOptionsPanel.classList.toggle('visible');
  } else {
    if(penOptionsPanel) penOptionsPanel.classList.remove('visible');
  }
  currentTool = toolName;
  document.querySelectorAll('.tool-button').forEach(btn => {
    btn.classList.remove('active');
  });
  const toolButton = document.getElementById(`${toolName}-tool`);
  if (toolButton) {
    toolButton.classList.add('active');
  }
  if (toolName === 'select') {
    canvas.style.cursor = 'grab';
  } else {
    canvas.style.cursor = 'crosshair';
  }
}

export function updateZoomDisplay() {
  if (zoomDisplay) {
    zoomDisplay.textContent = `${Math.round(scale * 100)}%`;
  }
}