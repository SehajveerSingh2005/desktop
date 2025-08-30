// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

class ZenCanvasEditor {
  constructor() {
    this.titleInput = null;
    this.canvas = null;
    this.fabricCanvas = null;
    this.toolbar = null;
    
    // Current tool and drawing state
    this.currentTool = 'select';
    this.isDrawing = false;
    this.startPoint = null;
    
    // Style properties
    this.strokeColor = '#00000';
    this.fillColor = 'transparent';
    this.strokeWidth = 3;
    this.fontSize = 16;
    this.fontFamily = 'Arial';
    
    // History for undo/redo
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;
    
    // Autosave
    this.isChanged = false;
    this.autoSaveTimer = null;
    this.lastSavedContent = '';
    this.lastSavedTitle = '';
    
    // Database
    this.db = null;
    this.dbName = 'ZenCanvasDB';
    this.dbVersion = 1;
    
    // Infinite canvas properties
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastPanPoint = null;
    this.minZoom = 0.1;
    this.maxZoom = 3;
    
    // Dynamic canvas properties
    this.canvasWidth = window.innerWidth;
    this.canvasHeight = window.innerHeight;
    this.canvasOffsetX = 0;
    this.canvasOffsetY = 0;
    
    // Resize optimization properties
    this.lastWidth = 0;
    this.lastHeight = 0;
    this.expandTimer = null;
    
    // Rendering optimization properties
    this.renderTimer = null;
  }

  async init() {
    console.log('[ZenCanvasEditor] Initializing...');
    
    // Initialize IndexedDB
    await this.initDatabase();
    
    // Wait for DOM elements
    await this.waitForElements();
    
    // Initialize Fabric.js canvas with performance optimizations
    this.initFabricCanvas();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup autosave
    this.setupAutoSave();
    
    // Load saved content
    await this.loadContent();
    
    console.log('[ZenCanvasEditor] Initialized successfully');
    
    // Debug: check canvas state
    console.log('[ZenCanvasEditor] Canvas dimensions:', {
      width: this.canvas.width,
      height: this.canvas.height,
      fabricWidth: this.fabricCanvas.getWidth(),
      fabricHeight: this.fabricCanvas.getHeight()
    });
    
    // Performance monitoring
    this.setupPerformanceMonitoring();
  }

