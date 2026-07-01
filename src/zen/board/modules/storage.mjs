/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// High-level save/load logic bridging board state with IndexedDB (scene JSON)
// and the native filesystem (media assets via assets.js).
//
// Storage strategy:
//   - Board metadata + scene JSON → IndexedDB 'boards' store (tiny, fast)
//   - Images / Videos / Captures → native filesystem via IOUtils/PathUtils
//     (stored as plain files in <profile>/zen-board-assets/)
//
// Advantages over pure-IDB blob storage:
//   - No SHA-256 hashing of large files in JS (no ArrayBuffer heap spikes)
//   - Videos can be streamed natively from file:// URLs (byte-range, seek, HW decode)
//   - IDB stays lean (only JSON metadata, a few KB per board)
//   - Easy manual backup: just copy the zen-board-assets folder

import {
  saveBoard as dbSaveBoard,
  loadBoard as dbLoadBoard,
  createBoard as dbCreateBoard,
  getAsset,
} from "./db.mjs";
import { saveAsset, getAssetURL } from "./assets.mjs";
import { smoothPoints } from "./smoothing.mjs";
import { wireVideoPlaybackEvents } from "./media.mjs";
import { redrawCanvas } from "./canvas.mjs";

// The URL param key used to link a tab to a board ID
const BOARD_ID_PARAM = "id";

// ObjectURLs we created for video blobs (file:// URLs need no revocation,
// but blob: fallbacks for legacy data do). Track so we can clean up.
const _createdObjectURLs = [];

// ── Helpers ────────────────────────────────────────────────────────────────

