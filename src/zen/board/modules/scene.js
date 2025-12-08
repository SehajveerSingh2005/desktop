// scene.js

import { ctx } from './canvas.js'; // Import ctx for measurements

export const scene = [];

export function addToScene(object) {
  scene.push(object);
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Base class for drawing objects
export class DrawingObject {
  constructor(id, type, color, lineWidth, x = 0, y = 0) {
    this.id = id;
    this.type = type;
    this.color = color;
    this.lineWidth = lineWidth;
    this.x = x;
    this.y = y;
    this.visible = true;
  }

  draw(context) {}
  getBoundingBox() { return { x: 0, y: 0, width: 0, height: 0 }; }
  move(dx, dy) {
    this.x += dx;
    this.y += dy;
  }
}

// Helper function to average points within a window
function getAveragePoint(points, startIndex, endIndex) {
  const window = points.slice(startIndex, endIndex);
  if (window.length === 0) return { x: 0, y: 0 }; // Should not happen with proper indexing

  const total = window.reduce((acc, point) => {
    acc.x += point.x;
    acc.y += point.y;
    return acc;
  }, { x: 0, y: 0 });

  return {
    x: total.x / window.length,
    y: total.y / window.length,
  };
}


// Pen/Path drawing object
export class Path extends DrawingObject {
  constructor(id, color, lineWidth, startX, startY) {
    super(id, 'path', color, lineWidth, startX, startY);
    // Raw points from mouse input, relative to object origin
    this.rawRelativePoints = [{ x: 0, y: 0 }];
    // Smoothed points used for rendering
    this.smoothedRelativePoints = [{ x: 0, y: 0 }];
    this.boundingBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  addPoint(worldX, worldY) {
    const relativeX = worldX - this.x;
    const relativeY = worldY - this.y;
    this.rawRelativePoints.push({ x: relativeX, y: relativeY });

    // Update bounding box as raw points are added
    this.boundingBox.minX = Math.min(this.boundingBox.minX, relativeX);
    this.boundingBox.minY = Math.min(this.boundingBox.minY, relativeY);
    this.boundingBox.maxX = Math.max(this.boundingBox.maxX, relativeX);
    this.boundingBox.maxY = Math.max(this.boundingBox.maxY, relativeY);

    this.updateSmoothedPoints();
  }

  updateSmoothedPoints() {
    const raw = this.rawRelativePoints;
    const smoothed = [];
    const windowSize = 4; // Number of points before and after to average

    if (raw.length < 2) {
      this.smoothedRelativePoints = [...raw];
      return;
    }

    // Apply a simple sliding window average for smoothing
    for (let i = 0; i < raw.length; i++) {
        const startIndex = Math.max(0, i - windowSize);
        const endIndex = Math.min(raw.length, i + windowSize + 1); // +1 because slice excludes end
        
        smoothed.push(getAveragePoint(raw, startIndex, endIndex));
    }
    this.smoothedRelativePoints = smoothed;
  }

  draw(context) {
    context.save();
    context.translate(this.x, this.y);
    
    context.strokeStyle = this.color;
    context.lineWidth = this.lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    const points = this.smoothedRelativePoints; // Use smoothed points for drawing
    
    if (points.length < 3) {
      context.beginPath();
      if (points.length === 1) {
        context.arc(points[0].x, points[0].y, this.lineWidth / 2, 0, 2 * Math.PI);
        context.fillStyle = this.color;
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

            // Catmull-Rom to Bezier conversion
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;

            context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        
        // For the last 2 points, draw a quadratic curve to finish smoothly
        const last = points.length - 1;
        context.quadraticCurveTo(
            points[last - 1].x,
            points[last - 1].y,
            points[last].x,
            points[last].y
        );
        context.stroke();
    }
    
    context.restore();
  }

  getBoundingBox() {
    const padding = this.lineWidth / 2;
    return {
      x: this.x + this.boundingBox.minX - padding,
      y: this.y + this.boundingBox.minY - padding,
      width: (this.boundingBox.maxX - this.boundingBox.minX) + this.lineWidth,
      height: (this.boundingBox.maxY - this.boundingBox.minY) + this.lineWidth,
    };
  }
}

// Text drawing object
export class Text extends DrawingObject {
  constructor(id, text, x, y, font, color) {
    super(id, 'text', color, 1, x, y);
    this.text = text;
    this.font = font;
  }

  draw(context) {
    context.fillStyle = this.color;
    context.font = this.font;
    context.textBaseline = 'top';
    context.fillText(this.text, this.x, this.y);
  }

  getBoundingBox() {
    ctx.font = this.font;
    const width = ctx.measureText(this.text).width;
    const height = parseFloat(this.font);
    return { x: this.x, y: this.y, width, height };
  }
}