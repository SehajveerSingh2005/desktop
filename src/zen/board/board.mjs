/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { canvas, resizeCanvas, redrawCanvas, setTransform, getTransformedPoint } from "./modules/canvas.mjs";
import { toolHandlers } from "./modules/tools.mjs";
import { getState, setState, bumpSceneGeneration, getSceneGeneration, triggerSave, triggerSaveImmediate } from "./modules/state.mjs";
import { initTools, selectTool, updateZoomDisplay, activateTextEditor, deactivateTextEditor } from "./modules/ui.mjs";
import { findObjectAt } from "./modules/interactions.mjs";
// Text shadows global Text — kept as-is since renaming would touch every file.
/* eslint-disable no-shadow */
import { scene, removeFromScene, replaceScene, Text } from "./modules/scene.mjs";
/* eslint-enable no-shadow */
import { ensureBoardId, loadBoard, revokeAllObjectURLs } from "./modules/storage.mjs";
import { pushHistory, undo, redo, registerOnRestore } from "./modules/history.mjs";
import { hideVideoControls } from "./modules/video-controls.mjs";
import { hideCaptureControls, ensureIframeInjected } from "./modules/capture-controls.mjs";
import { stopWheelAnimation, zoom, handleWheel } from "./modules/viewport.mjs";
import { handleFile, handleDrop, handlePaste } from "./modules/file-handling.mjs";
import { initTitleInput, adjustTitleInputWidth } from "./modules/title.mjs";
import { applyTransparency, initTheme } from "./modules/theme.mjs";

// Expose to chrome process for cross-process state access.
window.getState = getState;
window.getTransformedPoint = getTransformedPoint;

// Scene classes map for deserialization.
const SCENE_CLASSES_PATH = "./modules/scene.mjs";
const MEDIA_CLASSES_PATH = "./modules/media.mjs";

let _sceneClasses = null;
async function getSceneClasses() {
  if (!_sceneClasses) {
    const scene = await import(SCENE_CLASSES_PATH);
    const media = await import(MEDIA_CLASSES_PATH);
    _sceneClasses = {
      Path: scene.Path, Rectangle: scene.Rectangle, Ellipse: scene.Ellipse, Text: scene.Text,
      ImageObject: media.ImageObject, VideoObject: media.VideoObject,
      CaptureObject: media.CaptureObject, LiveEmbedObject: media.LiveEmbedObject,
    };
  }
  return _sceneClasses;
}

let _lastMouseUpGeneration = -1;

function getTabForBoard() {
  const browserEl = window.docShell?.chromeEventHandler;
  return browserEl?.ownerDocument?.defaultView?.gBrowser?.getTabForBrowser(browserEl);
}

function setBoardAttributes(boardId) {
  const browserEl = window.docShell?.chromeEventHandler;
  if (browserEl) {
    browserEl.setAttribute("zen-board-id", boardId);
    browserEl.setAttribute("zen-board-tab", "true");
  }
  const tab = getTabForBoard();
  if (tab) {
    tab.setAttribute("zen-board-id", boardId);
    tab.setAttribute("zen-board-tab", "true");
  }
}

async function loadSavedBoard(boardId, classes) {
  const saved = await loadBoard(boardId, classes);
  if (saved) {
    const liveEmbeds = saved.scene.filter(obj => obj.type === "live-embed");
    replaceScene(saved.scene);
    liveEmbeds.forEach(obj => ensureIframeInjected(obj));
    let displayTitle = saved.title;
    if (saved.title === "Untitled Board") {
      try {
        const translated = document.l10n.formatValuesSync([
          { id: "zen-board-untitled-board" },
        ]);
        if (translated?.[0]) {
          displayTitle = translated[0];
        }
      } catch {
        displayTitle = saved.title;
      }
    }
    setState({ boardTitle: saved.title, isTransparent: saved.isTransparent });
    document.title = displayTitle;

    try {
      const tab = getTabForBoard();
      if (tab) {
        tab.zenStaticLabel = displayTitle;
      }
    } catch (e) {
      console.warn("ZenBoard: Failed to set tab label:", e);
    }

    applyTransparency(saved.isTransparent);

    const chromeWindow = window.docShell?.chromeEventHandler?.ownerDocument?.defaultView;
    const rememberZoomPan =
      chromeWindow?.Services?.prefs?.getBoolPref("zen.board.remember-zoom-pan", true) ?? true;
    if (rememberZoomPan && typeof saved.scale === "number") {
      setTransform(saved.scale, saved.offsetX ?? 0, saved.offsetY ?? 0);
    } else {
      setTransform(1, 0, 0);
    }
  } else {
    applyTransparency(true);
    setTransform(1, 0, 0);
  }
}

