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
  const { scale, offsetX, offsetY, selectedObjectId, editingTextObject } = getState();
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
      if (selectedObject.type === 'text') {
        box = {
          x: box.x - 2,
          y: box.y - 2,
          width: box.width + 4,
          height: box.height + 4
        };
      }

      const isEditingThis = editingTextObject && editingTextObject.id === selectedObjectId;
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--board-accent-color').trim();

      // Only draw the main selection box if we're not currently editing it in the DOM (to avoid double border)
      if (!isEditingThis) {
        ctx.strokeStyle = accentColor || '#007bff';
        ctx.lineWidth = 2 / scale;
        const cornerRadius = 8 / scale;
        drawRoundedRect(ctx, box.x, box.y, box.width, box.height, cornerRadius);
      }

      // Draw resize handles for the selected object (except for Text objects)
      if (selectedObject.type !== 'text') {
        ctx.fillStyle = accentColor || '#007bff';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5 / scale;
        const handleRadius = 6 / scale;

        const handles = [
          { x: box.x, y: box.y }, // nw
          { x: box.x + box.width, y: box.y }, // ne
          { x: box.x, y: box.y + box.height }, // sw
          { x: box.x + box.width, y: box.y + box.height }, // se
        ];

        handles.forEach(h => {
          ctx.beginPath();
          ctx.arc(h.x, h.y, handleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
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
