// ============================================================
// AI去水印 - Vidu AI (vidu.com) 无水印下载
// API 研究结果（2026-07-01）：
// - Feed API: service.vidu.com/vidu/v1/feed/list
// - 数据结构: list[].media_asset.creation.uri = 视频 URL
//             list[].short_film.creation.uri = 短片视频 URL
// - CDN: vidu.cf.vidu.studio（用户内容）/ image01.cf.vidu.studio（静态）
// ============================================================
(function () {
  'use strict';

  const LOG = '[AI去水印·Vidu]';
  const SITE = 'vidu';

  // ==================== 站点开关检查 ====================
  let enabled = true;
  chrome.runtime.sendMessage({ type: 'GET_SITE_MODULES' }, (resp) => {
    if (resp?.success) {
      enabled = resp.modules[SITE] !== false;
      if (!enabled) {
        console.log(`${LOG} 已在设置中禁用，跳过`);
        return;
      }
      init();
    }
  });

  // ==================== 数据层 ====================
  const capturedVideos = new Map();

  function addVideo(url, data) {
    if (!url) return;
    const base = getBaseUrl(url);
    if (capturedVideos.has(base)) return;
    capturedVideos.set(base, { url, ...data, addedAt: Date.now() });
    console.log(`${LOG} 新增视频: ${capturedVideos.size} 个`);
    updateBadge();
  }

  function getBaseUrl(url) {
    try { return new URL(url).origin + new URL(url).pathname; }
    catch { return url; }
  }

  // ==================== fetch 拦截 ====================
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url) || '';

    // 拦截 feed 列表 API
    if (url.includes('/vidu/v1/feed/list')) {
      try {
        const clone = resp.clone();
        clone.json().then((data) => {
          if (data?.list) {
            extractFromFeedList(data.list);
          }
        }).catch(() => {});
      } catch (_) {}
    }

    // 拦截单个作品详情 API
    if (url.includes('/vidu/v1/creations/') || url.includes('/vidu/v1/media-asset/')) {
      try {
        const clone = resp.clone();
        clone.json().then((data) => {
          if (data?.creation?.uri) {
            addVideo(data.creation.uri, {
              name: data.title || data.detail || '',
              id: data.id || '',
              tag: data.tag || '',
              creator: data.creator?.nick_name || ''
            });
          }
        }).catch(() => {});
      } catch (_) {}
    }

    return resp;
  };

  // 从 feed list 提取视频 URL
  function extractFromFeedList(list) {
    for (const item of list) {
      // media_asset 类型
      if (item.type === 'media_asset' && item.media_asset) {
        const ma = item.media_asset;
        if (ma.creation?.uri) {
          addVideo(ma.creation.uri, {
            name: ma.detail || ma.brief || '',
            id: ma.id || '',
            tag: ma.tag || '',
            creator: ma.creator?.nick_name || '',
            cover: ma.creation?.cover_uri || ''
          });
        }
      }
      // short_film 类型
      if (item.type === 'short_film' && item.short_film) {
        const sf = item.short_film;
        if (sf.creation?.uri) {
          addVideo(sf.creation.uri, {
            name: sf.title || sf.detail || '',
            id: sf.id || '',
            tag: '短片',
            creator: sf.creator?.nick_name || '',
            cover: sf.creation?.cover_uri || ''
          });
        }
      }
    }
  }

  // ==================== 下载 ====================
  async function downloadVideo(url) {
    const filename = formatFilename({ site: 'vidu', title: '', ext: 'mp4' });
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'downloadFile', url, filename
      });
      if (resp?.success) {
        showToast('✅ 下载成功');
      } else {
        throw new Error(resp?.error || '下载失败');
      }
    } catch (e) {
      showToast('❌ ' + e.message, true);
    }
  }

  // 复用 background.js 的格式化（简化版）
  function formatFilename(data) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const idx = String(capturedVideos.size).padStart(2, '0');
    return `${data.site || 'vidu'}_${date}_${idx}.${data.ext || 'mp4'}`;
  }

  // ==================== UI：悬浮指示器 ====================
  let indicator = null;

  function createIndicator() {
    if (indicator) return;
    indicator = document.createElement('div');
    indicator.id = 'aiwm-vidu-indicator';
    indicator.innerHTML = `
      <style>
        #aiwm-vidu-indicator {
          position: fixed; bottom: 80px; right: 24px; z-index: 2147483647;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          font-family: -apple-system, sans-serif; user-select: none;
        }
        #aiwm-vidu-indicator .badge {
          background: linear-gradient(135deg, #00d4aa, #0088ff);
          color: #fff; border-radius: 30px; padding: 8px 16px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
          transition: transform 0.2s;
        }
        #aiwm-vidu-indicator .badge:hover { transform: scale(1.05); }
        #aiwm-vidu-indicator .actions {
          display: none; flex-direction: column; gap: 4px;
          background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
          border-radius: 12px; padding: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }
        #aiwm-vidu-indicator .actions.visible { display: flex; }
        #aiwm-vidu-indicator .actions button {
          background: transparent; color: #fff; border: none;
          padding: 8px 16px; border-radius: 8px; font-size: 12px;
          cursor: pointer; white-space: nowrap; text-align: left;
          transition: background 0.15s;
        }
        #aiwm-vidu-indicator .actions button:hover {
          background: rgba(255,255,255,0.15);
        }
        #aiwm-vidu-indicator .actions button:disabled {
          opacity: 0.4; cursor: not-allowed;
        }
      </style>
      <div class="actions" id="aiwm-vidu-actions"></div>
      <div class="badge" id="aiwm-vidu-badge">🎬 0</div>
    `;
    const append = () => {
      if (document.body) document.body.appendChild(indicator);
      else setTimeout(append, 300);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', append);
    else append();
  }

  function bindIndicatorEvents() {
    const badge = document.getElementById('aiwm-vidu-badge');
    const actions = document.getElementById('aiwm-vidu-actions');
    if (!badge || !actions) return;

    let expanded = false;
    badge.addEventListener('click', () => {
      expanded = !expanded;
      actions.classList.toggle('visible', expanded);
      if (expanded) renderActionList();
    });

    document.addEventListener('click', (e) => {
      if (!indicator.contains(e.target) && expanded) {
        expanded = false;
        actions.classList.remove('visible');
      }
    });
  }

  function renderActionList() {
    const actions = document.getElementById('aiwm-vidu-actions');
    if (!actions) return;
    const videos = Array.from(capturedVideos.values());
    actions.innerHTML = '';

    // 下载最新一个
    if (videos.length > 0) {
      const latest = videos[videos.length - 1];
      const btn = document.createElement('button');
      btn.textContent = `⬇️ 下载最新视频`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadVideo(latest.url);
      });
      actions.appendChild(btn);
    }

    // 全部打包下载
    if (videos.length > 1) {
      const btnAll = document.createElement('button');
      btnAll.textContent = `📦 打包下载全部 (${videos.length})`;
      btnAll.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!window.JSZip) {
          showToast('❌ JSZip 未加载，请刷新页面重试', true);
          return;
        }
        btnAll.disabled = true;
        btnAll.textContent = '📦 打包中 0%...';
        try {
          await downloadAllAsZip(videos, 'vidu', (pct) => {
            btnAll.textContent = `📦 打包中 ${pct}%...`;
          });
          btnAll.textContent = '✅ 打包完成';
          showToast('✅ ZIP 打包下载完成');
          setTimeout(() => { btnAll.textContent = `📦 打包下载全部 (${videos.length})`; btnAll.disabled = false; }, 3000);
        } catch (err) {
          showToast('❌ 打包失败: ' + err.message, true);
          btnAll.textContent = `📦 打包下载全部 (${videos.length})`;
          btnAll.disabled = false;
        }
      });
      actions.appendChild(btnAll);
    }

    if (videos.length === 0) {
      const empty = document.createElement('button');
      empty.textContent = '暂无捕获的视频';
      empty.disabled = true;
      actions.appendChild(empty);
    }
  }

  function updateBadge() {
    const badge = document.getElementById('aiwm-vidu-badge');
    if (!badge) return;
    badge.textContent = `🎬 ${capturedVideos.size}`;
  }

  // ==================== Toast ====================
  function showToast(msg, isError) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position:fixed;bottom:30px;left:50%;transform:translateX(-50%);
      background:${isError ? '#ef4444' : '#10b981'};color:#fff;
      padding:10px 24px;border-radius:30px;font-size:14px;z-index:2147483647;
      box-shadow:0 4px 15px rgba(0,0,0,0.2);font-family:-apple-system,sans-serif;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
  }

  // ==================== 带重试的 fetch ====================
  async function fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const resp = await fetch(url);
        if (resp.ok) return resp;
        if (i === maxRetries - 1) throw new Error(`HTTP ${resp.status}`);
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        console.log(`[AI去水印] 重试 ${i + 1}/${maxRetries}，等待 ${delay}ms: ${url.substring(0, 60)}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // ==================== 批量打包下载 ====================
  async function downloadAllAsZip(videos, siteName, onProgress) {
    const zip = new JSZip();
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    let downloaded = 0;
    const total = videos.length;
    const concurrency = 3;

    // 分批并发下载
    for (let i = 0; i < total; i += concurrency) {
      const batch = videos.slice(i, i + concurrency);
      await Promise.all(batch.map(async (v, j) => {
        try {
          const resp = await fetchWithRetry(v.url);
          const blob = await resp.blob();
          const idx = String(i + j + 1).padStart(2, '0');
          const name = v.name ? v.name.replace(/[\\/:*?"<>|\s]+/g, '_').substring(0, 30) : '';
          const filename = name ? `${siteName}_${name}_${idx}.mp4` : `${siteName}_${date}_${idx}.mp4`;
          zip.file(filename, blob);
        } catch (err) {
          console.warn(`[AI去水印] 打包跳过: ${err.message}`);
        }
        downloaded++;
        if (onProgress) onProgress(Math.round(downloaded / total * 100));
      }));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const objectUrl = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `AI去水印_${siteName}_${date}.zip`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(objectUrl); }, 1000);
  }

  // ==================== 初始化 ====================
  function init() {
    console.log(`${LOG} Vidu AI 下载模块已加载 (v1.2.0)`);
    createIndicator();
    bindIndicatorEvents();
  }
})();
