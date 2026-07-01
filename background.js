// ========== AI去水印 - Background Service Worker ==========
// 支持 Dreamina/即梦 + 豆包视频下载 + 豆包图片下载 + 15s 时长扩展 + 千问 + 小云雀
// v1.2.0 改造：videoList 持久化到 chrome.storage.local

let latestRequestedFilename = null;
let latestRequestedTime = 0;
const pendingDownloads = new Map();

// ==================== 跨标签页下载去重 ====================
// 同一 URL 在 TTL 内不重复下载（防多标签页 + 用户连点）
const downloadedUrls = new Map(); // url → expireAt timestamp
const DEDUP_TTL = 60 * 1000;      // 60 秒内同 URL 不重复下载
const DEDUP_MAX_SIZE = 200;       // 最多缓存 200 条

function isDuplicateDownload(url) {
  if (!url) return false;
  const now = Date.now();
  // 清理过期条目（顺便做）
  if (downloadedUrls.size > DEDUP_MAX_SIZE / 2) {
    for (const [k, expireAt] of downloadedUrls) {
      if (expireAt < now) downloadedUrls.delete(k);
    }
  }
  if (downloadedUrls.has(url) && downloadedUrls.get(url) > now) {
    return true; // 重复！
  }
  downloadedUrls.set(url, now + DEDUP_TTL);
  return false;
}

// ==================== 下载进度跟踪 ====================
const activeDownloads = new Map(); // downloadId → { url, filename, percent, totalBytes }

chrome.downloads.onChanged.addListener((delta) => {
  const id = delta.id;

  // 下载开始 → 记录
  if (delta.state?.current === 'in_progress') {
    if (!activeDownloads.has(id)) {
      activeDownloads.set(id, { url: '', filename: '', percent: 0, totalBytes: 0 });
    }
    const entry = activeDownloads.get(id);
    if (delta.totalBytes?.current) entry.totalBytes = delta.totalBytes.current;
    if (delta.bytesReceived?.current && entry.totalBytes > 0) {
      entry.percent = Math.round((delta.bytesReceived.current / entry.totalBytes) * 100);
    }
    // 广播进度到所有标签页
    broadcastProgress(id, entry.percent, 'in_progress');
  }

  // 下载完成/失败/取消 → 清理
  if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') {
    const entry = activeDownloads.get(id);
    if (entry) {
      broadcastProgress(id, delta.state?.current === 'complete' ? 100 : -1, delta.state.current);
    }
    activeDownloads.delete(id);
  }
});

// 进度广播节流（每 500ms 最多广播一次同 id）
const progressThrottle = new Map(); // id → lastBroadcastTime
function broadcastProgress(downloadId, percent, state) {
  const now = Date.now();
  const last = progressThrottle.get(downloadId) || 0;
  if (state === 'in_progress' && now - last < 500 && percent < 100) return;
  progressThrottle.set(downloadId, now);

  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, {
          type: 'DOWNLOAD_PROGRESS',
          downloadId, percent, state
        }).catch(() => {});
      } catch (_) {}
    }
  });

  // 清理过期节流记录
  if (state === 'complete' || state === 'interrupted') {
    progressThrottle.delete(downloadId);
  }
}

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
      notify('warn', '保存视频列表失败: ' + chrome.runtime.lastError.message, 'videoList');
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

// ==================== 统一错误通知 ====================
// notify('error'|'warn'|'info', '消息内容', '可选上下文')
// 写入 chrome.storage.local，popup 启动时读取 + storage 变化时实时弹 toast
const NOTIFY_KEY = 'notifications';
const NOTIFY_MAX = 20;

function notify(level, msg, context) {
  const entry = {
    level,   // 'error' | 'warn' | 'info'
    msg: String(msg),
    context: context || '',
    time: Date.now()
  };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    `[AI去水印] ${context ? '(' + context + ') ' : ''}${msg}`
  );
  chrome.storage.local.get([NOTIFY_KEY], (result) => {
    const list = Array.isArray(result[NOTIFY_KEY]) ? result[NOTIFY_KEY] : [];
    list.push(entry);
    // 保留最新 NOTIFY_MAX 条
    const trimmed = list.length > NOTIFY_MAX ? list.slice(-NOTIFY_MAX) : list;
    chrome.storage.local.set({ [NOTIFY_KEY]: trimmed });
  });
}

// popup 读取后清空
function consumeNotifications(callback) {
  chrome.storage.local.get([NOTIFY_KEY], (result) => {
    const list = Array.isArray(result[NOTIFY_KEY]) ? result[NOTIFY_KEY] : [];
    chrome.storage.local.remove([NOTIFY_KEY]);
    if (typeof callback === 'function') callback(list);
  });
}

// ==================== 文件命名模板 ====================
// 模板变量：{site} {title} {date} {time} {idx} {ext} {id}
// 默认模板：{site}_{date}_{idx}.{ext}
const DEFAULT_FILENAME_TEMPLATE = '{site}_{date}_{idx}.{ext}';
let filenameTemplate = DEFAULT_FILENAME_TEMPLATE;

// 归档目录前缀（下载文件会存到 {prefix}/{site}/{filename}）
const DEFAULT_ARCHIVE_PREFIX = 'AI去水印';
let archivePrefix = DEFAULT_ARCHIVE_PREFIX;

