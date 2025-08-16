# Zen Notes & Canvas

This module provides both text-based notes and canvas drawing capabilities for the Zen Browser.

## Features

### Notes Editor
- **Rich Text Editing**: Powered by Tiptap with markdown shortcuts
- **Slash Commands**: Type `/` to access formatting options
- **Auto-save**: Automatic saving with visual indicators
- **Minimal UI**: Transparent, clean interface
- **New Board Button**: 🎨 Switch to canvas mode

### Canvas Editor
- **Drawing Tools**: Powered by Excalidraw
- **Shape Tools**: Rectangle, ellipse, diamond, arrow, line
- **Text Tool**: Add text annotations
- **Free Draw**: Freehand drawing
- **Undo/Redo**: Full history support
- **Auto-save**: Automatic saving with visual indicators
- **Minimal UI**: Transparent, clean interface
- **New Note Button**: 📝 Switch back to notes mode

## Usage

### Switching Between Modes
- **Notes → Canvas**: Click the 🎨 button in the notes header
- **Canvas → Notes**: Click the 📝 button in the canvas header

### Building the Bundles

```bash
# Build Tiptap bundle
npm run bundle:tiptap

# Build Canvas bundle (Excalidraw)
npm run bundle:canvas

# Watch mode for development
npm run bundle:tiptap:watch
npm run bundle:canvas:watch
```

### File Structure
```
src/zen/notes/
├── content/
│   ├── note.xhtml          # Notes interface
│   ├── note.mjs            # Notes JavaScript
│   ├── canvas.xhtml        # Canvas interface
│   └── canvas.mjs          # Canvas JavaScript
├── skin/
│   ├── note.css            # Notes styling
│   └── canvas.css          # Canvas styling
└── vendor/                  # Bundled dependencies
    ├── tiptap.bundle.js    # Tiptap bundle
    └── canvas.bundle.js    # Excalidraw bundle
```

## Dependencies

- **Tiptap**: Rich text editor for notes
- **Excalidraw**: Drawing canvas for diagrams and sketches

## Storage

Both notes and canvas data are automatically saved to:
1. `browser.storage.local` (Firefox extension)
2. `localStorage` (fallback)
3. Memory storage (final fallback)

## Future Enhancements

- Notes embedded within canvas
- Collaborative editing
- Export to various formats
- Integration with browser bookmarks
- Cloud sync support
