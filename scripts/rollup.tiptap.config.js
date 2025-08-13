import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'scripts/tiptap.bundle.entry.js',
  output: {
    file: 'src/zen/vendor/tiptap.bundle.js',
    format: 'iife',
    name: 'ZenTiptap',
    sourcemap: false,
  },
  plugins: [
    nodeResolve({ 
      browser: true, 
      preferBuiltins: false,
    }),
    commonjs({
      transformMixedEsModules: true,
    }),
    terser({
      compress: {
        drop_console: false,
      },
    }),
  ],
};
