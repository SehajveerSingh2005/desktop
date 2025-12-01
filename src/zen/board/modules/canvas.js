// canvas.js

import { scene } from './scene.js';

export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d');

function resetContext() {
  // Set all default drawing properties
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.font = '24px Arial';
  ctx.fillStyle = '#000';
  // Ensure composite operation is reset
  ctx.globalCompositeOperation = 'source-over';
}

export function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas

  for (const obj of scene) {
    if (obj.visible) { // Only draw visible objects
      ctx.save();
      obj.draw(ctx);
      ctx.restore();
    }
  }
}

export function resizeCanvas() {
  const currentScene = [...scene];
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  scene.length = 0;
  scene.push(...currentScene);
  redrawCanvas();
}

// Initial reset
resetContext();
