/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getState, bumpSceneGeneration, triggerSave } from "./state.mjs";
import { redrawCanvas } from "./canvas.mjs";
import { pushHistory } from "./history.mjs";

function getL10nString(id, fallback) {
  try {
    const translated = document.l10n.formatValuesSync([{ id }]);
    if (translated?.[0]) {
      return translated[0];
    }
  } catch (e) {
    // Ignore and fallback
  }
  return fallback;
}

let overlayContainer = null;
let currentVideoObject = null;
let animationFrameId = null;

let isDraggingProgress = false;
let isDraggingVolume = false;
let _lastProgressUpdateTime = 0;

// Elements
let progressBar,
  progressFill,
  playBtn,
  volumeBtn,
  loopBtn,
  timeDisplay,
  volSlider,
  volFill;

function getIcon(iconName) {
  // Return inline SVG instead of img tags for better compatibility.
  // xmlns attribute is omitted because inline SVGs inside HTML5 documents do not require it,
  // and including it when setting innerHTML triggers "Removed unsafe attribute" Gecko warnings.
  let svg = "";
  if (iconName === "play") {
    svg =
      '<svg fill="white" width="20" height="20" viewBox="0 0 21 20"><path d="m 17.2778,8.30893 -10.54669,-5.84 c -0.61444,-0.34 -1.34,-0.33 -1.94333,0.02555 C 4.19,2.84671 3.83334,3.46893 3.83334,4.16004 V 15.84 c 0,0.6912 0.35666,1.3134 0.95444,1.6656 0.31,0.1822 0.65111,0.2744 0.99444,0.2744 0.32556,0 0.65112,-0.0833 0.94889,-0.2477 l 10.54559,-5.84 c 0.6177,-0.3411 1.0011,-0.99 1.0011,-1.6911 0,-0.70116 -0.3834,-1.35116 -1,-1.69227 z"/></svg>';
  } else if (iconName === "pause") {
    svg =
      '<svg fill="white" width="20" height="20" viewBox="0 0 21 20"><path d="M 7.16667,2.5 C 6.70833,2.5 6.33333,2.875 6.33333,3.33333 V 16.6667 C 6.33333,17.125 6.70833,17.5 7.16667,17.5 9.16667,17.5 9.16667,17.5 9.16667,17.5 9.625,17.5 10,17.125 10,16.6667 V 3.33333 C 10,2.875 9.625,2.5 9.16667,2.5 Z M 13.8333,2.5 c -0.4583,0 -0.8333,0.375 -0.8333,0.83333 V 16.6667 C 13,17.125 13.375,17.5 13.8333,17.5 h 2 c 0.4584,0 0.8334,-0.375 0.8334,-0.8333 V 3.33333 C 16.6667,2.875 16.2917,2.5 15.8333,2.5 Z"/></svg>';
  } else if (iconName === "volume-high") {
    svg =
      '<svg fill="white" width="20" height="20" viewBox="0 0 512 512"><path d="M 416,432 A 16,16 0 0 1 402.61,407.26 C 429.85,365.47 448,323.76 448,256 448,189.5 429.82,147.38 402.51,104.61 a 16.011936,16.011936 0 1 1 27,-17.22 c 30.3,47.5 50.49,94.35 50.49,168.61 0,64.75 -14.66,113.63 -50.6,168.74 A 16,16 0 0 1 416,432 Z M 368,384 A 16,16 0 0 1 354.14,360 C 373.05,327.09 384,299.51 384,256 384,211.83 373.07,184.44 354.18,152.06 a 16,16 0 0 1 27.64,-16.12 C 402.92,172.11 416,204.81 416,256 c 0,50.43 -13.06,83.29 -34.13,120 A 16,16 0 0 1 368,384 Z m -136,32 a 23.88,23.88 0 0 1 -14.2,-4.68 8.27,8.27 0 0 1 -0.66,-0.51 L 125.76,336 H 56 A 24,24 0 0 1 32,312 V 200 a 24,24 0 0 1 24,-24 h 69.75 l 91.37,-74.81 a 8.27,8.27 0 0 1 0.66,-0.51 A 24,24 0 0 1 256,120 v 272 a 24,24 0 0 1 -24,24 z M 320,336 a 16,16 0 0 1 -14.29,-23.19 c 9.49,-18.87 14.3,-38 14.3,-56.81 0,-19.38 -4.66,-37.94 -14.25,-56.73 a 16,16 0 0 1 28.5,-14.54 C 346.19,208.12 352,231.44 352,256 c 0,23.86 -6,47.81 -17.7,71.19 A 16,16 0 0 1 320,336 Z"/></svg>';
  } else if (iconName === "volume-mute") {
    svg =
      '<svg fill="white" width="20" height="20" viewBox="0 0 512 512"><path d="M 416,432 A 16,16 0 0 1 402.61,407.26 C 429.85,365.47 448,323.76 448,256 448,189.5 429.82,147.38 402.51,104.61 a 16.011936,16.011936 0 1 1 27,-17.22 c 30.3,47.5 50.49,94.35 50.49,168.61 0,64.75 -14.66,113.63 -50.6,168.74 A 16,16 0 0 1 416,432 Z M 368,384 A 16,16 0 0 1 354.14,360 C 373.05,327.09 384,299.51 384,256 384,211.83 373.07,184.44 354.18,152.06 a 16,16 0 0 1 27.64,-16.12 C 402.92,172.11 416,204.81 416,256 c 0,50.43 -13.06,83.29 -34.13,120 A 16,16 0 0 1 368,384 Z m -136,32 a 23.88,23.88 0 0 1 -14.2,-4.68 8.27,8.27 0 0 1 -0.66,-0.51 L 125.76,336 H 56 A 24,24 0 0 1 32,312 V 200 a 24,24 0 0 1 24,-24 h 69.75 l 91.37,-74.81 a 8.27,8.27 0 0 1 0.66,-0.51 A 24,24 0 0 1 256,120 v 272 a 24,24 0 0 1 -24,24 z M 320,336 a 16,16 0 0 1 -14.29,-23.19 c 9.49,-18.87 14.3,-38 14.3,-56.81 0,-19.38 -4.66,-37.94 -14.25,-56.73 a 16,16 0 0 1 28.5,-14.54 C 346.19,208.12 352,231.44 352,256 c 0,23.86 -6,47.81 -17.7,71.19 A 16,16 0 0 1 320,336 Z"/><line x1="100" y1="100" x2="412" y2="412" stroke="white" stroke-width="32" stroke-linecap="round"/></svg>';
  } else if (iconName === "loop") {
    svg =
      '<svg fill="white" width="20" height="20" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';
  }

  return svg;
}

