import { scene } from './scene.js';
import { selectedObjectId } from './tools.js'; // Import selectedObjectId

export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d', { alpha: true });

// --- Viewport State ---
export let scale = 1;
export let offsetX = 0;
export let offsetY = 0;

export function setTransform(newScale, newOffsetX, newOffsetY) {
  scale = newScale;
  offsetX = newOffsetX;
  offsetY = newOffsetY;
}

// --- Coordinate Transformation ---
export function getTransformedPoint(x, y) {
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
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  resetContext();
  
  for (const obj of scene) {
    if (obj.visible) {
      obj.draw(ctx);
    }
  }

  // Draw selection box for the selected object
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
