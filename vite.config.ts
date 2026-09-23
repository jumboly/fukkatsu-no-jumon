import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 等のサブパス配信でも壊れないよう相対パスでビルドする
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
