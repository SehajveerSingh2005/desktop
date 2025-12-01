// main.js (board.js) - Main Entry Point

import { canvas, resizeCanvas, redrawCanvas } from './modules/canvas.js';
import { toolHandlers, selectTool, currentTool } from './modules/tools.js';

// =================================================================
// === DOM Elements ================================================
// =================================================================
const penToolBtn = document.getElementById('pen-tool');
const eraserToolBtn = document.getElementById('eraser-tool');
const textToolBtn = document.getElementById('text-tool');

// =================================================================
// === Main Event Listeners (Delegation) ===========================
// =================================================================

function onMouseDown(e) {
  // Ensure the click is on the canvas itself, not on a UI element on top
  if (e.target !== canvas) return;
  toolHandlers[currentTool].onMouseDown(e);
}

function onMouseMove(e) {
  toolHandlers[currentTool].onMouseMove(e);
}

function onMouseUp(e) {
  toolHandlers[currentTool].onMouseUp(e);
}

// === Initialization ===

// Set up event listeners
window.addEventListener('resize', resizeCanvas);
canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('mouseout', onMouseUp);

penToolBtn.addEventListener('click', () => selectTool('pen'));
eraserToolBtn.addEventListener('click', () => selectTool('eraser'));
textToolBtn.addEventListener('click', () => selectTool('text'));

// Initial setup on DOMContentLoaded to ensure everything is ready
window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  redrawCanvas();
  // Set the initial tool after the DOM is fully loaded
  selectTool('pen');
});