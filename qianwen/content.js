// ============================================================
// 小柒去水印插件 - 千问图片/视频去水印下载
// 功能：自动检测千问 AI 生成的图片和视频，添加下载按钮
// 说明：整合自 XQ 插件（已移除右下角悬浮面板）
// ============================================================
(function() {
  'use strict';

  console.log('[AI去水印·千问] 脚本启动 v1.0');

  // ========================= 全局数据 =========================
  if (!window.__XQ_QW_DATA__) {
    window.__XQ_QW_DATA__ = {
      imageList: [],
      videoList: [],
      imageUrlSet: new Set(),
      videoUrlSet: new Set(),
      processedImages: new WeakSet(),
      processedVideos: new WeakSet(),
      scanCompleted: false,
      initialized: false
    };
  }

  const data = window.__XQ_QW_DATA__;
  const { imageList, videoList, imageUrlSet, videoUrlSet, processedImages, processedVideos } = data;

  // ========== 工具函数 ==========

  function getBaseUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch {
      return url;
    }
  }

  function isAiGeneratedImage(img) {
    if (!img || !img.src) return false;
    const src = img.src;
    if (src.startsWith('data:')) return false;
    return src.includes('qianwen.com') ||
           src.includes('tongyi') ||
           src.includes('aliyun') ||
           src.includes('alicdn');
  }

  // ========== 数据管理 ==========

  function addImage(url, width, height) {
    if (!url) return false;
    const baseUrl = getBaseUrl(url);
    if (!baseUrl) return false;
    if (imageUrlSet.has(baseUrl)) return false;
    imageUrlSet.add(baseUrl);
    imageList.push({ url, baseUrl, width: width || 0, height: height || 0 });
    return true;
  }

  function addVideo(url, prompt, width, height, coverUrl) {
    if (!url) return false;
    const baseUrl = getBaseUrl(url);
    if (!baseUrl) return false;
    if (videoUrlSet.has(baseUrl)) return false;
    videoUrlSet.add(baseUrl);
    videoList.push({
      url, baseUrl,
      prompt: prompt || '千问视频',
      width: width || 0,
      height: height || 0,
      coverUrl: coverUrl || ''
    });
    return true;
  }

  // ========== 扫描千问图片（从 DOM） ==========
  let hasScanned = false;
  function scanImagesFromDOM() {
    if (hasScanned) return;
    hasScanned = true;
    const images = document.querySelectorAll('img');
    for (const img of images) {
      if (!img.complete) continue;
      if (!isAiGeneratedImage(img)) continue;
      addImage(img.src, img.naturalWidth, img.naturalHeight);
    }
  }

  // ========== 扫描视频 ==========
  function scanVideosForButtons() {
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      if (processedVideos.has(video)) continue;
      const src = video.src || video.querySelector('source')?.src;
      if (!src) continue;
      if (src.includes('qianwen') || src.includes('tongyi') || src.includes('aliyun') || src.includes('alicdn')) {
        processedVideos.add(video);
        const prompt = video.closest('[class*="card"]')?.querySelector('[class*="prompt"], [class*="title"]')?.textContent?.trim() || '千问视频';
        addVideo(src, prompt);
        injectVideoButton(video);
      }
    }
  }

  // ========== 样式注入 ==========
  const DOWNLOAD_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

  function injectStyles() {
    if (document.getElementById('xq-qw-styles')) return;
    const style = document.createElement('style');
    style.id = 'xq-qw-styles';
    style.textContent = `
      .xq-dl-btn {
        position: absolute;
        bottom: 10px;
        right: 10px;
        z-index: 9999;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 12px;
        background: rgba(0, 0, 0, 0.62);
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        transition: background 0.2s, transform 0.15s;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
        line-height: 1;
        opacity: 0;
        pointer-events: none;
      }
      *:hover > .xq-dl-btn {
        opacity: 1;
        pointer-events: auto;
      }
      .xq-dl-btn:hover {
        background: rgba(0, 0, 0, 0.82);
        transform: scale(1.05);
      }
      .xq-dl-btn:disabled {
        opacity: 1;
        pointer-events: none;
        cursor: not-allowed;
      }
      .xq-dl-btn.xq-error {
        background: rgba(220, 38, 38, 0.8);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  // ========== 下载文件 ==========
  async function downloadFile(url, filename, btn, isImage = false) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'downloadFile',
        url: url,
        filename: filename
      });
      if (response && response.success) {
        if (btn) {
          btn.innerHTML = `${DOWNLOAD_ICON} ✓ 已下载`;
          btn.disabled = true;
          setTimeout(() => {
            btn.innerHTML = isImage ? `${DOWNLOAD_ICON} 下载原图` : `${DOWNLOAD_ICON} 下载视频`;
            btn.disabled = false;
          }, 2000);
        }
        return true;
      } else {
        throw new Error(response?.error || '下载失败');
      }
    } catch (error) {
      if (btn) {
        btn.innerHTML = '失败，点击重试';
        btn.classList.add('xq-error');
        setTimeout(() => {
          btn.innerHTML = isImage ? `${DOWNLOAD_ICON} 下载原图` : `${DOWNLOAD_ICON} 下载视频`;
          btn.classList.remove('xq-error');
          btn.disabled = false;
        }, 2000);
      }
      return false;
    }
  }

  // ========== 给图片添加下载按钮 ==========
  function injectImageButton(imgElement) {
    if (processedImages.has(imgElement)) return;
    if (!imgElement.src) return;
    if (!isAiGeneratedImage(imgElement)) return;

    const container = imgElement.parentElement;
    if (!container) return;
    if (container.querySelector('.xq-dl-btn')) return;

    processedImages.add(imgElement);

    const position = window.getComputedStyle(container).position;
    if (position === 'static') {
      container.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.className = 'xq-dl-btn';
    btn.innerHTML = `${DOWNLOAD_ICON} 下载原图`;

    btn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      btn.innerHTML = `${DOWNLOAD_ICON} 下载中...`;

      addImage(imgElement.src, imgElement.naturalWidth, imgElement.naturalHeight);
      const ts = Date.now();
      const filename = `qianwen_image_${ts}.png`;
      await downloadFile(imgElement.src, filename, btn, true);
    };

    container.appendChild(btn);
  }

  // ========== 给视频添加下载按钮 ==========
  function injectVideoButton(videoElement) {
    const container = videoElement.parentElement;
    if (!container) return;
    if (container.querySelector('.xq-dl-btn')) return;

    const position = window.getComputedStyle(container).position;
    if (position === 'static') {
      container.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.className = 'xq-dl-btn';
    btn.innerHTML = `${DOWNLOAD_ICON} 下载视频`;

    btn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      btn.innerHTML = `${DOWNLOAD_ICON} 下载中...`;

      const src = videoElement.src || videoElement.querySelector('source')?.src || '';
      const ts = Date.now();
      const filename = `qianwen_video_${ts}.mp4`;
      await downloadFile(src, filename, btn, false);
    };

    container.appendChild(btn);
  }

  // ========== MutationObserver 监听动态内容 ==========
  function startObserver() {
    const observer = new MutationObserver(() => {
      const images = document.querySelectorAll('img:not([data-xq-processed])');
      for (const img of images) {
        img.setAttribute('data-xq-processed', 'true');
        injectImageButton(img);
      }
      scanVideosForButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ========== 初始化 ==========
  function init() {
    if (data.initialized) return;
    data.initialized = true;

    injectStyles();

    setTimeout(() => {
      scanImagesFromDOM();
      scanVideosForButtons();
    }, 2000);

    startObserver();
    console.log('[AI去水印·千问] 初始化完成');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
