// Canvas Bundle Entry Point
// This file imports Excalidraw modules and exposes them globally

// Define global process before any imports
if (typeof window !== 'undefined') {
  window.process = {
    env: { NODE_ENV: 'production' },
    browser: true,
    version: 'v16.0.0',
    platform: 'browser',
    nextTick: setTimeout,
    cwd: () => '',
    chdir: () => {},
    umask: () => 0,
    uptime: () => 0,
    hrtime: () => [0, 0],
    memoryUsage: () => ({ heapUsed: 0, heapTotal: 0, external: 0, rss: 0 }),
    exit: () => {},
    kill: () => {},
    on: () => {},
    off: () => {},
    emit: () => {},
    listeners: () => [],
    removeAllListeners: () => {},
    removeListener: () => {},
    addListener: () => {},
    prependListener: () => {},
    prependOnceListener: () => {},
    once: () => {},
    setMaxListeners: () => {},
    getMaxListeners: () => 0,
    listenerCount: () => 0,
    eventNames: () => [],
    rawListeners: () => [],
    setUncaughtExceptionCaptureCallback: () => {},
    hasUncaughtExceptionCaptureCallback: () => false,
    setUnhandledRejectionCaptureCallback: () => {},
    hasUnhandledRejectionCaptureCallback: () => false,
    emitWarning: () => {},
    binding: () => {},
    moduleLoadList: [],
    release: {},
    features: {},
    versions: {},
    arch: 'x64',
    pid: 0,
    title: 'browser',
    argv: [],
    execArgv: [],
    execPath: '',
    mainModule: undefined,
    connected: false,
    allowedNodeEnvironmentFlags: [],
    debugPort: 0,
    noDeprecation: false,
    throwDeprecation: false,
    traceDeprecation: false,
    dlopen: () => {},
    'hrtime.bigint': () => BigInt(0),
    cpuUsage: () => ({ user: 0, system: 0 }),
    resourceUsage: () => ({ fsRead: 0, fsWrite: 0, voluntaryContextSwitches: 0, involuntaryContextSwitches: 0 })
  };
  
  // Also define global.process for modules that expect it
  if (typeof global !== 'undefined') {
    global.process = window.process;
  }
}

// Import React and ReactDOM first
import React from 'react';
import ReactDOM from 'react-dom';

// Import Excalidraw
import { Excalidraw } from '@excalidraw/excalidraw';

// Expose Canvas globally for use in the browser
window.ZenCanvas = {
  React,
  ReactDOM,
  Excalidraw,
  
  createCanvas: (element, options = {}) => {
    return ReactDOM.render(
      React.createElement(Excalidraw, options),
      element
    );
  },
  
  // Helper function to create a simple canvas
  createSimpleCanvas: (element) => {
    return ReactDOM.render(
      React.createElement(Excalidraw, {
        initialData: {
          elements: [],
          appState: {
            viewBackgroundColor: '#ffffff'
          }
        }
      }),
      element
    );
  }
};

console.log('[CanvasBundle] Excalidraw loaded and exposed globally as window.ZenCanvas');
