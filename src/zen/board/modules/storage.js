// modules/storage.js
// High-level save/load logic that bridges the board state with IndexedDB.
// - Images: stored as base64 data URLs directly in the scene JSON (fast, no async)
// - Videos: heavy blobs stored in the IDB assets store; referenced by hash in JSON

import { storeAsset, getAsset, saveBoard as dbSaveBoard, loadBoard as dbLoadBoard, createBoard as dbCreateBoard } from './db.js';

// The URL param key used to link a tab to a board ID
const BOARD_ID_PARAM = 'id';

// ObjectURLs we've created for video blobs so we can revoke on unload
const _createdObjectURLs = [];

// ── Helpers ────────────────────────────────────────────────────────────────

// Convert a legacy base64 data URL back to a Blob safely.
function dataURLToBlob(dataURL) {
  const [header, base64] = dataURL.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ── Serialization ──────────────────────────────────────────────────────────

/**
 * Serialize a single scene object to a plain JSON-safe object.
 * Images → extracted src (data URL) kept inline as string.
 * Videos → blob stored in IDB, replaced with { _assetHash } reference.
 */
async function serializeObject(obj) {
  const base = {
    id: obj.id,
    type: obj.type,
    x: obj.x,
    y: obj.y,
  };

  switch (obj.type) {
    case 'path':
      return {
        ...base,
        color: obj.color,
        lineWidth: obj.lineWidth,
        rawRelativePoints: obj.rawRelativePoints,
        boundingBox: obj.boundingBox,
      };

    case 'rectangle':
    case 'ellipse':
      return {
        ...base,
        width: obj.width,
        height: obj.height,
        strokeColor: obj.strokeColor,
        strokeWidth: obj.strokeWidth,
        isFilled: obj.isFilled,
        fillColor: obj.fillColor,
      };

    case 'text':
      return {
        ...base,
        text: obj.text,
        font: obj.font,
        color: obj.color,
      };

    case 'image': {
      let hash = obj._assetHash || null;
      // Legacy: If we loaded from a base64 string, obj._imageSrc will exist instead of a hash
      if (!hash && obj._blob) {
        hash = await storeAsset(obj._blob);
      } else if (!hash && obj.image && obj.image.src && obj.image.src.startsWith('data:')) {
        // Convert legacy base64 to Blob, so it's clean next save
        try {
          const blob = dataURLToBlob(obj.image.src);
          hash = await storeAsset(blob);
        } catch(e) { /* ignore */ }
      }
      return {
        ...base,
        width: obj.width,
        height: obj.height,
        _assetHash: hash,
        // Keep _imageSrc fallback for backward compatibility
        _imageSrc: hash ? undefined : (obj.image?.src || '')
      };
    }

    case 'video': {
      // Videos are stored as Blobs in IDB (potentially large)
      let hash = obj._assetHash || null;
      // Prefer the raw blob if available (avoids fetch() failing if objectURLs are revoked during pagehide)
      if (!hash && obj._blob) {
        hash = await storeAsset(obj._blob);
      } else if (!hash && obj.video && obj.video.src && obj.video.src.startsWith('blob:')) {
        // Fallback: Fetch the blob back from the objectURL
        try {
          const res = await fetch(obj.video.src);
          const blob = await res.blob();
          hash = await storeAsset(blob);
        } catch (e) {
          console.warn('ZenBoard: Could not store video asset', e);
        }
      }
      return {
        ...base,
        width: obj.width,
        height: obj.height,
        isMuted: obj.isMuted,
        volume: obj.volume,
        isLooping: obj.isLooping,
        _assetHash: hash,
      };
    }

    case 'capture': {
      // Capture images are stored as PNG blobs in IDB (same as image objects)
      let hash = obj._assetHash || null;
      if (!hash && obj._blob) {
        hash = await storeAsset(obj._blob);
      } else if (!hash && obj.image && obj.image.src) {
        try {
          const res = await fetch(obj.image.src);
          const blob = await res.blob();
          hash = await storeAsset(blob);
        } catch (e) {
          console.warn('ZenBoard: Could not store capture asset', e);
        }
      }
      return {
        ...base,
        width: obj.width,
        height: obj.height,
        _assetHash: hash,
        sourceUrl: obj.sourceUrl || '',
        sourceRegion: obj.sourceRegion || null,
      };
    }

    case 'live-embed': {
      // Only the URL is stored; the iframe is reconstructed on load.
      return {
        ...base,
        width: obj.width,
        height: obj.height,
        sourceUrl: obj.sourceUrl || '',
        sourceRegion: obj.sourceRegion || null,
        _assetHash: obj._assetHash || null,
      };
    }

    default:
      return base;
  }
}

/**
 * Deserialize a plain JSON scene-object back to the appropriate class instance.
 * Returns a promise because videos need an async IDB fetch.
 */
async function deserializeObject(data, classes) {
  const { Path, Rectangle, Ellipse, Text, ImageObject, VideoObject, CaptureObject, LiveEmbedObject } = classes;

  switch (data.type) {
    case 'path': {
      const obj = new Path(data.id, data.color, data.lineWidth, data.x, data.y);
      obj.rawRelativePoints = data.rawRelativePoints || [];
      obj.boundingBox = data.boundingBox || { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      // Re-smooth
      const { smoothPoints } = await import('./smoothing.js');
      obj.smoothedRelativePoints = smoothPoints(obj.rawRelativePoints);
      return obj;
    }

    case 'rectangle': {
      return new Rectangle(
        data.id, data.x, data.y, data.width, data.height,
        data.strokeColor, data.strokeWidth, data.isFilled, data.fillColor
      );
    }

    case 'ellipse': {
      return new Ellipse(
        data.id, data.x, data.y, data.width, data.height,
        data.strokeColor, data.strokeWidth, data.isFilled, data.fillColor
      );
    }

    case 'text': {
      return new Text(data.id, data.text, data.x, data.y, data.font, data.color);
    }

    case 'image': {
      let objectURL = data._imageSrc || '';
      if (data._assetHash) {
        try {
          const blob = await getAsset(data._assetHash);
          if (blob) {
            objectURL = URL.createObjectURL(blob);
            _createdObjectURLs.push(objectURL);
          }
        } catch (e) {
          console.warn('ZenBoard: Could not load image asset', e);
        }
      }
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve; // best-effort
        img.src = objectURL;
      });
      const result = new ImageObject(data.id, data.x, data.y, data.width, data.height, img);
      result._assetHash = data._assetHash;
      return result;
    }

    case 'video': {
      let objectURL = '';
      if (data._assetHash) {
        try {
          const blob = await getAsset(data._assetHash);
          if (blob) {
            objectURL = URL.createObjectURL(blob);
            _createdObjectURLs.push(objectURL);
          }
        } catch (e) {
          console.warn('ZenBoard: Could not load video asset', e);
        }
      }
      const videoEl = document.createElement('video');
      videoEl.preload = 'metadata';
      const result = await new Promise((resolve) => {
        videoEl.onloadedmetadata = () => resolve(
          new VideoObject(data.id, data.x, data.y, data.width, data.height, videoEl)
        );
        videoEl.onerror = () => resolve(
          new VideoObject(data.id, data.x, data.y, data.width, data.height, videoEl)
        );
        videoEl.src = objectURL;
      });
      result._assetHash = data._assetHash;
      result.isMuted = data.isMuted ?? true;
      result.volume = data.volume ?? 0.5;
      result.isLooping = data.isLooping ?? true;
      result.video.muted = result.isMuted;
      result.video.volume = result.volume;
      result.video.loop = result.isLooping;
      
      // We don't have direct access to redrawCanvas here, but it's okay because 
      // board.js handles the global redraw loop. For the video playback loop though,
      // it's better if we hook up the same requestAnimationFrame optimization.
      const forceRedraw = () => window.dispatchEvent(new CustomEvent('ZenBoardVideoFrame'));
      videoEl.onloadeddata = forceRedraw;
      videoEl.onseeked = forceRedraw;
      videoEl.oncanplay = forceRedraw;

      let frameRequest = null;
      videoEl.onplay = () => {
        const update = () => {
          if (!videoEl.paused && !videoEl.ended && result.visible) {
            // Avoid stacking overlapping loops
            forceRedraw();
            frameRequest = requestAnimationFrame(update);
          }
        };
        if (frameRequest) cancelAnimationFrame(frameRequest);
        update();
      };
      
      videoEl.onpause = () => {
        if (frameRequest) {
          cancelAnimationFrame(frameRequest);
          frameRequest = null;
        }
      };
      
      return result;
    }

    case 'capture': {
      // Load PNG blob from IDB, reconstruct Image element
      let objectURL = '';
      if (data._assetHash) {
        try {
          const blob = await getAsset(data._assetHash);
          if (blob) {
            objectURL = URL.createObjectURL(blob);
            _createdObjectURLs.push(objectURL);
          }
        } catch (e) {
          console.warn('ZenBoard: Could not load capture asset', e);
        }
      }
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = objectURL;
      });
      const captureResult = new CaptureObject(
        data.id, data.x, data.y, data.width, data.height, img, data.sourceUrl || ''
      );
      captureResult.sourceRegion = data.sourceRegion || null;
      captureResult._assetHash = data._assetHash;
      return captureResult;
    }

    case 'live-embed': {
      // Reconstruct the object. The iframe is created lazily when selected.
      let objectURL = '';
      if (data._assetHash) {
        try {
          const blob = await getAsset(data._assetHash);
          if (blob) {
            objectURL = URL.createObjectURL(blob);
            _createdObjectURLs.push(objectURL);
          }
        } catch (e) {
          console.warn('ZenBoard: Could not load live-embed asset', e);
        }
      }
      const liveObj = new LiveEmbedObject(
        data.id, data.x, data.y, data.width, data.height, data.sourceUrl || ''
      );
      if (objectURL) {
        const img = new Image();
        // Fire resolving independently so board load isn't terribly blocked
        // but typically synchronous enough if objectURL works immediately
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = objectURL;
        });
        liveObj._placeholderImage = img;
      }
      liveObj.sourceRegion = data.sourceRegion || null;
      liveObj._assetHash = data._assetHash || null;
      return liveObj;
    }

    default:
      return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the board ID from the current URL (?id=...).
 */
