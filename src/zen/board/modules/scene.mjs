/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { smoothPoints } from "./smoothing.mjs";
import { bumpSceneGeneration } from "./state.mjs";

export const scene = [];

export function addToScene(object) {
  scene.push(object);
  bumpSceneGeneration();
}

export function removeFromScene(id) {
  const index = scene.findIndex(obj => obj.id === id);
  if (index !== -1) {
    const obj = scene[index];
    // Allow objects (e.g. LiveEmbedObject) to clean up DOM resources
    if (typeof obj.destroy === "function") {
      obj.destroy();
    }
    scene.splice(index, 1);
    bumpSceneGeneration();
  }
}

export function clearScene() {
  for (const obj of scene) {
    if (typeof obj.destroy === "function") {
      obj.destroy();
    }
  }
  scene.length = 0;
  bumpSceneGeneration();
}

export function generateId() {
  return crypto.randomUUID();
}

// --- Base Classes ---
export class DrawingObject {
  constructor(id, type, x, y) {
    this.id = id;
    this.type = type;
    this._x = x;
    this._y = y;
    this._width = 0;
    this._height = 0;
    this.visible = true;
    this._serializedCache = null;
    this._cachedBoundingBox = null;
  }

  get x() {
    return this._x;
  }
  set x(val) {
    if (this._x !== val) {
      this._x = val;
      this._cachedBoundingBox = null;
      this._serializedCache = null;
    }
  }

  get y() {
    return this._y;
  }
  set y(val) {
    if (this._y !== val) {
      this._y = val;
      this._cachedBoundingBox = null;
      this._serializedCache = null;
    }
  }

  get width() {
    return this._width;
  }
  set width(val) {
    if (this._width !== val) {
      this._width = val;
      this._cachedBoundingBox = null;
      this._serializedCache = null;
    }
  }

  get height() {
    return this._height;
  }
  set height(val) {
    if (this._height !== val) {
      this._height = val;
      this._cachedBoundingBox = null;
      this._serializedCache = null;
    }
  }

  getBoundingBox(_ctx) {
    if (!this._cachedBoundingBox) {
      this._cachedBoundingBox = {
        x: this.x,
        y: this.y,
        width: this.width || 0,
        height: this.height || 0,
      };
    }
    return this._cachedBoundingBox;
  }
  move(dx, dy) {
    this.x += dx;
    this.y += dy;
    this._serializedCache = null;
    this._cachedBoundingBox = null;
    // If this is a path, the translate in drawPath means position shift doesn't
    // invalidate the Path2D. But clear it anyway to be safe for sub-classes.
    this._cachedPath2D = null;
  }
  resize(_handle, _x, _y, _anchorX, _anchorY) {
    this._serializedCache = null;
    this._cachedBoundingBox = null;
  }
}

class Shape extends DrawingObject {
  constructor(
    id,
    type,
    x,
    y,
    width,
    height,
    strokeColor,
    strokeWidth,
    isFilled,
    fillColor
  ) {
    super(id, type, x, y);
    this.width = width;
    this.height = height;
    this.strokeColor = strokeColor;
    this.strokeWidth = strokeWidth;
    this.isFilled = isFilled;
    this.fillColor = fillColor;
  }

  resize(handle, mouseX, mouseY, anchorX, anchorY) {
    super.resize(handle, mouseX, mouseY, anchorX, anchorY);
    // The stationary point is (anchorX, anchorY)
    // The moving point is (mouseX, mouseY)

    this.x = Math.min(mouseX, anchorX);
    this.y = Math.min(mouseY, anchorY);
    this.width = Math.abs(mouseX - anchorX);
    this.height = Math.abs(mouseY - anchorY);

    // Minimum size to keep handles visible
    if (this.width < 5) {
      this.width = 5;
    }
    if (this.height < 5) {
      this.height = 5;
    }
  }
}

