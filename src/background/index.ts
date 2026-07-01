// ============================================================
// AI去水印 - Background Service Worker (TypeScript)
// ============================================================
import type {
  ChromeMessage,
  VideoInfo,
  VideoDownloadResult,
  NotificationEntry,
  SiteModules,
} from '../shared/types';
import { STORAGE_KEYS, DEFAULTS } from '../shared/types';
import {
  formatFilename,
  createDedupChecker,
} from '../shared/utils';

// ==================== 状态 ====================
let latestRequestedFilename: string | null = null;
let latestRequestedTime = 0;
const pendingDownloads = new Map<string, string>();

// 视频列表持久化
const VIDEO_LIST_KEY = STORAGE_KEYS.VIDEO_LIST;
const VIDEO_LIST_MAX_SIZE = DEFAULTS.VIDEO_LIST_MAX_SIZE;
let videoListCache: VideoInfo[] | null = null;
let videoListLoading: Promise<VideoInfo[]> | null = null;

// 去重
const dedupChecker = createDedupChecker();

// 文件名模板
const DEFAULT_FILENAME_TEMPLATE = DEFAULTS.FILENAME_TEMPLATE;
let filenameTemplate = DEFAULT_FILENAME_TEMPLATE;

// 归档目录前缀
const DEFAULT_ARCHIVE_PREFIX = DEFAULTS.ARCHIVE_PREFIX;
let archivePrefix = DEFAULT_ARCHIVE_PREFIX;

// 通知队列
const NOTIFY_KEY = STORAGE_KEYS.NOTIFICATIONS;
const NOTIFY_MAX = DEFAULTS.NOTIFY_MAX;

// ==================== 初始化 ====================
chrome.storage.local.get(
  [STORAGE_KEYS.FILENAME_TEMPLATE, STORAGE_KEYS.ARCHIVE_PREFIX],
  (result: Record<string, unknown>) => {
    if (typeof result[STORAGE_KEYS.FILENAME_TEMPLATE] === 'string')
      filenameTemplate = result[STORAGE_KEYS.FILENAME_TEMPLATE] as string;
    if (typeof result[STORAGE_KEYS.ARCHIVE_PREFIX] === 'string')
      archivePrefix = result[STORAGE_KEYS.ARCHIVE_PREFIX] as string;
  }
);

function loadVideoListFromStorage(): Promise<VideoInfo[]> {
  if (videoListLoading) return videoListLoading;
  videoListLoading = new Promise((resolve) => {
    chrome.storage.local.get([VIDEO_LIST_KEY], (result) => {
      const arr = Array.isArray(result[VIDEO_LIST_KEY])
        ? result[VIDEO_LIST_KEY]
        : [];
      videoListCache = arr;
      videoListLoading = null;
      console.log(
        `[AI去水印] videoList 从 storage 恢复: ${arr.length} 条`
      );
      resolve(arr);
    });
  });
  return videoListLoading;
}

function saveVideoListToStorage(arr: VideoInfo[], callback?: () => void): void {
  const toSave =
    arr.length > VIDEO_LIST_MAX_SIZE
      ? arr.slice(arr.length - VIDEO_LIST_MAX_SIZE)
      : arr;
  videoListCache = toSave;
  chrome.storage.local.set({ [VIDEO_LIST_KEY]: toSave }, () => {
    if (chrome.runtime.lastError) {
      console.warn(
        '[AI去水印] 保存 videoList 失败:',
        chrome.runtime.lastError.message
      );
      notify('warn', '保存视频列表失败: ' + chrome.runtime.lastError.message, 'videoList');
    }
    if (typeof callback === 'function') callback();
  });
}

function appendVideosAndSave(
  currentList: VideoInfo[],
  newData: VideoInfo[],
  callback?: (updated: VideoInfo[]) => void
): void {
  const existingVids = new Set(currentList.map((v) => v.vid));
  const filtered = newData.filter(
    (v) => v && v.vid && !existingVids.has(v.vid)
  );
  if (filtered.length === 0) {
    if (typeof callback === 'function') callback(currentList);
    return;
  }
  const updated = currentList.concat(filtered);
  saveVideoListToStorage(updated, () => {
    if (typeof callback === 'function') callback(updated);
  });
}

// 预热
loadVideoListFromStorage();

