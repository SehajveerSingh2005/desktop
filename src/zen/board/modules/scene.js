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
  }

  draw(context) {
    // To be overridden by subclasses
  }
}

// Pen/Path drawing object
export class Path extends DrawingObject {
  constructor(id, color, lineWidth) {
    super(id, 'path', color, lineWidth);
    this.points = [];
  }

  addPoint(x, y) {
    this.points.push({ x, y });
  }

  draw(context) {
    context.strokeStyle = this.color;
    context.lineWidth = this.lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    if (this.points.length > 0) {
      context.moveTo(this.points[0].x, this.points[0].y);
      for (let i = 1; i < this.points.length; i++) {
        context.lineTo(this.points[i].x, this.points[i].y);
      }
    }
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
