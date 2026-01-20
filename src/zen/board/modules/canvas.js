import { getState, setState } from './state.js';
import { scene } from './scene.js';
import { drawScene } from './renderer.js';

export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d', { alpha: true });

export function setTransform(newScale, newOffsetX, newOffsetY) {
  setState({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
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
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.stroke();
}

function resetContext() {
  // Set all default drawing properties
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.font = '24px Arial';
  ctx.fillStyle = '#000';
  ctx.globalCompositeOperation = 'source-over';
}

export function redrawCanvas() {
  ctx.save(); // Save the default state

  // Clear the canvas with a transformed rectangle
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply the viewport transform
  const { scale, offsetX, offsetY } = getState();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  resetContext();

  drawScene(ctx, scene);

  // Draw selection box for the selected object
  const { selectedObjectId, editingTextObject } = getState();
  // Don't draw the canvas selection highlight if the object is currently
  // being edited via the DOM, as this would create a confusing "double border".
  if (selectedObjectId && (!editingTextObject || editingTextObject.id !== selectedObjectId)) {
    const selectedObject = scene.find(obj => obj.id === selectedObjectId);
    if (selectedObject) {
      const box = selectedObject.getBoundingBox(ctx);
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--board-accent-color').trim();

      ctx.strokeStyle = accentColor ? accentColor : '#007bff';
      // To ensure the highlight appears as a consistent 2px line on the screen,
      // we must set its "world space" thickness as the inverse of the current scale.
      ctx.lineWidth = 2 / scale;

      // The same inverse-scale logic applies to the corner radius.
      const cornerRadius = 8 / scale;

      drawRoundedRect(ctx, box.x, box.y, box.width, box.height, cornerRadius);
    }
  }

  ctx.restore(); // Restore to the default state
}

export function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  redrawCanvas();
}

// Initial reset
resetContext();