// ── Canvas event handlers ───────────────────────────────────────────────────

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
  const { currentTool } = getState();
  toolHandlers[currentTool].onMouseUp(e);
  triggerSave();

  const sceneModified =
    currentTool !== "select" || getSceneGeneration() !== _lastMouseUpGeneration;
  if (sceneModified) {
    bumpSceneGeneration();
    pushHistory();
  }
  _lastMouseUpGeneration = getSceneGeneration();
}

function onDoubleClick(e) {
  const { x, y } = getTransformedPoint(e.offsetX, e.offsetY);
  const hitObject = findObjectAt(x, y);
  if (hitObject && hitObject instanceof Text) {
    activateTextEditor(hitObject.x, hitObject.y, hitObject);
    setState({ selectedObjectId: hitObject.id });
    selectTool("select");
  }
}

// ── Main init ───────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await document.l10n.ready;
  } catch (e) {
    // l10n subsystem unavailable — continue with English fallbacks
  }
  await initTheme();
  initTools();
  resizeCanvas();

  const classes = await getSceneClasses();

  let boardId = null;
  try {
    boardId = await ensureBoardId();
    setState({ boardId });
    setBoardAttributes(boardId);
    await loadSavedBoard(boardId, classes);
    pushHistory();
  } catch (e) {
    console.error("ZenBoard: Failed to init", e);
    applyTransparency(true);
  }

  // Self-heal transparency for duplicated tabs
  const browserEl = window.docShell?.chromeEventHandler;
  if (browserEl) {
    browserEl.setAttribute("transparent", "true");
  }

  initTitleInput();

  // ── Event listeners ─────────────────────────────────────────
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
  });
  canvas.addEventListener("dblclick", onDoubleClick);

  window.addEventListener("scroll", () => window.scrollTo(0, 0), { passive: true });
  window.addEventListener("wheel", handleWheel, { passive: false });

  const zoomInBtn = document.getElementById("zoom-in-btn");
  const zoomOutBtn = document.getElementById("zoom-out-btn");
  zoomInBtn.addEventListener("click", () => zoom(1));
  zoomOutBtn.addEventListener("click", () => zoom(-1));


  window.addEventListener("ZenBoardCaptureAdded", async e => {
    if (e.detail?.boardId !== getState().boardId) {
      return;
    }
    try {
      const saved = await loadBoard(getState().boardId, classes);
      if (saved) {
        const liveEmbeds = saved.scene.filter(obj => obj.type === "live-embed");
        replaceScene(saved.scene);
        liveEmbeds.forEach(obj => ensureIframeInjected(obj));
        pushHistory();
        redrawCanvas();
      }
    } catch (err) {
      console.error("ZenBoard: Failed to reload scene after capture added", err);
    }
  });

  window.addEventListener("dragover", e => e.preventDefault());
  window.addEventListener("drop", handleDrop);
  window.addEventListener("paste", handlePaste);

  window.addEventListener("keydown", e => {
    const key = e.key ? e.key.toLowerCase() : "";
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (key === "z") {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
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

    if ((e.key === "Delete" || e.key === "Backspace") && !getState().editingTextObject) {
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

  document.getElementById("text-editor")?.addEventListener("blur", () => triggerSave());

  window.addEventListener("pagehide", () => {
    revokeAllObjectURLs();
    scene.forEach(obj => {
      if (typeof obj.destroy === "function") {
        obj.destroy();
      }
    });
    if (getState().boardId) {
      triggerSaveImmediate();
    }
  });

  registerOnRestore(restoredScene => {
    hideCaptureControls();
    restoredScene.forEach(obj => {
      if (obj.type === "live-embed") {
        ensureIframeInjected(obj);
      }
    });
  });

  selectTool("select");
  updateZoomDisplay();

  const zoomDisplay = document.getElementById("zoom-display");
  if (zoomDisplay) {
    zoomDisplay.addEventListener("click", () => {
      setTransform(1, 0, 0);
      redrawCanvas();
      updateZoomDisplay();
      triggerSave();
    });
  }

  document.body.style.opacity = "";
  document.body.classList.add("ready");

  const fontsToPreload = [
    "24px 'Roboto'",
    "24px 'Archivo Black'",
    "24px 'Instrument Serif'",
    "24px 'Maple Mono'",
  ];
  Promise.all(fontsToPreload.map(f => document.fonts.load(f)))
    .then(() => redrawCanvas())
    .catch(e => {
      console.warn("ZenBoard: Some fonts failed to preload", e);
      redrawCanvas();
    });
});
