// modules/tools.js

import { canvas, ctx, redrawCanvas } from './canvas.js';
import { scene, addToScene, generateId, Path, Text } from './scene.js';

// =================================================================
// === DOM Elements ================================================
// =================================================================
const penOptionsPanel = document.getElementById('pen-options');
const brushSizeSlider = document.getElementById('brush-size');
const textEditor = document.getElementById('text-editor');

// =================================================================
// === State =======================================================
// =================================================================
export let currentTool = 'pen';
let currentBrushSize = 5;
let isDrawing = false;
let currentDrawingPath = null;
let editingTextId = null; // ID of the Text object being edited
let isInitialized = false;

// For moving text
let isDraggingText = false;
let dragStartX = 0;
let dragStartY = 0;
let initialTextLeft = 0;
let initialTextTop = 0;

// =================================================================
// === Event Handlers for Options ==================================
// =================================================================

brushSizeSlider.addEventListener('input', (e) => {
  currentBrushSize = parseFloat(e.target.value);
});


// =================================================================
// === Helper Functions ============================================
// =================================================================

function findTextObjectAt(x, y) {
  for (let i = scene.length - 1; i >= 0; i--) {
    const object = scene[i];
    if (object instanceof Text) {
      ctx.font = object.font;
      const textWidth = ctx.measureText(object.text).width;
      const textHeight = parseFloat(object.font);
      if (
        x > object.x && x < object.x + textWidth &&
        y > object.y && y < object.y + textHeight
      ) {
        return object;
      }
    }
  }
  return null;
}

// =================================================================
// === Text Tool Implementation ====================================
// =================================================================

function activateTextEditor(x, y, existingObject = null) {
  // If there's an existing editor active, deactivate it first
  deactivateTextEditor();

  const textToEdit = existingObject ? existingObject.text : '';
  editingTextId = existingObject ? existingObject.id : null;
  
  // Hide the object from the scene while it's being edited
  if (existingObject) {
    existingObject.visible = false;
    redrawCanvas();
  }

  // Position and show the single textarea
  textEditor.style.left = `${x}px`;
  textEditor.style.top = `${y}px`;
  textEditor.value = textToEdit;
  textEditor.style.font = existingObject ? existingObject.font : '24px Arial';
  textEditor.style.color = existingObject ? existingObject.color : '#000';
  textEditor.style.visibility = 'visible';
  
  textEditor.focus();
  autoResizeTextEditor(); // Resize to fit content

  // Add drag listeners
  textEditor.addEventListener('mousedown', onTextareaMouseDown);
  window.addEventListener('mousemove', onTextareaMouseMove);
  window.addEventListener('mouseup', onTextareaMouseUp);
}

function deactivateTextEditor() {
  if (!textEditor || textEditor.style.visibility === 'hidden') return;

  const newText = textEditor.value.trim();
  const newX = parseFloat(textEditor.style.left);
  const newY = parseFloat(textEditor.style.top);
  const newFont = textEditor.style.font;
  const newColor = textEditor.style.color;

  if (editingTextId) {
    // We were editing an existing object
    const originalObject = scene.find(obj => obj.id === editingTextId);
    if (newText === '') {
      // If user deleted all text, remove the object
      const index = scene.findIndex(obj => obj.id === editingTextId);
      if (index > -1) scene.splice(index, 1);
    } else if (originalObject) {
      // Update the original object
      originalObject.text = newText;
      originalObject.x = newX;
      originalObject.y = newY;
      originalObject.font = newFont;
      originalObject.color = newColor;
      originalObject.visible = true; // Make it visible again
    }
  } else if (newText !== '') {
    // We were creating a new object
    const newTextObject = new Text(generateId(), newText, newX, newY, newFont, newColor);
    addToScene(newTextObject);
  }

  // Reset and hide the editor
  textEditor.value = '';
  textEditor.style.visibility = 'hidden';
  editingTextId = null;
  
  // Remove drag listeners to prevent memory leaks
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
  isDraggingText = false;
  textEditor.style.cursor = 'default';
}

function autoResizeTextEditor() {
    textEditor.style.height = 'auto';
    textEditor.style.height = `${textEditor.scrollHeight}px`;
    textEditor.style.width = 'auto';
    textEditor.style.width = `${textEditor.scrollWidth}px`;
}

// Add listeners to the single text editor instance
textEditor.addEventListener('input', autoResizeTextEditor);
textEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        deactivateTextEditor();
    }
});


// =================================================================
// === Tool Handlers ===============================================
// =================================================================

export const toolHandlers = {
  pen: {
    onMouseDown(e) {
      deactivateTextEditor(); // Ensure text editor is closed
      isDrawing = true;
      ctx.globalCompositeOperation = 'source-over';
      currentDrawingPath = new Path(generateId(), ctx.strokeStyle, currentBrushSize);
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
      const eraserRadius = 10;
      let needsRedraw = false;
      // Iterate backwards to safely remove items from the array
      for (let i = scene.length - 1; i >= 0; i--) {
        const object = scene[i];
        if (!object.visible) continue; // Don't erase hidden objects

        let hit = false;
        if (object instanceof Path) {
          // Check if any point in the path is near the eraser
          for (const point of object.points) {
            const distance = Math.hypot(point.x - e.offsetX, point.y - e.offsetY);
            if (distance < eraserRadius + object.lineWidth / 2) {
              hit = true;
              break;
            }
          }
        } else if (object instanceof Text) {
          // Check if the eraser is within the bounding box of the text
          ctx.font = object.font;
          const textWidth = ctx.measureText(object.text).width;
          const textHeight = parseFloat(object.font); // Approximate height
          if (
            e.offsetX > object.x && e.offsetX < object.x + textWidth &&
            e.offsetY > object.y && e.offsetY < object.y + textHeight
          ) {
            hit = true;
          }
        }
        
        if (hit) {
          scene.splice(i, 1); // Remove the object from the scene
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
      const hitObject = findTextObjectAt(e.offsetX, e.offsetY);
      if (hitObject) {
        activateTextEditor(hitObject.x, hitObject.y, hitObject);
      } else {
        activateTextEditor(e.offsetX, e.offsetY);
      }
    },
    onMouseMove() {},
    onMouseUp() {},
  },
};

// =================================================================
// === Tool Selection ==============================================
// =================================================================

export function selectTool(toolName) {
  const isFirstSelection = !isInitialized;

  if (toolName !== 'text') {
    deactivateTextEditor();
  }

  if (toolName === 'pen' && currentTool === 'pen' && !isFirstSelection) {
    penOptionsPanel.classList.toggle('visible');
  } else {
    penOptionsPanel.classList.remove('visible');
  }

  currentTool = toolName;
  document.querySelectorAll('.tool-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`${toolName}-tool`).classList.add('active');

  if (isFirstSelection) {
    isInitialized = true;
  }
}