// ==================== 通知 ====================
function notify(
  level: NotificationEntry['level'],
  msg: string,
  context?: string
): void {
  const entry: NotificationEntry = {
    level,
    msg: String(msg),
    context: context || '',
    time: Date.now(),
  };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    `[AI去水印] ${context ? '(' + context + ') ' : ''}${msg}`
  );
  chrome.storage.local.get([NOTIFY_KEY], (result) => {
    const list: NotificationEntry[] = Array.isArray(result[NOTIFY_KEY])
      ? result[NOTIFY_KEY]
      : [];
    list.push(entry);
    const trimmed =
      list.length > NOTIFY_MAX ? list.slice(-NOTIFY_MAX) : list;
    chrome.storage.local.set({ [NOTIFY_KEY]: trimmed });
  });
}

function consumeNotifications(
  callback: (list: NotificationEntry[]) => void
): void {
  chrome.storage.local.get([NOTIFY_KEY], (result) => {
    const list: NotificationEntry[] = Array.isArray(result[NOTIFY_KEY])
      ? result[NOTIFY_KEY]
      : [];
    chrome.storage.local.remove([NOTIFY_KEY]);
    callback(list);
  });
}

// ==================== 下载 ====================
async function downloadVideo(
  url: string,
  filename: string,
  saveAs = false
): Promise<{ success: boolean; downloadId?: number; filename: string; skipped?: boolean }> {
  if (dedupChecker.isDuplicateDownload(url)) {
    console.log('[AI去水印] 跳过重复下载:', url.substring(0, 80));
    return { success: true, skipped: true, filename };
  }
  pendingDownloads.set(url, filename);
  const downloadId = await chrome.downloads.download({
    url,
    filename,
    saveAs,
    conflictAction: 'uniquify',
  });
  return { success: true, downloadId, filename };
}

// ==================== 文件名拦截 ====================
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (item.byExtensionId !== chrome.runtime.id) return;

  if (pendingDownloads.has(item.url)) {
    const filename = pendingDownloads.get(item.url)!;
    pendingDownloads.delete(item.url);
    suggest({ filename, conflictAction: 'uniquify' });
    return;
  }

  if (
    latestRequestedFilename &&
    Date.now() - latestRequestedTime < 10000
  ) {
    suggest({
      filename: latestRequestedFilename,
      conflictAction: 'uniquify',
    });
  }
});

// ==================== 下载进度跟踪 ====================
interface ActiveDownload {
  url: string;
  filename: string;
  percent: number;
  totalBytes: number;
}

const activeDownloads = new Map<number, ActiveDownload>();
const progressThrottle = new Map<number, number>();

chrome.downloads.onChanged.addListener((delta) => {
  const id = delta.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deltaAny = delta as any;

  if (delta.state?.current === 'in_progress') {
    if (!activeDownloads.has(id)) {
      activeDownloads.set(id, {
        url: '',
        filename: '',
        percent: 0,
        totalBytes: 0,
      });
    }
    const entry = activeDownloads.get(id)!;
    if (deltaAny.totalBytes?.current) entry.totalBytes = deltaAny.totalBytes.current as number;
    if (deltaAny.bytesReceived?.current && entry.totalBytes > 0) {
      entry.percent = Math.round(
        ((deltaAny.bytesReceived.current as number) / entry.totalBytes) * 100
      );
    }
    broadcastProgress(id, entry.percent, 'in_progress');
  }

  if (
    delta.state?.current === 'complete' ||
    delta.state?.current === 'interrupted'
  ) {
    const entry = activeDownloads.get(id);
    if (entry) {
      broadcastProgress(
        id,
        delta.state?.current === 'complete' ? 100 : -1,
        delta.state.current as 'complete' | 'interrupted'
      );
    }
    activeDownloads.delete(id);
  }
});

function broadcastProgress(
  downloadId: number,
  percent: number,
  state: string
): void {
  const now = Date.now();
  const last = progressThrottle.get(downloadId) || 0;
  if (state === 'in_progress' && now - last < 500 && percent < 100) return;
  progressThrottle.set(downloadId, now);

  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      try {
        chrome.tabs
          .sendMessage(tab.id!, {
            type: 'DOWNLOAD_PROGRESS',
            downloadId,
            percent,
            state,
          })
          .catch(() => { /* 忽略发送失败 */ });
      } catch (_) { /* 忽略 */ }
    }
  });

  if (state === 'complete' || state === 'interrupted') {
    progressThrottle.delete(downloadId);
  }
}

