// ==========================================
// 内容脚本：负责 UI 注入与拦截消息接收
// ==========================================

// 缓存拦截到的视频数据 (Key: 文件名/videoId/ID)
const interceptedVideos = new Map();
let latestInterceptedVideo = null;
const SUPPORTED_HOSTNAMES = new Set(['dreamina.capcut.com', 'jimeng.jianying.com']);
const isSupportedHost = SUPPORTED_HOSTNAMES.has(window.location.hostname);
const CARD_SELECTOR = '[data-testid*="asset"], [data-testid*="work"], a[href*="/ai-tool/"], li, article';

if (!isSupportedHost) {
    console.debug('[Dreamina Downloader] Skip unsupported host:', window.location.hostname);
}

window.addEventListener('message', function(event) {
    if (!isSupportedHost) {
        return;
    }

    if (event.source !== window || !event.data || event.data.source !== 'dreamina-interceptor') {
        return;
    }
    
    if (event.data.type === 'VIDEO_INTERCEPTED') {
        const normalized = normalizeInterceptedPayload(event.data.payload);
        registerInterceptedVideo(normalized);
        // 捕获到数据后立即触发一次扫描
        injectButtons();
    }
});

const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (let m of mutations) {
        if (m.addedNodes.length > 0) {
            shouldScan = true;
            break;
        }
    }
    if (shouldScan) {
        injectButtons();
    }
});

function startObserver() {
    if (!isSupportedHost) {
        return;
    }

    // 观察 documentElement 是最稳妥的，它几乎永远不是 null
    const target = document.documentElement;
    if (!target) {
        requestAnimationFrame(startObserver);
        return;
    }
    
    try {
        observer.observe(target, { childList: true, subtree: true });
        console.log("[Dreamina Downloader] Content Script: Observer started.");
        setTimeout(injectButtons, 2000);
    } catch (e) {
        console.error("[Dreamina Downloader] Content Script: Failed to start observer:", e);
    }
}

// 启动
if (isSupportedHost) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        startObserver();
    } else {
        window.addEventListener('DOMContentLoaded', startObserver);
    }
}

