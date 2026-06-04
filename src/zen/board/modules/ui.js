// ui.js

import { canvas, redrawCanvas } from './canvas.js';
import { getState, setState } from './state.js';
import { scene, addToScene, removeFromScene, generateId, Text, parseFont } from './scene.js';
import { pushHistory } from './history.js';
import { hideVideoControls } from './video-controls.js';
import { hideCaptureControls } from './capture-controls.js';

// DOM Elements
let penOptionsPanel, brushSizeSlider, textEditor, zoomDisplay, fontOptionsPanel, fontCycleBtn, fontSizeIncreaseBtn, fontSizeDecreaseBtn, shapeOptionsPanel, shapeRectangleBtn, shapeEllipseBtn, fillToggleBtn, shapesToolBtn, colorToolBtn, colorOptionsPanel, mainColorsContainer, penToolBtn, eraserToolBtn, textToolBtn, selectToolBtn, slashMenu;

const COLORS = ['#000000', '#ffffff', '#FF3B30', '#FF9500', '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6'];



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
  colorToolBtn = document.getElementById('color-tool');
  colorOptionsPanel = document.getElementById('color-options-panel');
  mainColorsContainer = document.getElementById('main-colors');

  initColorPalette(mainColorsContainer);

  colorToolBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent document click from immediately closing it
    const isVisible = colorOptionsPanel.classList.toggle('visible');
    colorToolBtn.classList.toggle('active', isVisible);
  });

  // Close color panel when clicking outside
  document.addEventListener('click', (e) => {
    if (colorOptionsPanel.classList.contains('visible') &&
      !colorOptionsPanel.contains(e.target) &&
      !colorToolBtn.contains(e.target)) {
      colorOptionsPanel.classList.remove('visible');
      colorToolBtn.classList.remove('active');
    }
  });

  setState({ currentBrushSize: parseFloat(brushSizeSlider.value) });

  // Event Listeners
  brushSizeSlider.addEventListener('input', (e) => {
    setState({ currentBrushSize: parseFloat(e.target.value) });
  });

  textEditor.addEventListener('input', autoResizeTextEditor);

  slashMenu = document.getElementById('slash-menu');
  if (slashMenu) {
    slashMenu.querySelectorAll('.slash-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent textEditor blur
        selectSlashItem(item);
      });
    });
  }

  textEditor.addEventListener('keydown', (e) => {
    if (slashMenu && slashMenu.style.display !== 'none') {
      const items = slashMenu.querySelectorAll('.slash-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSlashIndex = (activeSlashIndex + 1) % items.length;
        updateSlashMenuItems();
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSlashIndex = (activeSlashIndex - 1 + items.length) % items.length;
        updateSlashMenuItems();
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectSlashItem(items[activeSlashIndex]);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideSlashMenu();
        return;
      }
    }

    // Auto-increment list and backspace logic
    const selectionStart = textEditor.selectionStart;
    const selectionEnd = textEditor.selectionEnd;

    if (selectionStart === selectionEnd) {
      const text = textEditor.value;
      const textBeforeCursor = text.substring(0, selectionStart);
      const textAfterCursor = text.substring(selectionStart);
      const lines = textBeforeCursor.split('\n');
      const currentLine = lines[lines.length - 1];

      if (e.key === 'Enter') {
        const emptyNumberedMatch = currentLine.match(/^(\s*)(\d+)\.\s*$/);
        const emptyBulletMatch = currentLine.match(/^(\s*)([-*•])\s*$/);

        if (emptyNumberedMatch || emptyBulletMatch) {
          e.preventDefault();
          const lineStartPos = selectionStart - currentLine.length;
          const indentation = emptyNumberedMatch?.[1] || emptyBulletMatch?.[1] || '';
          const newText = text.substring(0, lineStartPos) + indentation + textAfterCursor;
          textEditor.value = newText;
          const newCaretPos = lineStartPos + indentation.length;
          textEditor.setSelectionRange(newCaretPos, newCaretPos);
          autoResizeTextEditor();
          return;
        }

        const numberedMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
        const bulletMatch = currentLine.match(/^(\s*)([-*•])\s+(.*)$/);
        let nextPrefix = null;

        if (numberedMatch) {
          const nextNum = parseInt(numberedMatch[2], 10) + 1;
          nextPrefix = `\n${numberedMatch[1]}${nextNum}. `;
        } else if (bulletMatch) {
          nextPrefix = `\n${bulletMatch[1]}${bulletMatch[2]} `;
        }

        if (nextPrefix !== null) {
          e.preventDefault();
          const newText = textBeforeCursor + nextPrefix + textAfterCursor;
          textEditor.value = newText;
          const newCaretPos = selectionStart + nextPrefix.length;
          textEditor.setSelectionRange(newCaretPos, newCaretPos);
          autoResizeTextEditor();
          return;
        }
      } else if (e.key === 'Backspace') {
        const emptyNumberedMatch = currentLine.match(/^(\s*)(\d+)\.\s*$/);
        const emptyBulletMatch = currentLine.match(/^(\s*)([-*•])\s*$/);

        if (emptyNumberedMatch || emptyBulletMatch) {
          e.preventDefault();
          const lineStartPos = selectionStart - currentLine.length;
          const indentation = emptyNumberedMatch?.[1] || emptyBulletMatch?.[1] || '';
          const newText = text.substring(0, lineStartPos) + indentation + textAfterCursor;
          textEditor.value = newText;
          const newCaretPos = lineStartPos + indentation.length;
          textEditor.setSelectionRange(newCaretPos, newCaretPos);
          autoResizeTextEditor();
          return;
        }
      }
    }
  });

  textEditor.addEventListener('keyup', (e) => {
    const caretPos = textEditor.selectionStart;
    const textBeforeCaret = textEditor.value.substring(0, caretPos);
    const currentLine = textBeforeCaret.split('\n').pop();
    
    if (currentLine === '/') {
      if (slashMenu && slashMenu.style.display !== 'flex') {
        showSlashMenu();
      }
    } else if (slashMenu && slashMenu.style.display !== 'none' && !currentLine.includes('/')) {
      hideSlashMenu();
    }
  });

  // Prevent font controls from stealing focus from the text editor.
  // Without this, clicking a font button would blur the textarea and
  // incorrectly deactivate the editor.
  const handleFontButtonMouseDown = (e) => e.preventDefault();
  fontCycleBtn.addEventListener('click', cycleFont);
  fontCycleBtn.addEventListener('mousedown', handleFontButtonMouseDown);
  fontSizeIncreaseBtn.addEventListener('click', () => changeFontSize(4));
  fontSizeIncreaseBtn.addEventListener('mousedown', handleFontButtonMouseDown);
  fontSizeDecreaseBtn.addEventListener('click', () => changeFontSize(-4));
  fontSizeDecreaseBtn.addEventListener('mousedown', handleFontButtonMouseDown);

  shapeRectangleBtn.addEventListener('click', () => selectShape('rectangle'));
  shapeEllipseBtn.addEventListener('click', () => selectShape('ellipse'));
  fillToggleBtn.addEventListener('click', toggleFill);

  penToolBtn = document.getElementById('pen-tool');
  eraserToolBtn = document.getElementById('eraser-tool');
  textToolBtn = document.getElementById('text-tool');
  selectToolBtn = document.getElementById('select-tool');

  penToolBtn.addEventListener('click', () => selectTool('pen'));
  eraserToolBtn.addEventListener('click', () => selectTool('eraser'));
  textToolBtn.addEventListener('click', () => selectTool('text'));
  selectToolBtn.addEventListener('click', () => selectTool('select'));
  shapesToolBtn.addEventListener('click', () => selectTool('shape'));
}

