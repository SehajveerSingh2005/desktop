// modules/tools.js

import { canvas, ctx, redrawCanvas, getTransformedPoint, setTransform, scale, offsetX, offsetY } from './canvas.js';
import { scene, addToScene, generateId, Path, Text } from './scene.js';

// DOM Elements
let penOptionsPanel, brushSizeSlider, textEditor, zoomDisplay, fontOptionsPanel, fontCycleBtn, fontSizeIncreaseBtn, fontSizeDecreaseBtn;

// State
export let currentTool = 'select';
export let selectedObjectId = null;
let currentBrushSize = 5;
let isDrawing = false, isPanning = false, isDraggingObject = false;
let currentDrawingPath = null;
let editingTextObject = null;
let isInitialized = false;

// Dragging State
let dragStartX = 0, dragStartY = 0;
let isDraggingText = false, initialTextLeft = 0, initialTextTop = 0;

// Font State
const fontFamilies = ['Roboto', 'Archivo Black', 'Instrument Serif', 'Maple Mono'];
let currentFontIndex = 0;
let currentFontSize = 24;

export function initTools() {
  // DOM Elements Initialization
  penOptionsPanel = document.getElementById('pen-options');
  brushSizeSlider = document.getElementById('brush-size');
  textEditor = document.getElementById('text-editor');
  zoomDisplay = document.getElementById('zoom-display');
  fontOptionsPanel = document.getElementById('font-options-panel');
  fontCycleBtn = document.getElementById('font-cycle');
  fontSizeIncreaseBtn = document.getElementById('font-size-increase');
  fontSizeDecreaseBtn = document.getElementById('font-size-decrease');
  
  currentBrushSize = parseFloat(brushSizeSlider.value);

  // Event Listeners
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

  fontCycleBtn.addEventListener('click', cycleFont);
  fontSizeIncreaseBtn.addEventListener('click', () => changeFontSize(2));
  fontSizeDecreaseBtn.addEventListener('click', () => changeFontSize(-2));
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

// Font & Text Editor Functions
function updateTextareaFont() {
    if (textEditor) {
        textEditor.style.font = `${currentFontSize}px '${fontFamilies[currentFontIndex]}'`;
        fontCycleBtn.style.fontFamily = `'${fontFamilies[currentFontIndex]}', sans-serif`; // Update cycle button font
        autoResizeTextEditor();
    }
}

function cycleFont() {
    currentFontIndex = (currentFontIndex + 1) % fontFamilies.length;
    updateTextareaFont();
}

function changeFontSize(delta) {
    currentFontSize = Math.max(8, currentFontSize + delta);
    updateTextareaFont();
}

export function activateTextEditor(x, y, existingObject = null) {
  deactivateTextEditor();
  editingTextObject = existingObject;

  if (existingObject) {
    existingObject.visible = false;
    redrawCanvas();
    // Correctly parse the existing object's font to set the initial state
    const fontParts = existingObject.font.match(/(\d+)px "?([^"]*)"?/);
    if (fontParts && fontParts.length === 3) {
      currentFontSize = parseFloat(fontParts[1]);
      const fontName = fontParts[2].replace(/'/g, ""); // Clean font name
      currentFontIndex = fontFamilies.indexOf(fontName);
      if (currentFontIndex === -1) currentFontIndex = 0; // Fallback
    }
  } else {
    // Reset to default for new text object
    currentFontSize = 24;
    currentFontIndex = 0;
  }

  const screenX = (existingObject ? existingObject.x : x) * scale + offsetX;
  const screenY = (existingObject ? existingObject.y : y) * scale + offsetY;
  
  textEditor.value = existingObject ? existingObject.text : '';
  textEditor.style.left = `${screenX}px`;
  textEditor.style.top = `${screenY}px`;
  updateTextareaFont(); // Apply the correct font to the textarea and cycle button
  textEditor.style.color = existingObject ? existingObject.color : '#000';
  textEditor.style.visibility = 'visible';
  textEditor.style.transform = `scale(${scale})`;
  
  fontOptionsPanel.style.left = `${screenX - 60}px`;
  fontOptionsPanel.style.top = `${screenY}px`;
  fontOptionsPanel.style.transform = `scale(${scale})`;
  fontOptionsPanel.classList.add('visible');

  setTimeout(() => textEditor.focus(), 0);
  
  textEditor.addEventListener('mousedown', onTextareaMouseDown);
  window.addEventListener('mousemove', onTextareaMouseMove);
  window.addEventListener('mouseup', onTextareaMouseUp);
}

function deactivateTextEditor() {
    if (!textEditor || textEditor.style.visibility === 'hidden') return;
    
    fontOptionsPanel.classList.remove('visible');

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
            editingTextObject.font = textEditor.style.font; // Get final font from textarea
            editingTextObject.visible = true;
        }
    } else if (newText !== '') {
        const newTextObject = new Text(generateId(), newText, newX, newY, textEditor.style.font, '#000');
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
  fontOptionsPanel.style.cursor = 'grab';
}
function onTextareaMouseMove(e) {
  if (!isDraggingText) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  textEditor.style.left = `${initialTextLeft + dx}px`;
  textEditor.style.top = `${initialTextTop + dy}px`;
  fontOptionsPanel.style.left = `${initialTextLeft + dx - 60}px`;
  fontOptionsPanel.style.top = `${initialTextTop + dy}px`;
}
function onTextareaMouseUp() {
  if (isDraggingText) {
    isDraggingText = false;
    textEditor.style.cursor = 'default';
    fontOptionsPanel.style.cursor = 'default';
  }
}
function autoResizeTextEditor() {
    textEditor.style.height = 'auto';
    textEditor.style.height = `${textEditor.scrollHeight}px`;
    textEditor.style.width = 'auto';
    textEditor.style.width = `${textEditor.scrollWidth}px`;
}

// Tool Handlers
export const toolHandlers = {
  select: {
    onMouseDown(e) {
      deactivateTextEditor();
      const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
      const hitObject = findObjectAt(x, y);
      if (hitObject) {
        selectedObjectId = hitObject.id;
        isDraggingObject = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        canvas.style.cursor = 'move';
      } else {
        selectedObjectId = null;
        isPanning = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        canvas.style.cursor = 'grabbing';
      }
      redrawCanvas();
    },
    onMouseMove(e) {
      if (isDraggingObject) {
        const selectedObject = scene.find(obj => obj.id === selectedObjectId);
        if (selectedObject) {
          const dx = e.clientX - dragStartX;
          const dy = e.clientY - dragStartY;
          selectedObject.move(dx / scale, dy / scale);
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
          const localEraserX = x - object.x;
          const localEraserY = y - object.y;
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

// Tool Selection
export function selectTool(toolName) {
  if (currentTool === 'text' && toolName !== 'text') {
    deactivateTextEditor();
  }

  const isFirstSelection = !isInitialized;
  if (toolName === 'pen' && currentTool === 'pen' && !isFirstSelection) {
    if(penOptionsPanel) penOptionsPanel.classList.toggle('visible');
  } else if (penOptionsPanel) {
    penOptionsPanel.classList.remove('visible');
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

  if(!isInitialized) {
      isInitialized = true;
  }
}

export function updateZoomDisplay() {
  if (zoomDisplay) {
    zoomDisplay.textContent = `${Math.round(scale * 100)}%`;
  }
}
