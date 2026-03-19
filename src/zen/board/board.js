// main.js (board.js) - Main Entry Point

import { canvas, resizeCanvas, redrawCanvas, setTransform, getTransformedPoint } from './modules/canvas.js';
import { toolHandlers } from './modules/tools.js';
import { getState, setState } from './modules/state.js';
import { initTools, selectTool, updateZoomDisplay, activateTextEditor, deactivateTextEditor } from './modules/ui.js';
import { findObjectAt } from './modules/interactions.js';
import { scene, addToScene, removeFromScene, generateId, Text, Path, Rectangle, Ellipse } from './modules/scene.js';
import { ImageObject, VideoObject } from './modules/media.js';
import { ensureBoardId, saveBoard, loadBoard, revokeAllObjectURLs } from './modules/storage.js';
import { pushHistory, undo, redo } from './modules/history.js';
import { hideVideoControls } from './modules/video-controls.js';

// DOM Elements
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const boardTitleInput = document.getElementById('board-title');

// Autosave Logic
let _saveTimer = null;

export function triggerSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    triggerSaveImmediate();
  }, 1000); // 1-second debounce
}

export async function triggerSaveImmediate() {
  clearTimeout(_saveTimer);
  const { boardId, boardTitle, isTransparent } = getState();
  if (!boardId) return;
  try {
    await saveBoard(boardId, boardTitle, isTransparent, [...scene]);
  } catch (e) {
    console.error('ZenBoard: Immediate save failed', e);
  }
}

// Transparency Handling
function applyTransparency(isTransparent) {
  const canvasEl = document.getElementById('canvas');
  // We use a slight opacity instead of fully transparent for readability,
  // or a solid color if transparency is turned off.
  if (isTransparent) {
    canvasEl.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    document.body.style.backgroundColor = 'transparent';
  } else {
    canvasEl.style.backgroundColor = '#ffffff'; // White solid background
    document.body.style.backgroundColor = '#ffffff';
  }
}

// Zoom Logic
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

// Event Delegation

function onMouseDown(e) {
  const { currentTool } = getState();
  toolHandlers[currentTool].onMouseDown(e);
}

function onMouseMove(e) {
  const { currentTool } = getState();
  toolHandlers[currentTool].onMouseMove(e);
}

function onMouseUp(e) {
  // Read modification flags BEFORE the handler resets them to false.
  const { currentTool, isDraggingObject, isResizingObject } = getState();
  toolHandlers[currentTool].onMouseUp(e);
  triggerSave();

  // For the select tool, only commit history when something was actually
  // moved or resized. Clicks, panning, and deselects don't change the scene.
  const sceneModified = currentTool !== 'select' || isDraggingObject || isResizingObject;
  if (sceneModified) pushHistory();
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
        obj._blob = file;
        addToScene(obj);
        setState({ selectedObjectId: id });
        selectTool('select');
        redrawCanvas();
        triggerSaveImmediate();
        pushHistory();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  } else if (file.type.startsWith('video/')) {
    // Store a reference to the original Blob so storage.js can put it in IDB
    const blob = file;
    const objectURL = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const maxWidth = 400;
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > maxWidth) {
        h = (maxWidth / w) * h;
        w = maxWidth;
      }
      const obj = new VideoObject(id, x - w / 2, y - h / 2, w, h, video);
      // Keep the original blob on the object for serialization
      obj._blob = blob;
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
      triggerSaveImmediate();
      pushHistory();
    };
    video.src = objectURL;
  }
}

// =================================================================
// === Board Title =================================================
// =================================================================
function initTitleInput() {
  if (!boardTitleInput) return;

  const { boardTitle } = getState();
  boardTitleInput.value = boardTitle;
  document.title = boardTitle;

  boardTitleInput.addEventListener('input', () => {
    const newTitle = boardTitleInput.value.trim() || 'Untitled Board';
    setState({ boardTitle: newTitle });
    document.title = newTitle;

    // Force real-time tab label update for Firefox session restore
    try {
      const browserEl = window.docShell?.chromeEventHandler;
      const tab = browserEl?.ownerGlobal?.gBrowser?.getTabForBrowser(browserEl);
      if (tab && newTitle) {
        tab.zenStaticLabel = newTitle;
      }
    } catch (e) { /* ignore */ }

    // Instant commit prevents loss on quick close
    triggerSaveImmediate();
  });

  // Select all text on focus for quick rename
  boardTitleInput.addEventListener('focus', () => {
    boardTitleInput.select();
  });

  // Confirm on Enter/Escape
  boardTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      boardTitleInput.blur();
    }
  });
}

