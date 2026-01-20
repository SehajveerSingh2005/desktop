// ui.js

import { canvas, redrawCanvas } from './canvas.js';
import { getState, setState } from './state.js';
import { scene, addToScene, generateId, Text } from './scene.js';

// DOM Elements
let penOptionsPanel, brushSizeSlider, textEditor, zoomDisplay, fontOptionsPanel, fontCycleBtn, fontSizeIncreaseBtn, fontSizeDecreaseBtn, shapeOptionsPanel, shapeRectangleBtn, shapeEllipseBtn, fillToggleBtn, shapesToolBtn;

// --- Drag handlers for the text editor (border-drag logic) ---
function onDragMouseMove(e) {
  const { dragStartX, dragStartY, editingTextObject, scale } = getState();
  if (!editingTextObject) return;

  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;

  // Move the underlying scene object.
  editingTextObject.move(dx / scale, dy / scale);

  // Update the drag origin for the next mousemove event.
  setState({ dragStartX: e.clientX, dragStartY: e.clientY });

  // Sync the DOM editor's position with the scene object and redraw.
  updateTextEditorPosition();
  redrawCanvas();
}

function onDragMouseUp() {
  // The drag is over, so clean up the global listeners.
  window.removeEventListener('mousemove', onDragMouseMove);
  window.removeEventListener('mouseup', onDragMouseUp);
}

function onTextareaMouseDown(e) {
  // This function implements "drag-from-border".
  // A drag is only initiated if the mousedown occurs near the edge of the textarea.
  const borderSize = 5; // A 5px area to make it easier to grab
  const isonBorder =
    e.offsetX < borderSize ||
    e.offsetY < borderSize ||
    e.offsetX > textEditor.clientWidth - borderSize ||
    e.offsetY > textEditor.clientHeight - borderSize;

  if (isonBorder) {
    // Prevent the browser's default text-selection behavior.
    e.preventDefault();
    // Record the starting point of the drag.
    setState({
      dragStartX: e.clientX,
      dragStartY: e.clientY,
    });
    // Add temporary global listeners to track the drag.
    window.addEventListener('mousemove', onDragMouseMove);
    window.addEventListener('mouseup', onDragMouseUp);
  }
  // If the click is not on the border, we do nothing and allow the default
  // browser behavior for text editing (moving cursor, selecting text, etc.).
}

// This handler provides cursor feedback, showing 'move' on the draggable
// border and 'text' inside, so the user knows which part to drag.
function onTextareaMouseMove(e) {
  const borderSize = 5;
  const isonBorder =
    e.offsetX < borderSize ||
    e.offsetY < borderSize ||
    e.offsetX > textEditor.clientWidth - borderSize ||
    e.offsetY > textEditor.clientHeight - borderSize;

  textEditor.style.cursor = isonBorder ? 'move' : 'text';
}


// Initialization
export function initTools() {
  penOptionsPanel = document.getElementById('pen-options');
  brushSizeSlider = document.getElementById('brush-size');
  textEditor = document.getElementById('text-editor');
  zoomDisplay = document.getElementById('zoom-display');
  fontOptionsPanel = document.getElementById('font-options-panel');
  fontCycleBtn = document.getElementById('font-cycle');
  fontSizeIncreaseBtn = document.getElementById('font-size-increase');
  fontSizeDecreaseBtn = document.getElementById('font-size-decrease');
  shapeOptionsPanel = document.getElementById('shape-options-panel');
  shapeRectangleBtn = document.getElementById('shape-rectangle');
  shapeEllipseBtn = document.getElementById('shape-ellipse');
  fillToggleBtn = document.getElementById('fill-toggle');
  shapesToolBtn = document.getElementById('shapes-tool');

  setState({ currentBrushSize: parseFloat(brushSizeSlider.value) });

  // Event Listeners
  brushSizeSlider.addEventListener('input', (e) => {
    setState({ currentBrushSize: parseFloat(e.target.value) });
  });

  textEditor.addEventListener('input', autoResizeTextEditor);

  // Prevent font controls from stealing focus from the text editor.
  // Without this, clicking a font button would blur the textarea and
  // incorrectly deactivate the editor.
  const handleFontButtonMouseDown = (e) => e.preventDefault();
  fontCycleBtn.addEventListener('click', cycleFont);
  fontCycleBtn.addEventListener('mousedown', handleFontButtonMouseDown);
  fontSizeIncreaseBtn.addEventListener('click', () => changeFontSize(2));
  fontSizeIncreaseBtn.addEventListener('mousedown', handleFontButtonMouseDown);
  fontSizeDecreaseBtn.addEventListener('click', () => changeFontSize(-2));
  fontSizeDecreaseBtn.addEventListener('mousedown', handleFontButtonMouseDown);

  shapeRectangleBtn.addEventListener('click', () => selectShape('rectangle'));
  shapeEllipseBtn.addEventListener('click', () => selectShape('ellipse'));
  fillToggleBtn.addEventListener('click', toggleFill);

  shapesToolBtn.addEventListener('click', () => selectTool('shape'));
}

