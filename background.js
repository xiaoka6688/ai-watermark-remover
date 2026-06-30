// ========== AI去水印 - Background Service Worker ==========
// 支持 Dreamina/即梦 + 豆包视频下载 + 豆包图片下载 + 15s 时长扩展 + 千问 + 小云雀
// v1.2.0 改造：videoList 持久化到 chrome.storage.local

let latestRequestedFilename = null;
let latestRequestedTime = 0;
const pendingDownloads = new Map();

// ========== 豆包视频数据持久化 ==========
// 旧版用 const videoList = [] 存内存，SW 30s 休眠后清空 → popup 统计重置
// 改为：chrome.storage.local 持久化 + 内存缓存（SW 实例存活期间复用）
const VIDEO_LIST_KEY = 'videoList';
const VIDEO_LIST_MAX_SIZE = 500; // 软上限，FIFO 淘汰
let videoListCache = null;       // null 表示尚未从 storage 加载
let videoListLoading = null;     // Promise，避免并发重复加载

function loadVideoListFromStorage() {
  // 并发保护：如果已经在加载中，复用同一个 Promise
  if (videoListLoading) return videoListLoading;
  videoListLoading = new Promise((resolve) => {
    chrome.storage.local.get([VIDEO_LIST_KEY], (result) => {
      const arr = Array.isArray(result[VIDEO_LIST_KEY]) ? result[VIDEO_LIST_KEY] : [];
      videoListCache = arr;
      videoListLoading = null;
      console.log(`[AI去水印] videoList 从 storage 恢复: ${arr.length} 条`);
      resolve(arr);
    });
  });
  return videoListLoading;
}

function saveVideoListToStorage(arr, callback) {
  // 软上限：超过 MAX_SIZE 截断前面的（保留最新）
  let toSave = arr;
  if (arr.length > VIDEO_LIST_MAX_SIZE) {
    toSave = arr.slice(arr.length - VIDEO_LIST_MAX_SIZE);
  }
  videoListCache = toSave; // 先更新内存，避免 GET_VIDEO_LIST 读到旧值
  chrome.storage.local.set({ [VIDEO_LIST_KEY]: toSave }, () => {
    if (chrome.runtime.lastError) {
      console.warn('[AI去水印] 保存 videoList 失败:', chrome.runtime.lastError.message);
    }
    if (typeof callback === 'function') callback();
  });
}

// 把新数据按 vid 去重后追加，并持久化
function appendVideosAndSave(currentList, newData, callback) {
  const existingVids = new Set(currentList.map((v) => v.vid));
  const filtered = newData.filter((v) => v && v.vid && !existingVids.has(v.vid));
  if (filtered.length === 0) {
    if (typeof callback === 'function') callback(currentList);
    return;
  }
  const updated = currentList.concat(filtered);
  saveVideoListToStorage(updated, function() {
    if (typeof callback === 'function') callback(updated);
  });
}

// SW 启动时预热缓存（避免第一次 GET_VIDEO_LIST 等待）
loadVideoListFromStorage();

// ==================== 豆包分享API（回退方案） ====================

