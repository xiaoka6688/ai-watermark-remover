// ============================================================
// AI去水印 - 核心工具函数（可测试模块）
// 从 background.js / doubao_image/content.js / duration15.js 提取
// 支持 CommonJS（Node/Jest）和浏览器全局变量
// ============================================================
(function (exports) {
  'use strict';

  // ==================== 文件名模板解析 ====================
  // 来源：background.js

  const DEFAULT_FILENAME_TEMPLATE = '{site}_{date}_{idx}.{ext}';
  let _filenameCounter = 0;

  function formatFilename(data, template) {
    template = template || DEFAULT_FILENAME_TEMPLATE;
    const now = data._now || new Date(); // 可注入时间，方便测试
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toISOString().slice(11, 19).replace(/:/g, '');
    _filenameCounter++;
    const idx = String(data.idx || _filenameCounter).padStart(2, '0');

    const safe = (s) => String(s || '')
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 50);

    const vars = {
      site: safe(data.site) || 'download',
      title: safe(data.title) || '',
      date: date,
      time: time,
      idx: idx,
      ext: data.ext || 'mp4',
      id: safe(data.id) || ''
    };

    let result = template;
    for (const [key, val] of Object.entries(vars)) {
      result = result.replace(new RegExp('\\{' + key + '\\}', 'g'), val);
    }

    // 清理连续下划线和空标题产生的多余分隔符
    result = result.replace(/_+/g, '_')
      .replace(/^_/, '')
      .replace(/_\./g, '.')
      .replace(/\.\./g, '.');

    return result;
  }

  // ==================== 下载去重 ====================
  // 来源：background.js

  function createDedupChecker(ttl, maxSize) {
    ttl = ttl || 60000;
    maxSize = maxSize || 200;
    const downloadedUrls = new Map();

    function isDuplicateDownload(url, now) {
      now = now || Date.now();
      if (!url) return false;
      // 清理过期条目
      if (downloadedUrls.size > maxSize / 2) {
        for (const [k, expireAt] of downloadedUrls) {
          if (expireAt < now) downloadedUrls.delete(k);
        }
      }
      if (downloadedUrls.has(url) && downloadedUrls.get(url) > now) {
        return true;
      }
      downloadedUrls.set(url, now + ttl);
      return false;
    }

    function getSize() { return downloadedUrls.size; }
    function clear() { downloadedUrls.clear(); }

    return { isDuplicateDownload, getSize, clear };
  }

  // ==================== JSON 递归搜索 ====================
  // 来源：doubao_image/content.js

  function findAllKeysInJson(obj, targetKey, results) {
    if (!results) results = [];
    if (!obj || typeof obj !== 'object') return results;
    if (Array.isArray(obj)) {
      obj.forEach(function (item) { findAllKeysInJson(item, targetKey, results); });
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

  // ==================== 豆包图片提取 ====================
  // 来源：doubao_image/content.js

  function extractImageUrlsFromCreations(json) {
    const urls = [];
    const creations = findAllKeysInJson(json, 'creations');
    if (!creations || creations.length === 0) return urls;

    for (const creationGroup of creations) {
      if (!Array.isArray(creationGroup)) continue;
      for (const item of creationGroup) {
        const rawUrl = item && item.image && item.image.image_ori_raw && item.image.image_ori_raw.url;
        if (rawUrl) urls.push(rawUrl);
      }
    }
    return urls;
  }

  // ==================== 15s 时长请求体改写 ====================
  // 来源：doubao_video/duration15.js

  const TARGET_DURATION = 15;
  const TARGET_MODEL = 'seedance_v2.0';

  function parseAbilityParam(value) {
    if (value && typeof value === 'object') return Object.assign({}, value);
    if (typeof value === 'string' && value.trim()) {
      try { return JSON.parse(value); } catch (_) { return {}; }
    }
    return {};
  }

  function patchDurationBody(rawBody, selectedDuration) {
    if (typeof rawBody !== 'string' || !rawBody.trim()) return { changed: false, body: rawBody };
    if (selectedDuration !== TARGET_DURATION) return { changed: false, body: rawBody };

    var payload;
    try { payload = JSON.parse(rawBody); } catch (_) { return { changed: false, body: rawBody }; }

    var ability = payload && payload.chat_ability;
    if (!ability || Number(ability.ability_type) !== 17) return { changed: false, body: rawBody };

    var param = parseAbilityParam(ability.ability_param);
    param.model = TARGET_MODEL;
    param.duration = TARGET_DURATION;
    ability.ability_param = JSON.stringify(param);
    return { changed: true, body: JSON.stringify(payload) };
  }

  // ==================== 导出 ====================
  exports.formatFilename = formatFilename;
  exports.DEFAULT_FILENAME_TEMPLATE = DEFAULT_FILENAME_TEMPLATE;
  exports.createDedupChecker = createDedupChecker;
  exports.findAllKeysInJson = findAllKeysInJson;
  exports.extractImageUrlsFromCreations = extractImageUrlsFromCreations;
  exports.parseAbilityParam = parseAbilityParam;
  exports.patchDurationBody = patchDurationBody;
  exports.TARGET_DURATION = TARGET_DURATION;
  exports.TARGET_MODEL = TARGET_MODEL;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.XQUtils = {}));