function initColorPalette(container) {
  if (!container) return;
  COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    if (color === getState().currentColor) swatch.classList.add('active');

    swatch.addEventListener('click', () => selectColor(color));
    container.appendChild(swatch);
  });
}

function selectColor(color) {
  setState({ currentColor: color });

  // Update UI swatches
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    // Check both potential formats: hex string from property or rgb string from computed style
    const isActive =
      swatch.style.backgroundColor === color ||
      swatch.style.backgroundColor === `rgb(${hexToRgb(color)})` ||
      swatch.style.backgroundColor.replace(/\s/g, '') === `rgb(${hexToRgb(color)})`;

    swatch.classList.toggle('active', isActive);
  });

  // If there's an active text editor, update its color
  if (textEditor && textEditor.style.visibility === 'visible') {
    textEditor.style.color = color;
    // We don't push history here because the text isn't "finalized" yet.
    // It will be pushed when the editor is deactivated.
  }

  // Update toolbar icon
  const colorDisplay = document.getElementById('active-color-display');
  if (colorDisplay) {
    colorDisplay.style.backgroundColor = color;
    colorDisplay.style.borderColor = 'white';
  }
}

// Helper to handle color format matching if needed
function hexToRgb(hex) {
  const bigint = parseInt(hex.substring(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return r + "," + g + "," + b;
}

// Font & Text Editor
function updateTextareaFont() {
  const { currentFontSize, fontFamilies, currentFontIndex } = getState();
  if (textEditor) {
    const fontName = fontFamilies[currentFontIndex];
    const fontSpec = `${currentFontSize}px '${fontName}'`;
    textEditor.style.font = fontSpec;
    textEditor.style.lineHeight = '1.3';
    fontCycleBtn.style.fontFamily = `'${fontName}', sans-serif`;

    // Ensure the font is loaded before measuring for auto-resize. 
    // This prevents the editor from being too small when a font is used for the first time.
    if (document.fonts.check(fontSpec)) {
      autoResizeTextEditor();
    } else {
      document.fonts.load(fontSpec).then(() => {
        autoResizeTextEditor();
      });
    }
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

  if (slashMenu && slashMenu.style.display !== 'none') {
    updateSlashMenuPosition();
  }
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
    const { currentFontSize, fontFamilies, currentFontIndex, currentColor } = getState();
    const font = `${currentFontSize}px '${fontFamilies[currentFontIndex]}'`;
    objectToEdit = new Text(generateId(), '', x, y, font, currentColor);
    // Note: This object is NOT added to the main scene yet.
  }

  setState({ editingTextObject: objectToEdit });

  if (existingObject) {
    existingObject.visible = false;
    const { fontSize: currentFontSize, fontFamily: fontName } = parseFont(existingObject.font);
    let { fontFamilies } = getState();
    let currentFontIndex = fontFamilies.indexOf(fontName);
    if (currentFontIndex === -1) currentFontIndex = 0;
    setState({ currentFontSize, currentFontIndex });
    textEditor.value = existingObject.text;
    textEditor.style.color = existingObject.color;
    selectColor(existingObject.color); // Sync palette
  } else {
    setState({ currentFontSize: 24, currentFontIndex: 0 });
    textEditor.value = '';
    textEditor.style.color = '#000';
  }

  updateTextEditorPosition();
  updateTextareaFont();

  textEditor.style.visibility = 'visible';
  fontOptionsPanel.classList.add('visible');
  hideSlashMenu();

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
        removeFromScene(editingTextObject.id);
      }
    } else {
      // The object has text, so we update its properties.
      editingTextObject.text = newText;
      editingTextObject.font = textEditor.style.font;
      editingTextObject.color = textEditor.style.color;
      editingTextObject.visible = true;
      editingTextObject._serializedCache = null;
      editingTextObject._cachedBoundingBox = null;

      // If it was a new, temporary object, add it to the main scene now.
      if (!isInScene) {
        addToScene(editingTextObject);
      }
    }
  }

  hideSlashMenu();
  textEditor.value = '';
  textEditor.style.visibility = 'hidden';
  setState({ editingTextObject: null });

  textEditor.removeEventListener('mousedown', onTextareaMouseDown);
  textEditor.removeEventListener('mousemove', onTextareaMouseMove);

  redrawCanvas();
  pushHistory();
}

