/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  canvas,
  resizeCanvas,
  redrawCanvas,
  redrawCanvasImmediate,
  setTransform,
  getTransformedPoint,
  invalidateAccentColorCache,
} from "./modules/canvas.mjs";
import { toolHandlers } from "./modules/tools.mjs";
import { getState, setState, bumpSceneGeneration } from "./modules/state.mjs";
import {
  initTools,
  selectTool,
  updateZoomDisplay,
  activateTextEditor,
  deactivateTextEditor,
  updateTextEditorPosition,
} from "./modules/ui.mjs";
import { findObjectAt } from "./modules/interactions.mjs";
/* eslint-disable no-shadow */
import {
  scene,
  addToScene,
  removeFromScene,
  generateId,
  Text,
  Path,
  Rectangle,
  Ellipse,
} from "./modules/scene.mjs";
/* eslint-enable no-shadow */
import {
  ImageObject,
  VideoObject,
  CaptureObject,
  LiveEmbedObject,
} from "./modules/media.mjs";
import {
  ensureBoardId,
  saveBoard,
  loadBoard,
  revokeAllObjectURLs,
} from "./modules/storage.mjs";
import {
  pushHistory,
  undo,
  redo,
  registerOnRestore,
} from "./modules/history.mjs";
import {
  hideVideoControls,
  updateVideoControlsPosition,
} from "./modules/video-controls.mjs";
import {
  hideCaptureControls,
  updateCaptureControlsPosition,
  ensureIframeInjected,
  notifyTransformChanged,
} from "./modules/capture-controls.mjs";

// Exposed on window so that the privileged chrome process (ZenBoard.mjs)
// can retrieve current canvas/viewport state or transform coordinates via
// the content tab's contentWindow directly.
window.getState = getState;
window.getTransformedPoint = getTransformedPoint;

// DOM Elements
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const boardTitleInput = document.getElementById("board-title");

// Autosave Logic
let _saveTimer = null;

export function triggerSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const { isDrawing, isPanning, isDraggingObject, isResizingObject } =
      getState();
    if (isDrawing || isPanning || isDraggingObject || isResizingObject) {
      // Postpone saving because user is actively interacting
      triggerSave();
      return;
    }
    triggerSaveImmediate();
  }, 1000); // 1-second debounce
}

export async function triggerSaveImmediate() {
  clearTimeout(_saveTimer);
  const { boardId, boardTitle, isTransparent, scale, offsetX, offsetY } =
    getState();
  if (!boardId) {
    return;
  }
  try {
    await saveBoard(
      boardId,
      boardTitle,
      isTransparent,
      scale,
      offsetX,
      offsetY,
      [...scene]
    );
  } catch (e) {
    console.error("ZenBoard: Immediate save failed", e);
  }
}

function applyTransparency(isTransparent) {
  const chromeWindow = window.docShell?.chromeEventHandler?.ownerDocument?.defaultView;
  let opacity = 0.5;
  if (isTransparent) {
    try {
      const prefVal = chromeWindow?.Services?.prefs?.getStringPref("zen.board.background-opacity");
      opacity = parseFloat(prefVal ?? "0.5");
      if (isNaN(opacity)) {
        opacity = 0.5;
      }
    } catch (e) {
      opacity = 0.5;
    }
  } else {
    opacity = 1.0;
  }

  document.documentElement.style.setProperty("--board-bg-opacity", opacity);
}

// Wheel Panning and Zooming Animation Logic
let isAnimatingWheel = false;
let targetScale = 1;
let targetOffsetX = 0;
let targetOffsetY = 0;

let currentScale = 1;
let currentOffsetX = 0;
let currentOffsetY = 0;

