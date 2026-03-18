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
        cloned._assetHash = this._assetHash;
        cloned.visible = this.visible;
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
        const { selectedObjectId, scale } = getState();
        const isSelected = selectedObjectId === this.id;
        const baseBox = { x: this.x, y: this.y, width: this.width, height: this.height };

        // NOTE: The bounding box for selection logic (hit testing) should NOT include the controls
        // for the purpose of the blue selection border. 
        // BUT for hit testing clicks on the control bar, we handle that in the tool-handlers/select.js
        // by explicitly checking the control bar area there.
        // However, if we want the "select tool" to NOT deselect when clicking the controls, 
        // the interactions.js `findObjectAt` needs to know about this extended area.
        // 
        // To solve the "lag" and "double box" issue: 
        // We return the STRICT visual bounding box of the video here.
        // We rely on `select.js` to handle the "click on controls" logic separately from the generic hit test if needed,
        // OR we return an extended box but Render only the strict box.
        // 
        // In `canvas.js`, we use `getBoundingBox` to draw the blue border. 
        // So this MUST be the strict video box.
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
