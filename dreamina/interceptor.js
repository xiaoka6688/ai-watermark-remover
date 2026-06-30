// ==========================================
// 核心拦截逻辑：通过 manifest 指定在 MAIN world 运行，直接拥有对 window.fetch 的控制权
// ==========================================

(function() {
  const SUPPORTED_HOSTNAMES = new Set(['dreamina.capcut.com', 'jimeng.jianying.com']);

  if (!SUPPORTED_HOSTNAMES.has(window.location.hostname)) {
    return;
  }

  if (window.__dreaminaDownloaderInterceptorInstalled) {
    return;
  }

  window.__dreaminaDownloaderInterceptorInstalled = true;
  console.log("[Dreamina Logger] Interceptor is priming...");

  const originalFetch = window.fetch;
  const extractRequestUrl = (requestLike) => {
    if (typeof requestLike === 'string') {
      return requestLike;
    }

    if (requestLike && typeof requestLike.url === 'string') {
      return requestLike.url;
    }

    return '';
  };

  const shouldInspectRequest = (rawUrl) => {
    if (!rawUrl) {
      return false;
    }

    try {
      const parsedUrl = new URL(rawUrl, window.location.href);
      return parsedUrl.pathname.includes('/get_asset_list') ||
        parsedUrl.pathname.includes('/get_local_item_list') ||
        parsedUrl.pathname.includes('/get_history_by_ids');
    } catch (e) {
      return rawUrl.includes('/get_asset_list') ||
        rawUrl.includes('/get_local_item_list') ||
        rawUrl.includes('/get_history_by_ids');
    }
  };

  const proxiedFetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const url = extractRequestUrl(args[0]);
    
    if (response && response.ok) {
      const contentType = response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') : '';
      if ((contentType && contentType.includes('application/json')) || shouldInspectRequest(url)) {
        response.clone().json().then(data => {
          if (data && typeof data === 'object') {
            analyzeResponse(url, data);
          }
        }).catch(e => {});
      }
    }
    return response;
  };

  // --- 隐蔽性处理：伪装成原生函数 ---
  try {
    Object.defineProperty(proxiedFetch, 'name', { value: 'fetch', configurable: true });
    proxiedFetch.toString = () => "function fetch() { [native code] }";
    window.fetch = proxiedFetch;
  } catch(e) {
    console.error("[Dreamina Logger] Failed to proxy fetch safely:", e);
    window.fetch = proxiedFetch;
  }

  // --- 同样重写 XHR (作为兜底) ---
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._interceptorUrl = typeof url === 'string' ? url : url?.href;
    return originalXHROpen.apply(this, [method, url, ...args]);
  };

  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      if (this.status >= 200 && this.status < 300) {
        try {
          const contentType = this.getResponseHeader('content-type');
          if ((contentType && contentType.includes('application/json')) || shouldInspectRequest(this._interceptorUrl)) {
            const data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
            if (data && typeof data === 'object') {
              analyzeResponse(this._interceptorUrl, data);
            }
          }
        } catch(e) {}
      }
    });
    return originalXHRSend.apply(this, args);
  };

  function analyzeResponse(url, data) {
    const items = extractCandidateItems(data);

    items.forEach(actualItem => {
      if (!actualItem || !actualItem.video) {
        return;
      }

      const videoId = actualItem?.video?.video_id ||
        actualItem?.common_attr?.id ||
        actualItem?.common_attr?.local_item_id ||
        actualItem?.item_id ||
        actualItem?.__inherited_ids?.item_id ||
        actualItem?.task_id ||
        actualItem?.__inherited_ids?.task_id ||
        actualItem?.asset_id ||
        actualItem?.__inherited_ids?.asset_id;
        
      let hqUrl = null;
      let posterUrl = null;
      let coverUri = actualItem?.common_attr?.cover_uri || null;
      
      const itemId = actualItem?.common_attr?.id || 
                     actualItem?.common_attr?.local_item_id || 
                     actualItem?.item_id || 
                     actualItem?.__inherited_ids?.item_id ||
                     actualItem?.task_id || 
                     actualItem?.__inherited_ids?.task_id ||
                     actualItem?.asset_id || 
                     actualItem?.__inherited_ids?.asset_id ||
                     null;

      const videoModelStr = actualItem?.video?.video_model;
      if (videoModelStr && typeof videoModelStr === 'string') {
        try {
          const videoModel = JSON.parse(videoModelStr);
          posterUrl = videoModel.poster_url || videoModel.cover_url || null;
          const vList = videoModel?.video_list;
          if (vList) {
            const keys = ["video_4", "video_3", "video_2", "video_1"];
            for (const key of keys) {
              if (vList[key] && vList[key].main_url) {
                hqUrl = atob(vList[key].main_url);
                break;
              }
            }
          }
        } catch(e) {}
      }
      
      if (!hqUrl) {
         hqUrl = actualItem?.common_attr?.transcoded_video?.origin?.video_url ||
                 actualItem?.video?.transcoded_video?.origin?.video_url ||
                 actualItem?.video?.download_url ||
                 actualItem?.video?.play_url ||
                 actualItem?.video?.url;
      }

      const cover = posterUrl || actualItem?.video?.cover_url || actualItem?.image?.large_images?.[0]?.image_url;

       if (hqUrl && videoId) {
         window.postMessage({
           source: 'dreamina-interceptor',
           type: 'VIDEO_INTERCEPTED',
           payload: { videoId, url: hqUrl, cover, coverUri, itemId }
         }, '*');
       }
    });
  }

  function extractCandidateItems(payload) {
    const collected = [];
    const visited = new WeakSet();

    function collectFromNode(node, inheritedIds = {}) {
      if (!node || typeof node !== 'object') {
        return;
      }

      if (visited.has(node)) {
        return;
      }
      visited.add(node);

      if (Array.isArray(node)) {
        node.forEach(n => collectFromNode(n, inheritedIds));
        return;
      }
      
      const currentIds = {
          task_id: node.task_id || inheritedIds.task_id,
          item_id: node.item_id || inheritedIds.item_id,
          req_id: node.req_id || inheritedIds.req_id,
          asset_id: node.asset_id || inheritedIds.asset_id
      };

      if (node.video?.video_id || node.video?.video_model) {
        node.__inherited_ids = currentIds;
        collected.push(node);
      }

      const directLists = [
        node.item_list,
        node.local_item_list,
        node.asset_list,
        node.asset_group_list,
        node.video_list,
        node.origin_item_list
      ];

      directLists.forEach(list => collectFromNode(list, currentIds));

      if (node.item && typeof node.item === 'object') {
        collectFromNode(node.item, currentIds);
      }

      if (node.video && typeof node.video === 'object') {
        collectFromNode(node.video, currentIds);
      }

      if (node.image && typeof node.image === 'object') {
        collectFromNode(node.image, currentIds);
      }

      if (node.aigc_data && typeof node.aigc_data === 'object') {
        collectFromNode(node.aigc_data, currentIds);
      }

      if (node.data && typeof node.data === 'object') {
        collectFromNode(node.data, currentIds);
      }

      Object.values(node).forEach((value) => {
        if (value && typeof value === 'object') {
          collectFromNode(value, currentIds);
        }
      });
    }

    collectFromNode(payload);
    return collected;
  }

  console.log("[Dreamina Logger] API Interceptor Ready.");
})();
