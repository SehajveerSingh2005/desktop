/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getState, bumpSceneGeneration, triggerSave } from "./state.mjs";
import { redrawCanvas } from "./canvas.mjs";
import { pushHistory } from "./history.mjs";

async function getL10nString(id, fallback) {
  const [translated] = await document.l10n.formatValues([{ id }]);
  return translated || fallback;
}

let overlayContainer = null;
let currentVideoObject = null;
let animationFrameId = null;

let isDraggingProgress = false;
let isDraggingVolume = false;
let _lastProgressUpdateTime = 0;
let lastPlayState = null;

// Elements
let progressBar,
  progressFill,
  playBtn,
  volumeBtn,
  loopBtn,
  timeDisplay,
  volSlider,
  volFill;

const ICON_BASE = "chrome://browser/content/zen-board/icons/";

function toolIcon(name) {
  const span = document.createElement("span");
  span.className = "tool-icon";
  span.style.maskImage = `url('${ICON_BASE}${name}.svg')`;
  return span;
}

async function initDOM() {
  overlayContainer = document.getElementById("video-controls");
  if (!overlayContainer) {
    return;
  }

  // Clear existing content
  overlayContainer.innerHTML = "";

  // Create progress bar
  progressBar = document.createElement("div");
  progressBar.className = "video-progress-bar";
  progressFill = document.createElement("div");
  progressFill.className = "video-progress-fill";
  progressBar.appendChild(progressFill);

  // Create controls row
  const controlsRow = document.createElement("div");
  controlsRow.className = "video-controls-row";

  // Create play button
  playBtn = document.createElement("button");
  playBtn.className = "video-btn";
  playBtn.id = "vc-play";
  playBtn.title = await getL10nString("zen-board-video-play-pause", "Play/Pause");
  playBtn.appendChild(toolIcon("play"));

  // Create volume container
  const volumeContainer = document.createElement("div");
  volumeContainer.className = "video-volume-container";

  volSlider = document.createElement("div");
  volSlider.className = "video-volume-slider";
  volSlider.id = "vc-vol-slider";
  const volumeTrack = document.createElement("div");
  volumeTrack.className = "volume-track";
  volFill = document.createElement("div");
  volFill.className = "volume-fill";
  volumeTrack.appendChild(volFill);
  volSlider.appendChild(volumeTrack);

  volumeBtn = document.createElement("button");
  volumeBtn.className = "video-btn";
  volumeBtn.id = "vc-volume";
  volumeBtn.title = await getL10nString("zen-board-video-volume", "Volume");
  volumeBtn.appendChild(toolIcon("volume-high"));

  volumeContainer.appendChild(volSlider);
  volumeContainer.appendChild(volumeBtn);

  // Create loop button
  loopBtn = document.createElement("button");
  loopBtn.className = "video-btn";
  loopBtn.id = "vc-loop";
  loopBtn.title = await getL10nString("zen-board-video-loop", "Loop");
  loopBtn.appendChild(toolIcon("loop"));

  // Create time display
  timeDisplay = document.createElement("span");
  timeDisplay.className = "video-time";
  timeDisplay.textContent = "0:00 / 0:00";

  // Assemble controls row
  controlsRow.appendChild(playBtn);
  controlsRow.appendChild(volumeContainer);
  controlsRow.appendChild(loopBtn);
  controlsRow.appendChild(timeDisplay);

  // Assemble overlay
  overlayContainer.appendChild(progressBar);
  overlayContainer.appendChild(controlsRow);

  // Events
  if (playBtn) {
    playBtn.onclick = e => {
      e.stopPropagation(); // Prevent passing click to canvas
      const obj = getVideoObject();
      if (obj) {
        obj.togglePlay();
      }
      updatePlayIcon(obj);
    };
    // Also capture mousedown to prevent drag
    playBtn.onmousedown = e => e.stopPropagation();
  }

  if (loopBtn) {
    loopBtn.onclick = e => {
      e.stopPropagation();
      const obj = getVideoObject();
      if (obj) {
        obj.toggleLoop();
        loopBtn.classList.toggle("active", obj.video.loop);
        bumpSceneGeneration();
        triggerSave();
        pushHistory();
      }
    };
    loopBtn.onmousedown = e => e.stopPropagation();
  }

  if (volumeBtn && volSlider) {
    volumeBtn.onmouseenter = () => {
      volSlider.classList.add("visible");
    };

    volumeBtn.onclick = e => {
      e.stopPropagation();
      const obj = getVideoObject();
      if (obj) {
        obj.toggleMute();
        updateVolumeUI(obj);
        bumpSceneGeneration();
        triggerSave();
        pushHistory();
      }
    };

    // Prevent canvas interaction on slider
    volSlider.onmousedown = e => e.stopPropagation();
    volSlider.onclick = e => e.stopPropagation();
  }

  // Hide volume slider when mouse leaves the control area
  overlayContainer.onmouseleave = () => {
    if (volSlider && !isDraggingVolume) {
      volSlider.classList.remove("visible");
    }
  };

  // Prevent clicks on the overlay itself from deselecting?
  overlayContainer.onmousedown = e => e.stopPropagation();

  // Progress bar seeking with drag support
  if (progressBar) {
    const updateProgressFromMouse = e => {
      const obj = getVideoObject();
      if (obj && obj.video.duration) {
        const rect = progressBar.getBoundingClientRect();
        const pct = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width)
        );
        obj.video.currentTime = obj.video.duration * pct;
        updateProgress(obj, true);
        if (!obj.isPlaying) {
          redrawCanvas();
        }
      }
    };

    progressBar.onmousedown = e => {
      e.stopPropagation();
      isDraggingProgress = true;
      updateProgressFromMouse(e);
    };

    window.addEventListener("mousemove", e => {
      if (isDraggingProgress) {
        updateProgressFromMouse(e);
      }
    });

    window.addEventListener("mouseup", () => {
      isDraggingProgress = false;
    });
  }

  // Volume seeking with drag support
  if (volSlider) {
    const sliderTrack = volSlider.querySelector(".volume-track");
    if (sliderTrack) {
      const updateVolumeFromMouse = e => {
        const obj = getVideoObject();
        if (obj) {
          const rect = sliderTrack.getBoundingClientRect();
          if (rect.height === 0) {
            return;
          } // Prevent division by zero or jumps if hidden
          const pct = 1 - (e.clientY - rect.top) / rect.height;
          const vol = Math.max(0, Math.min(1, pct));
          obj.setVolume(vol);
          updateVolumeUI(obj);
        }
      };

      sliderTrack.onmousedown = e => {
        e.stopPropagation();
        isDraggingVolume = true;
        updateVolumeFromMouse(e);
      };

      window.addEventListener("mousemove", e => {
        if (isDraggingVolume) {
          updateVolumeFromMouse(e);
        }
      });

      window.addEventListener("mouseup", e => {
        if (isDraggingVolume) {
          isDraggingVolume = false;
          bumpSceneGeneration();
          triggerSave();
          pushHistory();
          // Hide slider if mouse is already outside
          const rect = overlayContainer.getBoundingClientRect();
          const isInside =
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom;
          if (!isInside && volSlider) {
            volSlider.classList.remove("visible");
          }
        }
      });
    }
  }
}

