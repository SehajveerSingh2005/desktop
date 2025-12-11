// scene.js

import { smoothPoints } from './smoothing.js';

export const scene = [];

export function addToScene(object) {
  scene.push(object);
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

export class Rectangle extends Shape {
    constructor(id, x, y, width, height, strokeColor, strokeWidth, isFilled, fillColor) {
        super(id, 'rectangle', x, y, width, height, strokeColor, strokeWidth);
        this.isFilled = isFilled;
        this.fillColor = fillColor;
    }
    
    getBoundingBox() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
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
    const width = ctx.measureText(this.text).width;
    const height = parseFloat(this.font);
    return { x: this.x, y: this.y, width, height };
  }
}
