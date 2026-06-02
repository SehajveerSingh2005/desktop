// modules/capture-controls.js
// DOM overlay toolbar for CaptureObject and LiveEmbedObject.
//
// CaptureObject toolbar:  [source URL ......] [▶ play] [↗ redirect]
// LiveEmbedObject toolbar: [source URL ......] [⏸ pause] [↗ redirect]
//
// This module follows the same pattern as video-controls.js:
//   - One singleton DOM overlay (#capture-controls in board.html)
//   - Position is updated via updateCaptureControlsPosition()
//   - show/hide are exported for use in select.js hit-testing

import { getState } from './state.js';
import { scene, removeFromScene, addToScene, generateId } from './scene.js';
import { redrawCanvas } from './canvas.js';
import { CaptureObject, LiveEmbedObject } from './media.js';
import { storeAsset, getAsset } from './db.js';
import { triggerSave, triggerSaveImmediate } from '../board.js';
import { pushHistory } from './history.js';

let overlayContainer = null;
let currentObject = null;
let animationFrameId = null;

// ── Global iframe position sync ───────────────────────────────────────────────
// Keeps ALL live-embed iframes positioned correctly after a pan/zoom.
// Instead of running a continuous RAF loop (which burns CPU every frame even
// when idle), callers signal a transform change via notifyTransformChanged().
// We schedule a single one-shot RAF to resync all iframe positions.
let _globalSyncId = null;

export function notifyTransformChanged() {
  // Only schedule a sync if there are any live embeds with injected iframes.
  const hasLiveEmbeds = scene.some(o => o.type === 'live-embed' && o._iframeEl);
  if (!hasLiveEmbeds) return;

  if (_globalSyncId) return; // Already scheduled for this frame
  _globalSyncId = requestAnimationFrame(() => {
    _globalSyncId = null;
    const { scale, offsetX, offsetY } = getState();
    for (const obj of scene) {
      if (obj.type === 'live-embed' && obj._iframeEl) {
        obj._syncIframePosition(scale, offsetX, offsetY);
      }
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
  playPauseBtn.innerHTML = iconPlay();

  // Redirect button (↗)
  redirectBtn = document.createElement('button');
  redirectBtn.className = 'capture-btn';
  redirectBtn.id = 'cc-redirect';
  redirectBtn.title = 'Open in new tab';
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
 */
function convertToLiveEmbed(captureObj) {
  const liveEmbed = new LiveEmbedObject(
    captureObj.id, captureObj.x, captureObj.y,
    captureObj.width, captureObj.height,
    captureObj.sourceUrl
  );
  liveEmbed.sourceRegion = captureObj.sourceRegion;
  liveEmbed._assetHash = captureObj._assetHash;
  // Copy the static image so the renderer can draw it as the deselected placeholder
  liveEmbed._placeholderImage = captureObj.image || null;

  // Replace in scene
  const idx = scene.findIndex(o => o.id === captureObj.id);
  if (idx !== -1) scene[idx] = liveEmbed;

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
 */
async function convertToStaticCapture(liveEmbedObj) {
  // Hide the live controls immediately to signal the transition is happening
  playPauseBtn.disabled = true;
  playPauseBtn.title = 'Converting…';

  try {
    let blob = null;
    if (liveEmbedObj._assetHash) {
      try {
        blob = await getAsset(liveEmbedObj._assetHash);
      } catch (e) {
        console.warn('ZenBoard: Could not load capture asset for static conversion', e);
      }
    }

    // If we couldn't get a snapshot, fall back to a placeholder
    if (!blob) {
      const offscreen = new OffscreenCanvas(Math.round(liveEmbedObj.width), Math.round(liveEmbedObj.height));
      const ctx = offscreen.getContext('2d');
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      blob = await offscreen.convertToBlob({ type: 'image/png' });
    }

    const objUrl = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = objUrl; });

    const captureObj = new CaptureObject(
      liveEmbedObj.id, liveEmbedObj.x, liveEmbedObj.y,
      liveEmbedObj.width, liveEmbedObj.height,
      img, liveEmbedObj.sourceUrl
    );
    captureObj._assetHash = liveEmbedObj._assetHash;
    captureObj.sourceRegion = liveEmbedObj.sourceRegion;

    // Destroy iframe and replace in scene
    if (liveEmbedObj.destroy) liveEmbedObj.destroy();
    const idx = scene.findIndex(o => o.id === liveEmbedObj.id);
    if (idx !== -1) scene[idx] = captureObj;

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
 * Inject a <xul:browser> element over the board canvas for a LiveEmbedObject.
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
  
  const boardBrowser = window.docShell.chromeEventHandler;
  boardBrowser.parentNode.appendChild(wrapper);

  // Register BC ID with the XFO observer BEFORE setting src so the Set entry
  // is ready when the HTTP response (with XFO headers) arrives asynchronously.
  try {
    const bcId = iframe.browsingContext?.id;
    const chromeWin = window.docShell?.chromeEventHandler?.ownerGlobal;
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
      const chromeWin = window.docShell.chromeEventHandler.ownerGlobal;
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
    playPauseBtn.innerHTML = iconPlay();
    playPauseBtn.title = 'Go live';
  } else {
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

  // Start position sync loop so iframe tracks panning/zooming
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  _startSyncLoop();
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

  const screenX = obj.x * scale + offsetX;
  const screenY = obj.y * scale + offsetY;
  const screenW = obj.width * scale;
  const screenH = obj.height * scale;
  const pad = 8;

  overlayContainer.style.transform = `translate(${screenX}px, ${screenY + screenH + pad}px)`;
  overlayContainer.style.width = `${screenW}px`;

  if (isDraggingObject || isResizingObject) {
    overlayContainer.style.opacity = '0';
    overlayContainer.style.pointerEvents = 'none';
    if (obj.type === 'live-embed' && obj._wrapperEl) {
      obj._wrapperEl.style.opacity = '0.5';
      obj._wrapperEl.style.pointerEvents = 'none';
    }
  } else {
    overlayContainer.style.opacity = '1';
    overlayContainer.style.pointerEvents = 'auto';
    if (obj.type === 'live-embed' && obj._wrapperEl) {
      obj._wrapperEl.style.opacity = '1';
      obj._wrapperEl.style.pointerEvents = 'auto';
    }
  }
}

export function getCurrentCaptureObject() {
  return currentObject;
}

function _startSyncLoop() {
  // This loop drives the capture-controls TOOLBAR overlay position.
  // Iframe position is handled independently by startGlobalSyncLoop().
  const loop = () => {
    const { selectedObjectId } = getState();
    if (!currentObject || overlayContainer.style.display === 'none') return;
    if (selectedObjectId !== currentObject.id) {
      hideCaptureControls();
      return;
    }
    updateCaptureControlsPosition();
    animationFrameId = requestAnimationFrame(loop);
  };
  animationFrameId = requestAnimationFrame(loop);
}
