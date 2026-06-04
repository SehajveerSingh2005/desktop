import { scene, clearScene, addToScene } from './scene.js';
import { redrawCanvas } from './canvas.js';
import { triggerSave } from '../board.js';
import { hideVideoControls } from './video-controls.js';
import { bumpSceneGeneration, getSceneGeneration, setState } from './state.js';

const MAX_HISTORY = 50;
let undoStack = [];
let redoStack = [];
let lastCommittedGeneration = -1;
let onRestoreCallback = null;

export function registerOnRestore(cb) {
  onRestoreCallback = cb;
}

export function clearHistory() {
  undoStack = [];
  redoStack = [];
  lastCommittedGeneration = -1;
}

/** Pushes current state to history if it changed */
export function pushHistory() {
  if (getSceneGeneration() === lastCommittedGeneration) return;

  undoStack.push(scene.map(obj => obj.clone()));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  lastCommittedGeneration = getSceneGeneration();
}

export function undo() {
  if (undoStack.length < 2) return;

  redoStack.push(undoStack.pop());
  const previous = undoStack[undoStack.length - 1];
  restoreSnapshot(previous);
  lastCommittedGeneration = getSceneGeneration();
}

export function redo() {
  if (redoStack.length === 0) return;

  const next = redoStack.pop();
  undoStack.push(next);
  restoreSnapshot(next);
  lastCommittedGeneration = getSceneGeneration();
}

function restoreSnapshot(snapshot) {
  clearScene();
  snapshot.forEach(obj => addToScene(obj.clone()));
  setState({ selectedObjectId: null });
  if (onRestoreCallback) {
    onRestoreCallback(scene);
  }
  hideVideoControls();
  redrawCanvas();
  triggerSave();
  bumpSceneGeneration();
}