// Font & Text Editor
function updateTextareaFont() {
  const { currentFontSize, fontFamilies, currentFontIndex } = getState();
  if (textEditor) {
    textEditor.style.font = `${currentFontSize}px '${fontFamilies[currentFontIndex]}'`;
    fontCycleBtn.style.fontFamily = `'${fontFamilies[currentFontIndex]}', sans-serif`;
    autoResizeTextEditor();
  }
}

function cycleFont() {
  let { currentFontIndex, fontFamilies } = getState();
  currentFontIndex = (currentFontIndex + 1) % fontFamilies.length;
  setState({ currentFontIndex });
  updateTextareaFont();
}

function changeFontSize(delta) {
  let { currentFontSize } = getState();
  currentFontSize = Math.max(8, currentFontSize + delta);
  setState({ currentFontSize });
  updateTextareaFont();
}

export function updateTextEditorPosition() {
  const { editingTextObject, scale, offsetX, offsetY } = getState();
  if (!editingTextObject) return;

  const screenX = editingTextObject.x * scale + offsetX;
  const screenY = editingTextObject.y * scale + offsetY;

  textEditor.style.left = `${screenX}px`;
  textEditor.style.top = `${screenY}px`;
  textEditor.style.transform = `scale(${scale})`;

  fontOptionsPanel.style.left = `${screenX - 60}px`;
  fontOptionsPanel.style.top = `${screenY}px`;
  fontOptionsPanel.style.transform = `scale(${scale})`;
}

export function activateTextEditor(x, y, existingObject = null) {
  if (getState().editingTextObject) {
    deactivateTextEditor();
  }

  let objectToEdit = existingObject;

  // For a brand-new text element, we create a temporary object immediately.
  // This is crucial for the drag-from-border logic, which needs an object
  // in the state to move, even before the text has been finalized.
  if (!objectToEdit) {
    const { currentFontSize, fontFamilies, currentFontIndex } = getState();
    const font = `${currentFontSize}px '${fontFamilies[currentFontIndex]}'`;
    objectToEdit = new Text(generateId(), '', x, y, font, '#000');
    // Note: This object is NOT added to the main scene yet.
  }

  setState({ editingTextObject: objectToEdit });

  if (existingObject) {
    existingObject.visible = false;
    const fontParts = existingObject.font.match(/(\d+)px "?([^"]*)"?/);
    if (fontParts && fontParts.length === 3) {
      let { fontFamilies } = getState();
      let currentFontSize = parseFloat(fontParts[1]);
      const fontName = fontParts[2].replace(/'/g, "");
      let currentFontIndex = fontFamilies.indexOf(fontName);
      if (currentFontIndex === -1) currentFontIndex = 0;
      setState({ currentFontSize, currentFontIndex });
    }
    textEditor.value = existingObject.text;
    textEditor.style.color = existingObject.color;
  } else {
    setState({ currentFontSize: 24, currentFontIndex: 0 });
    textEditor.value = '';
    textEditor.style.color = '#000';
  }

  updateTextEditorPosition();
  updateTextareaFont();

  textEditor.style.visibility = 'visible';
  fontOptionsPanel.classList.add('visible');

  setTimeout(() => textEditor.focus(), 0);

  textEditor.addEventListener('mousedown', onTextareaMouseDown);
  textEditor.addEventListener('mousemove', onTextareaMouseMove);
}