// ==================== 消息处理 ====================
chrome.runtime.onMessage.addListener(
  (
    message: ChromeMessage & Record<string, unknown>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    // Dreamina / 即梦 下载
    if (message.action === 'DOWNLOAD') {
      const msg = message as { action: 'DOWNLOAD'; url: string; filename?: string };
      if (dedupChecker.isDuplicateDownload(msg.url)) {
        sendResponse({ success: true, skipped: true });
        return true;
      }
      latestRequestedFilename =
        msg.filename || formatFilename({ site: 'dreamina', ext: 'mp4' });
      latestRequestedTime = Date.now();
      chrome.downloads.download(
        {
          url: msg.url,
          filename: latestRequestedFilename,
          saveAs: true,
          conflictAction: 'uniquify',
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            sendResponse({ success: true, downloadId });
          }
        }
      );
      return true;
    }

    // xyq 下载
    if (message.action === 'download_video') {
      const msg = message as { action: 'download_video'; url: string };
      if (dedupChecker.isDuplicateDownload(msg.url)) {
        sendResponse({ success: true, skipped: true });
        return true;
      }
      const filename = formatFilename({ site: 'xyq', ext: 'mp4' });
      chrome.downloads.download(
        { url: msg.url, filename, saveAs: false, conflictAction: 'uniquify' },
        () => {
          if (chrome.runtime.lastError) {
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            sendResponse({ success: true });
          }
        }
      );
      return true;
    }

    // 豆包视频数据统计
    if (message.type === 'videoDataExtracted') {
      const msg = message as { type: 'videoDataExtracted'; data: VideoInfo[] };
      const newData = msg.data || [];
      if (videoListCache === null) {
        loadVideoListFromStorage().then((currentList) => {
          appendVideosAndSave(currentList, newData, (updated) => {
            sendResponse({ success: true, count: updated.length });
          });
        });
        return true;
      }
      appendVideosAndSave(videoListCache, newData, (updated) => {
        sendResponse({ success: true, count: updated.length });
      });
      return true;
    }

    // 获取视频列表
    if (message.type === 'GET_VIDEO_LIST') {
      loadVideoListFromStorage().then((list) => {
        sendResponse({ success: true, data: list });
      });
      return true;
    }

    // 清空视频列表
    if (message.type === 'CLEAR_VIDEO_LIST') {
      videoListCache = [];
      saveVideoListToStorage([], () => {
        sendResponse({ success: true });
      });
      return true;
    }

    // 豆包视频下载结果
    if (message.type === 'videoDownloadResult') {
      const msg = message as {
        type: 'videoDownloadResult';
        data: VideoDownloadResult;
      };
      const data = msg.data;
      if (data?.success && data?.videoUrl) {
        const rawId = data.vid || data.messageId || Date.now();
        const sanitizedId = String(rawId).replace(/[\\/:*?"<>|]/g, '_');
        const filename = formatFilename({
          site: 'doubao',
          title: sanitizedId,
          ext: 'mp4',
          id: String(rawId),
        });
        downloadVideo(data.videoUrl, filename, false)
          .then(() => sendResponse({ success: true }))
          .catch((error: Error) => {
            notify('error', '视频下载失败: ' + error.message, 'doubao_video');
            sendResponse({ success: false, error: error.message });
          });
      } else {
        sendResponse({ success: true });
      }
      return true;
    }

    // 站点模块开关
    if (message.type === 'GET_SITE_MODULES') {
      chrome.storage.local.get([STORAGE_KEYS.SITE_MODULES], (result) => {
        const modules = (result[STORAGE_KEYS.SITE_MODULES] || {}) as Record<string, boolean>;
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
            pixverse: modules.pixverse !== false,
          } as SiteModules,
        });
      });
      return true;
    }

    // 15s 状态
    if (message.type === 'GET_15S_STATE') {
      chrome.storage.local.get(
        [STORAGE_KEYS.XQ_D15_ENABLED, STORAGE_KEYS.XQ_D15_DURATION],
        (result) => {
          sendResponse({
            success: true,
            enabled: result[STORAGE_KEYS.XQ_D15_ENABLED] === true,
            duration: Number(result[STORAGE_KEYS.XQ_D15_DURATION]) || 0,
          });
        }
      );
      return true;
    }

    if (message.type === 'SET_15S_ENABLED') {
      const msg = message as { type: 'SET_15S_ENABLED'; value: boolean };
      chrome.storage.local.set(
        { [STORAGE_KEYS.XQ_D15_ENABLED]: msg.value === true },
        () => {
          sendResponse({ success: true });
        }
      );
      return true;
    }

    // 通知队列
    if (message.type === 'CONSUME_NOTIFICATIONS') {
      consumeNotifications((list) => {
        sendResponse({ success: true, data: list });
      });
      return true;
    }

    // 文件名模板
    if (message.type === 'GET_FILENAME_TEMPLATE') {
      sendResponse({
        success: true,
        template: filenameTemplate,
        default: DEFAULT_FILENAME_TEMPLATE,
      });
      return true;
    }

    if (message.type === 'SET_FILENAME_TEMPLATE') {
      const msg = message as {
        type: 'SET_FILENAME_TEMPLATE';
        template: string;
      };
      filenameTemplate = msg.template || DEFAULT_FILENAME_TEMPLATE;
      chrome.storage.local.set({
        [STORAGE_KEYS.FILENAME_TEMPLATE]: filenameTemplate,
      });
      sendResponse({ success: true });
      return true;
    }

    // 归档目录前缀
    if (message.type === 'GET_ARCHIVE_PREFIX') {
      sendResponse({
        success: true,
        prefix: archivePrefix,
        default: DEFAULT_ARCHIVE_PREFIX,
      });
      return true;
    }

    if (message.type === 'SET_ARCHIVE_PREFIX') {
      const msg = message as { type: 'SET_ARCHIVE_PREFIX'; prefix: string };
      archivePrefix = msg.prefix || DEFAULT_ARCHIVE_PREFIX;
      chrome.storage.local.set({
        [STORAGE_KEYS.ARCHIVE_PREFIX]: archivePrefix,
      });
      sendResponse({ success: true });
      return true;
    }

    // 千问文件下载
    if (message.type === 'downloadFile') {
      const msg = message as {
        type: 'downloadFile';
        url: string;
        filename?: string;
      };
      if (dedupChecker.isDuplicateDownload(msg.url)) {
        sendResponse({ success: true, skipped: true });
        return true;
      }
      const filename =
        msg.filename || formatFilename({ site: 'qianwen', ext: 'mp4' });
      chrome.downloads.download(
        {
          url: msg.url,
          filename,
          saveAs: false,
          conflictAction: 'uniquify',
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            notify(
              'error',
              '文件下载失败: ' + chrome.runtime.lastError.message,
              'download'
            );
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            sendResponse({ success: true, downloadId });
          }
        }
      );
      return true;
    }

    // 即梦图片下载
    if (message.type === 'downloadImage') {
      const msg = message as {
        type: 'downloadImage';
        url: string;
        filename?: string;
      };
      (async () => {
        try {
          let url = msg.url;
          if (!url.startsWith('data:') && dedupChecker.isDuplicateDownload(url)) {
            sendResponse({ success: true, skipped: true });
            return;
          }
          const filename =
            msg.filename || formatFilename({ site: 'jimeng', ext: 'png' });

          if (url.startsWith('data:')) {
            const response = await fetch(url);
            const blob = await response.blob();
            url = URL.createObjectURL(blob);
          }

          chrome.downloads.download(
            {
              url,
              filename,
              saveAs: false,
              conflictAction: 'uniquify',
            },
            (downloadId) => {
              if (chrome.runtime.lastError) {
                notify(
                  'error',
                  '图片下载失败: ' + chrome.runtime.lastError.message,
                  'downloadImage'
                );
                sendResponse({
                  success: false,
                  error: chrome.runtime.lastError.message,
                });
              } else {
                sendResponse({ success: true, downloadId });
              }
            }
          );

          if (url.startsWith('blob:')) {
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          }
        } catch (e) {
          notify('error', '图片下载失败: ' + (e as Error).message, 'downloadImage');
          sendResponse({ success: false, error: (e as Error).message });
        }
      })();
      return true;
    }

    return false;
  }
);

console.log(
  '[AI去水印] background service worker 已加载 (v1.2.0 TypeScript)'
);