function startWheelAnimation() {
  if (isAnimatingWheel) {
    return;
  }
  isAnimatingWheel = true;

  const { scale, offsetX, offsetY } = getState();
  currentScale = scale;
  currentOffsetX = offsetX;
  currentOffsetY = offsetY;

  // Initialize targets if they are in their default state
  if (targetScale === 1 && targetOffsetX === 0 && targetOffsetY === 0) {
    targetScale = scale;
    targetOffsetX = offsetX;
    targetOffsetY = offsetY;
  }

  function step() {
    if (!isAnimatingWheel) {
      return;
    }

    const lerp = (start, end, amt) => start + (end - start) * amt;

    // Smooth lerp updates
    currentScale = lerp(currentScale, targetScale, 0.15);
    currentOffsetX = lerp(currentOffsetX, targetOffsetX, 0.15);
    currentOffsetY = lerp(currentOffsetY, targetOffsetY, 0.15);

    const scaleDiff = Math.abs(currentScale - targetScale);
    const offsetXDiff = Math.abs(currentOffsetX - targetOffsetX);
    const offsetYDiff = Math.abs(currentOffsetY - targetOffsetY);

    if (scaleDiff < 0.001 && offsetXDiff < 0.05 && offsetYDiff < 0.05) {
      // Snap to target at the end of interpolation
      setTransform(targetScale, targetOffsetX, targetOffsetY);
      // We are already inside a RAF callback — call the draw function directly.
      redrawCanvasImmediate();
      updateZoomDisplay();
      updateVideoControlsPosition();
      updateCaptureControlsPosition();
      notifyTransformChanged();
      if (getState().editingTextObject) {
        updateTextEditorPosition();
      }
      isAnimatingWheel = false;
      triggerSave();
      return;
    }

    setTransform(currentScale, currentOffsetX, currentOffsetY);
    // We are already inside a RAF callback — call the draw function directly.
    redrawCanvasImmediate();
    updateZoomDisplay();
    updateVideoControlsPosition();
    updateCaptureControlsPosition();
    notifyTransformChanged();
    if (getState().editingTextObject) {
      updateTextEditorPosition();
    }

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function stopWheelAnimation() {
  isAnimatingWheel = false;
}

// Zoom Logic
function zoom(direction) {
  stopWheelAnimation();
  const { scale, offsetX, offsetY } = getState();
  const zoomFactor = 1.1;
  const oldScale = scale;
  let newScale = direction > 0 ? oldScale * zoomFactor : oldScale / zoomFactor;
  // Clamp zoom level
  newScale = Math.max(0.1, Math.min(newScale, 10));

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  const newOffsetX = centerX - (centerX - offsetX) * (newScale / oldScale);
  const newOffsetY = centerY - (centerY - offsetY) * (newScale / oldScale);

  setTransform(newScale, newOffsetX, newOffsetY);
  redrawCanvas();
  updateZoomDisplay();

  updateVideoControlsPosition();
  updateCaptureControlsPosition();
  notifyTransformChanged();
  if (getState().editingTextObject) {
    updateTextEditorPosition();
  }
  triggerSave();
}

// Event Delegation

function onMouseDown(e) {
  stopWheelAnimation();
  const { currentTool } = getState();
  toolHandlers[currentTool].onMouseDown(e);
}

function onMouseMove(e) {
  const { currentTool } = getState();
  toolHandlers[currentTool].onMouseMove(e);
}

function onMouseUp(e) {
  // Read modification flags BEFORE the handler resets them to false.
  const { currentTool, isDraggingObject, isResizingObject } = getState();
  toolHandlers[currentTool].onMouseUp(e);
  triggerSave();

  // For the select tool, only commit history when something was actually
  // moved or resized. Clicks, panning, and deselects don't change the scene.
  const sceneModified =
    currentTool !== "select" || isDraggingObject || isResizingObject;
  if (sceneModified) {
    bumpSceneGeneration();
    pushHistory();
  }
}

function onDoubleClick(e) {
  const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
  const hitObject = findObjectAt(x, y);
  if (hitObject && hitObject instanceof Text) {
    // Activate the editor, select the object, and switch to the select tool
    activateTextEditor(hitObject.x, hitObject.y, hitObject);
    setState({ selectedObjectId: hitObject.id });
    selectTool("select");
  }
}

function handleFile(file, x, y) {
  const id = generateId();
  if (file.type.startsWith("image/")) {
    const objectURL = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectURL);
      const maxWidth = 400;
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = (maxWidth / w) * h;
        w = maxWidth;
      }
      const obj = new ImageObject(id, x - w / 2, y - h / 2, w, h, img);
      obj._blob = file;
      addToScene(obj);
      setState({ selectedObjectId: id });
      selectTool("select");
      redrawCanvas();
      triggerSaveImmediate();
      pushHistory();
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectURL);
    };
    img.src = objectURL;
  } else if (file.type.startsWith("video/")) {
    // Store a reference to the original Blob so storage.js can put it in IDB
    const objectURL = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const maxWidth = 400;
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > maxWidth) {
        h = (maxWidth / w) * h;
        w = maxWidth;
      }
      const obj = new VideoObject(id, x - w / 2, y - h / 2, w, h, video);
      // Keep the original blob on the object for serialization
      obj._blob = file;
      addToScene(obj);
      setState({ selectedObjectId: id });
      selectTool("select");

      // Animation start: set offset to out state immediately
      obj.controlsYOffset = 10;

      video.onloadeddata = redrawCanvas;
      video.onseeked = redrawCanvas;
      video.oncanplay = redrawCanvas;

      let frameRequest = null;
      video.onplay = () => {
        const update = () => {
          if (!video.paused && !video.ended) {
            redrawCanvas();
            frameRequest = requestAnimationFrame(update);
          }
        };
        if (frameRequest) {
          cancelAnimationFrame(frameRequest);
        }
        update();
      };
      video.onpause = () => {
        if (frameRequest) {
          cancelAnimationFrame(frameRequest);
          frameRequest = null;
        }
      };

      // Force a first-frame capture
      video.currentTime = 0;
      redrawCanvas();
      triggerSaveImmediate();
      pushHistory();
    };
    video.src = objectURL;
  }
}