function getVideoObject() {
  return currentVideoObject;
}

function updatePlayIcon(obj) {
  if (!playBtn) {
    return;
  }
  const isPaused = obj ? obj.video.paused : true;
  if (lastPlayState === isPaused) {
    return;
  }
  lastPlayState = isPaused;
  playBtn.replaceChildren(
    toolIcon(isPaused ? "play" : "pause")
  );
}

function updateProgress(obj, force = false) {
  if (!obj || !obj.video) {
    return;
  }
  const now = Date.now();
  if (!force && now - _lastProgressUpdateTime < 250) {
    return;
  }
  _lastProgressUpdateTime = now;

  const dur = obj.video.duration || 0;
  const cur = obj.video.currentTime || 0;
  const pct = dur > 0 ? (cur / dur) * 100 : 0;
  if (progressFill) {
    progressFill.style.width = `${pct}%`;
  }

  const fmt = t => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  };
  if (timeDisplay) {
    timeDisplay.textContent = `${fmt(cur)} / ${fmt(dur)}`;
  }
}

function updateVolumeUI(obj) {
  if (!volFill || !obj || !volumeBtn) {
    return;
  }
  volFill.style.height = `${obj.video.volume * 100}%`;
  volumeBtn.replaceChildren(
    toolIcon(obj.video.muted || obj.video.volume === 0 ? "volume-mute" : "volume-high")
  );
}

