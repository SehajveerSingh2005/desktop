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
  const { selectedObjectId } = getState();
  if (selectedObjectId) {
    const selectedObject = scene.find(obj => obj.id === selectedObjectId);
    if (selectedObject) {
      const box = selectedObject.getBoundingBox(ctx);
      ctx.strokeStyle = 'rgba(0, 123, 255, 0.8)';
      ctx.lineWidth = 1 / scale; // Make the selection line appear constant width
      ctx.setLineDash([6 / scale, 4 / scale]); // Dashed line that also scales
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.setLineDash([]); // Reset line dash
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
