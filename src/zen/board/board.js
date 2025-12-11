// main.js (board.js) - Main Entry Point

import { canvas, resizeCanvas, redrawCanvas, setTransform, getTransformedPoint } from './modules/canvas.js';
import { toolHandlers } from './modules/tools.js';
import { getState } from './modules/state.js';
import { initTools, selectTool, updateZoomDisplay, activateTextEditor } from './modules/ui.js';
import { findObjectAt } from './modules/interactions.js';
import { Text } from './modules/scene.js';

// =================================================================
// === DOM Elements ================================================
// =================================================================
const penToolBtn = document.getElementById('pen-tool');
const eraserToolBtn = document.getElementById('eraser-tool');
const textToolBtn = document.getElementById('text-tool');
const selectToolBtn = document.getElementById('select-tool');
const shapesToolBtn = document.getElementById('shapes-tool');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');

// =================================================================
// === Zoom Logic ==================================================
// =================================================================
function zoom(direction) {
  const { scale, offsetX, offsetY } = getState();
  const zoomFactor = 1.1;
  const oldScale = scale;
  let newScale = direction > 0 ? oldScale * zoomFactor : oldScale / zoomFactor;
  // Clamp zoom level
  newScale = Math.max(0.1, Math.min(newScale, 10));

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  const newOffsetX = centerX - (centerX - offsetX) * (newScale / oldScale);
  const newOffsetY = centerY - (centerY - offsetY) * (newScale / oldScale);

  setTransform(newScale, newOffsetX, newOffsetY);
  redrawCanvas();
  updateZoomDisplay();
}

// =================================================================
// === Main Event Listeners (Delegation) ===========================
// =================================================================

function onMouseDown(e) {
  if (e.target !== canvas) return;
  const { currentTool } = getState();
  toolHandlers[currentTool].onMouseDown(e);
}

function onMouseMove(e) {
  const { currentTool } = getState();
  toolHandlers[currentTool].onMouseMove(e);
}

function onMouseUp(e) {
  const { currentTool } = getState();
  toolHandlers[currentTool].onMouseUp(e);
}

function onDoubleClick(e) {
  const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
  const hitObject = findObjectAt(x, y);
  if (hitObject && hitObject instanceof Text) {
    // No need to switch tool, just activate the editor
    activateTextEditor(hitObject.x, hitObject.y, hitObject);
  }
}

// =================================================================
// === Initialization ==============================================
// =================================================================
window.addEventListener('DOMContentLoaded', () => {
  initTools();
  resizeCanvas();
  
  // Set up event listeners
  window.addEventListener('resize', resizeCanvas);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseout', onMouseUp);
  canvas.addEventListener('dblclick', onDoubleClick);

  penToolBtn.addEventListener('click', () => selectTool('pen'));
  eraserToolBtn.addEventListener('click', () => selectTool('eraser'));
  textToolBtn.addEventListener('click', () => selectTool('text'));
  selectToolBtn.addEventListener('click', () => selectTool('select'));
  shapesToolBtn.addEventListener('click', () => selectTool('shape'));
  zoomInBtn.addEventListener('click', () => zoom(1));
  zoomOutBtn.addEventListener('click', () => zoom(-1));

  // Initial setup
  selectTool('select');
  updateZoomDisplay();
  redrawCanvas();
});