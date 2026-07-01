/**
 * @file forwarder.js
 * @description 豆包视频下载 - 隔离世界桥接脚本（新版）
 * 在页面注入下载按钮，与 content.js (MAIN world) 通信获取无水印视频地址
 */

const videoButtonMap = new Map();

// ==================== 样式注入 ====================

function injectStyles() {
  if (document.getElementById('doubao-dl-styles')) return;
  const style = document.createElement('style');
  style.id = 'doubao-dl-styles';
  style.textContent = `
    .doubao-dl-btn {
      position: absolute;
      right: 16px;
      bottom: 16px;
      z-index: 9999;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border: none;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.62);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      color: #ffffff;
      font-size: 12px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      cursor: pointer;
      transition: background 0.2s, transform 0.15s, opacity 0.18s ease;
      pointer-events: auto;
      user-select: none;
      opacity: 0;
      transform: translateY(6px) scale(0.96);
    }
    [class*="block-video"]:hover .doubao-dl-btn,
    [class*="block-image"]:hover .doubao-dl-btn {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .doubao-dl-btn:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.82);
      transform: scale(1.05);
    }
    .doubao-dl-btn:active:not(:disabled) {
      transform: scale(0.97);
    }
    .doubao-dl-btn:disabled {
      cursor: not-allowed;
      opacity: 1;
    }
    .doubao-dl-btn svg {
      width: 14px;
      height: 14px;
      transition: transform 0.18s ease;
    }
    .doubao-dl-btn:hover svg {
      transform: translateY(1px);
    }
    .doubao-dl-btn.doubao-dl-busy {
      opacity: 1;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.4);
    }
    .doubao-dl-btn.doubao-dl-busy svg.animate-spin {
      animation: doubao-spin 1s linear infinite;
    }
    .doubao-dl-btn.doubao-dl-success {
      opacity: 1;
      background: rgba(16, 185, 129, 0.28);
    }
    .doubao-dl-btn.doubao-dl-error {
      opacity: 1;
      background: rgba(239, 68, 68, 0.24);
    }
    .doubao-dl-btn .dl-progress-text {
      font-size: 10px;
      font-weight: 700;
    }
    @keyframes doubao-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 无水印';
const SUCCESS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ERROR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

// ==================== 按钮注入 ====================

function findMessageId(element) {
  let el = element;
  for (let i = 0; i < 20 && el && el !== document.body; i++) {
    if (el.dataset) {
      if (el.dataset.messageId) return el.dataset.messageId;
      if (el.dataset.message_id) return el.dataset.message_id;
    }
    el = el.parentElement;
  }
  return null;
}

function injectVideoDownloadButton(container, messageId) {
  if (container.dataset.doubaoVideoInjected) return;
  container.dataset.doubaoVideoInjected = '1';

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  const btn = document.createElement('button');
  btn.className = 'doubao-dl-btn';
  btn.title = '下载无水印视频';
  btn.innerHTML = DOWNLOAD_ICON;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.disabled = true;
    btn.classList.remove('doubao-dl-success', 'doubao-dl-error');
    btn.classList.add('doubao-dl-busy');
    btn.innerHTML = '<svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
    videoButtonMap.set(messageId, btn);
    // 向 content.js (MAIN world) 发送下载请求
    window.postMessage({ type: 'startVideoDownloadByMessageId', messageId }, '*');
  });

  container.appendChild(btn);
}

function tryInjectForVideo(el) {
  if (!el.className || typeof el.className !== 'string') return;
  if (!el.className.includes('block-video')) return;
  if (el.dataset.doubaoVideoInjected) return;

  // 确认是真正的视频卡片
  const hasCover = el.querySelector('[class*="cover-"]');
  const hasPlayer = el.querySelector('[class*="video-player"]');
  const hasPlayIcon = el.querySelector('[class*="play-icon"]');
  if (!(hasCover || hasPlayer || hasPlayIcon)) return;

  el.dataset.doubaoVideoInjected = '1';
  const messageId = findMessageId(el);
  console.log(`[AI去水印·豆包] 注入视频按钮: messageId=${messageId || 'null'}`);

  if (messageId) {
    injectVideoDownloadButton(el, messageId);
  } else {
    injectGenericDownloadButton(el, 'video');
  }
}

// 通用下载按钮（不依赖 messageId）
function injectGenericDownloadButton(container, type) {
  if (container.dataset.doubaoGenericInjected) return;
  container.dataset.doubaoGenericInjected = '1';

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  const btn = document.createElement('button');
  btn.className = 'doubao-dl-btn';
  btn.title = type === 'video' ? '下载无水印视频' : '下载图片';
  btn.innerHTML = DOWNLOAD_ICON;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.disabled = true;
    btn.classList.add('doubao-dl-busy');
    btn.innerHTML = '<svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';

    // 通过 postMessage 请求 content.js (MAIN world) 获取最新 URL
    window.postMessage({ type: 'startVideoDownload' }, '*');

    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove('doubao-dl-busy');
      btn.innerHTML = DOWNLOAD_ICON;
    }, 3000);
  });

  container.appendChild(btn);
}

// 图片卡片注入
function tryInjectForImage(el) {
  if (!el.className || typeof el.className !== 'string') return;
  if (!el.className.includes('block-image')) return;
  if (el.dataset.doubaoImageInjected) return;

  const hasImg = el.querySelector('img');
  const hasImageClass = el.querySelector('[class*="image-"]');
  if (!(hasImg || hasImageClass)) return;

  el.dataset.doubaoImageInjected = '1';
  console.log('[AI去水印·豆包] 注入图片按钮');
  injectGenericDownloadButton(el, 'image');
}

function scanAndInject() {
  scanAndInjectVideos();
  scanAndInjectImages();
}

function scanAndInjectImages() {
  const cards = document.querySelectorAll('[class*="block-image"]');
  console.log(`[AI去水印·豆包] 扫描到 ${cards.length} 个图片卡片`);
  cards.forEach(tryInjectForImage);
}

// ==================== DOM 观察 ====================

let domObserverActive = false;

function startDOMObserver() {
  if (domObserverActive) return;
  domObserverActive = true;
  injectStyles();
  scanAndInject();

  new MutationObserver((mutations) => {
    let needRescan = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList && typeof node.className === 'string') {
            if (node.className.includes('block-video')) {
              tryInjectForVideo(node);
            }
            if (node.className.includes('block-image')) {
              tryInjectForImage(node);
            }
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('[class*="block-video"]').forEach(tryInjectForVideo);
            node.querySelectorAll('[class*="block-image"]').forEach(tryInjectForImage);
          }
        }
        needRescan = true;
      }
    }
    if (needRescan) scanAndInject();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });
}

// ==================== 消息通信 ====================

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg) return;

  // 转发 bigmusicShareSave 到 background.js（旧方案回退）
  if (msg.type === 'bigmusicShareSave') {
    try {
      chrome.runtime.sendMessage(
        { type: 'bigmusicShareSave', messageId: msg.messageId },
        (response) => {
          window.postMessage({ type: 'bigmusicShareSaveResult', data: response }, '*');
        }
      );
    } catch {
      window.postMessage({ type: 'bigmusicShareSaveResult', data: null }, '*');
    }
  }

  // 视频下载结果处理
  if (msg.type === 'videoDownloadResult') {
    const result = msg.data;
    const messageId = result?.messageId;
    const btn = messageId ? videoButtonMap.get(messageId) : null;

    if (btn) {
      btn.classList.remove('doubao-dl-busy');
      if (result?.success && result?.videoUrl) {
        btn.innerHTML = SUCCESS_ICON;
        btn.classList.add('doubao-dl-success');
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = DOWNLOAD_ICON;
          btn.classList.remove('doubao-dl-success');
        }, 3000);
      } else {
        btn.innerHTML = ERROR_ICON;
        btn.classList.add('doubao-dl-error');
        btn.disabled = false;
        setTimeout(() => {
          btn.innerHTML = DOWNLOAD_ICON;
          btn.classList.remove('doubao-dl-error');
        }, 3000);
      }
      videoButtonMap.delete(messageId);
    }

    // 转发下载结果到 background.js 执行实际下载
    if (result?.success && result?.videoUrl) {
      chrome.runtime.sendMessage({ type: 'videoDownloadResult', data: result }).catch(() => {});
    }
  }

  // 视频数据提取结果 → 触发按钮注入
  if (msg.type === 'videoDataExtracted') {
    setTimeout(scanAndInjectVideos, 300);
    setTimeout(scanAndInjectVideos, 1000);
    setTimeout(scanAndInjectVideos, 2500);
  }

  // ========== 15s 时长扩展桥接（MAIN world ↔ chrome.storage） ==========
  if (msg.type === 'aiwm_d15_get_state') {
    chrome.storage.local.get(['aiwm_d15_enabled', 'codex_doubao_video_duration_choice'], (result) => {
      window.postMessage({
        type: 'aiwm_d15_state_result',
        data: {
          enabled: result.aiwm_d15_enabled === true,
          duration: Number(result.codex_doubao_video_duration_choice) || 0
        }
      }, '*');
    });
  }

  if (msg.type === 'aiwm_d15_set_enabled') {
    chrome.storage.local.set({ aiwm_d15_enabled: msg.value === true });
  }

  if (msg.type === 'aiwm_d15_set_duration') {
    if (msg.value) {
      chrome.storage.local.set({ codex_doubao_video_duration_choice: String(msg.value) });
    } else {
      chrome.storage.local.remove('codex_doubao_video_duration_choice');
    }
  }
});

// 来自 background.js 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'startVideoDownload') {
    window.postMessage({ type: 'startVideoDownload' }, '*');
    sendResponse({ success: true });
    return true;
  }

  // 下载进度更新
  if (msg.type === 'DOWNLOAD_PROGRESS') {
    updateButtonProgress(msg.percent, msg.state);
  }
});

// 进度显示：找到当前 busy 状态的按钮更新文本
function updateButtonProgress(percent, state) {
  const busyBtn = document.querySelector('.doubao-dl-btn.doubao-dl-busy');
  if (!busyBtn) return;

  if (state === 'complete') {
    // 完成由 videoDownloadResult 处理，这里不重复
  } else if (state === 'interrupted') {
    busyBtn.classList.remove('doubao-dl-busy');
    busyBtn.classList.add('doubao-dl-error');
    busyBtn.innerHTML = ERROR_ICON;
    busyBtn.disabled = false;
    setTimeout(() => {
      busyBtn.innerHTML = DOWNLOAD_ICON;
      busyBtn.classList.remove('doubao-dl-error');
    }, 3000);
  } else if (percent >= 0) {
    // 显示百分比
    const existingProgress = busyBtn.querySelector('.dl-progress-text');
    if (existingProgress) {
      existingProgress.textContent = `${percent}%`;
    } else {
      const span = document.createElement('span');
      span.className = 'dl-progress-text';
      span.style.cssText = 'font-size:10px;color:#fff;font-weight:700;';
      span.textContent = `${percent}%`;
      busyBtn.innerHTML = '';
      busyBtn.appendChild(span);
    }
  }
}

// ==================== 初始化 ====================

function init() {
  startDOMObserver();
  
  const triggerScan = () => {
    scanAndInject();
    window.postMessage({ type: 'scanInitialVideos' }, '*');
  };

  triggerScan();
  setTimeout(triggerScan, 1000);
  setTimeout(triggerScan, 3000);

  // 监听 SPA 路由变化
  const handleRouteChange = () => {
    setTimeout(triggerScan, 500);
    setTimeout(triggerScan, 2000);
  };
  window.addEventListener('popstate', handleRouteChange);
  window.addEventListener('pushState', handleRouteChange);
  window.addEventListener('replaceState', handleRouteChange);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('[AI去水印·豆包视频] forwarder.js (新版) 已加载');