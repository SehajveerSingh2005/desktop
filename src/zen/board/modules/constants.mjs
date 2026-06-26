/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Named constants for Zen Board — eliminates magic numbers across modules.

// ── Zoom ────────────────────────────────────────────────────────────────────
export const ZOOM_STEP = 1.1;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 10;
export const ZOOM_LERP_FACTOR = 0.15;
export const ZOOM_CONVERGENCE_SCALE = 0.001;
export const ZOOM_CONVERGENCE_OFFSET = 0.05;

// ── Wheel input normalization ───────────────────────────────────────────────
export const WHEEL_LINE_TO_PX = 20;
export const WHEEL_PAGE_TO_PX = 400;
export const ZOOM_SENSITIVITY_PIXEL = 0.003;
export const ZOOM_SENSITIVITY_LINE = 0.015;
export const ZOOM_SENSITIVITY_PAGE = 0.1;

// ── Media ───────────────────────────────────────────────────────────────────
export const MAX_MEDIA_WIDTH = 400;

// ── Selection & resize handles ──────────────────────────────────────────────
export const HANDLE_HIT_SIZE = 12;
export const SELECTION_STROKE_WIDTH = 2;
export const SELECTION_CORNER_RADIUS = 8;
export const HANDLE_VISUAL_RADIUS = 6;
export const TEXT_SELECTION_PADDING = 2;

// ── Eraser ──────────────────────────────────────────────────────────────────
export const ERASER_RADIUS = 10;

// ── Text editor ─────────────────────────────────────────────────────────────
export const TEXT_BORDER_SIZE = 5;
export const FONT_SIZE_STEP = 4;
export const FONT_SIZE_MIN = 8;
export const DEFAULT_FONT_SIZE = 24;
export const TEXT_LINE_HEIGHT = 1.3;
export const AUTORESIZE_BUFFER = 4;
export const FONT_OPTIONS_OFFSET_X = 60;