// Slash Menu Helpers
let activeSlashIndex = 0;

function showSlashMenu() {
  if (!slashMenu) return;
  activeSlashIndex = 0;
  updateSlashMenuItems();
  slashMenu.style.display = 'flex';
  updateSlashMenuPosition();
}

export function hideSlashMenu() {
  if (!slashMenu) return;
  slashMenu.style.display = 'none';
}

function updateSlashMenuItems() {
  const items = slashMenu.querySelectorAll('.slash-item');
  items.forEach((item, index) => {
    item.classList.toggle('active', index === activeSlashIndex);
  });
}

function updateSlashMenuPosition() {
  if (!slashMenu || !textEditor) return;
  const { scale } = getState();
  const rect = textEditor.getBoundingClientRect();
  slashMenu.style.left = `${rect.left}px`;
  slashMenu.style.top = `${rect.bottom + 5}px`;
  slashMenu.style.transform = `scale(${scale})`;
  slashMenu.style.transformOrigin = `top left`;
}

function selectSlashItem(item) {
  if (!item || !textEditor) return;
  const val = item.getAttribute('data-value');
  
  const caretPos = textEditor.selectionStart;
  const textVal = textEditor.value;
  const textBefore = textVal.substring(0, caretPos);
  const textAfter = textVal.substring(caretPos);
  
  const lastNewlineIndex = textBefore.lastIndexOf('\n');
  const lineStart = lastNewlineIndex === -1 ? 0 : lastNewlineIndex + 1;
  
  const beforeLine = textVal.substring(0, lineStart);
  const lineContent = textVal.substring(lineStart, caretPos);
  
  if (lineContent.startsWith('/')) {
    textEditor.value = beforeLine + val + textAfter;
    textEditor.selectionStart = textEditor.selectionEnd = lineStart + val.length;
  }
  
  hideSlashMenu();
  autoResizeTextEditor();
  textEditor.focus();
}

function autoResizeTextEditor() {
  textEditor.style.height = 'auto';
  textEditor.style.width = 'auto';

  // Set to a small value to accurately measure scroll dimensions
  textEditor.style.height = '1px';
  textEditor.style.width = '1px';

  // Add a buffer to prevent clipping (especially for italic/bold or custom fonts)
  textEditor.style.height = `${textEditor.scrollHeight + 4}px`;
  textEditor.style.width = `${textEditor.scrollWidth + 4}px`;

  if (slashMenu && slashMenu.style.display !== 'none') {
    updateSlashMenuPosition();
  }
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
  hideVideoControls();
  hideCaptureControls();

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
  } else {
    // Hide all tool-specific panels first
    if (penOptionsPanel) penOptionsPanel.classList.remove('visible');
    if (shapeOptionsPanel) shapeOptionsPanel.classList.remove('visible');
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

let _lastZoomPercent = -1;
export function updateZoomDisplay() {
  const { scale } = getState();
  if (zoomDisplay) {
    const percent = Math.round(scale * 100);
    if (percent !== _lastZoomPercent) {
      zoomDisplay.textContent = `${percent}%`;
      _lastZoomPercent = percent;
    }
  }
}