// =================================================================
// === Board Title =================================================
// =================================================================
function adjustTitleInputWidth() {
  if (!boardTitleInput) {
    return;
  }
  let span = document.getElementById("title-width-tester");
  if (!span) {
    span = document.createElement("span");
    span.id = "title-width-tester";
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.whiteSpace = "pre";
    document.body.appendChild(span);
  }
  const styles = window.getComputedStyle(boardTitleInput);
  span.style.fontFamily = styles.fontFamily;
  span.style.fontSize = styles.fontSize;
  span.style.fontWeight = styles.fontWeight;
  
  span.textContent = boardTitleInput.value || boardTitleInput.placeholder || "";
  const textWidth = span.getBoundingClientRect().width;
  const padding = 24;
  boardTitleInput.style.width =
    Math.min(Math.max(textWidth + padding, 120), window.innerWidth * 0.8) +
    "px";
}

function initTitleInput() {
  if (!boardTitleInput) {
    return;
  }

  const { boardTitle } = getState();
  let displayTitle = boardTitle;
  if (boardTitle === "Untitled Board") {
    try {
      const translated = document.l10n.formatValuesSync([
        { id: "zen-board-untitled-board" },
      ]);
      if (translated && translated[0]) {
        displayTitle = translated[0];
      }
    } catch (e) {}
  }
  boardTitleInput.value = displayTitle;
  document.title = displayTitle;
  adjustTitleInputWidth();

  boardTitleInput.addEventListener("input", () => {
    adjustTitleInputWidth();
    const newTitle = boardTitleInput.value.trim() || "Untitled Board";
    setState({ boardTitle: newTitle });
    document.title = newTitle;

    // Force real-time tab label update for Firefox session restore
    try {
      const browserEl = window.docShell?.chromeEventHandler;
      const tab = browserEl?.ownerDocument?.defaultView?.gBrowser?.getTabForBrowser(browserEl);
      if (tab && newTitle) {
        tab.zenStaticLabel = newTitle;
      }
    } catch (e) {
      /* ignore */
    }

    // Instant commit prevents loss on quick close
    triggerSaveImmediate();
  });

  // Select all text on focus for quick rename
  boardTitleInput.addEventListener("focus", () => {
    boardTitleInput.select();
  });

  // Confirm on Enter/Escape
  boardTitleInput.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === "Escape") {
      boardTitleInput.blur();
    }
  });
}