export function getBoardIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get(BOARD_ID_PARAM) || null;
}

/**
 * Push the board ID into the current URL without reloading.
 */
export function setBoardIdInURL(id) {
  const url = new URL(window.location.href);
  url.searchParams.set(BOARD_ID_PARAM, id);
  history.replaceState(null, '', url.toString());
}

/**
 * Get the board ID for the current tab (from URL) or create a new one.
 * Returns: the board ID string.
 */
export async function ensureBoardId() {
  let id = getBoardIdFromURL();
  if (!id) {
    id = await dbCreateBoard({ title: 'Untitled Board', isTransparent: true });
    setBoardIdInURL(id);
  }
  return id;
}

/**
 * Saves the given scene array to IDB.
 */
export async function saveBoard(id, title, isTransparent, scale, offsetX, offsetY, sceneArray) {
  // Serialize all objects in parallel (faster asset hashing)
  const serializedScene = await Promise.all(
    sceneArray.map((obj) => serializeObject(obj))
  );

  await dbSaveBoard(id, title, isTransparent, scale, offsetX, offsetY, serializedScene);

  // Inform background script of update
  document.dispatchEvent(new CustomEvent('ZenBoardUpdated', {
    detail: { id, title, isTransparent, lastEdited: Date.now() }
  }));
}

/**
 * Load a board from IndexedDB and hydrate all objects.
 * @param {string} id
 * @param {object} classes - { Path, Rectangle, Ellipse, Text, ImageObject, VideoObject }
 * @returns {{ title, isTransparent, scale, offsetX, offsetY, scene: DrawingObject[] } | null}
 */
export async function loadBoard(id, classes) {
  const board = await dbLoadBoard(id);
  if (!board) return null;

  const hydratedObjects = await Promise.all(
    (board.scene || []).map(data => deserializeObject(data, classes))
  );

  return {
    title: board.title || 'Untitled Board',
    isTransparent: board.isTransparent ?? true,
    scale: board.scale,
    offsetX: board.offsetX,
    offsetY: board.offsetY,
    scene: hydratedObjects.filter(Boolean),
  };
}

/**
 * Revoke any ObjectURLs created for video blobs (call on pagehide).
 */
export function revokeAllObjectURLs() {
  _createdObjectURLs.forEach(url => URL.revokeObjectURL(url));
  _createdObjectURLs.length = 0;
}