  async initDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('canvases')) {
          const store = db.createObjectStore('canvases', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async waitForElements() {
    let attempts = 0;
    const maxAttempts = 50;
    
    while (attempts < maxAttempts) {
      this.titleInput = document.getElementById('canvas-title');
      this.canvas = document.getElementById('drawing-canvas');
      this.toolbar = document.getElementById('canvas-toolbar');
      
      if (this.titleInput && this.canvas && this.toolbar) {
        console.log('[ZenCanvasEditor] All elements found');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    throw new Error('Required elements not found after waiting');
  }

  initFabricCanvas() {
    // Optimized Fabric.js canvas initialization
    this.fabricCanvas = new fabric.Canvas(this.canvas, {
      isDrawingMode: false,
      selection: true,
      preserveObjectStacking: true,
      renderOnAddRemove: false, // Improve performance
      stateful: false, // Improve performance
      selectable: false, // Objects not selectable by default
      perPixelTargetFind: false, // Faster object detection
      targetFindTolerance: 0, // No tolerance for target finding
      skipOffscreen: true, // Skip offscreen objects
      enablePointerEvents: true, // Enable pointer events for better performance
      width: window.innerWidth,
      height: window.innerHeight
    });
    
    // Set up infinite canvas
    this.initInfiniteCanvas();
    
    // Handle window resize with debounce
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.resizeCanvas();
      }, 100);
    });
    
    // Setup canvas events with debouncing
    let saveTimer;
    const debouncedSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        this.isChanged = true;
        this.autoSave();
        this.saveToHistory();
      }, 300);
    };
    
    this.fabricCanvas.on('object:added', () => {
      debouncedSave();
      // Check if canvas needs expansion (debounced)
      clearTimeout(this.expandTimer);
      this.expandTimer = setTimeout(() => {
        this.expandCanvasIfNeeded();
      }, 500);
    });
    
    this.fabricCanvas.on('object:modified', () => {
      debouncedSave();
      // Check if canvas needs expansion (debounced)
      clearTimeout(this.expandTimer);
      this.expandTimer = setTimeout(() => {
        this.expandCanvasIfNeeded();
      }, 500);
    });
    
    this.fabricCanvas.on('object:removed', () => {
      debouncedSave();
    });
    
    // Setup pen tool events (only once)
    this.setupPenToolEvents();
    
    // Initialize drawing brush properties
    if (this.fabricCanvas.freeDrawingBrush) {
      this.fabricCanvas.freeDrawingBrush.color = this.strokeColor;
      this.fabricCanvas.freeDrawingBrush.width = this.strokeWidth;
      this.fabricCanvas.freeDrawingBrush.strokeLineCap = 'round';
      this.fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round';
      // Performance optimizations for drawing
      this.fabricCanvas.freeDrawingBrush.decimate = 0.1; // Reduce points for smoother lines
    }
    
    console.log('[ZenCanvasEditor] Optimized Fabric.js canvas initialized');
  }

  initInfiniteCanvas() {
    // For infinite canvas, start with a more appropriate size that balances usability and performance
    // Use a size that's large enough for most use cases but not too large to cause performance issues
    this.canvasWidth = Math.min(window.innerWidth * 2, 5000);
    this.canvasHeight = Math.min(window.innerHeight * 2, 5000);
    
    // Set initial canvas dimensions
    this.fabricCanvas.setDimensions({
      width: this.canvasWidth,
      height: this.canvasHeight
    });
    
    // Center viewport to show the central area
    this.panX = (window.innerWidth - this.canvasWidth) / 2;
    this.panY = (window.innerHeight - this.canvasHeight) / 2;
    this.zoom = 1;
    
    // Add grid background
    this.addGridBackground();
    
    // Apply viewport
    this.updateViewport();
    
    // Add visual bounds indicator
    this.addCanvasBoundsIndicator();
    
    console.log('[ZenCanvasEditor] Infinite canvas initialized with dimensions:', this.canvasWidth, 'x', this.canvasHeight);
  }

  addCanvasBoundsIndicator() {
    // Add a visual indicator for the canvas bounds
    // Only add if it doesn't already exist
    const existingBounds = this.fabricCanvas.getObjects().find(obj => obj.id === 'canvas-bounds');
    
    if (!existingBounds) {
      const bounds = new fabric.Rect({
        id: 'canvas-bounds',
        left: 0,
        top: 0,
        width: this.canvasWidth,
        height: this.canvasHeight,
        fill: 'transparent',
        stroke: 'rgba(255, 255, 255, 0.05)',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        strokeDashArray: [5, 5],
        zIndex: -1 // Send to back
      });
      
      this.fabricCanvas.add(bounds);
      this.fabricCanvas.sendToBack(bounds);
    }
  }

  addGridBackground() {
    // Remove any existing background
    this.fabricCanvas.setBackgroundColor(null);
    
    // Use CSS grid background for better performance
    // This avoids creating large canvases that exceed size limits
    this.fabricCanvas.setBackgroundColor('transparent');
    
    // Add CSS class for grid background
    if (this.canvas) {
      this.canvas.classList.add('grid-background');
    }
  }

  updateGrid() {
    // For a simple grid, we don't need to do anything special
    // The grid is handled by CSS in the background
    this.fabricCanvas.requestRenderAll();
  }

  updateViewport() {
    // Correct viewport transform: [a, b, c, d, e, f] where:
    // a: horizontal scaling
    // b: horizontal skewing
    // c: vertical skewing
    // d: vertical scaling
    // e: horizontal translation
    // f: vertical translation
    this.fabricCanvas.setViewportTransform([
      this.zoom,  // a: horizontal scaling
      0,          // b: horizontal skewing
      0,          // c: vertical skewing
      this.zoom,  // d: vertical scaling
      this.panX,  // e: horizontal translation
      this.panY   // f: vertical translation
    ]);
    
    // With our simplified grid implementation, we don't need to manually update anything
    // Just request a re-render with optimized settings
    // Only render if not already rendering
    if (!this.fabricCanvas._isRendering) {
      this.fabricCanvas.requestRenderAll();
    }
    
    this.updateZoomIndicator();
  }

  // Screen to canvas coordinate conversion methods
  screenToCanvasCoords(x, y) {
    // Use Fabric.js built-in viewport transform methods
    return this.fabricCanvas.restorePointerVpt({ x, y });
  }
  
  // Canvas to screen coordinate conversion
  canvasToScreenCoords(x, y) {
    // Use Fabric.js built-in viewport transform methods
    return this.fabricCanvas.calcTransformMatrix().transformPoint({ x, y });
  }

  updateZoomIndicator() {
    const zoomLevel = document.getElementById('zoom-level');
    if (zoomLevel) {
      const zoomPercent = Math.round(this.zoom * 100);
      // Only update if the value actually changed to reduce DOM thrashing
      if (zoomLevel.textContent !== `${zoomPercent}%`) {
        zoomLevel.textContent = `${zoomPercent}%`;
      }
    }
  }

  resetViewport() {
    // Reset zoom to 100% and center view
    this.zoom = 1;
    this.centerViewport();
    console.log('[ZenCanvasEditor] Viewport reset to 100% zoom and centered');
  }

  centerViewport() {
    // Center the viewport on the current canvas
    const canvasWidth = this.fabricCanvas.getWidth();
    const canvasHeight = this.fabricCanvas.getHeight();
    this.panX = (window.innerWidth - canvasWidth) / 2;
    this.panY = (window.innerHeight - canvasHeight) / 2;
    this.updateViewport();
    console.log('[ZenCanvasEditor] Viewport centered');
  }

  // Function to expand canvas when objects are near the edges
  expandCanvasIfNeeded() {
    // Get all objects on the canvas (excluding the bounds indicator)
    const objects = this.fabricCanvas.getObjects().filter(obj => obj.id !== 'canvas-bounds');
    if (objects.length === 0) return;
    
    // Find the bounds of all objects more efficiently
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Batch calculation for better performance
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      const bounds = obj.getBoundingRect(false, true); // Don't calculate transforms if not needed
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.left + bounds.width);
      maxY = Math.max(maxY, bounds.top + bounds.height);
    }
    
    // Check if objects are near the edges (within 100px)
    const buffer = 100;
    let needsExpansion = false;
    
    if (minX < buffer || minY < buffer || maxX > this.canvasWidth - buffer || maxY > this.canvasHeight - buffer) {
      needsExpansion = true;
    }
    
    // Only expand if we're not already at maximum reasonable size
    if (needsExpansion && this.canvasWidth < 10000 && this.canvasHeight < 10000) {
      // Expand canvas by 20% (more conservative than 50%)
      const newWidth = Math.min(this.canvasWidth * 1.2, 10000);
      const newHeight = Math.min(this.canvasHeight * 1.2, 10000);
      
      // Update canvas dimensions
      this.canvasWidth = newWidth;
      this.canvasHeight = newHeight;
      
      this.fabricCanvas.setDimensions({
        width: this.canvasWidth,
        height: this.canvasHeight
      });
      
      // Re-add bounds indicator
      this.addCanvasBoundsIndicator();
      
      console.log('[ZenCanvasEditor] Canvas expanded to:', this.canvasWidth, 'x', this.canvasHeight);
    }
  }

  resizeCanvas() {
    const container = document.getElementById('canvas-content');
    if (container && this.canvas) {
      const rect = container.getBoundingClientRect();
      // For infinite canvas, we update the container size but maintain our virtual canvas size
      // The virtual canvas size is kept separate from the display size
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
      
      if (this.fabricCanvas) {
        // Update viewport to maintain current view with performance optimization
        this.fabricCanvas.setDimensions({
          width: rect.width,
          height: rect.height
        });
        
        // Initialize lastWidth and lastHeight if not set
        if (this.lastWidth === 0 && this.lastHeight === 0) {
          this.lastWidth = rect.width;
          this.lastHeight = rect.height;
        }
        
        // Only update viewport if dimensions actually changed significantly
        if (Math.abs(rect.width - this.lastWidth) > 10 || Math.abs(rect.height - this.lastHeight) > 10) {
          this.updateViewport();
          this.fabricCanvas.requestRenderAll();
          this.lastWidth = rect.width;
          this.lastHeight = rect.height;
        }
      }
    }
  }

  setupEventListeners() {
    // Toolbar events
    this.setupToolbarEvents();
    
    // Title input
    this.titleInput.addEventListener('input', () => {
      this.isChanged = true;
      this.autoSave();
    });
    
    // Keyboard events
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    
    // Add infinite canvas keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === '0' && e.ctrlKey) {
        // Ctrl+0: Reset zoom and center view
        e.preventDefault();
        this.resetViewport();
      } else if (e.key === 'Home') {
        // Home: Center view
        e.preventDefault();
        this.centerViewport();
      } else if (e.key === 'h' && e.ctrlKey) {
        // Ctrl+H: Toggle instructions
        e.preventDefault();
        this.toggleInstructions();
      }
    });
    
    // Infinite canvas pan and zoom events
    this.setupPanZoomEvents();
    
    // Hide instructions after 5 seconds
    setTimeout(() => {
      const instructions = document.getElementById('canvas-instructions');
      if (instructions) {
        instructions.style.opacity = '0';
        setTimeout(() => {
          instructions.style.display = 'none';
        }, 300);
      }
    }, 5000);
    
    console.log('[ZenCanvasEditor] Event listeners set up');
  }

  toggleInstructions() {
    const instructions = document.getElementById('canvas-instructions');
    if (instructions) {
      if (instructions.style.display === 'none') {
        instructions.style.display = 'block';
        instructions.style.opacity = '0.8';
      } else {
        instructions.style.opacity = '0';
        setTimeout(() => {
          instructions.style.display = 'none';
        }, 300);
      }
    }
  }

  setupToolbarEvents() {
    // Tool selection
    document.getElementById('select-tool').addEventListener('click', () => this.setTool('select'));
    document.getElementById('pen-tool').addEventListener('click', () => this.setTool('pen'));
    document.getElementById('text-tool').addEventListener('click', () => this.setTool('text'));
    document.getElementById('rectangle-tool').addEventListener('click', () => this.setTool('rectangle'));
    document.getElementById('circle-tool').addEventListener('click', () => this.setTool('circle'));
    document.getElementById('line-tool').addEventListener('click', () => this.setTool('line'));
    document.getElementById('arrow-tool').addEventListener('click', () => this.setTool('arrow'));
    
    // Controls
    const brushSizeSlider = document.getElementById('brush-size');
    const brushSizeValue = document.getElementById('brush-size-value');
    brushSizeSlider.addEventListener('input', (e) => {
      this.strokeWidth = parseInt(e.target.value);
      brushSizeValue.textContent = this.strokeWidth;
      this.updateCanvasContext();
    });
    
    document.getElementById('color-picker').addEventListener('change', (e) => {
      this.strokeColor = e.target.value;
      this.updateCanvasContext();
    });
    
    // Actions
    document.getElementById('clear-canvas').addEventListener('click', () => this.clearCanvas());
    document.getElementById('undo-btn').addEventListener('click', () => this.undo());
    document.getElementById('redo-btn').addEventListener('click', () => this.redo());
    document.getElementById('save-canvas').addEventListener('click', () => this.saveContent());
    document.getElementById('load-canvas').addEventListener('click', () => this.loadContent());
    document.getElementById('export-png').addEventListener('click', () => this.exportPNG());
    
    // Viewport controls
    document.getElementById('reset-viewport').addEventListener('click', () => this.resetViewport());
    document.getElementById('center-viewport').addEventListener('click', () => this.centerViewport());
    
    // New note button
    document.getElementById('new-note-btn').addEventListener('click', () => this.createNewCanvas());
  }

  setupPanZoomEvents() {
    let isPanning = false;
    let lastPoint = null;
    const panningOverlay = document.getElementById('panning-overlay');
    
    // Touch support variables
    let touchStartDistance = 0;
    let isPinching = false;
    
    // Performance optimization: throttle viewport updates
    let viewportUpdateTimer = null;
    const throttleViewportUpdate = () => {
      if (viewportUpdateTimer) {
        clearTimeout(viewportUpdateTimer);
      }
      viewportUpdateTimer = setTimeout(() => {
        this.updateViewport();
        this.updateZoomIndicator();
      }, 16); // ~60fps
    };

    // Mouse panning
    this.canvas.addEventListener('mousedown', (e) => {
      // Check if we're clicking on the canvas background (not on an object)
      // Use Fabric.js method to check if we clicked on an object
      const target = this.fabricCanvas.findTarget(e, false);
      if (!target && e.button === 0) { // Only left mouse button
        e.preventDefault();
        isPanning = true;
        lastPoint = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
        this.canvas.classList.add('canvas-panning');
        if (panningOverlay) {
          panningOverlay.classList.add('active');
        }
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (isPanning && lastPoint) {
        const deltaX = e.clientX - lastPoint.x;
        const deltaY = e.clientY - lastPoint.y;
        
        this.panX += deltaX;
        this.panY += deltaY;
        throttleViewportUpdate(); // Throttled update for better performance
        
        lastPoint = { x: e.clientX, y: e.clientY };
      }
    });

    const endPanning = () => {
      if (isPanning) {
        isPanning = false;
        // Reset cursor based on current tool
        if (this.currentTool === 'select') {
          this.canvas.style.cursor = 'default';
        } else if (this.currentTool === 'pen') {
          this.canvas.style.cursor = 'crosshair';
        } else {
          this.canvas.style.cursor = 'crosshair';
        }
        this.canvas.classList.remove('canvas-panning');
        if (panningOverlay) {
          panningOverlay.classList.remove('active');
        }
        // Force final viewport update
        this.updateViewport();
        this.updateZoomIndicator();
      }
    };

    this.canvas.addEventListener('mouseup', endPanning);
    
    // Also handle mouse leaving canvas area while panning
    this.canvas.addEventListener('mouseleave', endPanning);

    // Touch panning
    this.canvas.addEventListener('touchstart', (e) => {
      // Check if we're touching the canvas background (not on an object)
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
      } else if (e.touches.length === 2) {
        // Pinch zoom
        isPinching = true;
        isPanning = false; // Cancel panning if pinching
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        touchStartDistance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
      }
    });

    this.canvas.addEventListener('touchmove', (e) => {
      if (isPanning && e.touches.length === 1) {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
      } else if (isPinching && e.touches.length === 2) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        
        const scale = currentDistance / touchStartDistance;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * scale));
        
        // Zoom towards center of touches
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = centerX - rect.left;
        const mouseY = centerY - rect.top;
        
        const zoomRatio = newZoom / this.zoom;
        this.panX = mouseX - zoomRatio * (mouseX - this.panX);
        this.panY = mouseY - zoomRatio * (mouseY - this.panY);
        
        this.zoom = newZoom;
        throttleViewportUpdate(); // Throttled update for better performance
        
        touchStartDistance = currentDistance;
      }
    });

    this.canvas.addEventListener('touchend', (e) => {
      if (isPanning || isPinching) {
        const mouseEvent = new MouseEvent('mouseup', {});
        this.canvas.dispatchEvent(mouseEvent);
        isPinching = false;
        // Force final viewport update
        this.updateViewport();
        this.updateZoomIndicator();
      }
    });

    // Mouse wheel zooming with throttling
    let wheelTimer = null;
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      // Get mouse position relative to canvas
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate zoom factor (more responsive zoom)
      const zoomFactor = 0.05; // Reduced zoom sensitivity for smoother experience
      const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;
      
      // Calculate new zoom level
      const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * (1 + delta)));
      
      // Adjust pan to zoom towards mouse position
      const zoomRatio = newZoom / this.zoom;
      this.panX = mouseX - zoomRatio * (mouseX - this.panX);
      this.panY = mouseY - zoomRatio * (mouseY - this.panY);
      
      this.zoom = newZoom;
      throttleViewportUpdate(); // Throttled update for better performance
      
      // Debounce wheel events to prevent excessive updates
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        this.updateViewport();
        this.updateZoomIndicator();
      }, 50);
    });

    console.log('[ZenCanvasEditor] Optimized pan/zoom events set up');
  }

  setupPenToolEvents() {
    // Optimized pen tool events with debouncing
    let pathSaveTimer;
    this.fabricCanvas.on('path:created', (e) => {
      const path = e.path;
      if (path) {
        path.setCoords();
        
        // Debounce history saving and autosaving
        clearTimeout(pathSaveTimer);
        pathSaveTimer = setTimeout(() => {
          this.saveToHistory();
          this.isChanged = true;
          this.autoSave();
        }, 100);
      }
    });
  }

  setTool(tool) {
    // Only update if tool actually changed
    if (this.currentTool === tool) return;
    
    this.currentTool = tool;
    
    // Update active tool button with better performance
    const activeBtn = document.getElementById(`${tool}-tool`);
    if (activeBtn) {
      // Remove active class from all buttons
      const toolButtons = document.querySelectorAll('.tool-btn');
      for (let i = 0; i < toolButtons.length; i++) {
        toolButtons[i].classList.remove('active');
      }
      // Add active class to current button
      activeBtn.classList.add('active');
    }
    
    // Configure canvas for current tool
    if (tool === 'select') {
      this.fabricCanvas.isDrawingMode = false;
      this.fabricCanvas.selection = true;
      // Only set cursor if not panning
      if (!this.canvas.classList.contains('canvas-panning')) {
        this.fabricCanvas.defaultCursor = 'default';
      }
    } else if (tool === 'pen') {
      this.fabricCanvas.isDrawingMode = true;
      this.fabricCanvas.selection = false;
      // Only set cursor if not panning
      if (!this.canvas.classList.contains('canvas-panning')) {
        this.fabricCanvas.defaultCursor = 'crosshair';
      }
      this.updateCanvasContext();
      
      // Set up pen tool to work with viewport transforms
      if (this.fabricCanvas.freeDrawingBrush) {
        this.fabricCanvas.freeDrawingBrush.decimate = 0; // No decimation for smooth lines
        this.fabricCanvas.freeDrawingBrush.strokeLineCap = 'round';
        this.fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round';
      }
    } else {
      this.fabricCanvas.isDrawingMode = false;
      this.fabricCanvas.selection = false;
      // Only set cursor if not panning
      if (!this.canvas.classList.contains('canvas-panning')) {
        this.fabricCanvas.defaultCursor = 'crosshair';
      }
      this.setupShapeDrawing();
    }
    
    console.log(`[ZenCanvasEditor] Tool changed to: ${tool}`);
  }

  setupShapeDrawing() {
    // Remove any existing shape drawing listeners to prevent duplicates
    this.fabricCanvas.off('mouse:down', this.handleShapeMouseDown);
    this.fabricCanvas.off('mouse:move', this.handleShapeMouseMove);
    this.fabricCanvas.off('mouse:up', this.handleShapeMouseUp);
    
    // Add shape drawing listeners
    this.fabricCanvas.on('mouse:down', this.handleShapeMouseDown.bind(this));
    this.fabricCanvas.on('mouse:move', this.handleShapeMouseMove.bind(this));
    this.fabricCanvas.on('mouse:up', this.handleShapeMouseUp.bind(this));
  }

  handleShapeMouseDown(e) {
    if (this.currentTool === 'select') return;
    
    // Use Fabric.js built-in pointer handling
    const pointer = this.fabricCanvas.getPointer(e.e);
    this.startPoint = pointer;
    this.isDrawing = true;
  }

  handleShapeMouseMove(e) {
    if (!this.isDrawing || !this.startPoint) return;
    
    // Use Fabric.js built-in pointer handling
    const pointer = this.fabricCanvas.getPointer(e.e);
    
    // Remove previous preview object
    if (this.previewObject) {
      this.fabricCanvas.remove(this.previewObject);
    }
    
    // Create preview object
    this.previewObject = this.createShapeObject(this.startPoint, pointer);
    if (this.previewObject) {
      this.fabricCanvas.add(this.previewObject);
      // Only request render all periodically to avoid excessive updates
      if (!this.renderTimer) {
        this.renderTimer = setTimeout(() => {
          this.fabricCanvas.requestRenderAll();
          this.renderTimer = null;
        }, 16); // ~60fps
      }
    }
  }

  handleShapeMouseUp(e) {
    if (!this.isDrawing || !this.startPoint) return;
    
    // Use Fabric.js built-in pointer handling
    const pointer = this.fabricCanvas.getPointer(e.e);
    
    // Remove preview object
    if (this.previewObject) {
      this.fabricCanvas.remove(this.previewObject);
      this.previewObject = null;
    }
    
    // Clear render timer if it exists
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    
    // Create final object
    const object = this.createShapeObject(this.startPoint, pointer);
    if (object) {
      this.fabricCanvas.add(object);
      this.fabricCanvas.requestRenderAll();
    }
    
    // Reset state
    this.isDrawing = false;
    this.startPoint = null;
  }

  createShapeObject(startPoint, endPoint) {
    // Validate inputs
    if (!startPoint || !endPoint) return null;
    
    switch (this.currentTool) {
      case 'rectangle':
        // Only create rectangle if it has meaningful size
        if (Math.abs(endPoint.x - startPoint.x) < 2 && Math.abs(endPoint.y - startPoint.y) < 2) {
          return null;
        }
        
        return new fabric.Rect({
          left: Math.min(startPoint.x, endPoint.x),
          top: Math.min(startPoint.y, endPoint.y),
          width: Math.abs(endPoint.x - startPoint.x),
          height: Math.abs(endPoint.y - startPoint.y),
          stroke: this.strokeColor,
          strokeWidth: this.strokeWidth,
          fill: this.fillColor,
          selectable: true,
          evented: true
        });
        
      case 'circle':
        const radius = Math.sqrt(
          Math.pow(endPoint.x - startPoint.x, 2) + 
          Math.pow(endPoint.y - startPoint.y, 2)
        ) / 2;
        
        // Only create circle if it has meaningful size
        if (radius < 2) {
          return null;
        }
        
        const centerX = (startPoint.x + endPoint.x) / 2;
        const centerY = (startPoint.y + endPoint.y) / 2;
        
        return new fabric.Circle({
          left: centerX - radius,
          top: centerY - radius,
          radius: radius,
          stroke: this.strokeColor,
          strokeWidth: this.strokeWidth,
          fill: this.fillColor,
          selectable: true,
          evented: true
        });
        
      case 'line':
        // Only create line if it has meaningful length
        if (Math.abs(endPoint.x - startPoint.x) < 2 && Math.abs(endPoint.y - startPoint.y) < 2) {
          return null;
        }
        
        return new fabric.Line([startPoint.x, startPoint.y, endPoint.x, endPoint.y], {
          stroke: this.strokeColor,
          strokeWidth: this.strokeWidth,
          selectable: true,
          evented: true
        });
        
      case 'arrow':
        // Only create arrow if it has meaningful length
        if (Math.abs(endPoint.x - startPoint.x) < 2 && Math.abs(endPoint.y - startPoint.y) < 2) {
          return null;
        }
        
        const line = new fabric.Line([startPoint.x, startPoint.y, endPoint.x, endPoint.y], {
          stroke: this.strokeColor,
          strokeWidth: this.strokeWidth,
          selectable: true,
          evented: true
        });
        
        // Add arrow head
        const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
        const arrowLength = 15;
        
        const arrowHead = new fabric.Triangle({
          left: endPoint.x,
          top: endPoint.y,
          width: arrowLength,
          height: arrowLength,
          fill: this.strokeColor,
          angle: (angle * 180 / Math.PI) + 90,
          selectable: false,
          evented: false
        });
        
        return new fabric.Group([line, arrowHead], {
          selectable: true,
          evented: true
        });
        
      default:
        return null;
    }
  }

  updateCanvasContext() {
    // Only update if in drawing mode and brush exists
    if (this.fabricCanvas.isDrawingMode && this.fabricCanvas.freeDrawingBrush) {
      // Batch update brush properties to reduce re-renders
      this.fabricCanvas.freeDrawingBrush.color = this.strokeColor;
      this.fabricCanvas.freeDrawingBrush.width = this.strokeWidth;
      this.fabricCanvas.freeDrawingBrush.strokeLineCap = 'round';
      this.fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round';
      
      // Request a single render update after all properties are set
      this.fabricCanvas.requestRenderAll();
    }
  }

  handleKeyDown(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelectedObjects();
    } else if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      } else if (e.key === 'a') {
        e.preventDefault();
        this.selectAll();
      }
    }
  }

  deleteSelectedObjects() {
    const activeObjects = this.fabricCanvas.getActiveObjects();
    if (activeObjects.length > 0) {
      this.fabricCanvas.remove(...activeObjects);
      this.fabricCanvas.discardActiveObject();
      this.fabricCanvas.requestRenderAll();
    }
  }

  selectAll() {
    // Select all objects on the canvas
    this.fabricCanvas.discardActiveObject();
    const selection = new fabric.ActiveSelection(this.fabricCanvas.getObjects(), {
      canvas: this.fabricCanvas
    });
    this.fabricCanvas.setActiveObject(selection);
    this.fabricCanvas.requestRenderAll();
  }

  // Convert screen coordinates to canvas coordinates accounting for viewport transform
  screenToCanvasCoords(x, y) {
    const viewportTransform = this.fabricCanvas.viewportTransform;
    const zoom = viewportTransform[0];
    const panX = viewportTransform[4];
    const panY = viewportTransform[5];
    
    return {
      x: (x - panX) / zoom,
      y: (y - panY) / zoom
    };
  }
  
  // Convert canvas coordinates to screen coordinates
  canvasToScreenCoords(x, y) {
    const viewportTransform = this.fabricCanvas.viewportTransform;
    const zoom = viewportTransform[0];
    const panX = viewportTransform[4];
    const panY = viewportTransform[5];
    
    return {
      x: x * zoom + panX,
      y: y * zoom + panY
    };
  }

  saveToHistory() {
    // Remove any history after current index
    this.history = this.history.slice(0, this.historyIndex + 1);
    
    // Add current state
    const currentState = this.fabricCanvas.toJSON();
    this.history.push(JSON.stringify(currentState));
    
    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const previousState = JSON.parse(this.history[this.historyIndex]);
      this.fabricCanvas.loadFromJSON(previousState, () => {
        this.fabricCanvas.requestRenderAll();
      });
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const nextState = JSON.parse(this.history[this.historyIndex]);
      this.fabricCanvas.loadFromJSON(nextState, () => {
        this.fabricCanvas.requestRenderAll();
      });
    }
  }

  clearCanvas() {
    // Clear all objects
    this.fabricCanvas.clear();
    
    // Re-add background and bounds indicator
    this.addGridBackground();
    this.addCanvasBoundsIndicator();
    
    this.history = [];
    this.historyIndex = -1;
    this.isChanged = true;
    this.autoSave();
    
    console.log('[ZenCanvasEditor] Canvas cleared');
  }

  createNewCanvas() {
    this.clearCanvas();
    this.titleInput.value = '';
    this.lastSavedContent = '';
    this.lastSavedTitle = '';
    this.isChanged = false;
    this.updateStatus('saved');
  }

  setupAutoSave() {
    setInterval(() => {
      if (this.isChanged) {
        this.autoSave();
      }
    }, 5000);
  }

  autoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setTimeout(() => {
      this.saveContent();
    }, 1000);
  }

  async saveContent() {
    try {
      const title = this.titleInput.value || 'Untitled Canvas';
      const canvasData = this.fabricCanvas.toJSON();
      
      const content = {
        id: 'current-canvas',
        title: title,
        canvasData: canvasData,
        timestamp: Date.now()
      };
      
      await this.saveToIndexedDB(content);
      
      this.lastSavedContent = JSON.stringify(content);
      this.lastSavedTitle = title;
      this.isChanged = false;
      
      this.updateStatus('saved');
      console.log('[ZenCanvasEditor] Canvas saved successfully');
    } catch (error) {
      console.error('[ZenCanvasEditor] Failed to save canvas:', error);
      this.updateStatus('saving');
    }
  }

  async saveToIndexedDB(content) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['canvases'], 'readwrite');
      const store = transaction.objectStore('canvases');
      const request = store.put(content);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadContent() {
    try {
      const content = await this.loadFromIndexedDB();
      
      if (content && content.canvasData) {
        // Load title
        if (content.title) {
          this.titleInput.value = content.title;
          this.lastSavedTitle = content.title;
        }
        
        // Load canvas data
        this.fabricCanvas.loadFromJSON(content.canvasData, () => {
          this.fabricCanvas.requestRenderAll();
        });
        
        console.log('[ZenCanvasEditor] Canvas loaded successfully');
      } else {
        this.createNewCanvas();
      }
    } catch (error) {
      console.error('[ZenCanvasEditor] Failed to load canvas:', error);
      this.createNewCanvas();
    }
  }

  async loadFromIndexedDB() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['canvases'], 'readonly');
      const store = transaction.objectStore('canvases');
      const request = store.get('current-canvas');
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  exportPNG() {
    const dataURL = this.fabricCanvas.toDataURL({
      format: 'png',
      quality: 1
    });
    
    const link = document.createElement('a');
    link.download = `${this.titleInput.value || 'canvas'}.png`;
    link.href = dataURL;
    link.click();
  }

  setupPerformanceMonitoring() {
    // Monitor frame rate
    let lastTime = performance.now();
    let frameCount = 0;
    let fps = 0;
    
    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        frameCount = 0;
        lastTime = currentTime;
        
        // Log FPS if it drops below 30
        if (fps < 30) {
          console.warn(`[ZenCanvasEditor] Low FPS detected: ${fps}`);
        }
      }
      
      requestAnimationFrame(measureFPS);
    };
    
    requestAnimationFrame(measureFPS);
  }

  updateStatus(status) {
    const savingStatus = document.getElementById('saving-status');
    const savedStatus = document.getElementById('saved-status');
    
    if (status === 'saving') {
      savingStatus.classList.remove('hidden');
      savedStatus.classList.add('hidden');
    } else if (status === 'saved') {
      savingStatus.classList.add('hidden');
      savedStatus.classList.remove('hidden');
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const editor = new ZenCanvasEditor();
    editor.init();
  });
} else {
  const editor = new ZenCanvasEditor();
  editor.init();
}