// =================================================================
// === Initialization ==============================================
// =================================================================
async function initTheme() {
  try {
    const chromeWindow = window.docShell?.chromeEventHandler?.ownerDocument?.defaultView;
    if (!chromeWindow) {
      return;
    }

    const themePicker = chromeWindow.gZenThemePicker;
    const workspaces = chromeWindow.gZenWorkspaces;
    if (!themePicker || !workspaces) {
      return;
    }

    const activeWorkspace = await workspaces.getActiveWorkspace();
    if (!activeWorkspace) {
      return;
    }

    const { primaryColor } =
      themePicker.getGradientForWorkspace(activeWorkspace);
    if (primaryColor) {
      document.documentElement.style.setProperty(
        "--board-accent-color",
        primaryColor
      );
    }

    // Listen for theme or workspace changes and invalidate the accent color cache
    if (!window._zenThemeListenersAdded) {
      const onThemeChange = () => {
        invalidateAccentColorCache();
        initTheme();
      };
      chromeWindow.addEventListener("ZenGradientCacheChanged", onThemeChange);
      chromeWindow.addEventListener("ZenWorkspacesUIUpdate", onThemeChange);
      window.addEventListener(
        "pagehide",
        () => {
          chromeWindow.removeEventListener(
            "ZenGradientCacheChanged",
            onThemeChange
          );
          chromeWindow.removeEventListener(
            "ZenWorkspacesUIUpdate",
            onThemeChange
          );
        },
        { once: true }
      );
      window._zenThemeListenersAdded = true;
    }
  } catch (e) {
    console.error("ZenBoard: Failed to init theme", e);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await document.l10n.ready;
  } catch (e) {}
  await initTheme();
  initTools();
  resizeCanvas();

  // ── Load or create the board ──────────────────────────────────
  const classes = {
    Path,
    Rectangle,
    Ellipse,
    Text,
    ImageObject,
    VideoObject,
    CaptureObject,
    LiveEmbedObject,
  };
  let boardId = null;
  try {
    boardId = await ensureBoardId();
    setState({ boardId });

    try {
      const browserEl = window.docShell?.chromeEventHandler;
      if (browserEl) {
        browserEl.setAttribute("zen-board-id", boardId);
        browserEl.setAttribute("zen-board-tab", "true");
      }
      const tab =
        browserEl?.ownerDocument?.defaultView?.gBrowser?.getTabForBrowser(browserEl);
      if (tab) {
        tab.setAttribute("zen-board-id", boardId);
        tab.setAttribute("zen-board-tab", "true");
      }
    } catch (e) {
      /* ignore */
    }

    const saved = await loadBoard(boardId, classes);
    if (saved) {
      // Populate scene with hydrated objects
      scene.length = 0;
      saved.scene.forEach(obj => {
        scene.push(obj);
        if (obj.type === "live-embed") {
          ensureIframeInjected(obj);
        }
      });
      setState({ boardTitle: saved.title, isTransparent: saved.isTransparent });
      document.title = saved.title;

      try {
        const browserEl = window.docShell?.chromeEventHandler;
        const tab =
          browserEl?.ownerDocument?.defaultView?.gBrowser?.getTabForBrowser(browserEl);
        if (tab && saved.title) {
          tab.zenStaticLabel = saved.title;
        }
      } catch (e) {
        /* ignore */
      }

      applyTransparency(saved.isTransparent);

      const chromeWindow = window.docShell?.chromeEventHandler?.ownerDocument?.defaultView;
      const rememberZoomPan =
        chromeWindow?.Services?.prefs?.getBoolPref(
          "zen.board.remember-zoom-pan",
          true
        ) ?? true;
      if (rememberZoomPan && typeof saved.scale === "number") {
        setTransform(saved.scale, saved.offsetX ?? 0, saved.offsetY ?? 0);
      } else {
        setTransform(1, 0, 0);
      }
    } else {
      applyTransparency(true);
      setTransform(1, 0, 0);
    }
    pushHistory();
  } catch (e) {
    console.error("ZenBoard: Failed to init", e);
    applyTransparency(true);
  }

  // ── Self-heal browser transparency ────────────────────────────
  // When a board tab is duplicated, the new tab is created with `about:blank`
  // (no _forZenEmptyTab), so the <browser> element never gets transparent="true".
  // Since board.html is a chrome:// page, we have privileged access to set it
  // ourselves. This is a no-op for tabs that already have it set.
  try {
    const browserEl = window.docShell?.chromeEventHandler;
    if (browserEl) {
      browserEl.setAttribute("transparent", "true");
    }
  } catch (e) {
    // Non-critical — transparency gracefully falls back
  }

  initTitleInput();

  // ── Set up event listeners ───────────────────────────────────
  let resizeTicking = false;
  window.addEventListener("resize", () => {
    if (!resizeTicking) {
      window.requestAnimationFrame(() => {
        resizeCanvas();
        adjustTitleInputWidth();
        resizeTicking = false;
      });
      resizeTicking = true;
    }
  });

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseout", e => {
    const { currentTool } = getState();
    toolHandlers[currentTool].onMouseUp(e);
    // Note: deliberate omission of triggerSave() here to stop IDB save spam when just hovering out
  });
  canvas.addEventListener("dblclick", onDoubleClick);

  // Prevent any browser-induced layout scrolling (like focusing an offscreen input/textarea)
  window.addEventListener(
    "scroll",
    () => {
      window.scrollTo(0, 0);
    },
    { passive: true }
  );

  window.addEventListener(
    "wheel",
    e => {
      e.preventDefault();

      // If not currently animating, synchronize targets with the actual state
      const { scale, offsetX, offsetY } = getState();
      if (!isAnimatingWheel) {
        targetScale = scale;
        targetOffsetX = offsetX;
        targetOffsetY = offsetY;
      }

      // Normalize deltas for consistent panning speed across delta modes
      let dx = e.deltaX;
      let dy = e.deltaY;

      if (e.deltaMode === 1) {
        // DOM_DELTA_LINE
        dx *= 20; // 20px per line
        dy *= 20;
      } else if (e.deltaMode === 2) {
        // DOM_DELTA_PAGE
        dx *= 400; // 400px per page
        dy *= 400;
      }

      if (e.ctrlKey) {
        // Zoom centered at the cursor position
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Determine zoom factor: trackpads (deltaMode 0) send small pixel deltas; mouse wheels send raw/line deltas
        let zoomFactor = 0.003;
        if (e.deltaMode === 1) {
          // Lines
          zoomFactor = 0.015;
        } else if (e.deltaMode === 2) {
          // Pages
          zoomFactor = 0.1;
        }

        const oldTargetScale = targetScale;
        let newTargetScale = oldTargetScale * Math.exp(-e.deltaY * zoomFactor);
        newTargetScale = Math.max(0.1, Math.min(newTargetScale, 10));

        // Calculate where the offset needs to go to keep mouseX, mouseY fixed under the new scale
        targetOffsetX =
          mouseX - (mouseX - targetOffsetX) * (newTargetScale / oldTargetScale);
        targetOffsetY =
          mouseY - (mouseY - targetOffsetY) * (newTargetScale / oldTargetScale);
        targetScale = newTargetScale;
      } else {
        // Pan
        if (e.shiftKey && !dx) {
          dx = dy;
          dy = 0;
        }
        targetOffsetX -= dx;
        targetOffsetY -= dy;
      }

      startWheelAnimation();
    },
    { passive: false }
  );

  zoomInBtn.addEventListener("click", () => zoom(1));
  zoomOutBtn.addEventListener("click", () => zoom(-1));

  // Custom event fired by video objects initialized from storage
  window.addEventListener("ZenBoardVideoFrame", () => {
    redrawCanvas();
  });

  // Custom event fired by the board picker popup when a new capture is added to
  // this board while a tab is already open — reload the scene to pick it up.
  window.addEventListener("ZenBoardCaptureAdded", async e => {
    if (e.detail?.boardId !== getState().boardId) {
      return;
    }
    try {
      const saved = await loadBoard(getState().boardId, classes);
      if (saved) {
        scene.length = 0;
        saved.scene.forEach(obj => {
          scene.push(obj);
          if (obj.type === "live-embed") {
            ensureIframeInjected(obj);
          }
        });
        bumpSceneGeneration();
        pushHistory();
        redrawCanvas();
      }
    } catch (err) {
      console.error(
        "ZenBoard: Failed to reload scene after capture added",
        err
      );
    }
  });

  window.addEventListener("dragover", e => e.preventDefault());
  window.addEventListener("drop", e => {
    e.preventDefault();
    const { x, y } = getTransformedPoint(e.clientX, e.clientY);
    if (e.dataTransfer.files.length) {
      for (const file of e.dataTransfer.files) {
        handleFile(file, x, y);
      }
    }
  });

  window.addEventListener("paste", e => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const { x, y } = getTransformedPoint(
      window.innerWidth / 2,
      window.innerHeight / 2
    );
    for (const item of items) {
      if (item.kind === "file") {
        handleFile(item.getAsFile(), x, y);
      }
    }
  });

  window.addEventListener("keydown", e => {
    // Undo / Redo
    const key = e.key ? e.key.toLowerCase() : "";
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (key === "z") {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();

        // If we're currently editing text, finalize it first so that
        // the text box is actually in the scene before we undo.
        if (getState().editingTextObject) {
          deactivateTextEditor();
        }

        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (key === "y") {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
        redo();
        return;
      }
    }

    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      !getState().editingTextObject
    ) {
      const { selectedObjectId } = getState();
      if (selectedObjectId) {
        removeFromScene(selectedObjectId);
        setState({ selectedObjectId: null });
        hideVideoControls();
        hideCaptureControls();
        redrawCanvas();
        triggerSave();
        pushHistory();
      }
    }
  });

  // Text editor blur triggers a save
  document.getElementById("text-editor")?.addEventListener("blur", () => {
    triggerSave();
  });

  // ── Cleanup on tab close ─────────────────────────────────────
  window.addEventListener("pagehide", () => {
    revokeAllObjectURLs();
    // Destroy any live embed iframes to avoid memory leaks
    scene.forEach(obj => {
      if (typeof obj.destroy === "function") {
        obj.destroy();
      }
    });
    // Flush any pending save immediately
    clearTimeout(_saveTimer);
    const {
      boardId: id,
      boardTitle,
      isTransparent,
      scale,
      offsetX,
      offsetY,
    } = getState();
    if (id) {
      // Best-effort synchronous-ish save (sendBeacon not suitable for IDB,
      // but browser gives ~handful of seconds for pagehide handlers)
      saveBoard(id, boardTitle, isTransparent, scale, offsetX, offsetY, [
        ...scene,
      ]).catch(() => {});
    }
  });

  // Register restore snapshot handler
  registerOnRestore(restoredScene => {
    hideCaptureControls();
    restoredScene.forEach(obj => {
      if (obj.type === "live-embed") {
        ensureIframeInjected(obj);
      }
    });
  });

  // Initial setup
  selectTool("select");
  updateZoomDisplay();

  const zoomDisplay = document.getElementById("zoom-display");
  if (zoomDisplay) {
    zoomDisplay.addEventListener("click", () => {
      setTransform(1, 0, 0);
      redrawCanvas();
      updateZoomDisplay();
      notifyTransformChanged();
      triggerSave();
    });
  }

  // Mark the board as ready to trigger smooth fade-in transition.
  // This MUST happen synchronously at the end of init before any async
  // continuation (like the font preload below) so the CSS transition fires
  // immediately and the page is never visible at opacity:1 before ready.
  document.body.style.opacity = "";
  document.body.classList.add("ready");

  // Preload all custom fonts when the page loads so canvas text displays correctly.
  // This is intentionally AFTER ready — the canvas redraws cleanly when fonts
  // resolve, and the body is already fading in at this point.
  const fontsToPreload = [
    "24px 'Roboto'",
    "24px 'Archivo Black'",
    "24px 'Instrument Serif'",
    "24px 'Maple Mono'",
  ];
  Promise.all(fontsToPreload.map(f => document.fonts.load(f)))
    .then(() => {
      redrawCanvas();
    })
    .catch(e => {
      console.warn("ZenBoard: Some fonts failed to preload", e);
      redrawCanvas();
    });
});
