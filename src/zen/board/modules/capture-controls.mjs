/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// DOM overlay toolbar for CaptureObject and LiveEmbedObject.
//
// CaptureObject toolbar:  [source URL ......] [▶ play] [↗ redirect]
// LiveEmbedObject toolbar: [source URL ......] [⏸ pause] [↗ redirect]
//
// This module follows the same pattern as video-controls.js:
//   - One singleton DOM overlay (#capture-controls in board.html)
//   - Position is updated via updateCaptureControlsPosition()
//   - show/hide are exported for use in select.js hit-testing

import { getState, bumpSceneGeneration } from './state.mjs';
import { scene } from './scene.mjs';
import { redrawCanvas } from './canvas.mjs';
import { CaptureObject, LiveEmbedObject } from './media.mjs';
import { getAsset } from './db.mjs';
import { saveAsset, deleteAsset } from './assets.mjs';
import { triggerSave, triggerSaveImmediate } from '../board.mjs';
import { pushHistory } from './history.mjs';

let overlayContainer = null;
let currentObject = null;
let animationFrameId = null;

let _globalSyncId = null;
export const activeLiveEmbeds = new Set();

export function notifyTransformChanged() {
  // clean up any stale live embeds that are no longer in the scene
  for (const obj of activeLiveEmbeds) {
    if (!scene.includes(obj)) {
      activeLiveEmbeds.delete(obj);
    }
  }

  if (activeLiveEmbeds.size === 0) return;

  if (_globalSyncId) return; // Already scheduled for this frame
  _globalSyncId = requestAnimationFrame(() => {
    _globalSyncId = null;
    const { scale, offsetX, offsetY } = getState();
    for (const obj of activeLiveEmbeds) {
      if (!obj._iframeEl) {
        activeLiveEmbeds.delete(obj);
        continue;
      }
      obj._syncIframePosition(scale, offsetX, offsetY);
    }
  });
}

// Keep startGlobalSyncLoop as a one-shot call used right after iframe injection
// so the iframe is positioned immediately without waiting for a transform event.
function startGlobalSyncLoop() {
  notifyTransformChanged();
}

// Elements
let sourceUrlEl = null;
let playPauseBtn = null;
let redirectBtn = null;

// ── Icon helpers ────────────────────────────────────────────────────────────

function iconPlay() {
  return `<svg fill="white" width="18" height="18" viewBox="0 0 21 20"><path d="m 17.2778,8.30893 -10.54669,-5.84 c -0.61444,-0.34 -1.34,-0.33 -1.94333,0.02555 C 4.19,2.84671 3.83334,3.46893 3.83334,4.16004 V 15.84 c 0,0.6912 0.35666,1.3134 0.95444,1.6656 0.31,0.1822 0.65111,0.2744 0.99444,0.2744 0.32556,0 0.65112,-0.0833 0.94889,-0.2477 l 10.54559,-5.84 c 0.6177,-0.3411 1.0011,-0.99 1.0011,-1.6911 0,-0.70116 -0.3834,-1.35116 -1,-1.69227 z"/></svg>`;
}

function iconPause() {
  return `<svg fill="white" width="18" height="18" viewBox="0 0 21 20"><path d="M 7.16667,2.5 C 6.70833,2.5 6.33333,2.875 6.33333,3.33333 V 16.6667 C 6.33333,17.125 6.70833,17.5 7.16667,17.5 9.16667,17.5 9.16667,17.5 9.16667,17.5 9.625,17.5 10,17.125 10,16.6667 V 3.33333 C 10,2.875 9.625,2.5 9.16667,2.5 Z M 13.8333,2.5 c -0.4583,0 -0.8333,0.375 -0.8333,0.83333 V 16.6667 C 13,17.125 13.375,17.5 13.8333,17.5 h 2 c 0.4584,0 0.8334,-0.375 0.8334,-0.8333 V 3.33333 C 16.6667,2.875 16.2917,2.5 15.8333,2.5 Z"/></svg>`;
}

