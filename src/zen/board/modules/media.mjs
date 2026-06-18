/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { DrawingObject } from './scene.mjs';
import { getState } from './state.mjs';

export class ImageObject extends DrawingObject {
    constructor(id, x, y, width, height, imageElement) {
        super(id, 'image', x, y);
        this.width = width;
        this.height = height;
        this.image = imageElement;
        this.aspectRatio = width / height;
    }


    resize(handle, mouseX, mouseY, anchorX, anchorY) {
        super.resize(handle, mouseX, mouseY, anchorX, anchorY);
        const newWidth = Math.abs(mouseX - anchorX);
        const newHeight = Math.abs(mouseY - anchorY);

        let finalWidth = newWidth;
        let finalHeight = newWidth / this.aspectRatio;

        if (newHeight * this.aspectRatio > newWidth) {
            finalHeight = newHeight;
            finalWidth = newHeight * this.aspectRatio;
        }

        this.width = Math.max(20, finalWidth);
        this.height = Math.max(20, finalHeight);

        // Position based on handle to simulate non-flipping resize
        if (handle === 'nw' || handle === 'sw') this.x = anchorX - this.width;
        else this.x = anchorX;

        if (handle === 'nw' || handle === 'ne') this.y = anchorY - this.height;
        else this.y = anchorY;
    }

    clone() {
        const cloned = new ImageObject(this.id, this.x, this.y, this.width, this.height, this.image);
        cloned._blob = this._blob;
        cloned.sourceRegion = this.sourceRegion;
        cloned._assetFile = this._assetFile;
        cloned._assetHash = this._assetHash;
        return cloned;
    }
}

export class VideoObject extends DrawingObject {
    constructor(id, x, y, width, height, videoElement) {
        super(id, 'video', x, y);
        this.width = width;
        this.height = height;
        this.video = videoElement;
        this.aspectRatio = width / height;
        this.isPlaying = false;
        this.isMuted = true;
        this.volume = 0.5;
        this.isLooping = true;

        this.video.muted = this.isMuted;
        this.video.volume = this.volume;
        this.video.loop = this.isLooping;
        this.video.autoplay = false;

        // UI State for animations and controls
        this.controlsYOffset = 10;
        this.controlsOpacity = 0;
        this.showVolumeSlider = false;
    }


    // Helper for hit-testing controls specifically
    getControlsBox() {
        const { scale } = getState();
        const s = scale || 1;
        const controlHeight = 40 / s;
        const currentOffset = this.controlsYOffset || 0;
        const rectX = this.x;
        const rectY = this.y + this.height + currentOffset;
        const rectW = Math.max(200 / s, this.width);
        const rectH = controlHeight;
        return { x: rectX, y: rectY, width: rectW, height: rectH };
    }

    resize(handle, mouseX, mouseY, anchorX, anchorY) {
        super.resize(handle, mouseX, mouseY, anchorX, anchorY);
        const newWidth = Math.abs(mouseX - anchorX);
        const newHeight = Math.abs(mouseY - anchorY);

        let finalWidth = newWidth;
        let finalHeight = newWidth / this.aspectRatio;

        // Dominant axis calculation
        if (newHeight * this.aspectRatio > newWidth) {
            finalHeight = newHeight;
            finalWidth = newHeight * this.aspectRatio;
        }

        this.width = Math.max(20, finalWidth);
        this.height = Math.max(20, finalHeight);

        // Position adjustment to prevent flipping and keep anchor stable
        if (handle === 'nw' || handle === 'sw') this.x = anchorX - this.width;
        else this.x = anchorX;

        if (handle === 'nw' || handle === 'ne') this.y = anchorY - this.height;
        else this.y = anchorY;
    }

    togglePlay() {
        if (this.video.paused) {
            this.video.play();
            this.isPlaying = true;
        } else {
            this.video.pause();
            this.isPlaying = false;
        }
        this._serializedCache = null;
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.video.muted = this.isMuted;
        this._serializedCache = null;
        return this.isMuted;
    }

    setVolume(val) {
        this.volume = val;
        this.video.volume = val;
        // Auto-unmute if user specifically sets volume
        if (val > 0 && this.isMuted) {
            this.toggleMute();
        } else if (val === 0 && !this.isMuted) {
            this.toggleMute();
        }
        this._serializedCache = null;
    }

