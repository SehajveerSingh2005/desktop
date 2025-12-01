// scene.js

export const scene = [];

export function addToScene(object) {
  scene.push(object);
}

export function removeFromScene(objectId) {
  const index = scene.findIndex(obj => obj.id === objectId);
  if (index > -1) {
    scene.splice(index, 1);
  }
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Base class for drawing objects
export class DrawingObject {
  constructor(id, type, color, lineWidth) {
    this.id = id;
    this.type = type;
    this.color = color;
    this.lineWidth = lineWidth;
    this.x = 0;
    this.y = 0;
    this.visible = true; // All objects are visible by default
  }

  draw(context) {
    // To be overridden by subclasses
  }
}

// Helper function to average points
function getAveragePoint(points) {
  const total = points.reduce((acc, point) => {
    acc.x += point.x;
    acc.y += point.y;
    return acc;
  }, { x: 0, y: 0 });

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

// Pen/Path drawing object
export class Path extends DrawingObject {
  constructor(id, color, lineWidth) {
    super(id, 'path', color, lineWidth);
    this.points = []; // This will now store the smoothed points
    this.rawPoints = []; // We'll store the raw input here
  }

  addPoint(x, y) {
    this.rawPoints.push({ x, y });
    this.updateSmoothedPoints();
  }

  updateSmoothedPoints() {
    if (this.rawPoints.length < 3) {
      this.points = [...this.rawPoints];
      return;
    }

    this.points = [this.rawPoints[0]];
    // Use a simple sliding window average for smoothing
    const windowSize = 4;
    for (let i = 1; i < this.rawPoints.length - 1; i++) {
        const startIndex = Math.max(0, i - windowSize);
        const endIndex = Math.min(this.rawPoints.length, i + windowSize);
        const window = this.rawPoints.slice(startIndex, endIndex);
        this.points.push(getAveragePoint(window));
    }
    this.points.push(this.rawPoints[this.rawPoints.length - 1]);
  }

  draw(context) {
    context.strokeStyle = this.color;
    context.lineWidth = this.lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (this.points.length < 2) {
      // Draw a dot for a single point
      if (this.points.length === 1) {
        context.beginPath();
        context.arc(this.points[0].x, this.points[0].y, this.lineWidth / 2, 0, 2 * Math.PI);
        context.fillStyle = this.color;
        context.fill();
      }
      return;
    }

    context.beginPath();
    context.moveTo(this.points[0].x, this.points[0].y);

    for (let i = 1; i < this.points.length - 1; i++) {
      const midPoint = getAveragePoint([this.points[i], this.points[i+1]]);
      context.quadraticCurveTo(this.points[i].x, this.points[i].y, midPoint.x, midPoint.y);
    }

    // Draw the final segment to the last point
    context.lineTo(this.points[this.points.length - 1].x, this.points[this.points.length - 1].y);
    context.stroke();
  }
}

// Text drawing object
export class Text extends DrawingObject {
  constructor(id, text, x, y, font, color) {
    super(id, 'text', color, 1);
    this.text = text;
    this.x = x;
    this.y = y;
    this.font = font;
  }

  draw(context) {
    context.fillStyle = this.color;
    context.font = this.font;
    context.textBaseline = 'top';
    context.fillText(this.text, this.x, this.y);
  }
}
