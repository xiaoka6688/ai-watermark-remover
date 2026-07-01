import { defineConfig } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.resolve(__dirname);

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    headless: false, // Chrome 扩展需要 headed 模式
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chrome-extension',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
          ],
        },
      },
    },
  ],
});
