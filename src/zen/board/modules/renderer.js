// renderer.js

function drawPath(context, object) {
  context.save();
  context.translate(object.x, object.y);
  context.strokeStyle = object.color;
  context.lineWidth = object.lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const points = object.smoothedRelativePoints;
  if (points.length < 3) {
    context.beginPath();
    if (points.length === 1) {
      context.arc(points[0].x, points[0].y, object.lineWidth / 2, 0, 2 * Math.PI);
      context.fillStyle = object.color;
      context.fill();
    } else if (points.length === 2) {
      context.moveTo(points[0].x, points[0].y);
      context.lineTo(points[1].x, points[1].y);
      context.stroke();
    }
  } else {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 2; i++) {
          const p0 = points[i - 1];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[i + 2];
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = p1.y + (p2.y - p0.y) / 6;
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = p2.y - (p3.y - p1.y) / 6;
          context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
      const last = points.length - 1;
      context.quadraticCurveTo(points[last - 1].x, points[last - 1].y, points[last].x, points[last].y);
      context.stroke();
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
  context.fillText(object.text, object.x, object.y);
}

const drawingFunctions = {
  path: drawPath,
  rectangle: drawRectangle,
  ellipse: drawEllipse,
  text: drawText,
};

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