// --- Concrete Object Classes ---
export class Path extends DrawingObject {
  constructor(id, color, lineWidth, startX, startY) {
    super(id, "path", startX, startY);
    this.color = color;
    this.lineWidth = lineWidth;
    this.rawRelativePoints = [0, 0];
    this.smoothedRelativePoints = [0, 0];
    this.boundingBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  addPoint(worldX, worldY) {
    const relativeX = worldX - this.x;
    const relativeY = worldY - this.y;

    if (this.rawRelativePoints.length >= 2) {
      const lastX = this.rawRelativePoints[this.rawRelativePoints.length - 2];
      const lastY = this.rawRelativePoints[this.rawRelativePoints.length - 1];
      const dx = relativeX - lastX;
      const dy = relativeY - lastY;
      if (dx * dx + dy * dy < 2.25) {
        // 1.5 units squared threshold
        return;
      }
    }

    this.rawRelativePoints.push(relativeX, relativeY);

    this.boundingBox.minX = Math.min(this.boundingBox.minX, relativeX);
    this.boundingBox.minY = Math.min(this.boundingBox.minY, relativeY);
    this.boundingBox.maxX = Math.max(this.boundingBox.maxX, relativeX);
    this.boundingBox.maxY = Math.max(this.boundingBox.maxY, relativeY);

    this.smoothedRelativePoints = smoothPoints(
      this.rawRelativePoints,
      this.smoothedRelativePoints
    );
    this._cachedPath2D = null; // Invalidate render cache
    this._serializedCache = null; // Invalidate serialized cache
    this._cachedBoundingBox = null; // Invalidate bbox cache
    bumpSceneGeneration();
  }

  getBoundingBox() {
    if (!this._cachedBoundingBox) {
      const padding = this.lineWidth / 2;
      this._cachedBoundingBox = {
        x: this.x + this.boundingBox.minX - padding,
        y: this.y + this.boundingBox.minY - padding,
        width: this.boundingBox.maxX - this.boundingBox.minX + this.lineWidth,
        height: this.boundingBox.maxY - this.boundingBox.minY + this.lineWidth,
      };
    }
    return this._cachedBoundingBox;
  }

  resize(handle, mouseX, mouseY, anchorX, anchorY) {
    super.resize(handle, mouseX, mouseY, anchorX, anchorY);
    const box = this.getBoundingBox();
    const oldWidth = box.width;
    const oldHeight = box.height;

    const newWidth = Math.abs(mouseX - anchorX);
    const newHeight = Math.abs(mouseY - anchorY);

    // Calculate scale factors
    const scaleX = oldWidth > 0 ? newWidth / oldWidth : 1;
    const scaleY = oldHeight > 0 ? newHeight / oldHeight : 1;

    // Update origin
    this.x = Math.min(mouseX, anchorX) - this.boundingBox.minX * scaleX;
    this.y = Math.min(mouseY, anchorY) - this.boundingBox.minY * scaleY;

    // Scale all points
    for (let i = 0; i < this.rawRelativePoints.length; i += 2) {
      this.rawRelativePoints[i] *= scaleX;
      this.rawRelativePoints[i + 1] *= scaleY;
    }

    // Update bounding box
    this.boundingBox.minX *= scaleX;
    this.boundingBox.minY *= scaleY;
    this.boundingBox.maxX *= scaleX;
    this.boundingBox.maxY *= scaleY;

    // Update smoothed points
    this.smoothedRelativePoints = smoothPoints(this.rawRelativePoints);
    this._cachedPath2D = null; // Invalidate render cache
  }

  clone() {
    const cloned = new Path(
      this.id,
      this.color,
      this.lineWidth,
      this.x,
      this.y
    );
    cloned.boundingBox = { ...this.boundingBox };
    cloned.rawRelativePoints = [...this.rawRelativePoints];
    cloned.smoothedRelativePoints = [...this.smoothedRelativePoints];
    cloned.visible = this.visible;
    // Do NOT share the native Path2D object — each clone must build its own
    // when first rendered to avoid keeping stale C++ objects alive in history
    cloned._cachedPath2D = null;
    return cloned;
  }
}

export class Rectangle extends Shape {
  constructor(
    id,
    x,
    y,
    width,
    height,
    strokeColor,
    strokeWidth,
    isFilled,
    fillColor
  ) {
    super(id, "rectangle", x, y, width, height, strokeColor, strokeWidth);
    this.isFilled = isFilled;
    this.fillColor = fillColor;
  }

