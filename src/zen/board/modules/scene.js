// scene.js

import { smoothPoints } from './smoothing.js';

export const scene = [];

export function addToScene(object) {
  scene.push(object);
}

export function removeFromScene(id) {
  const index = scene.findIndex(obj => obj.id === id);
  if (index !== -1) {
    const obj = scene[index];
    // Allow objects (e.g. LiveEmbedObject) to clean up DOM resources
    if (typeof obj.destroy === 'function') {
      obj.destroy();
    }
    scene.splice(index, 1);
  }
}

export function clearScene() {
  scene.length = 0;
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// --- Base Classes ---
export class DrawingObject {
  constructor(id, type, x, y) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.visible = true;
  }
  getBoundingBox() { return { x: this.x, y: this.y, width: 0, height: 0 }; }
  move(dx, dy) {
    this.x += dx;
    this.y += dy;
  }
  resize(handle, x, y, anchorX, anchorY) { }
}

class Shape extends DrawingObject {
  constructor(id, type, x, y, width, height, strokeColor, strokeWidth, isFilled, fillColor) {
    super(id, type, x, y);
    this.width = width;
    this.height = height;
    this.strokeColor = strokeColor;
    this.strokeWidth = strokeWidth;
    this.isFilled = isFilled;
    this.fillColor = fillColor;
  }

  resize(handle, mouseX, mouseY, anchorX, anchorY) {
    // The stationary point is (anchorX, anchorY)
    // The moving point is (mouseX, mouseY)

    this.x = Math.min(mouseX, anchorX);
    this.y = Math.min(mouseY, anchorY);
    this.width = Math.abs(mouseX - anchorX);
    this.height = Math.abs(mouseY - anchorY);

    // Minimum size to keep handles visible
    if (this.width < 5) this.width = 5;
    if (this.height < 5) this.height = 5;
  }
}

// --- Concrete Object Classes ---
export class Path extends DrawingObject {
  constructor(id, color, lineWidth, startX, startY) {
    super(id, 'path', startX, startY);
    this.color = color;
    this.lineWidth = lineWidth;
    this.rawRelativePoints = [{ x: 0, y: 0 }];
    this.smoothedRelativePoints = [{ x: 0, y: 0 }];
    this.boundingBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  addPoint(worldX, worldY) {
    const relativeX = worldX - this.x;
    const relativeY = worldY - this.y;
    this.rawRelativePoints.push({ x: relativeX, y: relativeY });

    this.boundingBox.minX = Math.min(this.boundingBox.minX, relativeX);
    this.boundingBox.minY = Math.min(this.boundingBox.minY, relativeY);
    this.boundingBox.maxX = Math.max(this.boundingBox.maxX, relativeX);
    this.boundingBox.maxY = Math.max(this.boundingBox.maxY, relativeY);

    this.smoothedRelativePoints = smoothPoints(this.rawRelativePoints);
    this._cachedPath2D = null; // Invalidate render cache
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

  resize(handle, mouseX, mouseY, anchorX, anchorY) {
    const box = this.getBoundingBox();
    const oldWidth = box.width;
    const oldHeight = box.height;

    const newWidth = Math.abs(mouseX - anchorX);
    const newHeight = Math.abs(mouseY - anchorY);

    // Calculate scale factors
    const scaleX = oldWidth > 0 ? newWidth / oldWidth : 1;
    const scaleY = oldHeight > 0 ? newHeight / oldHeight : 1;

    // Update origin
    const oldX = this.x;
    const oldY = this.y;
    this.x = Math.min(mouseX, anchorX) - (this.boundingBox.minX * scaleX);
    this.y = Math.min(mouseY, anchorY) - (this.boundingBox.minY * scaleY);

    // Scale all points
    this.rawRelativePoints.forEach(p => {
      p.x *= scaleX;
      p.y *= scaleY;
    });

    // Update bounding box
    this.boundingBox.minX *= scaleX;
    this.boundingBox.minY *= scaleY;
    this.boundingBox.maxX *= scaleX;
    this.boundingBox.maxY *= scaleY;

    // Update smoothed points
    this.smoothedRelativePoints = smoothPoints(this.rawRelativePoints);
    this._cachedPath2D = null; // Invalidate render cache

    // Scale line width? Maybe not, or maybe slightly. Let's keep it simple for now.
  }

  clone() {
    const cloned = new Path(this.id, this.color, this.lineWidth, this.x, this.y);
    cloned.boundingBox = { ...this.boundingBox };
    cloned.rawRelativePoints = this.rawRelativePoints.map(p => ({ ...p }));
    cloned.smoothedRelativePoints = this.smoothedRelativePoints.map(p => ({ ...p }));
    cloned.visible = this.visible;
    return cloned;
  }
}

export class Rectangle extends Shape {
  constructor(id, x, y, width, height, strokeColor, strokeWidth, isFilled, fillColor) {
    super(id, 'rectangle', x, y, width, height, strokeColor, strokeWidth);
    this.isFilled = isFilled;
    this.fillColor = fillColor;
  }

  getBoundingBox() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  clone() {
    const cloned = new Rectangle(this.id, this.x, this.y, this.width, this.height, this.strokeColor, this.strokeWidth, this.isFilled, this.fillColor);
    cloned.visible = this.visible;
    return cloned;
  }
}

export class Ellipse extends Shape {
  constructor(id, x, y, width, height, strokeColor, strokeWidth, isFilled, fillColor) {
    super(id, 'ellipse', x, y, width, height, strokeColor, strokeWidth);
    this.isFilled = isFilled;
    this.fillColor = fillColor;
  }

  getBoundingBox() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  clone() {
    const cloned = new Ellipse(this.id, this.x, this.y, this.width, this.height, this.strokeColor, this.strokeWidth, this.isFilled, this.fillColor);
    cloned.visible = this.visible;
    return cloned;
  }
}


export class Text extends DrawingObject {
  constructor(id, text, x, y, font, color) {
    super(id, 'text', x, y);
    this.text = text;
    this.font = font;
    this.color = color;
  }

  getBoundingBox(ctx) {
    ctx.font = this.font;
    const lines = this.text.split('\n');
    const fontSize = parseFloat(this.font) || 24;
    const lineHeight = fontSize * 1.2;

    let maxWidth = 0;
    lines.forEach(line => {
      maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
    });

    const height = lines.length * lineHeight;
    return { x: this.x, y: this.y, width: maxWidth, height };
  }

  clone() {
    const cloned = new Text(this.id, this.text, this.x, this.y, this.font, this.color);
    cloned.visible = this.visible;
    return cloned;
  }
}