function iconRedirect() {
  return `<svg fill="white" width="16" height="16" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/><polyline points="15 3 21 3 21 9" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="14" x2="21" y2="3" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;
}

// ── DOM init ────────────────────────────────────────────────────────────────

function initDOM() {
  overlayContainer = document.getElementById('capture-controls');
  if (!overlayContainer) return;

  overlayContainer.innerHTML = '';

  // Source URL chip (left)
  sourceUrlEl = document.createElement('a');
  sourceUrlEl.className = 'capture-source-url';
  sourceUrlEl.target = '_blank';
  sourceUrlEl.rel = 'noreferrer noopener';
  sourceUrlEl.title = '';
  sourceUrlEl.textContent = '';

  // Right-side button group
  const btnGroup = document.createElement('div');
  btnGroup.className = 'capture-btn-group';

  // Play/Pause button (▶ or ⏸)
  playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'capture-btn';
  playPauseBtn.id = 'cc-playpause';
  playPauseBtn.title = 'Go live';
  // eslint-disable-next-line no-unsanitized/property
  playPauseBtn.innerHTML = iconPlay();

  // Redirect button (↗)
  redirectBtn = document.createElement('button');
  redirectBtn.className = 'capture-btn';
  redirectBtn.id = 'cc-redirect';
  redirectBtn.title = 'Open in new tab';
  // eslint-disable-next-line no-unsanitized/property
  redirectBtn.innerHTML = iconRedirect();

  btnGroup.appendChild(playPauseBtn);
  btnGroup.appendChild(redirectBtn);

  overlayContainer.appendChild(sourceUrlEl);
  overlayContainer.appendChild(btnGroup);

  // ── Event handlers ────────────────────────────────────────────
  playPauseBtn.onclick = (e) => {
    e.stopPropagation();
    const obj = currentObject;
    if (!obj) return;
    if (obj.type === 'capture') {
      convertToLiveEmbed(obj);
    } else if (obj.type === 'live-embed') {
      convertToStaticCapture(obj);
    }
  };
  playPauseBtn.onmousedown = (e) => e.stopPropagation();

  redirectBtn.onclick = (e) => {
    e.stopPropagation();
    const obj = currentObject;
    if (!obj?.sourceUrl) return;
    // Open in a new tab via the chrome window
    try {
      const chromeWin = window.docShell?.chromeEventHandler?.ownerGlobal;
      if (chromeWin?.gBrowser) {
        chromeWin.gBrowser.addTrustedTab(obj.sourceUrl, {
          triggeringPrincipal: chromeWin.Services.scriptSecurityManager.createSystemPrincipal(),
        });
      } else {
        window.open(obj.sourceUrl, '_blank');
      }
    } catch {
      window.open(obj.sourceUrl, '_blank');
    }
  };
  redirectBtn.onmousedown = (e) => e.stopPropagation();

  // Prevent canvas from receiving clicks on the toolbar
  overlayContainer.onmousedown = (e) => e.stopPropagation();

  // Block source URL link from navigating away from the board
  sourceUrlEl.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    redirectBtn.click();
  };
}

// ── Conversion helpers ──────────────────────────────────────────────────────

/**
 * Convert a CaptureObject to a LiveEmbedObject in place.
 * The CaptureObject is removed from the scene and replaced with a LiveEmbedObject.
 * The iframe is injected immediately.
 * @param {object} captureObj The capture object.
 */
function convertToLiveEmbed(captureObj) {
  const liveEmbed = new LiveEmbedObject(
    captureObj.id, captureObj.x, captureObj.y,
    captureObj.width, captureObj.height,
    captureObj.sourceUrl
  );
  liveEmbed.sourceRegion = captureObj.sourceRegion;
  liveEmbed._assetHash = captureObj._assetHash;
  liveEmbed._assetFile = captureObj._assetFile;
  // Copy the static image so the renderer can draw it as the deselected placeholder
  liveEmbed._placeholderImage = captureObj.image || null;

  // Replace in scene
  const idx = scene.findIndex(o => o.id === captureObj.id);
  if (idx !== -1) scene[idx] = liveEmbed;

  bumpSceneGeneration();

  // Inject the iframe immediately
  ensureIframeInjected(liveEmbed);

  // Show the updated toolbar
  showCaptureControls(liveEmbed);

  redrawCanvas();
  triggerSave();
  pushHistory();
}

/**
 * Convert a LiveEmbedObject back to a CaptureObject.
 * Takes a fresh screenshot of the iframe, stores it, and replaces the object.
 * @param {object} liveEmbedObj The live embed object.
 */
// eslint-disable-next-line complexity
async function convertToStaticCapture(liveEmbedObj) {
  // Hide the live controls immediately to signal the transition is happening
  if (playPauseBtn) {
    playPauseBtn.disabled = true;
    playPauseBtn.title = 'Converting…';
  }

  try {
    let blob = null;

    const chromeWin = window.docShell?.chromeEventHandler?.ownerGlobal || window.top;
    const captureOnPause = chromeWin?.Services?.prefs?.getBoolPref("zen.board.live-embeds.capture-on-pause", true) ?? true;

    // 1. Try to take a screenshot of the live iframe via ScreenshotsUtils
    if (liveEmbedObj._iframeEl && captureOnPause) {
      try {
        let screenshotsUtils = chromeWin?.ScreenshotsUtils;
        if (!screenshotsUtils && chromeWin?.ChromeUtils) {
          try {
            const modules = chromeWin.ChromeUtils.importESModule("resource:///modules/ScreenshotsUtils.sys.mjs");
            screenshotsUtils = modules.ScreenshotsUtils;
          } catch (e1) {
            const modules = chromeWin.ChromeUtils.importESModule("resource://app/modules/ScreenshotsUtils.sys.mjs");
            screenshotsUtils = modules.ScreenshotsUtils;
          }
        }
        if (!screenshotsUtils) {
          throw new Error("ScreenshotsUtils not found in parent window or parent ChromeUtils");
        }

        const left = Math.round(liveEmbedObj.sourceRegion?.left || 0);
        const topOffset = Math.round(liveEmbedObj.sourceRegion?.top || 0);
        const width = Math.max(1, Math.round(liveEmbedObj.sourceRegion?.width || liveEmbedObj.width));
        const height = Math.max(1, Math.round(liveEmbedObj.sourceRegion?.height || liveEmbedObj.height));
        const region = {
          left,
          top: topOffset,
          right: left + width,
          bottom: top + height,
          width,
          height,
          devicePixelRatio: liveEmbedObj.sourceRegion?.devicePixelRatio || window.devicePixelRatio || 1,
          viewportWidth: Math.max(800, liveEmbedObj.sourceRegion?.viewportWidth || 1280),
          viewportHeight: Math.max(600, liveEmbedObj.sourceRegion?.viewportHeight || 800)
        };
        const canvas = await ScreenshotsUtils.createCanvas(region, liveEmbedObj._iframeEl);
        if (canvas) {
          blob = await canvas.convertToBlob({ type: 'image/png' });
        }
      } catch (e) {
        console.warn('ZenBoard: Could not capture live iframe via ScreenshotsUtils', e);
      }
    }

    // 2. Fall back to reading the existing filesystem file
    if (!blob && liveEmbedObj._assetFile) {
      try {
        const folder = PathUtils.join(PathUtils.profileDir, 'zen-board-assets');
        const filePath = PathUtils.join(folder, liveEmbedObj._assetFile);
        const data = await IOUtils.read(filePath);
        blob = new Blob([data], { type: 'image/png' });
      } catch (e) {
        console.warn('ZenBoard: Could not load capture asset from filesystem', e);
      }
    }

    // 3. Fall back to legacy IDB asset
    if (!blob && liveEmbedObj._assetHash) {
      try {
        blob = await getAsset(liveEmbedObj._assetHash);
      } catch (e) {
        console.warn('ZenBoard: Could not load legacy capture asset from DB', e);
      }
    }

    // 4. Fall back to offscreen canvas filled with placeholder color
    if (!blob) {
      try {
        const offscreen = new OffscreenCanvas(Math.max(1, Math.round(liveEmbedObj.width)), Math.max(1, Math.round(liveEmbedObj.height)));
        const ctx = offscreen.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, offscreen.width, offscreen.height);
        blob = await offscreen.convertToBlob({ type: 'image/png' });
      } catch (e) {
        console.error('ZenBoard: OffscreenCanvas fallback failed', e);
      }
    }

    let filename = liveEmbedObj._assetFile;
    if (blob) {
      // Save the fresh blob to a new asset file
      const newFilename = await saveAsset(blob);
      // Delete the old asset file if it's different and exists
      if (liveEmbedObj._assetFile && liveEmbedObj._assetFile !== newFilename) {
        await deleteAsset(liveEmbedObj._assetFile);
      }
      filename = newFilename;
    }

    let img = new Image();
    if (blob) {
      const objUrl = URL.createObjectURL(blob);
      await new Promise((res) => {
        img.onload = () => { URL.revokeObjectURL(objUrl); res(); };
        img.onerror = () => { URL.revokeObjectURL(objUrl); res(); };
        img.src = objUrl;
      });
    }

    const captureObj = new CaptureObject(
      liveEmbedObj.id, liveEmbedObj.x, liveEmbedObj.y,
      liveEmbedObj.width, liveEmbedObj.height,
      img, liveEmbedObj.sourceUrl
    );
    captureObj._assetFile = filename;
    captureObj._assetHash = null;
    captureObj.sourceRegion = liveEmbedObj.sourceRegion;

    // Destroy iframe and replace in scene
    if (liveEmbedObj.destroy) liveEmbedObj.destroy();
    const idx = scene.findIndex(o => o.id === liveEmbedObj.id);
    if (idx !== -1) scene[idx] = captureObj;

    bumpSceneGeneration();

    showCaptureControls(captureObj);
    redrawCanvas();
    await triggerSaveImmediate();
    pushHistory();

  } catch (e) {
    console.error('ZenBoard: Failed to convert live embed to static capture', e);
  } finally {
    if (playPauseBtn) {
      playPauseBtn.disabled = false;
      playPauseBtn.title = 'Go live';
    }
  }
}

/**
 * Inject the content browser iframe into the parent document structure.
 * @param {object} liveEmbedObj The live embed object.
 */
export function ensureIframeInjected(liveEmbedObj) {
  if (liveEmbedObj._iframeEl) return; // Already injected

  const chromeWin = window.docShell.chromeEventHandler.ownerGlobal;
  const chromeDoc = chromeWin.document;

  // The wrapper acts as the "cropped window" matching the capture dimensions.
  const wrapper = chromeDoc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  wrapper.className = 'live-embed-wrapper';
  wrapper.style.position = 'absolute';
  wrapper.style.overflow = 'hidden';
  wrapper.style.borderRadius = '8px';
  wrapper.style.zIndex = '500';
  wrapper.style.visibility = 'visible';
  wrapper.style.pointerEvents = 'none';

  const iframe = chromeDoc.createXULElement('browser');
  iframe.setAttribute('type', 'content');
  iframe.setAttribute('remote', 'true');
  
  iframe.className = 'live-embed-frame';
  iframe.style.position = 'absolute';
  iframe.style.border = 'none';
  iframe.style.transformOrigin = 'top left';

  wrapper.appendChild(iframe);

  liveEmbedObj._wrapperEl = wrapper;
  liveEmbedObj._iframeEl = iframe;
  activeLiveEmbeds.add(liveEmbedObj);
  
  const boardBrowser = window.docShell.chromeEventHandler;
  boardBrowser.parentNode.appendChild(wrapper);

  // Register BC ID with the XFO observer BEFORE setting src so the Set entry
  // is ready when the HTTP response (with XFO headers) arrives asynchronously.
  try {
    const bcId = iframe.browsingContext?.id;
    if (bcId != null && chromeWin?.gZenBoard?.registerLiveEmbedBC) {
      chromeWin.gZenBoard.registerLiveEmbedBC(bcId);
      console.error("[ZenBoard] BC registered OK, id:", bcId); // TEMP DEBUG F12
    } else {
      console.error("[ZenBoard] BC reg FAILED — id:", bcId, "gZenBoard:", !!chromeWin?.gZenBoard, "chromeWin:", !!chromeWin); // TEMP DEBUG F12
    }
  } catch(e) { console.error("[ZenBoard] BC reg error:", e); }

  // Stop Fission lifecycle events from bubbling up to tabbrowser.js, which would confuse
  // the main browser window into thinking a real tab crashed.
  iframe.addEventListener("oop-browser-crashed", e => e.stopPropagation(), true);
  iframe.addEventListener("oop-browser-buildid-mismatch", e => e.stopPropagation(), true);

  // Fission explicitly blocks System Principal (which board.html has) from directly
  // triggering HTTP web loads. This causes the load to abort before the network request
  // even begins. We MUST use a Null Principal to allow the navigation to start.
  // We MUST defer the load to allow the Fission frameLoader to initialize asynchronously.
  setTimeout(() => {
    try {
      const ssm = chromeWin.Services.scriptSecurityManager;
      const nullPrincipal = ssm.createNullPrincipal({});
      
      const nsIUriObj = chromeWin.Services.io.newURI(liveEmbedObj.sourceUrl);
      
      if (typeof iframe.loadURI === 'function') {
        iframe.loadURI(nsIUriObj, {
          triggeringPrincipal: nullPrincipal,
          loadFlags: Components.interfaces.nsIWebNavigation.LOAD_FLAGS_NONE
        });
        console.error("[ZenBoard] loadURI executed with Null Principal and nsIURI"); // TEMP
      } else {
        console.error("[ZenBoard] Fatal: iframe.loadURI is not a function");
      }
    } catch (e) {
      console.error("[ZenBoard] loadURI failed:", e);
    }
    
    // Inject a frame script that:
    // 1. Hides the page's own scrollbars (since the embed is not meant to be user-scrollable)
    // 2. After page load, forces scroll to (0,0) so our negative translate mapping is always aligned with the page origin.
    if (iframe.messageManager) {
      const script = `data:application/javascript,` + encodeURIComponent(`
        (function() {
          function setup() {
            if (!content || !content.document || !content.document.documentElement) return;
            // Hide scrollbars
            content.document.documentElement.style.overflow = 'hidden';
            content.document.documentElement.style.scrollbarWidth = 'none';
            // Scroll to the top-left origin
            content.scrollTo(0, 0);
          }
          try {
            addEventListener("DOMContentLoaded", setup);
            addEventListener("load", setup);
            setup();
          } catch(e) {}
        })();
      `);
      try {
        iframe.messageManager.loadFrameScript(script, true);
      } catch(e) { console.error("[ZenBoard] frameScript failed", e); }
    }
  }, 0);


  // Sync position and start the persistent global sync loop.
  const { scale, offsetX, offsetY } = getState();
  liveEmbedObj._syncIframePosition(scale, offsetX, offsetY);
  startGlobalSyncLoop();
}

// ── Public API ──────────────────────────────────────────────────────────────

export function showCaptureControls(obj) {
  if (!overlayContainer) initDOM();
  if (!overlayContainer) return;

  currentObject = obj;

  // Update source URL display
  const url = obj.sourceUrl || '';
  sourceUrlEl.href = url;
  sourceUrlEl.title = url;
  try {
    const urlObj = new URL(url);
    sourceUrlEl.textContent = urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname.slice(0, 24) : '');
  } catch {
    sourceUrlEl.textContent = url.slice(0, 30);
  }

  // Update play/pause button
  if (obj.type === 'capture') {
    // eslint-disable-next-line no-unsanitized/property
    playPauseBtn.innerHTML = iconPlay();
    playPauseBtn.title = 'Go live';
  } else {
    // eslint-disable-next-line no-unsanitized/property
    playPauseBtn.innerHTML = iconPause();
    playPauseBtn.title = 'Pause (back to static)';
  }

  // If this is a live embed, ensure the iframe is injected and visible
  if (obj.type === 'live-embed') {
    if (!obj._iframeEl) {
      ensureIframeInjected(obj);
    }
    if (obj._wrapperEl) {
      // Un-hide the wrapper (was visibility:hidden when deselected) and make it
      // interactive. The global sync loop will have kept its position correct.
      obj._wrapperEl.style.visibility = 'visible';
      obj._wrapperEl.style.pointerEvents = 'auto';
    }
  }

  overlayContainer.style.display = 'flex';
  overlayContainer.classList.remove('fade-out');

  updateCaptureControlsPosition();
}

export function hideCaptureControls() {
  if (overlayContainer) {
    overlayContainer.style.display = 'none';
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (currentObject && currentObject.type === 'live-embed' && currentObject._wrapperEl) {
    // Disable interaction so the user can drag/select it again, but keep it visible.
    currentObject._wrapperEl.style.pointerEvents = 'none';
    currentObject._wrapperEl.style.visibility = 'visible';
  }
  currentObject = null;
}

export function updateCaptureControlsPosition() {
  if (!currentObject || !overlayContainer) return;

  const { scale, offsetX, offsetY, isDraggingObject, isResizingObject } = getState();
  const obj = currentObject;

  // Sync the iframe (if live embed) to current transform
  if (obj.type === 'live-embed' && obj._iframeEl) {
    obj._syncIframePosition(scale, offsetX, offsetY);
  }

  const sX = obj.x * scale + offsetX;
  const sY = obj.y * scale + offsetY;
  const screenW = obj.width * scale;
  const screenH = obj.height * scale;
  const pad = 8;

  const targetTransform = `translate(${sX}px, ${sY + screenH + pad}px)`;
  if (overlayContainer.style.transform !== targetTransform) {
    overlayContainer.style.transform = targetTransform;
  }

  const targetWidth = `${screenW}px`;
  if (overlayContainer.style.width !== targetWidth) {
    overlayContainer.style.width = targetWidth;
  }

  const isDraggingOrResizing = isDraggingObject || isResizingObject;

  const targetOpacity = isDraggingOrResizing ? '0' : '1';
  if (overlayContainer.style.opacity !== targetOpacity) {
    overlayContainer.style.opacity = targetOpacity;
  }

  const targetPointerEvents = isDraggingOrResizing ? 'none' : 'auto';
  if (overlayContainer.style.pointerEvents !== targetPointerEvents) {
    overlayContainer.style.pointerEvents = targetPointerEvents;
  }

  if (obj.type === 'live-embed' && obj._wrapperEl) {
    const targetWrapperOpacity = isDraggingOrResizing ? '0.5' : '1';
    if (obj._wrapperEl.style.opacity !== targetWrapperOpacity) {
      obj._wrapperEl.style.opacity = targetWrapperOpacity;
    }
    const targetWrapperPointerEvents = isDraggingOrResizing ? 'none' : 'auto';
    if (obj._wrapperEl.style.pointerEvents !== targetWrapperPointerEvents) {
      obj._wrapperEl.style.pointerEvents = targetWrapperPointerEvents;
    }
  }
}

export function getCurrentCaptureObject() {
  return currentObject;
}

// Position updates are now event-driven (via updateCaptureControlsPosition
// called from select.js on drag/resize, and notifyTransformChanged on pan/zoom)
// so no polling loop is needed here.

