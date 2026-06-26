/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getState, setState } from "./state.mjs";
import { scene } from "./scene.mjs";
import { drawScene } from "./renderer.mjs";
import {
  SELECTION_STROKE_WIDTH,
  SELECTION_CORNER_RADIUS,
  HANDLE_VISUAL_RADIUS,
  HANDLE_STROKE_WIDTH,
  TEXT_SELECTION_PADDING,
} from "./constants.mjs";

export const canvas = document.getElementById("canvas");
export const ctx = canvas.getContext("2d", { alpha: true });

export function setTransform(newScale, newOffsetX, newOffsetY) {
  setState({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
}

// ── Accent color cache ────────────────────────────────────────────────────
// getComputedStyle is called synchronously and is expensive when called every
// frame. We cache the value and only refresh it when the theme changes.
let _cachedAccentColor = "";
export function invalidateAccentColorCache() {
  _cachedAccentColor = "";
}
export function getAccentColor() {
  if (!_cachedAccentColor) {
    _cachedAccentColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--board-accent-color")
      .trim();
  }
  return _cachedAccentColor || "#007bff";
}

// --- Coordinate Transformation ---
export function getTransformedPoint(x, y) {
  const { scale, offsetX, offsetY } = getState();
  return {
    x: (x - offsetX) / scale,
    y: (y - offsetY) / scale,
  };
}

// --- Drawing ---
function drawRoundedRect(canvasCtx, x, y, width, height, radius) {
  canvasCtx.beginPath();
  canvasCtx.moveTo(x + radius, y);
  canvasCtx.lineTo(x + width - radius, y);
  canvasCtx.quadraticCurveTo(x + width, y, x + width, y + radius);
  canvasCtx.lineTo(x + width, y + height - radius);
  canvasCtx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height
  );
  canvasCtx.lineTo(x + radius, y + height);
  canvasCtx.quadraticCurveTo(x, y + height, x, y + height - radius);
  canvasCtx.lineTo(x, y + radius);
  canvasCtx.quadraticCurveTo(x, y, x + radius, y);
  canvasCtx.closePath();
  canvasCtx.stroke();
}

function resetContext() {
  // Set all default drawing properties
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.font = "24px Arial";
  ctx.fillStyle = "#000";
  ctx.globalCompositeOperation = "source-over";
}

let redrawScheduled = false;

export function redrawCanvas() {
  if (redrawScheduled) {
    return;
  }
  redrawScheduled = true;
  requestAnimationFrame(redrawCanvasImmediate);
}

export function redrawCanvasImmediate() {
  redrawScheduled = false;
  ctx.save(); // Save the default state

  // Clear the canvas with a transformed rectangle
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply the viewport transform with devicePixelRatio scaling
  const { scale, offsetX, offsetY, selectedObjectId, editingTextObject } =
    getState();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  resetContext();

  drawScene(ctx, scene);

  // Draw selection box for the selected object
  if (selectedObjectId) {
    const selectedObject = scene.find(obj => obj.id === selectedObjectId);
    if (selectedObject) {
      let box = selectedObject.getBoundingBox(ctx);

      // Add a small buffer for text objects to match the textarea's padding
      if (selectedObject.type === "text") {
        box = {
          x: box.x - TEXT_SELECTION_PADDING,
          y: box.y - TEXT_SELECTION_PADDING,
          width: box.width + TEXT_SELECTION_PADDING * 2,
          height: box.height + TEXT_SELECTION_PADDING * 2,
        };
      } else if (selectedObject.type === "video") {
        // Strict visual bounds for video (excluding controls)
        box = {
          x: selectedObject.x,
          y: selectedObject.y,
          width: selectedObject.width,
          height: selectedObject.height,
        };
      }

      const isEditingThis =
        editingTextObject && editingTextObject.id === selectedObjectId;
      const accentColor = getAccentColor();

      // Only draw the main selection box if we're not currently editing it in the DOM (to avoid double border)
      if (!isEditingThis) {
        ctx.strokeStyle = accentColor || "#007bff";
        ctx.lineWidth = SELECTION_STROKE_WIDTH / scale;
        const cornerRadius = SELECTION_CORNER_RADIUS / scale;
        drawRoundedRect(ctx, box.x, box.y, box.width, box.height, cornerRadius);
      }

      // Draw resize handles for the selected object (except for Text objects)
      if (selectedObject.type !== "text") {
        ctx.fillStyle = accentColor || "#007bff";
        ctx.strokeStyle = "white";
        ctx.lineWidth = HANDLE_STROKE_WIDTH / scale;
        const handleRadius = HANDLE_VISUAL_RADIUS / scale;

        ctx.beginPath();
        ctx.arc(box.x, box.y, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(box.x + box.width, box.y, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(box.x, box.y + box.height, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(
          box.x + box.width,
          box.y + box.height,
          handleRadius,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  ctx.restore(); // Restore to the default state
}

export function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  redrawCanvas();
}

// Initial reset
resetContext();