    clone() {
        const cloned = new VideoObject(this.id, this.x, this.y, this.width, this.height, this.video);
        cloned._blob = this._blob;
        cloned._assetFile = this._assetFile;
        cloned._assetHash = this._assetHash;
        cloned.isPlaying = this.isPlaying;
        cloned.isMuted = this.isMuted;
        cloned.volume = this.volume;
        cloned.isLooping = this.isLooping;
        cloned.controlsYOffset = this.controlsYOffset;
        cloned.controlsOpacity = this.controlsOpacity;
        cloned.showVolumeSlider = this.showVolumeSlider;
        cloned.visible = this.visible;
        return cloned;
    }
}

// ── CaptureObject ────────────────────────────────────────────────────────────
// A static screenshot of a webpage or region.
export class CaptureObject extends DrawingObject {
    constructor(id, x, y, width, height, imageElement, sourceUrl) {
        super(id, 'capture', x, y);
        this.width = width;
        this.height = height;
        this.image = imageElement;
        this.sourceUrl = sourceUrl || '';
        this.aspectRatio = width / height;
        // Asset hash, set after IDB storage (mirrors ImageObject)
        this._assetHash = null;
    }


    /**
     * Returns the screen-space rect of the bottom toolbar for hit-testing.
     * @param {number} scale The scale of the board.
     */
    getToolbarBox(scale) {
        const s = scale || 1;
        const barHeight = 40 / s;
        const pad = 8 / s;
        return {
            x: this.x,
            y: this.y + this.height + pad,
            width: Math.max(200 / s, this.width),
            height: barHeight,
        };
    }

    resize(handle, mouseX, mouseY, anchorX, anchorY) {
        super.resize(handle, mouseX, mouseY, anchorX, anchorY);
        const newWidth = Math.abs(mouseX - anchorX);
        const newHeight = Math.abs(mouseY - anchorY);

        let finalWidth = newWidth;
        let finalHeight = newWidth / this.aspectRatio;

        if (newHeight * this.aspectRatio > newWidth) {
            finalHeight = newHeight;
            finalWidth = newHeight * this.aspectRatio;
        }

        this.width = Math.max(20, finalWidth);
        this.height = Math.max(20, finalHeight);

        if (handle === 'nw' || handle === 'sw') this.x = anchorX - this.width;
        else this.x = anchorX;

        if (handle === 'nw' || handle === 'ne') this.y = anchorY - this.height;
        else this.y = anchorY;
    }

    clone() {
        const cloned = new CaptureObject(this.id, this.x, this.y, this.width, this.height, this.image, this.sourceUrl);
        cloned._blob = this._blob;
        cloned.sourceRegion = this.sourceRegion;
        cloned._assetFile = this._assetFile;
        cloned._assetHash = this._assetHash;
        cloned.visible = this.visible;
        return cloned;
    }
}

// ── LiveEmbedObject ──────────────────────────────────────────────────────────
export class LiveEmbedObject extends DrawingObject {
    constructor(id, x, y, width, height, sourceUrl) {
        super(id, 'live-embed', x, y);
        this.width = width;
        this.height = height;
        this.sourceUrl = sourceUrl || '';
        this.aspectRatio = width / height;
        // The actual iframe element — created lazily by capture-controls.js
        this._iframeEl = null;
        this._wrapperEl = null;
        this._assetHash = null;
    }


    getToolbarBox(scale) {
        const s = scale || 1;
        const barHeight = 40 / s;
        const pad = 8 / s;
        return {
            x: this.x,
            y: this.y + this.height + pad,
            width: Math.max(200 / s, this.width),
            height: barHeight,
        };
    }

    resize(handle, mouseX, mouseY, anchorX, anchorY) {
        super.resize(handle, mouseX, mouseY, anchorX, anchorY);
        const newWidth = Math.abs(mouseX - anchorX);
        const newHeight = Math.abs(mouseY - anchorY);

        let finalWidth = newWidth;
        let finalHeight = newWidth / this.aspectRatio;

        if (newHeight * this.aspectRatio > newWidth) {
            finalHeight = newHeight;
            finalWidth = newHeight * this.aspectRatio;
        }

        this.width = Math.max(20, finalWidth);
        this.height = Math.max(20, finalHeight);

        if (handle === 'nw' || handle === 'sw') this.x = anchorX - this.width;
        else this.x = anchorX;

        if (handle === 'nw' || handle === 'ne') this.y = anchorY - this.height;
        else this.y = anchorY;

        this._syncIframePosition();
    }

