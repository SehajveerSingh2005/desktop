/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { redrawCanvas, getTransformedPoint } from "./canvas.mjs";
import { getState, setState, triggerSaveImmediate } from "./state.mjs";
import { MAX_MEDIA_WIDTH } from "./constants.mjs";
import { addToScene, generateId } from "./scene.mjs";
import { ImageObject, VideoObject, wireVideoPlaybackEvents } from "./media.mjs";
import { selectTool } from "./ui.mjs";
import { pushHistory } from "./history.mjs";

function clampToMaxWidth(w, h) {
  if (w > MAX_MEDIA_WIDTH) {
    h = (MAX_MEDIA_WIDTH / w) * h;
    w = MAX_MEDIA_WIDTH;
  }
  return { w, h };
}

export function handleFile(file, x, y) {
  const id = generateId();
  if (file.type.startsWith("image/")) {
    const objectURL = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectURL);
      const { w, h } = clampToMaxWidth(img.width, img.height);
      const obj = new ImageObject(id, x - w / 2, y - h / 2, w, h, img);
      obj._blob = file;
      addToScene(obj);
      setState({ selectedObjectId: id });
      selectTool("select");
      redrawCanvas();
      triggerSaveImmediate();
      pushHistory();
    };
    img.onerror = () => URL.revokeObjectURL(objectURL);
    img.src = objectURL;
  } else if (file.type.startsWith("video/")) {
    const objectURL = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const { w, h } = clampToMaxWidth(video.videoWidth, video.videoHeight);
      const obj = new VideoObject(id, x - w / 2, y - h / 2, w, h, video);
      obj._blob = file;
      addToScene(obj);
      setState({ selectedObjectId: id });
      selectTool("select");
      obj.controlsYOffset = 10;
      wireVideoPlaybackEvents(video, redrawCanvas);
      video.currentTime = 0;
      redrawCanvas();
      triggerSaveImmediate();
      pushHistory();
    };
    video.src = objectURL;
  }
}

export function handleDrop(e) {
  e.preventDefault();
  const { x, y } = getTransformedPoint(e.clientX, e.clientY);
  for (const file of e.dataTransfer.files) {
    handleFile(file, x, y);
  }
}

export function handlePaste(e) {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  const { x, y } = getTransformedPoint(window.innerWidth / 2, window.innerHeight / 2);
  for (const item of items) {
    if (item.kind === "file") {
      handleFile(item.getAsFile(), x, y);
    }
  }
}