function startProgressLoop() {
  // Only run while the video is actively playing
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  const tick = () => {
    const obj = getVideoObject();
    if (!obj || !obj.video || obj.video.paused || obj.video.ended) {
      animationFrameId = null;
      return;
    }
    updateProgress(obj);
    updatePlayIcon(obj);
    animationFrameId = requestAnimationFrame(tick);
  };
  animationFrameId = requestAnimationFrame(tick);
}

export async function showVideoControls(videoObj) {
  if (!overlayContainer) {
    await initDOM();
  }
  if (!overlayContainer) {
    return;
  }

  // Detach previous video's listeners if switching objects
  if (currentVideoObject && currentVideoObject !== videoObj) {
    currentVideoObject.video.removeEventListener("play", startProgressLoop);
    currentVideoObject.video.removeEventListener("pause", _onVideoPause);
    currentVideoObject.video.removeEventListener("ended", _onVideoPause);
    currentVideoObject.video.removeEventListener("seeked", _onVideoSeeked);
  }

  currentVideoObject = videoObj;
  lastPlayState = null;

  // Init state
  updatePlayIcon(videoObj);
  if (loopBtn) {
    loopBtn.classList.toggle("active", videoObj.video.loop);
  }
  updateVolumeUI(videoObj);
  updateProgress(videoObj, true);

  overlayContainer.style.display = "flex";
  overlayContainer.classList.remove("fade-out");

  updateVideoControlsPosition();

  // Start progress loop only if already playing
  if (!videoObj.video.paused) {
    startProgressLoop();
  }

  // Hook video events so the loop starts/stops automatically
  videoObj.video.addEventListener("play", startProgressLoop);
  videoObj.video.addEventListener("pause", _onVideoPause);
  videoObj.video.addEventListener("ended", _onVideoPause);
  videoObj.video.addEventListener("seeked", _onVideoSeeked);
}

function _onVideoPause() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  // Sync UI to final paused state
  const obj = getVideoObject();
  if (obj) {
    updateProgress(obj, true);
    updatePlayIcon(obj);
  }
}

function _onVideoSeeked() {
  const obj = getVideoObject();
  if (obj) {
    updateProgress(obj, true);
    updatePlayIcon(obj);
  }
}

export function hideVideoControls() {
  if (overlayContainer) {
    overlayContainer.style.display = "none";
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }
  if (currentVideoObject) {
    currentVideoObject.video.removeEventListener("play", startProgressLoop);
    currentVideoObject.video.removeEventListener("pause", _onVideoPause);
    currentVideoObject.video.removeEventListener("ended", _onVideoPause);
    currentVideoObject.video.removeEventListener("seeked", _onVideoSeeked);
    currentVideoObject = null;
  }
}

export function updateVideoControlsPosition() {
  if (!currentVideoObject || !overlayContainer) {
    return;
  }

  const { scale, offsetX, offsetY, isDraggingObject } = getState();
  const obj = currentVideoObject;

  // Determine visual position calculation
  const sX = obj.x * scale + offsetX;
  const sY = obj.y * scale + offsetY;
  const screenW = obj.width * scale;
  const screenH = obj.height * scale;

  const pad = 10;

  let targetTop = sY + screenH + pad;
  let targetLeft = sX;
  const width = screenW;

  const targetOpacity = isDraggingObject ? "0" : "1";
  if (overlayContainer.style.opacity !== targetOpacity) {
    overlayContainer.style.opacity = targetOpacity;
  }

  const targetPointerEvents = isDraggingObject ? "none" : "auto";
  if (overlayContainer.style.pointerEvents !== targetPointerEvents) {
    overlayContainer.style.pointerEvents = targetPointerEvents;
  }

  const targetTransform = `translate(${targetLeft}px, ${targetTop}px)`;
  if (overlayContainer.style.transform !== targetTransform) {
    overlayContainer.style.transform = targetTransform;
  }

  const targetWidth = `${width}px`;
  if (overlayContainer.style.width !== targetWidth) {
    overlayContainer.style.width = targetWidth;
  }
}