    move(dx, dy) {
        super.move(dx, dy);
        this._syncIframePosition();
    }

    _syncIframePosition(scale, offsetX, offsetY) {
        if (!this._wrapperEl || !this._iframeEl) return;
        if (scale === undefined) {
            const state = typeof getState === 'function' ? getState() : null;
            if (!state) return;
            scale = state.scale;
            offsetX = state.offsetX;
            offsetY = state.offsetY;
        }

        const left = this.x * scale + offsetX;
        const topOffset = this.y * scale + offsetY;

        // Cache layout properties so we don't trigger reflows by rewriting the same width/height
        const targetWrapperW = `${this.width}px`;
        const targetWrapperH = `${this.height}px`;
        const targetWrapperTransform = `translate(${left}px, ${topOffset}px) scale(${scale})`;

        if (this._wrapperEl.style.width !== targetWrapperW) {
            this._wrapperEl.style.width = targetWrapperW;
        }
        if (this._wrapperEl.style.height !== targetWrapperH) {
            this._wrapperEl.style.height = targetWrapperH;
        }
        if (this._wrapperEl.style.transformOrigin !== '0 0') {
            this._wrapperEl.style.transformOrigin = '0 0';
        }
        if (this._wrapperEl.style.transform !== targetWrapperTransform) {
            this._wrapperEl.style.transform = targetWrapperTransform;
        }
        if (this._wrapperEl.style.left !== '0px') {
            this._wrapperEl.style.left = '0px';
        }
        if (this._wrapperEl.style.top !== '0px') {
            this._wrapperEl.style.top = '0px';
        }
        if (this._wrapperEl.style.overflow !== 'hidden') {
            this._wrapperEl.style.overflow = 'hidden';
        }

        // Restoring original layout viewport width.
        // Fallback to a standard desktop width (1280px) if not provided.
        const viewportW = Math.max(800, this.sourceRegion?.viewportWidth || 1280);

        // Ensure scroll offsets are positive.
        const sX = Math.max(0, this.sourceRegion?.left || 0);
        const sY = Math.max(0, this.sourceRegion?.top || 0);

        const origW = this.sourceRegion?.width || this.width;
        const origH = this.sourceRegion?.height || this.height;

        // Scale factor to map the original capture size to the resized size
        const s_content = this.width / origW;

        // The browser element's height is set large enough to contain the captured area.
        const iframeH = Math.max(1000, sY + origH + 500);

        // Position the browser element inside the overflow:hidden wrapper.
        // It is sized to viewportW wide, so the page renders at its original layout width.
        const targetIframeW = `${viewportW}px`;
        const targetIframeH = `${iframeH}px`;
        const targetIframeTransform = `scale(${s_content}) translate(${-sX}px, ${-sY}px)`;

        if (this._iframeEl.style.width !== targetIframeW) {
            this._iframeEl.style.width = targetIframeW;
        }
        if (this._iframeEl.style.height !== targetIframeH) {
            this._iframeEl.style.height = targetIframeH;
        }
        if (this._iframeEl.style.transformOrigin !== '0 0') {
            this._iframeEl.style.transformOrigin = '0 0';
        }
        if (this._iframeEl.style.transform !== targetIframeTransform) {
            this._iframeEl.style.transform = targetIframeTransform;
        }
        if (this._iframeEl.style.left !== '0px') {
            this._iframeEl.style.left = '0px';
        }
        if (this._iframeEl.style.top !== '0px') {
            this._iframeEl.style.top = '0px';
        }
    }



    destroy() {
        if (this._iframeEl) {
            this._iframeEl.remove();
            this._iframeEl = null;
        }
        if (this._wrapperEl) {
            this._wrapperEl.remove();
            this._wrapperEl = null;
        }
    }

    clone() {
        const cloned = new LiveEmbedObject(this.id, this.x, this.y, this.width, this.height, this.sourceUrl);
        cloned.sourceRegion = this.sourceRegion;
        cloned._assetFile = this._assetFile;
        cloned._assetHash = this._assetHash;
        cloned.visible = this.visible;
        return cloned;
    }
}
