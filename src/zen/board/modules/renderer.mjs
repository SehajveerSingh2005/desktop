/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getState } from "./state.mjs";
import {
  parseFont, HEADING1_SCALE, HEADING2_SCALE, INDENT_SCALE, LINE_HEIGHT_RATIO,
} from "./scene.mjs";

// Cache rounded rect clip paths to avoid rebuilding a Path2D on every frame.
//
// Key insight: the Path2D shape depends only on (w, h, r) — NOT on (x, y),
// because the canvas transform already positions the object via translate/scale.
// The old key included x,y which are world-space floats that change on every
// pan/zoom event, causing constant misses and FIFO churn against the 500-entry cap.
//
// We draw the path at (0,0) and shift it to (x,y) via ctx.save/translate/restore
// at the call site, so the cached Path2D is reused for every object of the same
// size regardless of its position or the current zoom level.
const _roundedRectCache = new Map();
const _ROUNDED_RECT_CACHE_MAX = 32; // small: distinct sizes per board are few

function getRoundedRectPath(w, h, r) {
  // Round to 1 decimal place so subpixel jitter from resize doesn't fragment the cache
  const key = `${Math.round(w * 10)},${Math.round(h * 10)},${Math.round(r * 10)}`;
  let path = _roundedRectCache.get(key);
  if (!path) {
    path = new Path2D();
    path.moveTo(r, 0);
    path.lineTo(w - r, 0);
    path.quadraticCurveTo(w, 0, w, r);
    path.lineTo(w, h - r);
    path.quadraticCurveTo(w, h, w - r, h);
    path.lineTo(r, h);
    path.quadraticCurveTo(0, h, 0, h - r);
    path.lineTo(0, r);
    path.quadraticCurveTo(0, 0, r, 0);
    path.closePath();
    if (_roundedRectCache.size >= _ROUNDED_RECT_CACHE_MAX) {
      _roundedRectCache.delete(_roundedRectCache.keys().next().value);
    }
    _roundedRectCache.set(key, path);
  }
  return path;
}

// Apply a cached rounded-rect clip translated to (x, y).
// Must be called inside a ctx.save()/ctx.restore() pair — the clip is
// active for the lifetime of that save, then discarded automatically.
function clipRoundedRect(context, x, y, w, h, r) {
  context.translate(x, y);
  context.clip(getRoundedRectPath(w, h, r));
  context.translate(-x, -y);
}

function drawPath(context, object) {
  context.save();
  context.translate(object.x, object.y);
  context.strokeStyle = object.color;
  context.lineWidth = object.lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (!object.isFinalized) {
    // 1. Draw the finalized solid path segment
    if (object._solidPath2D) {
      context.stroke(object._solidPath2D);
    }

    // 2. Draw the remaining temporary segment of the curve
    const points = object.smoothedRelativePoints;
    const M = points.length / 2;
    const startIdx = object._numAppendedPoints || 1;

    if (M > 0) {
      context.beginPath();
      // Move to the end of the solid path
      if (startIdx >= 2 && startIdx * 2 < points.length) {
        context.moveTo(points[startIdx * 2], points[startIdx * 2 + 1]);
      } else {
        context.moveTo(points[0], points[1]);
      }

      if (M < 3) {
        if (M === 2) {
          context.lineTo(points[2], points[3]);
        }
      } else {
        // Draw the temporary cubic Bezier segments
        for (let i = startIdx; i < M - 2; i++) {
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
          context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2x, p2y);
        }
        // Draw the final segment to the end point
        const last = M - 1;
        context.quadraticCurveTo(
          points[(last - 1) * 2],
          points[(last - 1) * 2 + 1],
          points[last * 2],
          points[last * 2 + 1]
        );
      }
      context.stroke();
    }
    context.restore();
    return;
  }

  // Smooth path: draw bezier curves when drawing is completed
  const points = object.smoothedRelativePoints;
  const N = points.length / 2;

  if (N === 1) {
    if (!object._cachedDotPath2D) {
      const path2d = new Path2D();
      path2d.arc(points[0], points[1], object.lineWidth / 2, 0, 2 * Math.PI);
      object._cachedDotPath2D = path2d;
    }
    context.fillStyle = object.color;
    context.fill(object._cachedDotPath2D);
    context.restore();
    return;
  }

  if (!object._cachedPath2D) {
    const path2d = new Path2D();
    if (N < 3) {
      path2d.moveTo(points[0], points[1]);
      path2d.lineTo(points[2], points[3]);
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
    object._cachedPath2D = path2d;
  }

  context.stroke(object._cachedPath2D);
  context.restore();
}