export function deactivateTextEditor() {
  if (!textEditor || textEditor.style.visibility === 'hidden') return;

  fontOptionsPanel.classList.remove('visible');

  const { editingTextObject } = getState();
  const newText = textEditor.value;

  if (editingTextObject) {
    const isInScene = scene.some(obj => obj.id === editingTextObject.id);

    // If the editor is closed and there's no text, discard the object.
    if (newText.trim() === '') {
      // If the object was already in the scene, find and remove it.
      if (isInScene) {
        const index = scene.findIndex(obj => obj.id === editingTextObject.id);
        if (index > -1) scene.splice(index, 1);
      }
    } else {
      // The object has text, so we update its properties.
      editingTextObject.text = newText;
      editingTextObject.font = textEditor.style.font;
      editingTextObject.color = textEditor.style.color;
      editingTextObject.visible = true;

      // If it was a new, temporary object, add it to the main scene now.
      if (!isInScene) {
        addToScene(editingTextObject);
      }
    }
  }

  textEditor.value = '';
  textEditor.style.visibility = 'hidden';
  setState({ editingTextObject: null });

  textEditor.removeEventListener('mousedown', onTextareaMouseDown);
  textEditor.removeEventListener('mousemove', onTextareaMouseMove);

  redrawCanvas();
}

function autoResizeTextEditor() {
  textEditor.style.height = 'auto';
  textEditor.style.height = `${textEditor.scrollHeight}px`;
  textEditor.style.width = 'auto';
  textEditor.style.width = `${textEditor.scrollWidth}px`;
}

// Shape Tools
function selectShape(shapeType) {
  setState({ currentShapeType: shapeType });
  shapeRectangleBtn.classList.toggle('active', shapeType === 'rectangle');
  shapeEllipseBtn.classList.toggle('active', shapeType === 'ellipse');
}

function toggleFill() {
  let { isShapeFilled } = getState();
  isShapeFilled = !isShapeFilled;
  setState({ isShapeFilled });
  fillToggleBtn.innerHTML = `<img src="chrome://browser/content/zen-board/icons/${isShapeFilled ? 'fill-solid' : 'fill-none'}.svg" alt="Fill">`;
}

// --- Tool Selection ---
export function selectTool(toolName) {
  if (getState().editingTextObject) {
    deactivateTextEditor();
  }

  const isSameTool = toolName === getState().currentTool;

  // If different tool is selected, hide all panels
  if (!isSameTool) {
    if (penOptionsPanel) penOptionsPanel.classList.remove('visible');
    if (shapeOptionsPanel) shapeOptionsPanel.classList.remove('visible');
  }

  // Toggle panel for the current tool if the button is clicked again
  if (isSameTool) {
    if (toolName === 'pen') {
      penOptionsPanel.classList.toggle('visible');
    } else if (toolName === 'shape') {
      shapeOptionsPanel.classList.toggle('visible');
    }
  }

  setState({ currentTool: toolName });
  document.querySelectorAll('.tool-button, .shape-button').forEach(btn => btn.classList.remove('active'));

  const toolButtonId = toolName === 'shape' ? 'shapes-tool' : `${toolName}-tool`;
  const toolButton = document.getElementById(toolButtonId);
  if (toolButton) {
    toolButton.classList.add('active');
  }

  if (toolName === 'shape') {
    let { currentShapeType } = getState();
    if (currentShapeType === 'rectangle') {
      shapeRectangleBtn.classList.add('active');
    } else {
      shapeEllipseBtn.classList.add('active');
    }
  }

  if (toolName === 'select') {
    canvas.style.cursor = 'grab';
  } else {
    canvas.style.cursor = 'crosshair';
    setState({ selectedObjectId: null });
  }

  redrawCanvas();
}

export function updateZoomDisplay() {
  const { scale } = getState();
  if (zoomDisplay) {
    zoomDisplay.textContent = `${Math.round(scale * 100)}%`;
  }
}