// =================================================================
// === Initialization ==============================================
// =================================================================
async function initTheme() {
  try {
    const chromeWindow = window.docShell?.chromeEventHandler?.ownerGlobal;
    if (!chromeWindow) return;

    const { gZenThemePicker, gZenWorkspaces } = chromeWindow;
    if (!gZenThemePicker || !gZenWorkspaces) return;

    const activeWorkspace = await gZenWorkspaces.getActiveWorkspace();
    if (!activeWorkspace) return;

    const { primaryColor } = gZenThemePicker.getGradientForWorkspace(activeWorkspace);
    if (primaryColor) {
      document.documentElement.style.setProperty('--board-accent-color', primaryColor);
    }
  } catch (e) {
    console.error('ZenBoard: Failed to init theme', e);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initTools();
  resizeCanvas();

  // ── Load or create the board ──────────────────────────────────
  const classes = { Path, Rectangle, Ellipse, Text, ImageObject, VideoObject };
  let boardId = null;
  try {
    boardId = await ensureBoardId();
    setState({ boardId });

    const saved = await loadBoard(boardId, classes);
    if (saved) {
      // Populate scene with hydrated objects
      scene.length = 0;
      saved.scene.forEach(obj => scene.push(obj));
      setState({ boardTitle: saved.title, isTransparent: saved.isTransparent });
      document.title = saved.title;

      try {
        const browserEl = window.docShell?.chromeEventHandler;
        const tab = browserEl?.ownerGlobal?.gBrowser?.getTabForBrowser(browserEl);
        if (tab && saved.title) tab.zenStaticLabel = saved.title;
      } catch (e) { /* ignore */ }

      applyTransparency(saved.isTransparent);
    } else {
      applyTransparency(true);
    }
    pushHistory();
  } catch (e) {
    console.error('ZenBoard: Failed to init', e);
    applyTransparency(true);
  }

  // ── Self-heal browser transparency ────────────────────────────
  // When a board tab is duplicated, the new tab is created with `about:blank`
  // (no _forZenEmptyTab), so the <browser> element never gets transparent="true".
  // Since board.html is a chrome:// page, we have privileged access to set it
  // ourselves. This is a no-op for tabs that already have it set.
  try {
    const browserEl = window.docShell?.chromeEventHandler;
    if (browserEl) {
      browserEl.setAttribute('transparent', 'true');
    }
  } catch (e) {
    // Non-critical — transparency gracefully falls back
  }

  initTitleInput();

  // Update title input to reflect loaded title
  if (boardTitleInput) {
    boardTitleInput.value = getState().boardTitle;
  }

  // ── Set up event listeners ───────────────────────────────────
  let resizeTicking = false;
  window.addEventListener('resize', () => {
    if (!resizeTicking) {
      window.requestAnimationFrame(() => {
        resizeCanvas();
        resizeTicking = false;
      });
      resizeTicking = true;
    }
  });

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseout', (e) => {
    const { currentTool } = getState();
    toolHandlers[currentTool].onMouseUp(e);
    // Note: deliberate omission of triggerSave() here to stop IDB save spam when just hovering out
  });
  canvas.addEventListener('dblclick', onDoubleClick);

  zoomInBtn.addEventListener('click', () => zoom(1));
  zoomOutBtn.addEventListener('click', () => zoom(-1));
  
  // Custom event fired by video objects initialized from storage
  window.addEventListener('ZenBoardVideoFrame', () => {
    redrawCanvas();
  });

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
    // Undo / Redo
    const key = e.key ? e.key.toLowerCase() : '';
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (key === 'z') {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();

        // If we're currently editing text, finalize it first so that
        // the text box is actually in the scene before we undo.
        if (getState().editingTextObject) {
          deactivateTextEditor();
        }

        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
        redo();
        return;
      }
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && !getState().editingTextObject) {
      const { selectedObjectId } = getState();
      if (selectedObjectId) {
        removeFromScene(selectedObjectId);
        setState({ selectedObjectId: null });
        hideVideoControls();
        redrawCanvas();
        triggerSave();
        pushHistory();
      }
    }
  });

  // Text editor blur triggers a save
  document.getElementById('text-editor')?.addEventListener('blur', () => {
    triggerSave();
  });

  // ── Cleanup on tab close ─────────────────────────────────────
  window.addEventListener('pagehide', () => {
    revokeAllObjectURLs();
    // Flush any pending save immediately
    clearTimeout(_saveTimer);
    const { boardId: id, boardTitle, isTransparent } = getState();
    if (id) {
      // Best-effort synchronous-ish save (sendBeacon not suitable for IDB, 
      // but browser gives ~handful of seconds for pagehide handlers)
      saveBoard(id, boardTitle, isTransparent, [...scene]).catch(() => {});
    }
  });

  // Initial setup
  selectTool('select');
  updateZoomDisplay();
  
  // Wait for web fonts to load so text objects render with the correct font
  // instead of falling back to serif on initial load.
  document.fonts.ready.then(() => {
    redrawCanvas();
  });
});