function drawRectangle(context, object) {
  context.strokeStyle = object.strokeColor;
  context.lineWidth = object.strokeWidth;
  context.lineJoin = "miter";
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
  context.save();
  context.fillStyle = object.color;
  context.textBaseline = "top";

  const lines = object.text.split("\n");
  const { fontSize: baseFontSize, fontFamily } = parseFont(object.font);

  let currentY = object.y;

  lines.forEach(line => {
    let lineFontSize = baseFontSize;
    let indent = 0;
    let cleanText = line;
    let isBullet = false;
    let isNumbered = false;
    let numStr = "";

    if (line.startsWith("# ")) {
      lineFontSize = baseFontSize * HEADING1_SCALE;
      cleanText = line.substring(2);
    } else if (line.startsWith("## ")) {
      lineFontSize = baseFontSize * HEADING2_SCALE;
      cleanText = line.substring(3);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      indent = baseFontSize * INDENT_SCALE;
      cleanText = line.substring(2);
      isBullet = true;
    } else {
      const numberedMatch = line.match(/^(\d+)\.\s/);
      if (numberedMatch) {
        indent = baseFontSize * INDENT_SCALE;
        cleanText = line.substring(numberedMatch[0].length);
        isNumbered = true;
        numStr = numberedMatch[1] + ".";
      }
    }

    context.font = `${lineFontSize}px '${fontFamily}'`;

    if (isBullet) {
      const bulletX = object.x + indent * 0.4 + 2;
      const bulletY = currentY + lineFontSize * 0.5 + 2;
      const radius = lineFontSize * 0.15;
      context.beginPath();
      context.arc(bulletX, bulletY, radius, 0, 2 * Math.PI);
      context.fill();
    } else if (isNumbered) {
      const numX = object.x + indent * 0.1 + 2;
      context.fillText(numStr, numX, currentY + 2);
    }

    context.fillText(cleanText, object.x + indent + 2, currentY + 2);
    currentY += lineFontSize * LINE_HEIGHT_RATIO;
  });

  context.restore();
}

const drawingFunctions = {
  path: drawPath,
  rectangle: drawRectangle,
  ellipse: drawEllipse,
  text: drawText,
  image: drawImage,
  video: drawVideo,
  capture: drawCapture,
  "live-embed": drawLiveEmbedPlaceholder,
};

function drawImage(context, object) {
  const { selectedObjectId, isDraggingObject } = getState();
  const isSelected = selectedObjectId === object.id;
  const isDragging = isSelected && isDraggingObject;

  context.save();
  if (isDragging) {
    context.globalAlpha = 0.5;
  }

  clipRoundedRect(context, object.x, object.y, object.width, object.height, 8);

  if (object.image && object.image.complete) {
    context.drawImage(
      object.image,
      object.x,
      object.y,
      object.width,
      object.height
    );
  } else {
    context.fillStyle = "#f0f0f0";
    context.fillRect(object.x, object.y, object.width, object.height);
  }
  context.restore();
}

function drawCapture(context, object) {
  const { selectedObjectId, isDraggingObject } = getState();
  const isSelected = selectedObjectId === object.id;
  const isDragging = isSelected && isDraggingObject;

  context.save();
  if (isDragging) {
    context.globalAlpha = 0.5;
  }

  clipRoundedRect(context, object.x, object.y, object.width, object.height, 8);

  if (object.image && object.image.complete) {
    context.drawImage(
      object.image,
      object.x,
      object.y,
      object.width,
      object.height
    );
  } else {
    context.fillStyle = "#1a1a2e";
    context.fillRect(object.x, object.y, object.width, object.height);
  }
  context.restore();
}

function drawLiveEmbedPlaceholder(context, object) {
  context.save();

  clipRoundedRect(context, object.x, object.y, object.width, object.height, 8);

  if (
    object._placeholderImage &&
    object._placeholderImage.complete &&
    object._placeholderImage.naturalWidth > 0
  ) {
    context.drawImage(
      object._placeholderImage,
      object.x,
      object.y,
      object.width,
      object.height
    );
  } else {
    // Clip is already applied — fillRect respects it
    context.fillStyle = "#1a1a2e";
    context.fillRect(object.x, object.y, object.width, object.height);
  }

  context.restore();
}

function drawVideo(context, object) {
  const { selectedObjectId, isDraggingObject } = getState();
  const isSelected = selectedObjectId === object.id;
  const isDragging = isSelected && isDraggingObject;

  context.save();
  if (isDragging) {
    context.globalAlpha = 0.5;
  }

  clipRoundedRect(context, object.x, object.y, object.width, object.height, 8);

  context.drawImage(
    object.video,
    object.x,
    object.y,
    object.width,
    object.height
  );
  context.restore();
}

export function drawScene(context, scene) {
  const { scale, offsetX, offsetY } = getState();
  const viewportMinX = -offsetX / scale;
  const viewportMinY = -offsetY / scale;
  const viewportMaxX = (window.innerWidth - offsetX) / scale;
  const viewportMaxY = (window.innerHeight - offsetY) / scale;

  for (const object of scene) {
    if (object.visible) {
      if (object.type !== "text") {
        const box = object.getBoundingBox(context);
        if (
          box.x + box.width < viewportMinX ||
          box.x > viewportMaxX ||
          box.y + box.height < viewportMinY ||
          box.y > viewportMaxY
        ) {
          continue;
        }
      }

      const drawFn = drawingFunctions[object.type];
      if (drawFn) {
        drawFn(context, object);
      }
    }
  }
}
