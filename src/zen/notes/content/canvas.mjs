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
    this.strokeColor = '#000000';
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
  }

  async init() {
    console.log('[ZenCanvasEditor] Initializing...');
    
    // Initialize IndexedDB
    await this.initDatabase();
    
    // Wait for DOM elements
    await this.waitForElements();
    
    // Initialize Fabric.js canvas
    this.initFabricCanvas();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup autosave
    this.setupAutoSave();
    
    // Load saved content
    await this.loadContent();
    
    console.log('[ZenCanvasEditor] Initialized successfully');
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
    // Initialize Fabric.js canvas
    this.fabricCanvas = new fabric.Canvas(this.canvas, {
      isDrawingMode: false,
      selection: true,
      preserveObjectStacking: true
    });
    
    // Set canvas background
    this.fabricCanvas.setBackgroundColor('#ffffff', () => {
      this.fabricCanvas.renderAll();
    });
    
    // Setup canvas events
    this.fabricCanvas.on('object:added', () => {
      this.isChanged = true;
      this.autoSave();
      this.saveToHistory();
    });
    
    this.fabricCanvas.on('object:modified', () => {
      this.isChanged = true;
      this.autoSave();
      this.saveToHistory();
    });
    
    this.fabricCanvas.on('object:removed', () => {
      this.isChanged = true;
      this.autoSave();
      this.saveToHistory();
    });
    
    console.log('[ZenCanvasEditor] Fabric.js canvas initialized');
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
    
    console.log('[ZenCanvasEditor] Event listeners set up');
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
    
    // New note button
    document.getElementById('new-note-btn').addEventListener('click', () => this.createNewCanvas());
  }

  setTool(tool) {
    this.currentTool = tool;
    
    // Update active tool button
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${tool}-tool`).classList.add('active');
    
    // Configure canvas for current tool
    if (tool === 'select') {
      this.fabricCanvas.isDrawingMode = false;
      this.fabricCanvas.selection = true;
      this.fabricCanvas.defaultCursor = 'default';
    } else if (tool === 'pen') {
      this.fabricCanvas.isDrawingMode = true;
      this.fabricCanvas.selection = false;
      this.fabricCanvas.defaultCursor = 'crosshair';
      this.updateCanvasContext();
    } else {
      this.fabricCanvas.isDrawingMode = false;
      this.fabricCanvas.selection = false;
      this.fabricCanvas.defaultCursor = 'crosshair';
      this.setupShapeDrawing();
    }
    
    console.log(`[ZenCanvasEditor] Tool changed to: ${tool}`);
  }

  setupShapeDrawing() {
    this.fabricCanvas.on('mouse:down', this.handleShapeMouseDown.bind(this));
    this.fabricCanvas.on('mouse:move', this.handleShapeMouseMove.bind(this));
    this.fabricCanvas.on('mouse:up', this.handleShapeMouseUp.bind(this));
  }

  handleShapeMouseDown(e) {
    if (this.currentTool === 'select') return;
    
    const pointer = this.fabricCanvas.getPointer(e.e);
    this.startPoint = pointer;
    this.isDrawing = true;
  }

  handleShapeMouseMove(e) {
    if (!this.isDrawing || !this.startPoint) return;
    
    const pointer = this.fabricCanvas.getPointer(e.e);
    
    // Remove previous preview object
    if (this.previewObject) {
      this.fabricCanvas.remove(this.previewObject);
    }
    
    // Create preview object
    this.previewObject = this.createShapeObject(this.startPoint, pointer);
    this.fabricCanvas.add(this.previewObject);
    this.fabricCanvas.renderAll();
  }

  handleShapeMouseUp(e) {
    if (!this.isDrawing || !this.startPoint) return;
    
    const pointer = this.fabricCanvas.getPointer(e.e);
    
    // Remove preview object
    if (this.previewObject) {
      this.fabricCanvas.remove(this.previewObject);
      this.previewObject = null;
    }
    
    // Create final object
    const object = this.createShapeObject(this.startPoint, pointer);
    this.fabricCanvas.add(object);
    this.fabricCanvas.renderAll();
    
    // Reset state
    this.isDrawing = false;
    this.startPoint = null;
  }

  createShapeObject(startPoint, endPoint) {
    switch (this.currentTool) {
      case 'rectangle':
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
        return new fabric.Line([startPoint.x, startPoint.y, endPoint.x, endPoint.y], {
          stroke: this.strokeColor,
          strokeWidth: this.strokeWidth,
          selectable: true,
          evented: true
        });
        
      case 'arrow':
        const line = new fabric.Line([startPoint.x, startPoint.y, endPoint.x, endPoint.y], {
          stroke: this.strokeColor,
          strokeWidth: this.strokeWidth,
          selectable: true,
          evented: true
        });
        
        // Add arrow head
        const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;
        
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
    if (this.fabricCanvas.isDrawingMode) {
      this.fabricCanvas.freeDrawingBrush.color = this.strokeColor;
      this.fabricCanvas.freeDrawingBrush.width = this.strokeWidth;
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
      this.fabricCanvas.renderAll();
    }
  }

  selectAll() {
    this.fabricCanvas.selectAll();
    this.fabricCanvas.renderAll();
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
        this.fabricCanvas.renderAll();
      });
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const nextState = JSON.parse(this.history[this.historyIndex]);
      this.fabricCanvas.loadFromJSON(nextState, () => {
        this.fabricCanvas.renderAll();
      });
    }
  }

  clearCanvas() {
    this.fabricCanvas.clear();
    this.fabricCanvas.setBackgroundColor('#ffffff', () => {
      this.fabricCanvas.renderAll();
    });
    
    this.history = [];
    this.historyIndex = -1;
    this.isChanged = true;
    this.autoSave();
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
          this.fabricCanvas.renderAll();
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