function initDOM() {
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
  playBtn.title = getL10nString("zen-board-video-play-pause", "Play/Pause");
  // eslint-disable-next-line no-unsanitized/property
  playBtn.innerHTML = getIcon("play");

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
  volumeBtn.title = getL10nString("zen-board-video-volume", "Volume");
  // eslint-disable-next-line no-unsanitized/property
  volumeBtn.innerHTML = getIcon("volume-high");

  volumeContainer.appendChild(volSlider);
  volumeContainer.appendChild(volumeBtn);

  // Create loop button
  loopBtn = document.createElement("button");
  loopBtn.className = "video-btn";
  loopBtn.id = "vc-loop";
  loopBtn.title = getL10nString("zen-board-video-loop", "Loop");
  // eslint-disable-next-line no-unsanitized/property
  loopBtn.innerHTML = getIcon("loop");

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
  // eslint-disable-next-line no-unsanitized/property
  playBtn.innerHTML =
    obj && !obj.video.paused ? getIcon("pause") : getIcon("play");
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
  // eslint-disable-next-line no-unsanitized/property
  volumeBtn.innerHTML =
    obj.video.muted || obj.video.volume === 0
      ? getIcon("volume-mute")
      : getIcon("volume-high");
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

export function showVideoControls(videoObj) {
  if (!overlayContainer) {
    initDOM();
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
