import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'es2022', // main.js awaits at the top level (the loading bar's steps)
    rollupOptions: {
      input: {
        game: resolve(__dirname, 'index.html'),
        viewer: resolve(__dirname, 'viewer.html'),
        bench: resolve(__dirname, 'bench.html'),
      },
    },
  },
});
