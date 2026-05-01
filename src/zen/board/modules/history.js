// modules/history.js
import { scene, clearScene, addToScene } from './scene.js';
import { redrawCanvas } from './canvas.js';
import { triggerSaveImmediate } from '../board.js';
import { hideVideoControls } from './video-controls.js';

const MAX_HISTORY = 50;
let undoStack = [];
let redoStack = [];
let lastHistoryHash = '';

export function clearHistory() {
  undoStack = [];
  redoStack = [];
  lastHistoryHash = '';
}

/** Hashes current scene data for deduplication */
function getSceneHash() {
  return JSON.stringify(scene.map(obj => {
    return { ...obj, type: obj.type, image: undefined, video: undefined, _blob: undefined, _cachedPath2D: undefined, _iframeEl: undefined };
  }));
}

/** Pushes current state to history if it changed */
export function pushHistory() {
  const currentHash = getSceneHash();
  if (currentHash === lastHistoryHash) return;

  undoStack.push(scene.map(obj => obj.clone()));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  lastHistoryHash = currentHash;
}

export function undo() {
  if (undoStack.length < 2) return;

  redoStack.push(undoStack.pop());
  const previous = undoStack[undoStack.length - 1];
  restoreSnapshot(previous);
  lastHistoryHash = getSceneHash();
}

export function redo() {
  if (redoStack.length === 0) return;

  const next = redoStack.pop();
  undoStack.push(next);
  restoreSnapshot(next);
  lastHistoryHash = getSceneHash();
}

function restoreSnapshot(snapshot) {
  clearScene();
  snapshot.forEach(obj => addToScene(obj.clone()));
  hideVideoControls();
  redrawCanvas();
  triggerSaveImmediate();
}
