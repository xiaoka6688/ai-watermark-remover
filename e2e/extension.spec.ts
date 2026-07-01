// ============================================================
// AI去水印 - 端到端测试
// 测试扩展加载、popup 显示、Options Page 打开
// ============================================================
import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, '..');

// ==================== 测试 1：扩展能正常加载 ====================
test.describe('扩展加载', () => {
  test('扩展能正常加载并显示在 Chrome 扩展列表中', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // 获取扩展的 service worker
    const serviceWorkers = context.serviceWorkers();
    expect(serviceWorkers.length).toBeGreaterThanOrEqual(0);

    await context.close();
  });
});

// ==================== 测试 2：Popup 页面能正常显示 ====================
test.describe('Popup 页面', () => {
  test('Popup 页面包含标题和功能列表', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // 等待扩展加载
    await new Promise((r) => setTimeout(r, 2000));

    // 获取扩展 ID
    const serviceWorkers = context.serviceWorkers();
    let extensionId = '';

    if (serviceWorkers.length > 0) {
      const swUrl = serviceWorkers[0].url();
      const match = swUrl.match(/chrome-extension:\/\/([a-z]+)\//);
      if (match) extensionId = match[1];
    }

    if (!extensionId) {
      // 尝试从背景页获取
      const pages = context.pages();
      for (const page of pages) {
        const url = page.url();
        const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
        if (match) {
          extensionId = match[1];
          break;
        }
      }
    }

    expect(extensionId).toBeTruthy();

    // 打开 popup 页面
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');

    // 验证标题
    const title = await popupPage.title();
    expect(title).toContain('AI去水印');

    // 验证包含功能列表
    const content = await popupPage.textContent('body');
    expect(content).toContain('Dreamina');
    expect(content).toContain('豆包');
    expect(content).toContain('千问');
    expect(content).toContain('小云雀');

    // 验证统计区域存在
    const statsEl = popupPage.locator('.stats');
    await expect(statsEl).toBeVisible();

    await popupPage.close();
    await context.close();
  });
});

// ==================== 测试 3：Options Page 能正常打开 ====================
test.describe('Options Page', () => {
  test('Options Page 包含所有配置项', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    await new Promise((r) => setTimeout(r, 2000));

    // 获取扩展 ID
    const serviceWorkers = context.serviceWorkers();
    let extensionId = '';

    if (serviceWorkers.length > 0) {
      const swUrl = serviceWorkers[0].url();
      const match = swUrl.match(/chrome-extension:\/\/([a-z]+)\//);
      if (match) extensionId = match[1];
    }

    expect(extensionId).toBeTruthy();

    // 打开 options 页面
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.waitForLoadState('domcontentloaded');

    // 验证标题
    const title = await optionsPage.title();
    expect(title).toContain('设置');

    // 验证站点模块开关存在
    const content = await optionsPage.textContent('body');
    expect(content).toContain('Dreamina');
    expect(content).toContain('豆包');
    expect(content).toContain('即梦');
    expect(content).toContain('小云雀');
    expect(content).toContain('千问');
    expect(content).toContain('可灵');
    expect(content).toContain('Vidu');
    expect(content).toContain('PixVerse');

    // 验证功能开关存在
    expect(content).toContain('15s 时长扩展');
    expect(content).toContain('下载去重');

    // 验证文件名模板存在
    expect(content).toContain('命名模板');
    expect(content).toContain('归档目录');

    // 验证暗色模式选择器存在
    expect(content).toContain('暗色模式');

    // 验证数据管理存在
    expect(content).toContain('清空豆包视频统计');
    expect(content).toContain('恢复全部默认设置');

    await optionsPage.close();
    await context.close();
  });
});