// 从 storage 加载模板和前缀（启动时 + popup 修改后）
chrome.storage.local.get(['filenameTemplate', 'archivePrefix'], (result) => {
  if (result.filenameTemplate) filenameTemplate = result.filenameTemplate;
  if (result.archivePrefix) archivePrefix = result.archivePrefix;
});

// 计数器（同一次会话内递增，避免同秒冲突）
let filenameCounter = 0;

function formatFilename(data) {
  // data: { site, title, ext, id, url }
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  filenameCounter++;
  const idx = String(filenameCounter).padStart(2, '0');

  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 50);

  const site = safe(data.site) || 'download';

  const vars = {
    site: site,
    title: safe(data.title) || '',
    date: date,
    time: time,
    idx: idx,
    ext: data.ext || 'mp4',
    id: safe(data.id) || ''
  };

  let filename = filenameTemplate;
  for (const [key, val] of Object.entries(vars)) {
    filename = filename.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }

  // 清理连续下划线和空标题产生的多余分隔符
  filename = filename.replace(/_+/g, '_').replace(/^_|_\.|\.\./g, (m) => m.replace('_', ''));

  // 归档目录：{archivePrefix}/{site}/{date}/filename
  const prefix = safe(archivePrefix) || 'AI去水印';
  return `${prefix}/${site}/${date}/${filename}`;
}

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
  if (isDuplicateDownload(url)) {
    console.log('[AI去水印] 跳过重复下载:', url.substring(0, 80));
    return { success: true, skipped: true, filename };
  }
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
    if (isDuplicateDownload(message.url)) {
      sendResponse({ success: true, skipped: true });
      return true;
    }
    latestRequestedFilename = message.filename || formatFilename({ site: 'dreamina', title: message.title || '', ext: 'mp4', id: message.videoId || '' });
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
    if (isDuplicateDownload(url)) {
      sendResponse({ success: true, skipped: true });
      return true;
    }
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let filename = formatFilename({ site: 'xyq', title: message.title || '', ext: 'mp4' });
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
      const filename = formatFilename({ site: 'doubao', title: sanitizedId, ext: 'mp4', id: rawId });
      downloadVideo(data.videoUrl, filename, false)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          notify('error', '视频下载失败: ' + error.message, 'doubao_video');
          sendResponse({ success: false, error: error.message });
        });
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
    chrome.storage.local.get(['aiwm_d15_enabled', 'codex_doubao_video_duration_choice'], (result) => {
      sendResponse({
        success: true,
        enabled: result.aiwm_d15_enabled === true,
        duration: Number(result.codex_doubao_video_duration_choice) || 0
      });
    });
    return true;
  }

  if (message.type === 'SET_15S_ENABLED') {
    chrome.storage.local.set({ aiwm_d15_enabled: message.value === true }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // ---- 读取并清空通知队列（popup 用） ----
  if (message.type === 'CONSUME_NOTIFICATIONS') {
    consumeNotifications(function(list) {
      sendResponse({ success: true, data: list });
    });
    return true;
  }

  // ---- 文件名模板（popup/Options Page 读写） ----
  if (message.type === 'GET_FILENAME_TEMPLATE') {
    sendResponse({ success: true, template: filenameTemplate, default: DEFAULT_FILENAME_TEMPLATE });
    return true;
  }

  if (message.type === 'SET_FILENAME_TEMPLATE') {
    filenameTemplate = message.template || DEFAULT_FILENAME_TEMPLATE;
    chrome.storage.local.set({ filenameTemplate: filenameTemplate });
    sendResponse({ success: true });
    return true;
  }

  // ---- 归档目录前缀（Options Page 读写） ----
  if (message.type === 'GET_ARCHIVE_PREFIX') {
    sendResponse({ success: true, prefix: archivePrefix, default: DEFAULT_ARCHIVE_PREFIX });
    return true;
  }

  if (message.type === 'SET_ARCHIVE_PREFIX') {
    archivePrefix = message.prefix || DEFAULT_ARCHIVE_PREFIX;
    chrome.storage.local.set({ archivePrefix: archivePrefix });
    sendResponse({ success: true });
    return true;
  }

  // ---- 站点模块开关查询（content script 用） ----
  if (message.type === 'GET_SITE_MODULES') {
    chrome.storage.local.get(['site_modules'], (result) => {
      const modules = result.site_modules || {};
      // 默认全部启用
      sendResponse({
        success: true,
        modules: {
          dreamina: modules.dreamina !== false,
          doubao: modules.doubao !== false,
          jimeng: modules.jimeng !== false,
          xyq: modules.xyq !== false,
          qianwen: modules.qianwen !== false,
          klingai: modules.klingai !== false,
          vidu: modules.vidu !== false,
          pixverse: modules.pixverse !== false
        }
      });
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
    if (isDuplicateDownload(url)) {
      sendResponse({ success: true, skipped: true });
      return true;
    }
    const filename = message.filename || formatFilename({ site: 'qianwen', title: message.title || '', ext: 'mp4' });
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        notify('error', '文件下载失败: ' + chrome.runtime.lastError.message, 'download');
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
        // base64 URL 不参与去重（每次生成的 blob URL 不同）
        if (!url.startsWith('data:') && isDuplicateDownload(url)) {
          sendResponse({ success: true, skipped: true });
          return;
        }
        let filename = message.filename || formatFilename({ site: 'jimeng', title: '', ext: 'png' });

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
        notify('error', '图片下载失败: ' + e.message, 'downloadImage');
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});

console.log('[AI去水印] background service worker 已加载 (v1.2.0, videoList 已持久化)');
