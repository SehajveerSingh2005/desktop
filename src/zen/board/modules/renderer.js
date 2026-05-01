// renderer.js
import { getState } from './state.js';

function drawPath(context, object) {
  context.save();
  context.translate(object.x, object.y);
  context.strokeStyle = object.color;
  context.lineWidth = object.lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const points = object.smoothedRelativePoints;
  
  if (!object._cachedPath2D) {
    const path2d = new Path2D();
    if (points.length < 3) {
      if (points.length === 1) {
        path2d.arc(points[0].x, points[0].y, object.lineWidth / 2, 0, 2 * Math.PI);
        // Note: filled in renderer below
      } else if (points.length === 2) {
        path2d.moveTo(points[0].x, points[0].y);
        path2d.lineTo(points[1].x, points[1].y);
      }
    } else {
      path2d.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 2; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        path2d.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
      const last = points.length - 1;
      path2d.quadraticCurveTo(points[last - 1].x, points[last - 1].y, points[last].x, points[last].y);
    }
    object._cachedPath2D = path2d;
  }

  if (points.length === 1) {
    context.fillStyle = object.color;
    context.fill(object._cachedPath2D);
  } else {
    context.stroke(object._cachedPath2D);
  }
  context.restore();
}

function drawRectangle(context, object) {
  context.strokeStyle = object.strokeColor;
  context.lineWidth = object.strokeWidth;
  context.lineJoin = 'miter';
  if (object.isFilled) {
    context.fillStyle = object.fillColor;
    context.fillRect(object.x, object.y, object.width, object.height);
  }
  context.strokeRect(object.x, object.y, object.width, object.height);
}

function drawEllipse(context, object) {
  const radiusX = Math.abs(object.width / 2);
  const radiusY = Math.abs(object.height / 2);
  const centerX = object.x + radiusX;
  const centerY = object.y + radiusY;

  context.strokeStyle = object.strokeColor;
  context.lineWidth = object.strokeWidth;
  context.beginPath();
  context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
  if (object.isFilled) {
    context.fillStyle = object.fillColor;
    context.fill();
  }
  context.stroke();
}

function drawText(context, object) {
  context.fillStyle = object.color;
  context.font = object.font;
  context.textBaseline = 'top';

  const lines = object.text.split('\n');
  const fontSize = parseFloat(object.font) || 24;
  const lineHeight = fontSize * 1.2;

  lines.forEach((line, i) => {
    context.fillText(line, object.x, object.y + (i * lineHeight));
  });
}

const drawingFunctions = {
  path: drawPath,
  rectangle: drawRectangle,
  ellipse: drawEllipse,
  text: drawText,
  image: drawImage,
  video: drawVideo,
  capture: drawCapture,
  'live-embed': drawLiveEmbedPlaceholder,
};

function drawImage(context, object) {
  const { selectedObjectId, isDraggingObject } = getState();
  const isSelected = selectedObjectId === object.id;
  const isDragging = isSelected && isDraggingObject;

  context.save();
  if (isDragging) context.globalAlpha = 0.5;

  // Clip with border radius
  const radius = 8;
  context.beginPath();
  context.moveTo(object.x + radius, object.y);
  context.lineTo(object.x + object.width - radius, object.y);
  context.quadraticCurveTo(object.x + object.width, object.y, object.x + object.width, object.y + radius);
  context.lineTo(object.x + object.width, object.y + object.height - radius);
  context.quadraticCurveTo(object.x + object.width, object.y + object.height, object.x + object.width - radius, object.y + object.height);
  context.lineTo(object.x + radius, object.y + object.height);
  context.quadraticCurveTo(object.x, object.y + object.height, object.x, object.y + object.height - radius);
  context.lineTo(object.x, object.y + radius);
  context.quadraticCurveTo(object.x, object.y, object.x + radius, object.y);
  context.closePath();
  context.clip();

  if (object.image && object.image.complete) {
    context.drawImage(object.image, object.x, object.y, object.width, object.height);
  } else {
    // Fallback or placeholder while loading
    context.fillStyle = '#f0f0f0';
    context.fillRect(object.x, object.y, object.width, object.height);
  }
  context.restore();
}