async function callBigmusicShareSave(messageId) {
  const apiUrl = 'https://api-normal.doubao.com/alice/media/bigmusic/share_save?' +
    'version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858' +
    '&pkg_type=release_version&device_id=0&pc_version=3.14.6&region=CN&sys_region=CN' +
    '&samantha_web=1&use-olympus-account=1';

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ message_id: messageId })
    });
    const data = await resp.json();
    if (data.code === 0 && data.data) {
      const shareId = data.data.share_id;
      return {
        success: true,
        share_id: shareId,
        share_url: data.data.share_url || `https://www.doubao.com/video-sharing?share_id=${shareId}`
      };
    }
    return { success: false, error: `API错误: code=${data.code}, msg=${data.msg}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==================== 下载函数 ====================

async function downloadVideo(url, filename, saveAs = false) {
  pendingDownloads.set(url, filename);
  const downloadId = await chrome.downloads.download({
    url,
    filename,
    saveAs,
    conflictAction: 'uniquify'
  });
  return { success: true, downloadId, filename };
}

// ==================== 文件命名拦截 ====================

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (item.byExtensionId !== chrome.runtime.id) return;

  if (pendingDownloads.has(item.url)) {
    const filename = pendingDownloads.get(item.url);
    pendingDownloads.delete(item.url);
    suggest({ filename, conflictAction: 'uniquify' });
    return;
  }

  if (latestRequestedFilename && (Date.now() - latestRequestedTime < 10000)) {
    suggest({ filename: latestRequestedFilename, conflictAction: 'uniquify' });
  }
});

// ==================== 消息处理 ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ---- Dreamina / 即梦 下载 ----
  if (message.action === 'DOWNLOAD') {
    latestRequestedFilename = message.filename || `dreamina_video_${Date.now()}.mp4`;
    latestRequestedTime = Date.now();
    chrome.downloads.download({
      url: message.url,
      filename: latestRequestedFilename,
      saveAs: true,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }

  if (message.action === 'download_video') {
    const url = message.url;
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let filename = `下载_${dateStr}.mp4`;
    try {
      const urlObj = new URL(url);
      const targetName = urlObj.searchParams.get('filename');
      if (targetName) filename = targetName;
    } catch (_) {}
    chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }

  // ---- 豆包分享API（background 兜底调用） ----
  if (message.type === 'bigmusicShareSave') {
    callBigmusicShareSave(message.messageId)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  // ---- 豆包视频下载结果（来自 forwarder.js → content.js） ----
  if (message.type === 'videoDownloadResult') {
    const data = message.data;
    if (data?.success && data?.videoUrl) {
      const rawId = data.vid || data.messageId || Date.now();
      const sanitizedId = String(rawId).replace(/[\\/:*?"<>|]/g, '_');
      const filename = `${sanitizedId}.mp4`;
      downloadVideo(data.videoUrl, filename, false)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
    } else {
      sendResponse({ success: true });
    }
    return true;
  }

  // ---- 豆包视频数据统计（持久化版） ----
  if (message.type === 'videoDataExtracted') {
    var newData = message.data || [];
    // 确保内存缓存已加载
    if (videoListCache === null) {
      loadVideoListFromStorage().then(function(currentList) {
        appendVideosAndSave(currentList, newData, function(updated) {
          sendResponse({ success: true, count: updated.length });
        });
      });
      return true; // 保持 channel 开启
    }
    appendVideosAndSave(videoListCache, newData, function(updated) {
      sendResponse({ success: true, count: updated.length });
    });
    return true;
  }

  if (message.type === 'GET_VIDEO_LIST') {
    // 异步读取 storage，避免 SW 刚唤醒时返回空数组
    loadVideoListFromStorage().then(function(list) {
      sendResponse({ success: true, data: list });
    });
    return true;
  }

  // ---- 用于调试/重置：清空持久化列表 ----
  if (message.type === 'CLEAR_VIDEO_LIST') {
    videoListCache = [];
    saveVideoListToStorage([], function() {
      sendResponse({ success: true });
    });
    return true;
  }

  // ---- 15s 时长扩展状态（popup 读写） ----
  if (message.type === 'GET_15S_STATE') {
    chrome.storage.local.get(['xq_d15_enabled', 'codex_doubao_video_duration_choice'], (result) => {
      sendResponse({
        success: true,
        enabled: result.xq_d15_enabled === true,
        duration: Number(result.codex_doubao_video_duration_choice) || 0
      });
    });
    return true;
  }

  if (message.type === 'SET_15S_ENABLED') {
    chrome.storage.local.set({ xq_d15_enabled: message.value === true }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // ---- 豆包主动下载（popup 触发） ----
  if (message.type === 'startVideoDownload') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length) {
        sendResponse({ success: false, error: '未找到活动标签页' });
        return;
      }
      const tab = tabs[0];
      if (tab.url && tab.url.includes('doubao.com')) {
        chrome.tabs.sendMessage(tab.id, { type: 'startVideoDownload' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: '无法连接到页面，请刷新页面后重试' });
          } else {
            sendResponse({ success: true, response });
          }
        });
      } else {
        sendResponse({ success: false, error: '请在豆包页面使用此功能' });
      }
    });
    return true;
  }

  // ---- 千问文件下载（来自 qianwen_content.js） ----
  if (message.type === 'downloadFile') {
    const url = message.url;
    const filename = message.filename || `download_${Date.now()}.mp4`;
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }

  // ---- 即梦图片下载（来自 jimeng_content.js，支持 Base64） ----
  if (message.type === 'downloadImage') {
    (async () => {
      try {
        let url = message.url;
        let filename = message.filename || `image_${Date.now()}.jpg`;

        if (url.startsWith('data:')) {
          const response = await fetch(url);
          const blob = await response.blob();
          url = URL.createObjectURL(blob);
        }

        chrome.downloads.download({
          url: url,
          filename: filename,
          saveAs: false,
          conflictAction: 'uniquify'
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, downloadId });
          }
        });

        if (url.startsWith('blob:')) {
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});

console.log('[AI去水印] background service worker 已加载 (v1.2.0, videoList 已持久化)');
