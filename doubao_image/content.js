// ============================================================
// AI去水印 - 豆包图片无水印下载（轻量版）
// 替代原 doubao-downloader.user.js（22880 行 → ~280 行）
// 核心机制：劫持 JSON.parse 拦截 creations 响应，提取 image_ori_raw
// ============================================================
(function () {
  'use strict';

  const LOG = '[AI去水印·豆包图片]';
  const STORAGE_KEY = 'doubao_downloaded_images';

  // ==================== 数据层 ====================
  const capturedImages = new Map(); // baseUrl → { url, addedAt }
  let downloadedSet = new Set();    // 已下载的 URL 集合（持久化）

  // 从 storage 恢复已下载记录
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    if (Array.isArray(result[STORAGE_KEY])) {
      downloadedSet = new Set(result[STORAGE_KEY]);
    }
  });

  function addImage(url) {
    if (!url || typeof url !== 'string') return;
    try {
      const base = new URL(url).origin + new URL(url).pathname;
      if (capturedImages.has(base)) return;
      capturedImages.set(base, { url, addedAt: Date.now() });
      console.log(`${LOG} 新增图片: ${capturedImages.size} 个`);
      // 通知 UI 刷新
      window.dispatchEvent(new CustomEvent('doubao-images-updated'));
    } catch (_) {}
  }

  function markDownloaded(url) {
    downloadedSet.add(url);
    // 持久化（批量写，避免频繁 IO）
    clearTimeout(markDownloaded._timer);
    markDownloaded._timer = setTimeout(() => {
      chrome.storage.local.set({ [STORAGE_KEY]: Array.from(downloadedSet) });
    }, 2000);
  }

  // ==================== JSON.parse 劫持 ====================
  // 这是原版最核心的机制：拦截所有 JSON.parse，提取 creations 中的原始图片 URL
  const _originalParse = JSON.parse;

  JSON.parse = function (text, reviver) {
    const result = _originalParse.call(this, text, reviver);

    // 快速过滤：只处理包含 creations 的响应
    if (typeof text === 'string' && text.includes('"creations"')) {
      try {
        extractFromCreations(result);
      } catch (_) {}
    }

    // 同时处理 play_info（视频，保留兼容）
    if (typeof text === 'string' && text.includes('"play_info"')) {
      // 视频逻辑由 doubao_video 模块处理，这里跳过
    }

    return result;
  };

  // 恢复 toString 伪装
  JSON.parse.toString = function () {
    return 'function parse() { [native code] }';
  };

  // 递归搜索 JSON 中所有含指定 key 的值
  function findAllKeysInJson(obj, targetKey, results) {
    if (!results) results = [];
    if (!obj || typeof obj !== 'object') return results;
    if (Array.isArray(obj)) {
      obj.forEach((item) => findAllKeysInJson(item, targetKey, results));
    } else {
      for (const key in obj) {
        if (key === targetKey) {
          results.push(obj[key]);
        }
        if (typeof obj[key] === 'object') {
          findAllKeysInJson(obj[key], targetKey, results);
        }
      }
    }
    return results;
  }

  // 从 creations 数组中提取原始图片 URL
  function extractFromCreations(json) {
    const creations = findAllKeysInJson(json, 'creations');
    if (!creations || creations.length === 0) return;

    for (const creationGroup of creations) {
      if (!Array.isArray(creationGroup)) continue;
      for (const item of creationGroup) {
        const rawUrl = item?.image?.image_ori_raw?.url;
        if (rawUrl) {
          addImage(rawUrl);
          // 同时修补页面预览图（让它显示无水印版本）
          try {
            if (item.image.image_ori) item.image.image_ori.url = rawUrl;
            if (item.image.image_preview) item.image.image_preview.url = rawUrl;
            if (item.image.image_thumb) item.image.image_thumb.url = rawUrl;
          } catch (_) {}
        }
      }
    }
  }

  // ==================== 下载逻辑 ====================
  async function downloadSingle(url, filename) {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'downloadImage',
        url: url,
        filename: filename || `doubao_image_${Date.now()}.png`
      });
      if (resp?.success) {
        markDownloaded(url);
        showToast('✅ 下载成功');
      } else {
        throw new Error(resp?.error || '下载失败');
      }
    } catch (e) {
      showToast('❌ ' + e.message, true);
    }
  }

  async function downloadAll() {
    const urls = Array.from(capturedImages.values())
      .map((v) => v.url)
      .filter((u) => !downloadedSet.has(u));

    if (urls.length === 0) {
      showToast('没有新图片需要下载');
      return;
    }

    // 单张直接下载
    if (urls.length === 1) {
      await downloadSingle(urls[0]);
      return;
    }

    // 多张逐个下载（避免 ZIP 依赖）
    showToast(`开始下载 ${urls.length} 张图片...`);
    let done = 0;
    for (const url of urls) {
      const name = getFileNameFromUrl(url) || `doubao_image_${Date.now()}_${done}.png`;
      await downloadSingle(url, name);
      done++;
      updateBadge();
    }
    showToast(`✅ ${done} 张图片下载完成`);
  }

  function getFileNameFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const last = pathname.split('/').pop();
      return last || null;
    } catch (_) {
      return null;
    }
  }

  // ==================== UI：悬浮指示器 ====================
  let indicator = null;

  function createIndicator() {
    if (indicator) return;

    indicator = document.createElement('div');
    indicator.id = 'aiwm-doubao-indicator';
    indicator.innerHTML = `
      <style>
        #aiwm-doubao-indicator {
          position: fixed; bottom: 80px; right: 24px; z-index: 2147483647;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          user-select: none;
        }
        #aiwm-doubao-indicator .badge {
          background: linear-gradient(135deg, #5aaaff, #9b82e6);
          color: #fff; border-radius: 30px; padding: 8px 16px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
          transition: transform 0.2s, box-shadow 0.2s;
          pointer-events: auto;
        }
        #aiwm-doubao-indicator .badge:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 20px rgba(0,0,0,0.3);
        }
        #aiwm-doubao-indicator .actions {
          display: none; flex-direction: column; gap: 4px;
          background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
          border-radius: 12px; padding: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }
        #aiwm-doubao-indicator .actions.visible { display: flex; }
        #aiwm-doubao-indicator .actions button {
          background: transparent; color: #fff; border: none;
          padding: 8px 16px; border-radius: 8px; font-size: 12px;
          cursor: pointer; white-space: nowrap; text-align: left;
          transition: background 0.15s;
        }
        #aiwm-doubao-indicator .actions button:hover {
          background: rgba(255,255,255,0.15);
        }
        #aiwm-doubao-indicator .actions button:disabled {
          opacity: 0.4; cursor: not-allowed;
        }
      </style>
      <div class="actions" id="aiwm-actions"></div>
      <div class="badge" id="aiwm-badge">📷 0</div>
    `;

    // 等 body 可用
    const append = () => {
      if (document.body) {
        document.body.appendChild(indicator);
        bindIndicatorEvents();
        updateBadge();
      } else {
        setTimeout(append, 300);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', append);
    } else {
      append();
    }
  }

  function bindIndicatorEvents() {
    const badge = document.getElementById('aiwm-badge');
    const actions = document.getElementById('aiwm-actions');
    if (!badge || !actions) return;

    let expanded = false;
    badge.addEventListener('click', () => {
      expanded = !expanded;
      actions.classList.toggle('visible', expanded);
      if (expanded) renderActionList();
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!indicator.contains(e.target) && expanded) {
        expanded = false;
        actions.classList.remove('visible');
      }
    });
  }

  function renderActionList() {
    const actions = document.getElementById('aiwm-actions');
    if (!actions) return;

    const images = Array.from(capturedImages.values());
    const newCount = images.filter((v) => !downloadedSet.has(v.url)).length;

    actions.innerHTML = '';

    // 下载全部未下载
    const btnAll = document.createElement('button');
    btnAll.textContent = `⬇️ 下载全部 (${newCount})`;
    btnAll.disabled = newCount === 0;
    btnAll.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadAll();
    });
    actions.appendChild(btnAll);

    // 下载最新一张
    if (images.length > 0) {
      const latest = images[images.length - 1];
      const btnLatest = document.createElement('button');
      btnLatest.textContent = `⬇️ 下载最新一张`;
      btnLatest.disabled = downloadedSet.has(latest.url);
      btnLatest.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadSingle(latest.url);
      });
      actions.appendChild(btnLatest);
    }

    // 清空记录
    const btnClear = document.createElement('button');
    btnClear.textContent = '🗑️ 清空下载记录';
    btnClear.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadedSet.clear();
      chrome.storage.local.remove(STORAGE_KEY);
      showToast('已清空下载记录');
      renderActionList();
    });
    actions.appendChild(btnClear);
  }

  function updateBadge() {
    const badge = document.getElementById('aiwm-badge');
    if (!badge) return;
    const total = capturedImages.size;
    const newCount = Array.from(capturedImages.values()).filter(
      (v) => !downloadedSet.has(v.url)
    ).length;
    badge.textContent = newCount > 0 ? `📷 ${total} · ${newCount}新` : `📷 ${total}`;
  }

  // ==================== Toast ====================
  function showToast(msg, isError) {
    const existing = document.querySelector('.aiwm-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'aiwm-toast';
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
      background: ${isError ? '#ef4444' : '#10b981'}; color: white;
      padding: 10px 24px; border-radius: 30px; font-size: 14px;
      z-index: 2147483647; font-weight: 500;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      font-family: -apple-system, sans-serif;
      animation: aiwmToastIn 0.3s ease;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // 注入动画
  const animStyle = document.createElement('style');
  animStyle.textContent = `
    @keyframes aiwmToastIn {
      from { transform: translateX(-50%) translateY(20px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(animStyle);

  // ==================== 初始化 ====================
  window.addEventListener('doubao-images-updated', () => {
    updateBadge();
  });

  // 延迟创建指示器（等页面加载完）
  setTimeout(createIndicator, 1000);

  console.log(`${LOG} 豆包图片下载模块已加载 (轻量版 v1.2.0)`);
})();
