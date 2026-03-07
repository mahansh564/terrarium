import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      phaser: resolve(__dirname, 'node_modules/phaser/dist/phaser-arcade-physics.min.js')
    }
  },
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    lib: {
      entry: resolve(__dirname, 'src/webview/main.ts'),
      name: 'CodeOrbitWebview',
      formats: ['iife'],
      fileName: () => 'main.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