function injectButtons() {
    if (!isSupportedHost) {
        return;
    }

    // 方案1：图片卡片 - 优先处理，因为图片能最稳定地和接口返回的 URL 匹配。
    // 这能确保在资产页等列表中，优先通过 img 完成了准确绑定，避免 video 兜底逻辑错误覆盖。
    document.querySelectorAll('img').forEach(img => {
        checkAndInjectBySrc(img, img.src, img.closest('div')); 
    });
    
    // 方案2：背景图盒子
    document.querySelectorAll('div[style*="background-image"]').forEach(div => {
        const style = div.getAttribute('style');
        const match = style.match(/url\(['"]?(.*?)['"]?\)/);
        if (match && match[1]) {
            checkAndInjectBySrc(div, match[1], div);
        }
    });

    // 方案3：视频标签 - 最后处理，避免在列表中由于无法精确匹配而被 fallback 污染
    document.querySelectorAll('video').forEach(v => {
        let src = v.src;
        if (!src || src.startsWith('blob:') || src.startsWith('data:')) {
            src = v.poster;
        }
        // 即便 src 提取不到，也传 null 进去，因为可以通过容器里的其它线索匹配
        checkAndInjectBySrc(v, src || null, v.parentElement);
    });
}

function findMatchForElement(element, src, container) {
    let match = null;

    // 1. 通过本身的 src
    if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
        match = findMatchByUrl(src);
        if (match) return match;
    }

    if (!container) return null;

    // 2. 通过容器内的图片 src
    const imgs = container.querySelectorAll('img');
    for (let img of imgs) {
        if (img.src && !img.src.startsWith('data:') && !img.src.startsWith('blob:')) {
            match = findMatchByUrl(img.src);
            if (match) return match;
        }
    }

    // 3. 通过容器内的背景图片
    const bgDivs = container.querySelectorAll('div[style*="background-image"]');
    for (let div of bgDivs) {
        const style = div.getAttribute('style');
        const m = style.match(/url\(['"]?(.*?)['"]?\)/);
        if (m && m[1]) {
            match = findMatchByUrl(m[1]);
            if (match) return match;
        }
    }

    // 4. 通过容器内的链接 (href) 中寻找可能包含的 ID
    const allLinks = [];
    if (container.tagName === 'A') allLinks.push(container);
    container.querySelectorAll('a[href]').forEach(a => allLinks.push(a));

    for (let a of allLinks) {
        const href = a.getAttribute('href');
        if (!href) continue;
        try {
            const urlObj = new URL(href, window.location.href);
            for (let [key, val] of urlObj.searchParams) {
                match = interceptedVideos.get(val);
                if (match) return match;
            }
            const parts = urlObj.pathname.split('/');
            for (let part of parts) {
                if (part && part.length > 5) {
                    match = interceptedVideos.get(part);
                    if (match) return match;
                }
            }
        } catch(e) {}
    }

    return null;
}

function checkAndInjectBySrc(element, src, fallbackContainer) {
    let container = findCardContainer(element, fallbackContainer);
    
    let matchData = findMatchForElement(element, src, container);
    
    // 激进的 fallback：对于 video 标签，如果精确匹配失败，且当前有最新拦截到的视频数据，
    // 并且视频尺寸足够大（排除了小卡片或隐藏元素），则直接使用最新的拦截数据。
    // 由于我们在前面优先处理了 img 和 bg-image，这里多加一步限制：宽度要 > 250
    if (!matchData && element.tagName === 'VIDEO' && latestInterceptedVideo) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 250 || rect.height > 250) {
            matchData = latestInterceptedVideo;
            console.debug('[Dreamina Downloader] Using latest intercepted video as fallback for large player');
        }
    }

    if (matchData) {
        if (container) {
            addBtnToContainer(container, matchData.url, matchData.itemId || matchData.videoId || 'dreamina-video');
        }
    }
}

function normalizeInterceptedPayload(payload) {
    const normalized = {
        url: payload.url,
        videoId: payload.videoId || null,
        cover: payload.cover || null,
        coverUri: payload.coverUri || null,
        itemId: payload.itemId || null,
    };

    normalized.keys = Array.from(collectLookupKeys(normalized));
    return normalized;
}

function registerInterceptedVideo(data) {
    if (!data || !data.url) {
        return;
    }

    data.keys.forEach((key) => {
        interceptedVideos.set(key, data);
    });
    
    // 更新最新拦截到的视频，用于播放器的兜底匹配
    latestInterceptedVideo = data;
}

function collectLookupKeys(data) {
    const keys = new Set();

    addNormalizedKey(keys, data.videoId);
    addNormalizedKey(keys, data.itemId);
    addKeysFromUrl(keys, data.cover);

    if (data.coverUri) {
        addNormalizedKey(keys, data.coverUri);
        const coverUriTail = data.coverUri.split('/').pop();
        addNormalizedKey(keys, coverUriTail);
    }

    return keys;
}

function findMatchByUrl(src) {
    for (const key of collectLookupKeys({ cover: src, coverUri: null, videoId: null, itemId: null })) {
        const match = interceptedVideos.get(key);
        if (match) {
            return match;
        }
    }

    return null;
}

function addKeysFromUrl(keys, rawUrl) {
    if (!rawUrl) {
        return;
    }

    try {
        const parsedUrl = new URL(rawUrl, window.location.href);
        const path = parsedUrl.pathname || '';
        const fileName = path.split('/').pop();
        addNormalizedKey(keys, rawUrl);
        addNormalizedKey(keys, path);
        addNormalizedKey(keys, fileName);

        if (fileName && fileName.includes('~')) {
            addNormalizedKey(keys, fileName.split('~')[0]);
        }

        const videoIdFromQuery = parsedUrl.searchParams.get('VideoID');
        addNormalizedKey(keys, videoIdFromQuery);
    } catch (e) {
        addNormalizedKey(keys, rawUrl);
    }
}

function addNormalizedKey(keys, value) {
    if (!value || typeof value !== 'string') {
        return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return;
    }

    keys.add(trimmed);
}

function findCardContainer(element, fallbackContainer) {
    let container = element.closest(CARD_SELECTOR) || fallbackContainer || element.parentElement;
    let depth = 0;

    while (container && depth < 6) {
        const rect = container.getBoundingClientRect();
        if (rect.width >= 120 && rect.height >= 120) {
            return container;
        }
        container = container.parentElement;
        depth++;
    }

    return fallbackContainer || element.parentElement;
}

function addBtnToContainer(container, downloadUrl, filename="video") {
    if (container.querySelector('.dreamina-dl-btn')) return;
    if (!downloadUrl || !downloadUrl.startsWith('http')) return;

    if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative'; 
    }

    const btn = document.createElement('button');
    btn.className = 'dreamina-dl-btn';
    btn.type = 'button';
    btn.title = '无水印下载';
    btn.setAttribute('aria-label', '无水印下载');
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 11.5L12 15L15.5 11.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18.5H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        chrome.runtime.sendMessage({
            action: 'DOWNLOAD',
            url: downloadUrl,
            filename: `${filename}.mp4`
        });
        
        btn.classList.add('is-busy');
        setTimeout(() => { btn.classList.remove('is-busy'); }, 2000);
    });

    container.appendChild(btn);
}

// 解决被官方透明遮罩层遮挡导致 CSS :hover 失效的问题
document.addEventListener('mousemove', (e) => {
    const buttons = document.querySelectorAll('.dreamina-dl-btn');
    buttons.forEach(btn => {
        const container = btn.parentElement;
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        // 增加一点容错缓冲 (padding)
        const isHovered = (
            e.clientX >= rect.left - 10 && e.clientX <= rect.right + 10 &&
            e.clientY >= rect.top - 10 && e.clientY <= rect.bottom + 10
        );
        
        if (isHovered) {
            btn.classList.add('is-visible');
        } else {
            btn.classList.remove('is-visible');
        }
    });
});

// ==================== 下载进度监听 ====================
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DOWNLOAD_PROGRESS') {
        const busyBtn = document.querySelector('.dreamina-dl-btn.is-busy');
        if (!busyBtn) return;

        if (msg.state === 'complete') {
            busyBtn.classList.remove('is-busy');
            setTimeout(() => { busyBtn.classList.remove('is-visible'); }, 2000);
        } else if (msg.state === 'interrupted') {
            busyBtn.classList.remove('is-busy');
        } else if (msg.percent >= 0) {
            // 显示百分比
            let progressEl = busyBtn.querySelector('.dl-progress');
            if (!progressEl) {
                progressEl = document.createElement('span');
                progressEl.className = 'dl-progress';
                progressEl.style.cssText = 'font-size:10px;color:#fff;font-weight:700;position:absolute;';
                busyBtn.appendChild(progressEl);
            }
            progressEl.textContent = `${msg.percent}%`;
        }
    }
});
