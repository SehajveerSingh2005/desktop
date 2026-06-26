/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { smoothPoints } from "./smoothing.mjs";
import { bumpSceneGeneration } from "./state.mjs";

export const MIN_SHAPE_SIZE = 5;

// ── Text formatting ratios (shared with renderer.mjs) ───────────────────────
export const HEADING1_SCALE = 1.8;
export const HEADING2_SCALE = 1.4;
export const INDENT_SCALE = 1.2;
export const LINE_HEIGHT_RATIO = 1.3;

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

export function replaceScene(objects) {
  for (const obj of scene) {
    if (typeof obj.destroy === "function") {
      obj.destroy();
    }
  }
  scene.length = 0;
  for (const obj of objects) {
    scene.push(obj);
  }
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
    if (this.width < MIN_SHAPE_SIZE) {
      this.width = MIN_SHAPE_SIZE;
    }
    if (this.height < MIN_SHAPE_SIZE) {
      this.height = MIN_SHAPE_SIZE;
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
    this.isFinalized = false;
    this._solidPath2D = null;
    this._numAppendedPoints = 0;
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
        return false;
      }
    }

    this.rawRelativePoints.push(relativeX, relativeY);

    this.boundingBox.minX = Math.min(this.boundingBox.minX, relativeX);
    this.boundingBox.minY = Math.min(this.boundingBox.minY, relativeY);
    this.boundingBox.maxX = Math.max(this.boundingBox.maxX, relativeX);
    this.boundingBox.maxY = Math.max(this.boundingBox.maxY, relativeY);

    // Incrementally smooth the points
    this.smoothedRelativePoints = smoothPoints(
      this.rawRelativePoints,
      this.smoothedRelativePoints
    );

    const points = this.smoothedRelativePoints;
    const M = points.length / 2;
    const windowSize = 4;

    if (!this._solidPath2D && M >= 1) {
      this._solidPath2D = new Path2D();
      this._solidPath2D.moveTo(points[0], points[1]);
      this._numAppendedPoints = 1;
    }

    if (this._solidPath2D) {
      // Append newly finalized points (indices i where i + 2 < M - windowSize)
      const limit = M - windowSize - 2;
      while (this._numAppendedPoints < limit) {
        const i = this._numAppendedPoints;
        if (i + 2 < M) {
          const p0x = points[(i - 1) * 2];
          const p0y = points[(i - 1) * 2 + 1];
          const p1x = points[i * 2];
          const p1y = points[i * 2 + 1];
          const p2x = points[(i + 1) * 2];
          const p2y = points[(i + 1) * 2 + 1];
          const p3x = points[(i + 2) * 2];
          const p3y = points[(i + 2) * 2 + 1];

          const cp1x = p1x + (p2x - p0x) / 6;
          const cp1y = p1y + (p2y - p0y) / 6;
          const cp2x = p2x - (p3x - p1x) / 6;
          const cp2y = p2y - (p3y - p1y) / 6;
          this._solidPath2D.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2x, p2y);
          this._numAppendedPoints++;
        } else {
          break;
        }
      }
    }

    this._serializedCache = null; // Invalidate serialized cache
    this._cachedBoundingBox = null; // Invalidate bbox cache
    bumpSceneGeneration();
    return true;
  }

  finalizePath() {
    this.smoothedRelativePoints = smoothPoints(this.rawRelativePoints);
    this.isFinalized = true;
    
    // Build the final Path2D for rendering
    const points = this.smoothedRelativePoints;
    const N = points.length / 2;
    const path2d = new Path2D();
    if (N > 0) {
      if (N < 3) {
        path2d.moveTo(points[0], points[1]);
        if (N === 2) {
          path2d.lineTo(points[2], points[3]);
        }
      } else {
        path2d.moveTo(points[0], points[1]);
        for (let i = 1; i < N - 2; i++) {
          const p0x = points[(i - 1) * 2];
          const p0y = points[(i - 1) * 2 + 1];
          const p1x = points[i * 2];
          const p1y = points[i * 2 + 1];
          const p2x = points[(i + 1) * 2];
          const p2y = points[(i + 1) * 2 + 1];
          const p3x = points[(i + 2) * 2];
          const p3y = points[(i + 2) * 2 + 1];

          const cp1x = p1x + (p2x - p0x) / 6;
          const cp1y = p1y + (p2y - p0y) / 6;
          const cp2x = p2x - (p3x - p1x) / 6;
          const cp2y = p2y - (p3y - p1y) / 6;
          path2d.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2x, p2y);
        }
        const last = N - 1;
        path2d.quadraticCurveTo(
          points[(last - 1) * 2],
          points[(last - 1) * 2 + 1],
          points[last * 2],
          points[last * 2 + 1]
        );
      }
    }
    this._cachedPath2D = path2d;
    this._solidPath2D = null;
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
    cloned.isFinalized = this.isFinalized;
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

// Shadow of global Text — kept as-is since renaming would touch every file.
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
          lineFontSize = baseFontSize * HEADING1_SCALE;
          cleanText = line.substring(2);
        } else if (line.startsWith("## ")) {
          lineFontSize = baseFontSize * HEADING2_SCALE;
          cleanText = line.substring(3);
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          indent = baseFontSize * INDENT_SCALE;
          cleanText = line.substring(2);
        } else {
          const numberedMatch = line.match(/^(\d+)\.\s/);
          if (numberedMatch) {
            indent = baseFontSize * INDENT_SCALE;
            cleanText = line.substring(numberedMatch[0].length);
          }
        }

        ctx.font = `${lineFontSize}px '${fontFamily}'`;
        const lineWidth = ctx.measureText(cleanText).width + indent;
        maxWidth = Math.max(maxWidth, lineWidth);
        totalHeight += lineFontSize * LINE_HEIGHT_RATIO;
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