function drawCapture(context, object) {
  // Identical to drawImage but uses the 'capture' type.
  // The controls toolbar is rendered by capture-controls.js as a DOM overlay.
  const { selectedObjectId, isDraggingObject } = getState();
  const isSelected = selectedObjectId === object.id;
  const isDragging = isSelected && isDraggingObject;

  context.save();
  if (isDragging) context.globalAlpha = 0.5;

  const radius = 8;
  context.beginPath();
  context.moveTo(object.x + radius, object.y);
  context.lineTo(object.x + object.width - radius, object.y);
  context.quadraticCurveTo(object.x + object.width, object.y, object.x + object.width, object.y + radius);
  context.lineTo(object.x + object.width, object.y + object.height - radius);
  context.quadraticCurveTo(object.x + object.width, object.y + object.height, object.x + object.width - radius, object.y + object.height);
  context.lineTo(object.x + radius, object.y + object.height);
  context.quadraticCurveTo(object.x, object.y + object.height, object.x, object.y + object.height - radius);
  context.lineTo(object.x, object.y + radius);
  context.quadraticCurveTo(object.x, object.y, object.x + radius, object.y);
  context.closePath();
  context.clip();

  if (object.image && object.image.complete) {
    context.drawImage(object.image, object.x, object.y, object.width, object.height);
  } else {
    context.fillStyle = '#1a1a2e';
    context.fillRect(object.x, object.y, object.width, object.height);
  }
  context.restore();
}

function drawLiveEmbedPlaceholder(context, object) {
  // When deselected, draw the static screenshot as the placeholder so the
  // object remains visible on the canvas. The live browser overlay is only
  // shown when the object is selected (wrapper visibility:visible).
  context.save();

  const radius = 8;
  context.beginPath();
  context.moveTo(object.x + radius, object.y);
  context.lineTo(object.x + object.width - radius, object.y);
  context.quadraticCurveTo(object.x + object.width, object.y, object.x + object.width, object.y + radius);
  context.lineTo(object.x + object.width, object.y + object.height - radius);
  context.quadraticCurveTo(object.x + object.width, object.y + object.height, object.x + object.width - radius, object.y + object.height);
  context.lineTo(object.x + radius, object.y + object.height);
  context.quadraticCurveTo(object.x, object.y + object.height, object.x, object.y + object.height - radius);
  context.lineTo(object.x, object.y + radius);
  context.quadraticCurveTo(object.x, object.y, object.x + radius, object.y);
  context.closePath();
  context.clip();

  if (object._placeholderImage && object._placeholderImage.complete && object._placeholderImage.naturalWidth > 0) {
    // Draw the static screenshot as the canvas stand-in
    context.drawImage(object._placeholderImage, object.x, object.y, object.width, object.height);
  } else {
    // Fallback: dark placeholder until image is ready
    context.fillStyle = '#1a1a2e';
    context.fill();
  }

  context.restore();
}

function drawVideo(context, object) {
  const { selectedObjectId, isDraggingObject, scale } = getState();
  const isSelected = selectedObjectId === object.id;
  const isDragging = isSelected && isDraggingObject;

  context.save();
  if (isDragging) context.globalAlpha = 0.5;

  const radius = 8;
  context.beginPath();
  context.moveTo(object.x + radius, object.y);
  context.lineTo(object.x + object.width - radius, object.y);
  context.quadraticCurveTo(object.x + object.width, object.y, object.x + object.width, object.y + radius);
  context.lineTo(object.x + object.width, object.y + object.height - radius);
  context.quadraticCurveTo(object.x + object.width, object.y + object.height, object.x + object.width - radius, object.y + object.height);
  context.lineTo(object.x + radius, object.y + object.height);
  context.quadraticCurveTo(object.x, object.y + object.height, object.x, object.y + object.height - radius);
  context.lineTo(object.x, object.y + radius);
  context.quadraticCurveTo(object.x, object.y, object.x + radius, object.y);
  context.closePath();
  context.clip();

  context.drawImage(object.video, object.x, object.y, object.width, object.height);
  context.restore();
}


export function drawScene(context, scene) {
  for (const object of scene) {
    if (object.visible) {
      const drawFn = drawingFunctions[object.type];
      if (drawFn) {
        drawFn(context, object);
      }
    }
  }
}
