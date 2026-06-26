/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { redrawCanvasImmediate, setTransform } from "./canvas.mjs";
import { getState } from "./state.mjs";
import {
  ZOOM_LERP_FACTOR, ZOOM_CONVERGENCE_SCALE, ZOOM_CONVERGENCE_OFFSET,
  WHEEL_LINE_TO_PX, WHEEL_PAGE_TO_PX,
  ZOOM_SENSITIVITY_PIXEL, ZOOM_SENSITIVITY_LINE, ZOOM_SENSITIVITY_PAGE,
  ZOOM_STEP, ZOOM_MIN, ZOOM_MAX,
} from "./constants.mjs";
import { updateZoomDisplay } from "./ui.mjs";
import { updateVideoControlsPosition } from "./video-controls.mjs";
import { updateCaptureControlsPosition, notifyTransformChanged } from "./capture-controls.mjs";
import { triggerSave } from "./state.mjs";

const lerp = (a, b, t) => a + (b - a) * t;

function syncOverlayPositions() {
  updateZoomDisplay();
  updateVideoControlsPosition();
  updateCaptureControlsPosition();
  notifyTransformChanged();
  if (getState().editingTextObject) {
    // Lazy import to avoid circular dep with ui.mjs
    import("./ui.mjs").then(m => m.updateTextEditorPosition());
  }
}

// ── Wheel animation state ───────────────────────────────────────────────────

let isAnimating = false;
let targetScale = 1;
let targetOffsetX = 0;
let targetOffsetY = 0;
let currentScale = 1;
let currentOffsetX = 0;
let currentOffsetY = 0;

export function startWheelAnimation() {
  if (isAnimating) {
    return;
  }
  isAnimating = true;

  const { scale, offsetX, offsetY } = getState();
  currentScale = scale;
  currentOffsetX = offsetX;
  currentOffsetY = offsetY;

  if (targetScale === 1 && targetOffsetX === 0 && targetOffsetY === 0) {
    targetScale = scale;
    targetOffsetX = offsetX;
    targetOffsetY = offsetY;
  }

  function step() {
    if (!isAnimating) {
      return;
    }

    currentScale = lerp(currentScale, targetScale, ZOOM_LERP_FACTOR);
    currentOffsetX = lerp(currentOffsetX, targetOffsetX, ZOOM_LERP_FACTOR);
    currentOffsetY = lerp(currentOffsetY, targetOffsetY, ZOOM_LERP_FACTOR);

    const converged =
      Math.abs(currentScale - targetScale) < ZOOM_CONVERGENCE_SCALE &&
      Math.abs(currentOffsetX - targetOffsetX) < ZOOM_CONVERGENCE_OFFSET &&
      Math.abs(currentOffsetY - targetOffsetY) < ZOOM_CONVERGENCE_OFFSET;

    if (converged) {
      setTransform(targetScale, targetOffsetX, targetOffsetY);
      isAnimating = false;
    } else {
      setTransform(currentScale, currentOffsetX, currentOffsetY);
      requestAnimationFrame(step);
    }

    redrawCanvasImmediate();
    syncOverlayPositions();
    if (converged) {
      triggerSave();
    }
  }

  requestAnimationFrame(step);
}

export function stopWheelAnimation() {
  isAnimating = false;
}

export function isWheelAnimating() {
  return isAnimating;
}

// ── Button zoom ─────────────────────────────────────────────────────────────

export function zoom(direction) {
  stopWheelAnimation();
  const { scale, offsetX, offsetY } = getState();
  const oldScale = scale;
  let newScale = direction > 0 ? oldScale * ZOOM_STEP : oldScale / ZOOM_STEP;
  newScale = Math.max(ZOOM_MIN, Math.min(newScale, ZOOM_MAX));

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const newOffsetX = centerX - (centerX - offsetX) * (newScale / oldScale);
  const newOffsetY = centerY - (centerY - offsetY) * (newScale / oldScale);

  setTransform(newScale, newOffsetX, newOffsetY);
  syncOverlayPositions();
  triggerSave();
}

// ── Wheel event handler ─────────────────────────────────────────────────────

export function handleWheel(e) {
  e.preventDefault();

  const { scale, offsetX, offsetY } = getState();
  if (!isAnimating) {
    targetScale = scale;
    targetOffsetX = offsetX;
    targetOffsetY = offsetY;
  }

  let dx = e.deltaX;
  let dy = e.deltaY;
  if (e.deltaMode === 1) {
    dx *= WHEEL_LINE_TO_PX;
    dy *= WHEEL_LINE_TO_PX;
  } else if (e.deltaMode === 2) {
    dx *= WHEEL_PAGE_TO_PX;
    dy *= WHEEL_PAGE_TO_PX;
  }

  if (e.ctrlKey) {
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    let zoomFactor = ZOOM_SENSITIVITY_PIXEL;
    if (e.deltaMode === 1) {
      zoomFactor = ZOOM_SENSITIVITY_LINE;
    } else if (e.deltaMode === 2) {
      zoomFactor = ZOOM_SENSITIVITY_PAGE;
    }

    const oldTargetScale = targetScale;
    let newTargetScale = oldTargetScale * Math.exp(-e.deltaY * zoomFactor);
    newTargetScale = Math.max(ZOOM_MIN, Math.min(newTargetScale, ZOOM_MAX));

    targetOffsetX = mouseX - (mouseX - targetOffsetX) * (newTargetScale / oldTargetScale);
    targetOffsetY = mouseY - (mouseY - targetOffsetY) * (newTargetScale / oldTargetScale);
    targetScale = newTargetScale;
  } else {
    if (e.shiftKey && !dx) {
      dx = dy;
      dy = 0;
    }
    targetOffsetX -= dx;
    targetOffsetY -= dy;
  }

  startWheelAnimation();
}
