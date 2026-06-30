/**
 * @file inject.js
 * @description 注入到 Main World，从 React Fiber 提取视频数据，通过 postMessage 传递给 content.js
 *              性能优化：缓存 fiberKey 和命中深度，跳过已处理卡片
 */

(function () {
    'use strict';

    const LOG_PREFIX = '[小云雀下载·inject]';
    const CARD_SELECTOR = 'button[class*="card-"]';

    // ===== 性能缓存 =====
    let cachedFiberKey = null;  // React Fiber 的属性名全局唯一，只需查找一次
    let cachedDepth = -1;       // 数据所在的 Fiber 深度，同组件卡片完全一致

    // ===== 获取 React Fiber（带缓存） =====
    function getReactFiber(element) {
        // 如果已缓存 key，直接取值（O(1)）
        if (cachedFiberKey && element[cachedFiberKey]) {
            return element[cachedFiberKey];
        }
        // 首次查找
        for (const k in element) {
            if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) {
                cachedFiberKey = k;
                return element[k];
            }
        }
        return null;
    }

    // ===== 从 Fiber 链查找含 Video 数据的 props =====
    function findVideoData(fiber) {
        if (!fiber) return null;

        // 如果已知深度，直接跳到目标层级（O(1) 而非 O(D)）
        if (cachedDepth >= 0) {
            let f = fiber;
            for (let i = 0; i < cachedDepth; i++) {
                f = f?.return;
            }
            const result = extractFromProps(f);
            if (result) return result;
            // 缓存失效（极少发生），回退到全量搜索
        }

        // 全量搜索并缓存深度
        let f = fiber;
        let depth = 0;
        while (f && depth <= 20) {
            const result = extractFromProps(f);
            if (result) {
                cachedDepth = depth;
                return result;
            }
            f = f.return;
            depth++;
        }
        return null;
    }

    // ===== 从单个 Fiber 节点的 props 中提取视频数据 =====
    function extractFromProps(fiber) {
        if (!fiber) return null;
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (!props || typeof props !== 'object') return null;

        for (const key in props) {
            if (key === 'children' || key === 'style' || key === 'className') continue;
            const candidate = props[key];
            if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                if (candidate.Video) return candidate;
                if (candidate.origin_url || candidate.download_url) return { Video: candidate };
            }
        }
        return null;
    }

    // ===== 扫描卡片（只处理未标记的） =====
    function scanCards() {
        const cards = document.querySelectorAll(CARD_SELECTOR);
        const results = [];
        let downloadable = 0;

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];

            // 跳过已处理的卡片（data 属性在两个 world 中共享）
            if (card.dataset.xyqProcessed === 'true') continue;

            const fiber = getReactFiber(card);
            const asset = findVideoData(fiber);

            const originUrl = asset?.Video?.origin_url;
            const downloadUrl = asset?.Video?.download_url;
            const videoUrl = originUrl || downloadUrl;
            if (videoUrl) downloadable++;

            results.push({
                index: i,
                videoUrl: videoUrl || null,
                originUrl: originUrl || null,
                downloadUrl: downloadUrl || null,
                name: asset?.Name || asset?.Video?.name || null,
                vid: asset?.Video?.vid || null,
                metadata: asset?.Video?.metadata || null
            });
        }

        console.log(`${LOG_PREFIX} 扫描 ${results.length} 个新卡片, ${downloadable} 个可下载`);

        if (results.length > 0) {
            window.postMessage({ type: 'XYQ_SCAN_RESULT', results }, '*');
        }
    }

    // 监听 content.js 的扫描请求
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data?.type === 'XYQ_REQUEST_SCAN') {
            setTimeout(scanCards, 300);
        }
    });

    // 首次扫描
    setTimeout(scanCards, 2000);
})();
