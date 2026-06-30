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
      top: 16px;
      right: 16px;
      z-index: 9999;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #ffffff;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
      transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
      pointer-events: auto;
      user-select: none;
      opacity: 0;
      transform: translateY(6px) scale(0.96);
    }
    [class*="block-video"]:hover .doubao-dl-btn {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .doubao-dl-btn:hover:not(:disabled) {
      border-color: rgba(255, 255, 255, 0.36);
      background: rgba(255, 255, 255, 0.24);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
      transform: translateY(-1px) scale(1.02);
    }
    .doubao-dl-btn:active:not(:disabled) {
      transform: translateY(0) scale(0.97);
      background: rgba(255, 255, 255, 0.2);
    }
    .doubao-dl-btn:disabled {
      cursor: not-allowed;
      opacity: 1;
    }
    .doubao-dl-btn svg {
      width: 18px;
      height: 18px;
      transition: transform 0.18s ease, opacity 0.18s ease;
    }
    .doubao-dl-btn:hover svg {
      transform: translateY(1px);
    }
    .doubao-dl-btn.doubao-dl-busy {
      opacity: 1 !important;
      border-color: rgba(255, 255, 255, 0.4);
      background: rgba(255, 255, 255, 0.24);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
    }
    .doubao-dl-btn.doubao-dl-success {
      opacity: 1 !important;
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.42);
      background: rgba(16, 185, 129, 0.28);
    }
    .doubao-dl-btn.doubao-dl-error {
      opacity: 1 !important;
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.38);
      background: rgba(239, 68, 68, 0.24);
    }
    .doubao-dl-btn svg.animate-spin {
      animation: doubao-spin 1s linear infinite;
    }
    .doubao-dl-btn.doubao-dl-busy svg:not(.animate-spin) {
      animation: doubao-pulse 1s ease-in-out infinite;
    }
    @keyframes doubao-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes doubao-pulse {
      0%, 100% { opacity: 1; transform: translateY(0); }
      50% { opacity: 0.7; transform: translateY(1px); }
    }
  `;
  document.head.appendChild(style);
}

const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
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
  if (!(el.querySelector('[class*="cover-"]') ||
        el.querySelector('[class*="video-player"]') ||
        el.querySelector('[class*="play-icon"]'))) return;

  const messageId = findMessageId(el);
  if (messageId) {
    injectVideoDownloadButton(el, messageId);
  }
}

function scanAndInjectVideos() {
  document.querySelectorAll('[class*="block-video"]').forEach(tryInjectForVideo);
}

function scanAndInject() {
  scanAndInjectVideos();
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
          if (node.classList && typeof node.className === 'string' && node.className.includes('block-video')) {
            tryInjectForVideo(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('[class*="block-video"]').forEach(tryInjectForVideo);
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
});

// 来自 background.js 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'startVideoDownload') {
    window.postMessage({ type: 'startVideoDownload' }, '*');
    sendResponse({ success: true });
    return true;
  }
});

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

console.log('[Doubao DL] forwarder.js (新版) 已加载');