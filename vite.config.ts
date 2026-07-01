import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: './manifest.json',
      watchFilePaths: ['manifest.json'],
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        // 入口文件会由插件自动从 manifest.json 读取
      },
    },
  },
});
