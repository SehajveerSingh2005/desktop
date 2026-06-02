// modules/media.js
import { DrawingObject } from './scene.js';
import { getState } from './state.js';

export class ImageObject extends DrawingObject {
    constructor(id, x, y, width, height, imageElement) {
        super(id, 'image', x, y);
        this.width = width;
        this.height = height;
        this.image = imageElement;
        this.aspectRatio = width / height;
    }

    getBoundingBox() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }

    resize(handle, mouseX, mouseY, anchorX, anchorY) {
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

    getBoundingBox() {
        const baseBox = { x: this.x, y: this.y, width: this.width, height: this.height };
        return baseBox;
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
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.video.muted = this.isMuted;
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

    getBoundingBox() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }

    /**
     * Returns the screen-space rect of the bottom toolbar for hit-testing.
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

    getBoundingBox() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
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
        this.x += dx;
        this.y += dy;
        this._syncIframePosition();
    }

    _syncIframePosition(scale, offsetX, offsetY) {
        if (!this._wrapperEl || !this._iframeEl) return;
        if (scale === undefined) return;

        const left = this.x * scale + offsetX;
        const top = this.y * scale + offsetY;

        // The wrapper handles position, canvas-scale zooming, and the crop bounding box (overflow: hidden).
        this._wrapperEl.style.width = `${this.width}px`;
        this._wrapperEl.style.height = `${this.height}px`;
        this._wrapperEl.style.transformOrigin = '0 0';
        this._wrapperEl.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
        this._wrapperEl.style.left = `0px`;
        this._wrapperEl.style.top = `0px`;
        this._wrapperEl.style.overflow = 'hidden';

        // Restoring original layout viewport width.
        // Fallback to a standard desktop width (1280px) if not provided.
        const viewportW = Math.max(800, this.sourceRegion?.viewportWidth || 1280);

        // Ensure scroll offsets are positive.
        const scrollX = Math.max(0, this.sourceRegion?.left || 0);
        const scrollY = Math.max(0, this.sourceRegion?.top || 0);

        const origW = this.sourceRegion?.width || this.width;
        const origH = this.sourceRegion?.height || this.height;

        // Scale factor to map the original capture size to the resized size
        const s_content = this.width / origW;

        // The browser element's height is set large enough to contain the captured area.
        const iframeH = Math.max(1000, scrollY + origH + 500);

        // Position the browser element inside the overflow:hidden wrapper.
        // It is sized to viewportW wide, so the page renders at its original layout width.
        this._iframeEl.style.width = `${viewportW}px`;
        this._iframeEl.style.height = `${iframeH}px`;
        
        // Shift it negatively and scale it to fit the current object bounds.
        this._iframeEl.style.transformOrigin = '0 0';
        this._iframeEl.style.transform = `scale(${s_content}) translate(${-scrollX}px, ${-scrollY}px)`;
        this._iframeEl.style.left = `0px`;
        this._iframeEl.style.top = `0px`;
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
