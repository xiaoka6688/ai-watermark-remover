/**
 * @file content.js
 * @description V2 Content Script - Isolated World
 *              负责注入 inject.js、接收数据、注入 UI
 *              性能优化：预构建 SVG 模板、requestIdleCallback 分批注入
 */

(function () {
    'use strict';

    const LOG_PREFIX = '[AI去水印·小云雀]';
    const CARD_SELECTOR = 'button[class*="card-"]';
    const PREVIEW_SELECTOR = 'div[class*="cardPreview-"]';

    // ===== 预构建 SVG 模板（避免每次 innerHTML 解析） =====
    const SVG_NS = 'http://www.w3.org/2000/svg';

    function createDownloadSvg() {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2.2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.innerHTML = '<path d="M12 5v10"/><path d="M8 12l4 4 4-4"/><path d="M6 19h12"/>';
        return svg;
    }

    function createDisabledSvg() {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2.2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
        return svg;
    }

    // 预构建模板节点（仅创建一次，后续全部用 cloneNode）
    const downloadSvgTemplate = createDownloadSvg();
    const disabledSvgTemplate = createDisabledSvg();

    // ===== 1. inject.js 已通过 manifest MAIN world 声明注入（CSP 安全） =====
    // 旧方案：document.createElement('script') 会被页面 CSP 阻止
    // 新方案：manifest.json content_scripts + world:"MAIN" 由扩展系统注入

    // ===== 2. 监听 inject.js 发来的扫描结果 =====
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data?.type === 'XYQ_SCAN_RESULT') {
            handleScanResult(event.data.results);
        }
    });

    // ===== 3. 处理扫描结果 =====
    function handleScanResult(results) {
        if (results.length === 0) return;

        const cards = document.querySelectorAll(CARD_SELECTOR);

        // 分批注入：利用 requestIdleCallback 避免阻塞主线程
        // 小批量（<30）直接同步处理；大批量分批
        if (results.length <= 30) {
            injectBatch(results, cards);
        } else {
            const BATCH_SIZE = 20;
            let offset = 0;

            function processNextBatch(deadline) {
                const end = Math.min(offset + BATCH_SIZE, results.length);
                injectBatch(results.slice(offset, end), cards);
                offset = end;

                if (offset < results.length) {
                    // 如果浏览器有空闲时间则继续，否则让出主线程
                    if (typeof requestIdleCallback === 'function') {
                        requestIdleCallback(processNextBatch);
                    } else {
                        setTimeout(processNextBatch, 16);
                    }
                }
            }

            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(processNextBatch);
            } else {
                processNextBatch();
            }
        }
    }

    function injectBatch(batch, cards) {
        let successCount = 0;
        let failCount = 0;

        batch.forEach((item) => {
            const card = cards[item.index];
            if (!card || card.dataset.xyqProcessed === 'true') return;

            const preview = card.querySelector(PREVIEW_SELECTOR);
            if (!preview) return;

            const btnWrap = document.createElement('div');
            btnWrap.className = 'xyq-dl-wrap';

            const btn = document.createElement('button');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'xyq-checkbox';

            if (item.videoUrl) {
                successCount++;

                const videoName = item.name || item.vid || `video_${item.index}`;
                btn.dataset.name = videoName;
                checkbox.dataset.url = item.videoUrl;
                checkbox.dataset.name = videoName;

                // 防冒泡：阻止点击时触发默认的卡片预览窗口
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                });

                checkbox.addEventListener('change', (e) => {
                    // 控制卡片整体高亮
                    if (e.target.checked) {
                        card.classList.add('xyq-card-selected');
                    } else {
                        card.classList.remove('xyq-card-selected');
                    }
                    refreshToolbarStats();
                });

                btn.className = 'xyq-dl-btn';
                btn.title = '下载无水印视频';
                btn.dataset.url = item.videoUrl;
                btn.appendChild(downloadSvgTemplate.cloneNode(true));

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    chrome.runtime.sendMessage({ action: 'download_video', url: item.videoUrl });
                    btn.classList.add('xyq-dl-done');
                    setTimeout(() => btn.classList.remove('xyq-dl-done'), 2500);
                });

                // 将独立定位的 Checkbox 直接 append 到预览卡区域，以让其绝对定位基于卡片
                preview.appendChild(checkbox);
            } else {
                failCount++;
                btn.className = 'xyq-dl-btn xyq-dl-disabled';
                btn.title = '未能获取到无水印链接';
                btn.appendChild(disabledSvgTemplate.cloneNode(true));
            }

            btnWrap.appendChild(btn);
            preview.style.position = 'relative';
            preview.appendChild(btnWrap);
            card.dataset.xyqProcessed = 'true';
        });

        refreshToolbarStats();
        console.log(`${LOG_PREFIX} 本次注入: ${successCount} 可下载, ${failCount} 不可用`);
    }

    // ===== 4. 顶部工具栏 =====
    function createToolbar() {
        if (document.getElementById('xyq-toolbar')) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'xyq-toolbar';
        toolbar.innerHTML = `
      <div class="xyq-toolbar-inner">
        <div class="xyq-toolbar-info">
          <svg class="xyq-toolbar-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v10"/>
            <path d="M8 12l4 4 4-4"/>
            <path d="M6 19h12"/>
          </svg>
          <span class="xyq-toolbar-title">小云雀无水印下载</span>
          <span class="xyq-toolbar-stats" id="xyq-stats">扫描中...</span>
        </div>
        <div class="xyq-toolbar-actions">
          <button class="xyq-toolbar-btn" id="xyq-rescan">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            重新扫描
          </button>
          <button class="xyq-toolbar-btn xyq-toolbar-btn-primary" id="xyq-download-all">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v10"/>
              <path d="M8 12l4 4 4-4"/>
              <path d="M6 19h12"/>
            </svg>
            全部下载
          </button>
        </div>
      </div>
    `;
        document.body.appendChild(toolbar);

        // 动态监听路由变化，仅在 /asset 资产库页面显示工具栏
        setInterval(() => {
            const currentPath = window.location.pathname;
            if (currentPath.includes('/asset')) {
                toolbar.style.display = 'block';
            } else {
                toolbar.style.display = 'none';
            }
        }, 800);

        // 重新扫描
        document.getElementById('xyq-rescan').addEventListener('click', () => {
            document.querySelectorAll('[data-xyq-processed]').forEach((el) => {
                el.removeAttribute('data-xyq-processed');
            });
            document.querySelectorAll('.xyq-dl-wrap').forEach((el) => el.remove());
            document.querySelectorAll('.xyq-checkbox').forEach((el) => el.remove()); // 清理脱离的复选框
            window.postMessage({ type: 'XYQ_REQUEST_SCAN' }, '*');
        });

        // 全部下载 / 选中打包下载
        document.getElementById('xyq-download-all').addEventListener('click', async () => {
            const downloadBtn = document.getElementById('xyq-download-all');
            if (downloadBtn.disabled) return;

            const allCheckboxes = Array.from(document.querySelectorAll('.xyq-checkbox'));
            const checkedBoxes = allCheckboxes.filter(cb => cb.checked);

            // 决定要打包哪些：如果勾选了则只打包勾选，否则打包所有
            const targetsToDownload = checkedBoxes.length > 0 ? checkedBoxes : allCheckboxes;

            if (targetsToDownload.length === 0) {
                alert('当前页面没有可下载的视频');
                return;
            }

            // 如果只有一个视频，直接掉用原下载逻辑避免 zip
            if (targetsToDownload.length === 1) {
                chrome.runtime.sendMessage({ action: 'download_video', url: targetsToDownload[0].dataset.url });
                return;
            }

            // 多视频打包
            if (!window.JSZip) {
                alert('JSZip 尚未加载成功，无法打包。请刷新重试！');
                return;
            }

            downloadBtn.disabled = true;
            const originalText = downloadBtn.innerHTML;
            const statsEl = document.getElementById('xyq-stats');

            try {
                const zip = new JSZip();
                let downloaded = 0;
                const total = targetsToDownload.length;

                statsEl.innerHTML = `<span style="color: #fbbf24; font-weight: bold;">打包中: 0/${total} ...</span>`;

                for (let i = 0; i < total; i++) {
                    const target = targetsToDownload[i];
                    const url = target.dataset.url;
                    let name = target.dataset.name + '.mp4';
                    // 清理不合法字符
                    name = name.replace(/[<>\:\"\/\\\|\?\*]/g, '_');

                    try {
                        const response = await fetch(url);
                        if (!response.ok) throw new Error('Network error');
                        const blob = await response.blob();
                        zip.file(name, blob);
                        downloaded++;
                        statsEl.innerHTML = `<span style="color: #fbbf24; font-weight: bold;">打包中: ${downloaded}/${total} ...</span>`;
                    } catch (err) {
                        console.error('Fetch video failed:', err);
                    }
                }

                statsEl.innerHTML = `<span style="color: #10b981; font-weight: bold;">正在生成 ZIP 文件，稍候...</span>`;
                const content = await zip.generateAsync({ type: 'blob' });

                // 创建前台下载链接释放
                const objectUrl = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = objectUrl;
                a.download = `小云雀精选合辑_${Date.now()}.zip`;
                document.body.appendChild(a);
                a.click();

                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(objectUrl);
                }, 1000);

            } catch (err) {
                alert('打包失败：' + err.message);
            } finally {
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = originalText;
                refreshToolbarStats();
            }
        });
    }

    // ===== 累计统计 & 刷新按钮态 =====
    function refreshToolbarStats() {
        const statsEl = document.getElementById('xyq-stats');
        const dlBtn = document.getElementById('xyq-download-all');
        if (!statsEl || !dlBtn) return;

        const successItems = document.querySelectorAll('.xyq-checkbox');
        const totalSuccess = successItems.length;
        const fail = document.querySelectorAll('.xyq-dl-btn.xyq-dl-disabled').length;
        const total = totalSuccess + fail;

        const checkedBoxes = document.querySelectorAll('.xyq-checkbox:checked');
        const selectedCount = checkedBoxes.length;

        if (total > 0) {
            if (selectedCount > 0) {
                statsEl.innerHTML = `共 ${total} 个视频 · ${totalSuccess} 可下载 · <b>已选中 <span style="color:#6366f1;">${selectedCount}</span> 个</b>`;
                dlBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <polyline points="9 17 4 12"/>
              <line x1="20" y1="12" x2="15" y2="12"/>
            </svg> 下载选中 (${selectedCount})
         `;
            } else {
                statsEl.innerText = `共 ${total} 个视频 · ${totalSuccess} 可下载${fail > 0 ? ' · ' + fail + ' 不可用' : ''}`;
                dlBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v10"/><path d="M8 12l4 4 4-4"/><path d="M6 19h12"/>
            </svg> 全部打包下载
         `;
            }
        } else {
            statsEl.textContent = '未检测到视频';
        }
    }

    // ===== 5. MutationObserver（排除自身注入 + 防抖） =====
    let scanDebounceTimer = null;
    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            let hasNewCards = false;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.classList?.contains('xyq-dl-wrap') || node.id === 'xyq-toolbar') continue;
                    if (node.matches?.(CARD_SELECTOR) || node.querySelector?.(CARD_SELECTOR)) {
                        hasNewCards = true;
                        break;
                    }
                }
                if (hasNewCards) break;
            }
            if (hasNewCards) {
                clearTimeout(scanDebounceTimer);
                scanDebounceTimer = setTimeout(() => {
                    window.postMessage({ type: 'XYQ_REQUEST_SCAN' }, '*');
                }, 800);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ===== 入口 =====
    function init() {
        console.log(`${LOG_PREFIX} 插件已加载`);
        createToolbar();
        startObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
