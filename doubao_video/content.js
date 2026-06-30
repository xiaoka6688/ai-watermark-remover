// ========== 豆包视频下载 - content.js (MAIN world) ==========
// 在 MAIN world 中运行，可以访问 window._ROUTER_DATA 等内部数据
// 负责：劫持 fetch/XHR 捕获视频信息，调用 get_play_info 接口获取无水印地址

const processedUrls = new Set();
const MAX_DEDUP_SIZE = 100;
const videoCache = new Map();

// ========== 核心：调用 get_play_info 接口获取无水印视频 ==========
async function callGetPlayInfo(videoKey) {
  const baseUrl = 'https://www.doubao.com/samantha/media/get_play_info';
  const params = new URLSearchParams({
    aid: '497858',
    device_platform: 'web',
    samantha_web: '1',
    'use-olympus-account': '1',
    version_code: '20800',
    pkg_type: 'release_version',
    web_tab_id: crypto.randomUUID()
  });
  const url = `${baseUrl}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'agw-js-conv': 'str',
      'origin': location.origin,
      'referer': location.href
    },
    credentials: 'include',
    body: JSON.stringify({ key: videoKey, type: 'video' })
  });

  const json = await response.json();
  if (json.code !== 0) {
    throw new Error(`get_play_info 接口返回错误: code=${json.code}, msg=${json.msg || '未知'}`);
  }

  const data = json.data;
  if (!data) throw new Error('响应中无 data 字段');

  // 从 original_media_info 中获取无水印地址
  const originalMedia = data.original_media_info;
  if (!originalMedia || !originalMedia.main_url) {
    // 回退到 play_infos
    console.warn('[AI去水印·豆包视频] 未找到 original_media_info，尝试使用 play_infos');
    const playInfos = data.play_infos || (data.play_info ? [data.play_info] : []);
    const playInfo = playInfos[0];
    if (!playInfo || !playInfo.main) {
      throw new Error('未找到视频播放地址');
    }
    const mainUrl = playInfo.main.replace(/lr=[^&]+/g, 'lr=video_gen_no_watermark');
    const backupUrl = playInfo.backup ? playInfo.backup.replace(/lr=[^&]+/g, 'lr=video_gen_no_watermark') : null;
    return {
      success: true,
      mainUrl: mainUrl,
      backupUrl: backupUrl,
      width: playInfo.width,
      height: playInfo.height,
      definition: playInfo.definition || 'unknown'
    };
  }

  // 使用 original_media_info 中的无水印地址
  let mainUrl = originalMedia.main_url;
  let backupUrl = originalMedia.backup_url || null;

  // 强制替换水印参数
  mainUrl = mainUrl.replace(/lr=[^&]+/g, 'lr=video_gen_no_watermark');
  if (backupUrl) backupUrl = backupUrl.replace(/lr=[^&]+/g, 'lr=video_gen_no_watermark');

  return {
    success: true,
    mainUrl: mainUrl,
    backupUrl: backupUrl,
    width: originalMedia.width || null,
    height: originalMedia.height || null,
    definition: originalMedia.definition || (data.video_info && data.video_info.definition) || 'unknown'
  };
}

// ========== 工具：从页面数据中查找视频 vid 和 messageId ==========
function findVideoAndMessageId() {
  const routerData = window._ROUTER_DATA;
  if (!routerData) return null;
  const cells = routerData && routerData.loaderData && routerData.loaderData.chat_layout
    ? routerData.loaderData.chat_layout.trimmedChainRecentConvCells || []
    : [];
  for (const cell of cells) {
    const messages = cell && cell.conversation ? cell.conversation.messages || [] : [];
    for (const msg of messages) {
      const msgId = String(msg.message_id || '').trim();
      if (!msgId || msgId === '0') continue;
      const vid = findVidInObject(msg);
      if (vid) return { vid, messageId: msgId };
    }
  }
  return null;
}

function findVidByMessageId(targetId) {
  const cached = videoCache.get(targetId);
  if (cached) return { vid: cached, messageId: targetId };
  const routerData = window._ROUTER_DATA;
  if (!routerData) return null;
  const cells = routerData && routerData.loaderData && routerData.loaderData.chat_layout
    ? routerData.loaderData.chat_layout.trimmedChainRecentConvCells || []
    : [];
  for (const cell of cells) {
    const messages = cell && cell.conversation ? cell.conversation.messages || [] : [];
    for (const msg of messages) {
      const msgId = String(msg.message_id || '').trim();
      if (msgId === targetId) {
        const vid = findVidInObject(msg);
        if (vid) {
          videoCache.set(targetId, vid);
          return { vid, messageId: targetId };
        }
      }
    }
  }
  // 深度搜索兜底
  const deepVid = deepSearchVidByMessageId(routerData, targetId);
  if (deepVid) {
    videoCache.set(targetId, deepVid);
    return { vid: deepVid, messageId: targetId };
  }
  return null;
}

function deepSearchVidByMessageId(obj, targetId, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 15 || !obj || typeof obj !== 'object') return null;
  if (String(obj.message_id || obj.messageId || '').trim() === targetId) {
    const vid = findVidInObject(obj);
    if (vid) return vid;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = deepSearchVidByMessageId(item, targetId, depth + 1);
      if (found) return found;
    }
  } else {
    for (const key in obj) {
      if (key === 'window' || key === 'parent') continue;
      const found = deepSearchVidByMessageId(obj[key], targetId, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findVidInObject(obj, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 10 || !obj) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findVidInObject(item, depth + 1);
      if (found) return found;
    }
  } else if (typeof obj === 'object') {
    const vid = obj.vid || obj.video_id;
    if (vid && typeof vid === 'string' && vid.startsWith('v0')) return vid;
    for (const val of Object.values(obj)) {
      const found = findVidInObject(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// ========== 分享接口（旧方案回退） ==========
async function callBigmusicShareSave(messageId) {
  return new Promise(function(resolve) {
    function handler(ev) {
      if (ev.data && ev.data.type === 'bigmusicShareSaveResult') {
        window.removeEventListener('message', handler);
        resolve(ev.data.data);
      }
    }
    window.postMessage({ type: 'bigmusicShareSave', messageId: messageId }, '*');
    window.addEventListener('message', handler);
    setTimeout(function() {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 15000);
  });
}

async function callGetVideoShareInfo(shareId, vid) {
  var url = 'https://www.doubao.com/creativity/share/get_video_share_info?version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7550681679050343936&pc_version=3.14.6&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1&web_tab_id=' + crypto.randomUUID();
  try {
    var resp = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'agw-js-conv': 'str'
      },
      credentials: 'include',
      body: JSON.stringify({ share_id: shareId, vid: vid, creation_id: '' })
    });
    var json = await resp.json();
    if (json.code === 0 && json.data) return json.data;
    return null;
  } catch (e) {
    return null;
  }
}

function extractNoWatermarkVideoUrl(data) {
  var playInfo = (data && data.play_infos && data.play_infos[0]) || data.play_info || (data.main ? data : null);
  if (!playInfo || !playInfo.main) return null;
  var replaceLr = function(url) {
    if (!url) return url;
    return url.replace(/lr=video_gen_watermark_dyn/g, 'lr=video_gen_no_watermark')
              .replace(/lr=video_gen_watermark/g, 'lr=video_gen_no_watermark');
  };
  return {
    mainUrl: replaceLr(playInfo.main),
    backupUrl: replaceLr(playInfo.backup),
    width: playInfo.width,
    height: playInfo.height,
    definition: playInfo.definition
  };
}

// ========== 下载视频入口（优先新接口 get_play_info） ==========
async function startVideoDownload() {
  console.log('[AI去水印·豆包视频] startVideoDownload');
  var info = findVideoAndMessageId();
  if (!info) return { success: false, error: '未找到视频内容' };

  // 1. 优先尝试新接口 get_play_info（直接获取无水印）
  try {
    var playResult = await callGetPlayInfo(info.vid);
    if (playResult && playResult.mainUrl) {
      return {
        success: true,
        messageId: info.messageId,
        vid: info.vid,
        videoUrl: playResult.mainUrl,
        backupUrl: playResult.backupUrl,
        width: playResult.width,
        height: playResult.height,
        definition: playResult.definition,
        source: 'get_play_info'
      };
    }
  } catch (err) {
    console.warn('[AI去水印·豆包视频] 新接口失败，回退旧逻辑:', err);
  }

  // 2. 回退原有逻辑
  var share = await callBigmusicShareSave(info.messageId);
  if (!share || !share.share_id) return { success: false, error: '获取视频分享ID失败' };

  var videoData = await callGetVideoShareInfo(share.share_id, info.vid);
  if (!videoData) return { success: false, error: '获取视频信息失败' };

  var extracted = extractNoWatermarkVideoUrl(videoData);
  if (!extracted) return { success: false, error: '提取下载链接失败' };

  return {
    success: true,
    messageId: info.messageId,
    shareId: share.share_id,
    vid: info.vid,
    videoUrl: extracted.mainUrl,
    backupUrl: extracted.backupUrl,
    width: extracted.width,
    height: extracted.height,
    definition: extracted.definition,
    source: 'legacy'
  };
}

async function startVideoDownloadByMessageId(messageId) {
  console.log('[AI去水印·豆包视频] startVideoDownloadByMessageId, messageId:', messageId);
  var info = findVidByMessageId(messageId);
  if (!info) return { success: false, error: '未找到视频内容', messageId: messageId };

  // 1. 优先新接口
  try {
    var playResult = await callGetPlayInfo(info.vid);
    if (playResult && playResult.mainUrl) {
      return {
        success: true,
        messageId: info.messageId,
        vid: info.vid,
        videoUrl: playResult.mainUrl,
        backupUrl: playResult.backupUrl,
        width: playResult.width,
        height: playResult.height,
        definition: playResult.definition,
        source: 'get_play_info'
      };
    }
  } catch (err) {
    console.warn('[AI去水印·豆包视频] 新接口失败，回退旧逻辑:', err);
  }

  // 2. 回退旧逻辑
  var share = await callBigmusicShareSave(info.messageId);
  if (!share || !share.share_id) return { success: false, error: '获取视频分享ID失败', messageId: messageId };

  var videoData = await callGetVideoShareInfo(share.share_id, info.vid);
  if (!videoData) return { success: false, error: '获取视频信息失败', messageId: messageId };

  var extracted = extractNoWatermarkVideoUrl(videoData);
  if (!extracted) return { success: false, error: '提取下载链接失败', messageId: messageId };

  return {
    success: true,
    messageId: info.messageId,
    shareId: share.share_id,
    vid: info.vid,
    videoUrl: extracted.mainUrl,
    backupUrl: extracted.backupUrl,
    width: extracted.width,
    height: extracted.height,
    definition: extracted.definition,
    source: 'legacy'
  };
}

// ========== 劫持 fetch 和 XHR 实时捕获视频数据 ==========
function extractVideoFromMessages(messages) {
  var videos = [];
  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    var msgId = String(msg.message_id || '').trim();
    if (!msgId || msgId === '0') continue;
    var vid = findVidInObject(msg);
    if (vid) {
      videoCache.set(msgId, vid);
      videos.push({ vid: vid, messageId: msgId });
    }
  }
  return videos;
}

function markProcessed(url) {
  if (url) {
    processedUrls.add(url);
    if (processedUrls.size > MAX_DEDUP_SIZE) {
      var first = processedUrls.values().next().value;
      processedUrls.delete(first);
    }
  }
}

function extractAndPublishFromXHR(response, url) {
  if (url && processedUrls.has(url)) return;
  var messages = null;
  if (response && response.downlink_body && response.downlink_body.pull_singe_chain_downlink_body) {
    messages = response.downlink_body.pull_singe_chain_downlink_body.messages;
  }
  if (!messages) messages = response && response.messages ? response.messages : null;
  if (!messages) return;
  if (url) markProcessed(url);
  var videos = extractVideoFromMessages(messages);
  if (videos.length) {
    window.postMessage({ type: 'videoDataExtracted', data: videos }, '*');
  }
}

async function readSSEStream(stream) {
  var reader = stream.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  try {
    while (true) {
      var result = await reader.read();
      if (result.done) return;
      buffer += decoder.decode(result.value, { stream: true });
      var parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (var p = 0; p < parts.length; p++) {
        var match = parts[p].match(/^data: (.+)$/m);
        if (match) {
          try {
            var json = JSON.parse(match[1]);
            var patchOps = json && json.patch_op;
            // 直接节点
            var baseMsgId = String(json.message_id || '').trim();
            var directVid = findVidInObject(json);
            if (directVid && baseMsgId && baseMsgId !== '0') {
              videoCache.set(baseMsgId, directVid);
              window.postMessage({ type: 'videoDataExtracted', data: [{ vid: directVid, messageId: baseMsgId }] }, '*');
            }
            // 补丁列表
            if (patchOps) {
              for (var o = 0; o < patchOps.length; o++) {
                var pv = patchOps[o] && patchOps[o].patch_value;
                if (!pv) continue;
                var id = String(pv.message_id || baseMsgId || '').trim();
                if (!id || id === '0') continue;
                var vid = findVidInObject(pv);
                if (vid) {
                  videoCache.set(id, vid);
                  window.postMessage({ type: 'videoDataExtracted', data: [{ vid: vid, messageId: id }] }, '*');
                }
              }
            }
          } catch(e) {}
        }
      }
    }
  } catch(e) {}
}

// ========== 劫持 window.fetch 和 XMLHttpRequest ==========
var originalFetch = window.fetch;
window.fetch = function() {
  var args = arguments;
  var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
  if (typeof url === 'string' && (url.indexOf('chat/completion') !== -1 || url.indexOf('chat/get_message') !== -1)) {
    if (processedUrls.has(url)) return originalFetch.apply(this, args);
    markProcessed(url);
    return originalFetch.apply(this, args).then(function(resp) {
      var contentType = resp.headers.get('content-type') || '';
      if (contentType.indexOf('text/event-stream') !== -1) {
        var tee = resp.body.tee();
        var newResp = new Response(tee[0], {
          status: resp.status,
          statusText: resp.statusText,
          headers: resp.headers
        });
        readSSEStream(tee[1]);
        return newResp;
      }
      if (contentType.indexOf('application/json') !== -1) {
        var clone = resp.clone();
        clone.json().then(function(data) { extractAndPublishFromXHR(data, url); }).catch(function() {});
      }
      return resp;
    });
  }
  return originalFetch.apply(this, args);
};

var originalXHROpen = XMLHttpRequest.prototype.open;
var originalXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function(method, url) {
  this._doubaoUrl = url;
  return originalXHROpen.apply(this, arguments);
};
XMLHttpRequest.prototype.send = function() {
  var self = this;
  self.addEventListener('load', function() {
    if (typeof self._doubaoUrl === 'string' && (self._doubaoUrl.indexOf('chain/single') !== -1 || self._doubaoUrl.indexOf('chat/get_history') !== -1)) {
      try {
        extractAndPublishFromXHR(JSON.parse(self.responseText), self._doubaoUrl);
      } catch(e) {}
    }
  });
  return originalXHRSend.apply(this, arguments);
};

// ========== 初始扫描 ==========
function scanInitialVideoData() {
  var routerData = window._ROUTER_DATA;
  if (!routerData) return;
  var cells = routerData && routerData.loaderData && routerData.loaderData.chat_layout
    ? routerData.loaderData.chat_layout.trimmedChainRecentConvCells || []
    : [];
  var videos = [];
  for (var c = 0; c < cells.length; c++) {
    var messages = cells[c] && cells[c].conversation ? cells[c].conversation.messages || [] : [];
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      var msgId = String(msg.message_id || '').trim();
      if (!msgId || msgId === '0') continue;
      var vid = findVidInObject(msg);
      if (vid) {
        videoCache.set(msgId, vid);
        videos.push({ vid: vid, messageId: msgId });
      }
    }
  }
  if (videos.length) window.postMessage({ type: 'videoDataExtracted', data: videos }, '*');
}

// ========== 消息监听 ==========
window.addEventListener('message', function(ev) {
  var msg = ev.data;
  if (!msg || !msg.type) return;
  
  if (msg.type === 'startVideoDownload') {
    startVideoDownload().then(function(result) {
      window.postMessage({ type: 'videoDownloadResult', data: result }, '*');
    });
  } else if (msg.type === 'startVideoDownloadByMessageId') {
    startVideoDownloadByMessageId(msg.messageId).then(function(result) {
      window.postMessage({ type: 'videoDownloadResult', data: result }, '*');
    });
  } else if (msg.type === 'scanInitialVideos') {
    scanInitialVideoData();
  }
});

// ========== 监听 SPA 路由变化 ==========
var wrapState = function(type) {
  var original = history[type];
  return function() {
    var res = original.apply(this, arguments);
    var e = new Event(type);
    e.arguments = arguments;
    window.dispatchEvent(e);
    return res;
  };
};
history.pushState = wrapState('pushState');
history.replaceState = wrapState('replaceState');

var handleRouteChange = function() {
  setTimeout(scanInitialVideoData, 500);
  setTimeout(scanInitialVideoData, 2000);
};
window.addEventListener('popstate', handleRouteChange);
window.addEventListener('pushState', handleRouteChange);
window.addEventListener('replaceState', handleRouteChange);

// ========== 初始化 ==========
setTimeout(function() { scanInitialVideoData(); }, 500);
setTimeout(function() { scanInitialVideoData(); }, 1500);

console.log('[AI去水印·豆包视频] 豆包视频下载 content script 已加载');