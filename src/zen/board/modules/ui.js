// ui.js

import { canvas, redrawCanvas } from './canvas.js';
import { getState, setState } from './state.js';
import { scene, addToScene, generateId, Text } from './scene.js';

// DOM Elements
let penOptionsPanel, brushSizeSlider, textEditor, zoomDisplay, fontOptionsPanel, fontCycleBtn, fontSizeIncreaseBtn, fontSizeDecreaseBtn, shapeOptionsPanel, shapeRectangleBtn, shapeEllipseBtn, fillToggleBtn, shapesToolBtn;

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
  textEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        deactivateTextEditor();
    }
  });

  fontCycleBtn.addEventListener('click', cycleFont);
  fontSizeIncreaseBtn.addEventListener('click', () => changeFontSize(2));
  fontSizeDecreaseBtn.addEventListener('click', () => changeFontSize(-2));

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

export function activateTextEditor(x, y, existingObject = null) {
  deactivateTextEditor();
  setState({ editingTextObject: existingObject });

  if (existingObject) {
    existingObject.visible = false;
    redrawCanvas();
    const fontParts = existingObject.font.match(/(\d+)px "?([^"]*)"?/);
    if (fontParts && fontParts.length === 3) {
      let { fontFamilies } = getState();
      let currentFontSize = parseFloat(fontParts[1]);
      const fontName = fontParts[2].replace(/'/g, "");
      let currentFontIndex = fontFamilies.indexOf(fontName);
      if (currentFontIndex === -1) currentFontIndex = 0;
      setState({ currentFontSize, currentFontIndex });
    }
  } else {
    setState({ currentFontSize: 24, currentFontIndex: 0 });
  }

  const { scale, offsetX, offsetY } = getState();
  const screenX = (existingObject ? existingObject.x : x) * scale + offsetX;
  const screenY = (existingObject ? existingObject.y : y) * scale + offsetY;
  
  textEditor.value = existingObject ? existingObject.text : '';
  textEditor.style.left = `${screenX}px`;
  textEditor.style.top = `${screenY}px`;
  updateTextareaFont();
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

export function deactivateTextEditor() {
    if (!textEditor || textEditor.style.visibility === 'hidden') return;
    
    fontOptionsPanel.classList.remove('visible');

    const { editingTextObject, scale, offsetX, offsetY } = getState();
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
            editingTextObject.font = textEditor.style.font;
            editingTextObject.visible = true;
        }
    } else if (newText !== '') {
        const newTextObject = new Text(generateId(), newText, newX, newY, textEditor.style.font, '#000');
        addToScene(newTextObject);
    }

    textEditor.value = '';
    textEditor.style.visibility = 'hidden';
    setState({ editingTextObject: null });
    textEditor.removeEventListener('mousedown', onTextareaMouseDown);
    window.removeEventListener('mousemove', onTextareaMouseMove);
    window.removeEventListener('mouseup', onTextareaMouseUp);
    redrawCanvas();
}

function onTextareaMouseDown(e) {
  setState({
    isDraggingText: true,
    dragStartX: e.clientX,
    dragStartY: e.clientY,
    initialTextLeft: parseFloat(textEditor.style.left),
    initialTextTop: parseFloat(textEditor.style.top),
  });
  textEditor.style.cursor = 'grab';
  fontOptionsPanel.style.cursor = 'grab';
}
function onTextareaMouseMove(e) {
  const { isDraggingText, dragStartX, dragStartY, initialTextLeft, initialTextTop } = getState();
  if (!isDraggingText) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  textEditor.style.left = `${initialTextLeft + dx}px`;
  textEditor.style.top = `${initialTextTop + dy}px`;
  fontOptionsPanel.style.left = `${initialTextLeft + dx - 60}px`;
  fontOptionsPanel.style.top = `${initialTextTop + dy}px`;
}
function onTextareaMouseUp() {
  const { isDraggingText } = getState();
  if (isDraggingText) {
    setState({ isDraggingText: false });
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
  let { currentTool } = getState();
  if (currentTool === 'text' && toolName !== 'text') {
    deactivateTextEditor();
  }

  const isSameTool = toolName === currentTool;

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
    setState({ selectedObjectId: null });
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