  clone() {
    const cloned = new Rectangle(
      this.id,
      this.x,
      this.y,
      this.width,
      this.height,
      this.strokeColor,
      this.strokeWidth,
      this.isFilled,
      this.fillColor
    );
    cloned.visible = this.visible;
    return cloned;
  }
}

export class Ellipse extends Shape {
  constructor(
    id,
    x,
    y,
    width,
    height,
    strokeColor,
    strokeWidth,
    isFilled,
    fillColor
  ) {
    super(id, "ellipse", x, y, width, height, strokeColor, strokeWidth);
    this.isFilled = isFilled;
    this.fillColor = fillColor;
  }

  clone() {
    const cloned = new Ellipse(
      this.id,
      this.x,
      this.y,
      this.width,
      this.height,
      this.strokeColor,
      this.strokeWidth,
      this.isFilled,
      this.fillColor
    );
    cloned.visible = this.visible;
    return cloned;
  }
}

export function parseFont(fontStr) {
  const match = fontStr.match(
    /(\d+(?:\.\d+)?)px(?:\s*\/\s*(?:[\d.]+|normal))?\s+(.+)/i
  );
  if (match) {
    return {
      fontSize: parseFloat(match[1]),
      fontFamily: match[2].trim().replace(/['"]/g, ""),
    };
  }
  const baseFontSize = parseFloat(fontStr) || 24;
  const fontFamily =
    fontStr.replace(/^[0-9.]+\s*px\s+/, "").replace(/['"]/g, "") ||
    "sans-serif";
  return { fontSize: baseFontSize, fontFamily };
}

// eslint-disable-next-line no-shadow
export class Text extends DrawingObject {
  constructor(id, text, x, y, font, color) {
    super(id, "text", x, y);
    this.text = text;
    this.font = font;
    this.color = color;
  }

  getBoundingBox(ctx) {
    if (!this._cachedBoundingBox) {
      const lines = this.text.split("\n");
      const { fontSize: baseFontSize, fontFamily } = parseFont(this.font);

      let maxWidth = 0;
      let totalHeight = 0;

      lines.forEach(line => {
        let lineFontSize = baseFontSize;
        let indent = 0;
        let cleanText = line;

        if (line.startsWith("# ")) {
          lineFontSize = baseFontSize * 1.8;
          cleanText = line.substring(2);
        } else if (line.startsWith("## ")) {
          lineFontSize = baseFontSize * 1.4;
          cleanText = line.substring(3);
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          indent = baseFontSize * 1.2;
          cleanText = line.substring(2);
        } else {
          const numberedMatch = line.match(/^(\d+)\.\s/);
          if (numberedMatch) {
            indent = baseFontSize * 1.2;
            cleanText = line.substring(numberedMatch[0].length);
          }
        }

        ctx.font = `${lineFontSize}px '${fontFamily}'`;
        const lineWidth = ctx.measureText(cleanText).width + indent;
        maxWidth = Math.max(maxWidth, lineWidth);
        totalHeight += lineFontSize * 1.3;
      });

      if (totalHeight === 0) {
        totalHeight = baseFontSize * 1.3;
      }

      this._cachedBoundingBox = {
        x: this.x,
        y: this.y,
        width: maxWidth,
        height: totalHeight,
      };
    }
    return this._cachedBoundingBox;
  }

  clone() {
    const cloned = new Text(
      this.id,
      this.text,
      this.x,
      this.y,
      this.font,
      this.color
    );
    cloned.visible = this.visible;
    cloned._cachedBoundingBox = this._cachedBoundingBox;
    return cloned;
  }
}
