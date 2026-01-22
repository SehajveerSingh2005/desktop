// main.js (board.js) - Main Entry Point

import { canvas, resizeCanvas, redrawCanvas, setTransform, getTransformedPoint } from './modules/canvas.js';
import { toolHandlers } from './modules/tools.js';
import { getState, setState } from './modules/state.js';
import { initTools, selectTool, updateZoomDisplay, activateTextEditor } from './modules/ui.js';
import { findObjectAt } from './modules/interactions.js';
import { addToScene, removeFromScene, generateId, Text } from './modules/scene.js';
import { ImageObject, VideoObject } from './modules/media.js';

// =================================================================
// === DOM Elements ================================================
// =================================================================
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
    // Activate the editor, select the object, and switch to the select tool
    activateTextEditor(hitObject.x, hitObject.y, hitObject);
    setState({ selectedObjectId: hitObject.id });
    selectTool('select');
  }
}

function handleFile(file, x, y) {
  const id = generateId();
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 400;
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = (maxWidth / w) * h;
          w = maxWidth;
        }
        const obj = new ImageObject(id, x - w / 2, y - h / 2, w, h, img);
        addToScene(obj);
        setState({ selectedObjectId: id });
        selectTool('select');
        redrawCanvas();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  } else if (file.type.startsWith('video/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        const maxWidth = 400;
        let w = video.videoWidth;
        let h = video.videoHeight;
        if (w > maxWidth) {
          h = (maxWidth / w) * h;
          w = maxWidth;
        }
        const obj = new VideoObject(id, x - w / 2, y - h / 2, w, h, video);
        addToScene(obj);
        setState({ selectedObjectId: id });
        selectTool('select');

        // Animation start: set offset to out state immediately
        obj.controlsYOffset = 10;

        const forceRedraw = () => redrawCanvas();
        video.onloadeddata = forceRedraw;
        video.onseeked = forceRedraw;
        video.oncanplay = forceRedraw;

        video.onplay = () => {
          const update = () => {
            if (!video.paused && !video.ended) {
              redrawCanvas();
              requestAnimationFrame(update);
            }
          };
          update();
        };

        // Force a first-frame capture
        video.currentTime = 0;
        redrawCanvas();
      };
      video.src = e.target.result;
    };
    reader.readAsDataURL(file);
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

  zoomInBtn.addEventListener('click', () => zoom(1));
  zoomOutBtn.addEventListener('click', () => zoom(-1));

  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const { x, y } = getTransformedPoint(e.clientX, e.clientY);
    if (e.dataTransfer.files.length > 0) {
      for (const file of e.dataTransfer.files) {
        handleFile(file, x, y);
      }
    }
  });

  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const { x, y } = getTransformedPoint(window.innerWidth / 2, window.innerHeight / 2);
    for (const item of items) {
      if (item.kind === 'file') {
        handleFile(item.getAsFile(), x, y);
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && !getState().editingTextObject) {
      const { selectedObjectId } = getState();
      if (selectedObjectId) {
        removeFromScene(selectedObjectId);
        setState({ selectedObjectId: null });
        redrawCanvas();
      }
    }
  });

  // Initial setup
  selectTool('select');
  updateZoomDisplay();
  redrawCanvas();
});