// Convert a legacy base64 data URL back to a Blob safely.
function dataURLToBlob(dataURL) {
  const [header, base64] = dataURL.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

// ── Serialization ──────────────────────────────────────────────────────────

/**
 * Serialize a single scene object to a plain JSON-safe object.
 * Images / Videos / Captures → save to filesystem, store filename reference.
 *
 * @param {object} obj The scene object.
 */
// eslint-disable-next-line complexity
async function serializeObject(obj) {
  if (obj._serializedCache) {
    return obj._serializedCache;
  }

  const base = {
    id: obj.id,
    type: obj.type,
    x: obj.x,
    y: obj.y,
  };

  let serialized;
  switch (obj.type) {
    case "path":
      serialized = {
        ...base,
        color: obj.color,
        lineWidth: obj.lineWidth,
        rawRelativePoints: obj.rawRelativePoints,
        smoothedRelativePoints: obj.smoothedRelativePoints,
        boundingBox: obj.boundingBox,
      };
      break;

    case "rectangle":
    case "ellipse":
      serialized = {
        ...base,
        width: obj.width,
        height: obj.height,
        strokeColor: obj.strokeColor,
        strokeWidth: obj.strokeWidth,
        isFilled: obj.isFilled,
        fillColor: obj.fillColor,
      };
      break;

    case "text":
      serialized = {
        ...base,
        text: obj.text,
        font: obj.font,
        color: obj.color,
      };
      break;

    case "image": {
      // _assetFile is the filesystem filename; stamp it back on the object
      // so repeat saves don't create new orphaned files.
      let filename = obj._assetFile || null;
      if (!filename) {
        const blob =
          obj._blob ||
          (obj.image?.src?.startsWith("data:")
            ? dataURLToBlob(obj.image.src)
            : null);
        if (blob) {
          filename = await saveAsset(blob);
          obj._assetFile = filename; // stamp back so next save is idempotent
          obj._blob = null; // clear memory
        }
      }
      serialized = {
        ...base,
        width: obj.width,
        height: obj.height,
        _assetFile: filename,
        _assetHash: obj._assetHash || null,
      };
      break;
    }

    case "video": {
      let filename = obj._assetFile || null;
      if (!filename) {
        const blob =
          obj._blob ||
          (obj.video?.src?.startsWith("blob:")
            ? await fetch(obj.video.src)
                .then(r => r.blob())
                .catch(() => null)
            : null);
        if (blob) {
          filename = await saveAsset(blob);
          obj._assetFile = filename; // stamp back
          obj._blob = null; // clear memory
        }
      }
      serialized = {
        ...base,
        width: obj.width,
        height: obj.height,
        isMuted: obj.isMuted,
        volume: obj.volume,
        isLooping: obj.isLooping,
        _assetFile: filename,
        _assetHash: obj._assetHash || null,
      };
      break;
    }

    case "capture": {
      let filename = obj._assetFile || null;
      if (!filename) {
        const blob =
          obj._blob ||
          (obj.image?.src
            ? await fetch(obj.image.src)
                .then(r => r.blob())
                .catch(() => null)
            : null);
        if (blob) {
          filename = await saveAsset(blob);
          obj._assetFile = filename; // stamp back
          obj._blob = null; // clear memory
        }
      }
      serialized = {
        ...base,
        width: obj.width,
        height: obj.height,
        _assetFile: filename,
        _assetHash: obj._assetHash || null,
        sourceUrl: obj.sourceUrl || "",
        sourceRegion: obj.sourceRegion || null,
      };
      break;
    }

    case "live-embed": {
      let filename = obj._assetFile || null;
      if (!filename && obj._placeholderImage?.src) {
        try {
          const res = await fetch(obj._placeholderImage.src);
          const blob = await res.blob();
          filename = await saveAsset(blob);
          obj._assetFile = filename; // stamp back
        } catch (e) {
          console.warn("ZenBoard: Could not save live-embed placeholder image", e);
          filename = null;
        }
      }
      serialized = {
        ...base,
        width: obj.width,
        height: obj.height,
        sourceUrl: obj.sourceUrl || "",
        sourceRegion: obj.sourceRegion || null,
        _assetFile: filename,
        _assetHash: obj._assetHash || null,
      };
      break;
    }

    default:
      serialized = base;
      break;
  }

  obj._serializedCache = serialized;
  return serialized;
}

// ── Deserialization ────────────────────────────────────────────────────────

/**
 * Resolve the URL for an asset.
 * Handles:
 *   1. New filesystem assets (_assetFile) → file:// URL via IOUtils
 *   2. Legacy IDB assets (_assetHash)     → fetch blob from IDB, use data: URL
 *   3. Inline data URLs                   → returned as-is
 *
 * @param {object} data The object data.
 * @param {Function} [legacyFetcher] The legacy fetcher function.
 */
async function resolveAssetURL(data, legacyFetcher) {
  // New-style: filesystem file
  if (data._assetFile) {
    try {
      return await getAssetURL(data._assetFile);
    } catch (e) {
      console.warn(
        "ZenBoard: Could not resolve asset file",
        data._assetFile,
        e
      );
    }
  }
  // Legacy: IDB hash
  if (data._assetHash && legacyFetcher) {
    return await legacyFetcher(data._assetHash);
  }
  return null;
}

/**
 * Deserialize a plain JSON scene-object back to the appropriate class instance.
 *
 * @param {object} data The serialized data.
 * @param {object} classes The constructor classes.
 */
// eslint-disable-next-line complexity
async function deserializeObject(data, classes) {
// Class names shadow globals — kept as-is since renaming would touch every file.
/* eslint-disable no-shadow */
const {
  Path, Rectangle, Ellipse, Text,
  ImageObject, VideoObject, CaptureObject, LiveEmbedObject,
} = classes;
/* eslint-enable no-shadow */

  switch (data.type) {
    case "path": {
      const obj = new Path(data.id, data.color, data.lineWidth, data.x, data.y);
      const pts = data.rawRelativePoints || [];
      if (!!pts.length && typeof pts[0] === "object" && pts[0] !== null) {
        // Convert legacy format to flat format
        const flat = [];
        for (let i = 0; i < pts.length; i++) {
          flat.push(pts[i].x, pts[i].y);
        }
        obj.rawRelativePoints = flat;
      } else {
        obj.rawRelativePoints = pts;
      }
      obj.boundingBox = data.boundingBox || {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
      };
      obj.smoothedRelativePoints =
        data.smoothedRelativePoints || smoothPoints(obj.rawRelativePoints);
      obj.isFinalized = true;
      return obj;
    }

    case "rectangle":
      return new Rectangle(
        data.id,
        data.x,
        data.y,
        data.width,
        data.height,
        data.strokeColor,
        data.strokeWidth,
        data.isFilled,
        data.fillColor
      );

    case "ellipse":
      return new Ellipse(
        data.id,
        data.x,
        data.y,
        data.width,
        data.height,
        data.strokeColor,
        data.strokeWidth,
        data.isFilled,
        data.fillColor
      );

    case "text":
      return new Text(
        data.id,
        data.text,
        data.x,
        data.y,
        data.font,
        data.color
      );

    case "image": {
      // Try new filesystem URL first, then legacy inline src
      let imgSrc = data._imageSrc || "";

      if (data._assetFile) {
        imgSrc = await resolveAssetURL(data, null);
      } else if (data._assetHash) {
        try {
          const blob = await getAsset(data._assetHash);
          if (blob) {
            const tmpURL = URL.createObjectURL(blob);
            // We'll revoke after load
            imgSrc = tmpURL;
          }
        } catch (e) {
          console.warn("ZenBoard: Could not load legacy image asset", e);
        }
      }

      const img = new Image();
      const isTmpBlob = imgSrc && imgSrc.startsWith("blob:");
      await new Promise(resolve => {
        img.onload = () => {
          if (isTmpBlob) {
            URL.revokeObjectURL(imgSrc);
          }
          resolve();
        };
        img.onerror = () => {
          if (isTmpBlob) {
            URL.revokeObjectURL(imgSrc);
          }
          resolve();
        };
        img.src = imgSrc;
      });
      const result = new ImageObject(
        data.id,
        data.x,
        data.y,
        data.width,
        data.height,
        img
      );
      result._assetFile = data._assetFile || null;
      result._assetHash = data._assetHash || null;
      return result;
    }

    case "video": {
      let videoSrc = "";

      if (data._assetFile) {
        // file:// URL → the browser media engine can stream this directly
        videoSrc = await resolveAssetURL(data, null);
      } else if (data._assetHash) {
        try {
          const blob = await getAsset(data._assetHash);
          if (blob) {
            videoSrc = URL.createObjectURL(blob);
            _createdObjectURLs.push(videoSrc); // revoke on pagehide
          }
        } catch (e) {
          console.warn("ZenBoard: Could not load legacy video asset", e);
        }
      }

      const videoEl = document.createElement("video");
      videoEl.preload = "metadata";
      const result = await new Promise(resolve => {
        videoEl.onloadedmetadata = () =>
          resolve(
            new VideoObject(
              data.id,
              data.x,
              data.y,
              data.width,
              data.height,
              videoEl
            )
          );
        videoEl.onerror = () =>
          resolve(
            new VideoObject(
              data.id,
              data.x,
              data.y,
              data.width,
              data.height,
              videoEl
            )
          );
        videoEl.src = videoSrc;
      });
      result._assetFile = data._assetFile || null;
      result._assetHash = data._assetHash || null;
      result.isMuted = data.isMuted ?? true;
      result.volume = data.volume ?? 0.5;
      result.isLooping = data.isLooping ?? true;
      result.video.muted = result.isMuted;
      result.video.volume = result.volume;
      result.video.loop = result.isLooping;

      wireVideoPlaybackEvents(videoEl, redrawCanvas, () => result.visible);

      return result;
    }

    case "capture": {
      let imgSrc = "";

      if (data._assetFile) {
        imgSrc = await resolveAssetURL(data, null);
      } else if (data._assetHash) {
        try {
          const blob = await getAsset(data._assetHash);
          if (blob) {
            imgSrc = URL.createObjectURL(blob);
          }
        } catch (e) {
          console.warn("ZenBoard: Could not load legacy capture asset", e);
        }
      }

      const img = new Image();
      const isTmp = imgSrc && imgSrc.startsWith("blob:");
      await new Promise(resolve => {
        img.onload = () => {
          if (isTmp) {
            URL.revokeObjectURL(imgSrc);
          }
          resolve();
        };
        img.onerror = () => {
          if (isTmp) {
            URL.revokeObjectURL(imgSrc);
          }
          resolve();
        };
        img.src = imgSrc;
      });
      const captureResult = new CaptureObject(
        data.id,
        data.x,
        data.y,
        data.width,
        data.height,
        img,
        data.sourceUrl || ""
      );
      captureResult.sourceRegion = data.sourceRegion || null;
      captureResult._assetFile = data._assetFile || null;
      captureResult._assetHash = data._assetHash || null;
      return captureResult;
    }

    case "live-embed": {
      let imgSrc = "";

      if (data._assetFile) {
        imgSrc = await resolveAssetURL(data, null);
      } else if (data._assetHash) {
        try {
          const blob = await getAsset(data._assetHash);
          if (blob) {
            imgSrc = URL.createObjectURL(blob);
          }
        } catch (e) {
          console.warn("ZenBoard: Could not load legacy live-embed asset", e);
        }
      }

      const liveObj = new LiveEmbedObject(
        data.id,
        data.x,
        data.y,
        data.width,
        data.height,
        data.sourceUrl || ""
      );
      if (imgSrc) {
        const img = new Image();
        const isTmp = imgSrc.startsWith("blob:");
        await new Promise(resolve => {
          img.onload = () => {
            if (isTmp) {
              URL.revokeObjectURL(imgSrc);
            }
            resolve();
          };
          img.onerror = () => {
            if (isTmp) {
              URL.revokeObjectURL(imgSrc);
            }
            resolve();
          };
          img.src = imgSrc;
        });
        liveObj._placeholderImage = img;
      }
      liveObj.sourceRegion = data.sourceRegion || null;
      liveObj._assetFile = data._assetFile || null;
      liveObj._assetHash = data._assetHash || null;
      return liveObj;
    }

    default:
      return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getBoardIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get(BOARD_ID_PARAM) || null;
}

export function setBoardIdInURL(id) {
  const url = new URL(window.location.href);
  url.searchParams.set(BOARD_ID_PARAM, id);
  history.replaceState(null, "", url.toString());
}

export async function ensureBoardId() {
  let id = getBoardIdFromURL();
  if (!id) {
    id = await dbCreateBoard({ title: "Untitled Board", isTransparent: true });
    setBoardIdInURL(id);
  }
  return id;
}

/**
 * Save the board scene to IndexedDB (JSON) and media assets to the filesystem.
 *
 * @param {string} id The board ID.
 * @param {string} title The board title.
 * @param {boolean} isTransparent Whether the board is transparent.
 * @param {number} scale The scale of the board.
 * @param {number} offsetX The X offset.
 * @param {number} offsetY The Y offset.
 * @param {Array} sceneArray The array of scene objects.
 */
export async function saveBoard(
  id,
  title,
  isTransparent,
  scale,
  offsetX,
  offsetY,
  sceneArray
) {
  const serializedScene = await Promise.all(sceneArray.map(serializeObject));
  await dbSaveBoard(
    id,
    title,
    isTransparent,
    scale,
    offsetX,
    offsetY,
    serializedScene
  );
  document.dispatchEvent(
    new CustomEvent("ZenBoardUpdated", {
      detail: { id, title, isTransparent, lastEdited: Date.now() },
    })
  );
}

/**
 * Load a board from IndexedDB and hydrate all objects (media from filesystem).
 *
 * @param {string} id The board ID.
 * @param {object} classes The constructor classes.
 */
export async function loadBoard(id, classes) {
  const board = await dbLoadBoard(id);
  if (!board) {
    return null;
  }

  const hydratedObjects = await Promise.all(
    (board.scene || []).map(data => deserializeObject(data, classes))
  );

  return {
    title: board.title || "Untitled Board",
    isTransparent: board.isTransparent ?? true,
    scale: board.scale,
    offsetX: board.offsetX,
    offsetY: board.offsetY,
    scene: hydratedObjects.filter(Boolean),
  };
}

/**
 * Revoke any legacy blob: ObjectURLs (only videos loaded from old IDB data).
 */
export function revokeAllObjectURLs() {
  _createdObjectURLs.forEach(url => URL.revokeObjectURL(url));
  _createdObjectURLs.length = 0;
}
