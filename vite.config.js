import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8001,
    strictPort: true,
  },
  preview: {
    port: 8001,
    strictPort: true,
  },
});
