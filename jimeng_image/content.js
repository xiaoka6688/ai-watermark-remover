// ============================================================
// 小柒去水印插件 - 即梦图片去水印下载
// 功能：自动检测即梦 AI 生成的图片，添加下载按钮
//       通过 Canvas 重绘去除水印层
// 说明：整合自 XQ 插件
// ============================================================
(function() {
  'use strict';

  console.log('[XQ 即梦助手] 脚本启动 v1.0');

  // ========================= 全局数据 =========================
  let imageList = [];
  let imageUrlSet = new Set();
  let processedElements = new WeakSet();
  let downloadStats = { images: 0 };

  let floatingPanel = null;
  let isMinimized = false;
  let isDragging = false;
  let dragStartX, dragStartY, panelStartX, panelStartY;
  let scanTimer = null;

  // ========== 判断是否是即梦 AI 生成图片 ==========
  function isJimengImage(img) {
    const src = img.src;
    if (!src) return false;
    if (src.startsWith('data:')) return false;

    return src.indexOf('byteimg') > -1 ||
           src.indexOf('bytescm') > -1 ||
           src.indexOf('bytedance') > -1;
  }

  // ========== 去除图片水印（Canvas 重绘） ==========
  async function removeImageWatermark(imageUrl) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          'Referer': 'https://jimeng.jianying.com/',
          'Origin': 'https://jimeng.jianying.com',
          'User-Agent': navigator.userAgent
        }
      });
      if (!response.ok) throw new Error(`获取失败: ${response.status}`);
      const blob = await response.blob();

      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');

          // 用白色背景覆盖，然后绘制原图，去除水印层
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(blob => {
            if (blob) {
              resolve(URL.createObjectURL(blob));
            } else {
              reject(new Error('Canvas 转换失败'));
            }
          }, 'image/png', 0.95);
        };
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = URL.createObjectURL(blob);
      });
    } catch (error) {
      console.error('[XQ 即梦] 去除水印失败:', error);
      throw error;
    }
  }

  // ========== 显示 Toast 消息 ==========
  function showToast(message, isError = false) {
    const existing = document.querySelector('.xq-jm-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'xq-jm-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: ${isError ? '#ef4444' : '#10b981'};
      color: white;
      padding: 10px 20px;
      border-radius: 30px;
      font-size: 14px;
      font-weight: 500;
      z-index: 100001;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      animation: xqJmSlideUp 0.3s ease;
      white-space: nowrap;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // ========== 为图片添加下载按钮 ==========
  function addButtonToImage(img) {
    if (img.hasAttribute('data-xq-jm-processed')) return;

    const parent = img.parentNode;
    if (!parent) return;

    // 避免嵌套包装
    if (parent.classList && parent.classList.contains('xq-jm-img-wrapper')) return;

    const rect = img.getBoundingClientRect();
    const width = rect.width || img.clientWidth || img.naturalWidth || 300;
    const height = rect.height || img.clientHeight || img.naturalHeight || 300;

    // 包装容器
    const wrapper = document.createElement('div');
    wrapper.className = 'xq-jm-img-wrapper';
    wrapper.style.cssText = `
      position: relative;
      display: inline-block;
      width: ${width}px;
      height: ${height}px;
      line-height: 0;
    `;

    parent.insertBefore(wrapper, img);
    wrapper.appendChild(img);

    img.style.width = '100%';
    img.style.height = '100%';
    img.style.display = 'block';
    img.style.objectFit = 'contain';
    img.setAttribute('data-xq-jm-processed', 'true');

    // 下载按钮
    const btn = document.createElement('button');
    btn.innerHTML = '⬇️ 无水印';
    btn.style.cssText = `
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 99999;
      background: #1a1a2e;
      color: white;
      border: none;
      border-radius: 20px;
      padding: 5px 12px;
      font-size: 11px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      gap: 4px;
      opacity: 0.9;
      transition: all 0.2s ease;
    `;

    btn.onmouseenter = () => {
      if (!btn.disabled) {
        btn.style.background = '#98ddca';
        btn.style.color = '#1a5761';
      }
    };
    btn.onmouseleave = () => {
      if (!btn.disabled) {
        btn.style.background = '#1a1a2e';
        btn.style.color = 'white';
      }
    };

    btn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (btn.disabled) return;

      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ 去水印中...';
      btn.style.background = '#666';
      btn.style.color = 'white';

      try {
        showToast('正在去除水印...');

        // 先去水印处理
        const processedUrl = await removeImageWatermark(img.src);

        // 添加到列表
        if (!imageUrlSet.has(img.src)) {
          imageUrlSet.add(img.src);
          imageList.push({ url: img.src, processedUrl });
        }

        // 下载
        const ts = Date.now();
        const filename = `jimeng_image_${ts}.png`;

        // 使用 processedUrl (ObjectURL) 下载
        const response = await chrome.runtime.sendMessage({
          type: 'downloadImage',
          url: processedUrl,
          filename: filename
        });

        if (response && response.success) {
          showToast('✅ 无水印图片下载成功！');
          downloadStats.images++;
          updateFloatingPanelUI();
          btn.innerHTML = '✅ 已下载';
          btn.style.background = '#98ddca';
          btn.style.color = '#1a5761';
          setTimeout(() => {
            if (btn.parentNode) {
              btn.innerHTML = '⬇️ 无水印';
              btn.style.background = '#1a1a2e';
              btn.style.color = 'white';
              btn.disabled = false;
            }
          }, 2000);
        } else {
          throw new Error(response?.error || '下载失败');
        }
      } catch (error) {
        console.error('[XQ 即梦] 下载错误:', error);
        showToast('❌ ' + (error.message || '下载失败'), true);
        btn.innerHTML = '❌ 重试';
        btn.style.background = '#e74c3c';
        btn.style.color = 'white';
        btn.disabled = false;
        setTimeout(() => {
          if (btn.parentNode && btn.innerHTML === '❌ 重试') {
            btn.innerHTML = '⬇️ 无水印';
            btn.style.background = '#1a1a2e';
            btn.style.color = 'white';
          }
        }, 2000);
      }
    };

    wrapper.appendChild(btn);
  }

  // ========== 扫描所有匹配的图片并添加按钮 ==========
  function scanAndAddAllButtons() {
    const images = document.querySelectorAll('img');
    let added = 0;
    for (const img of images) {
      if (img.hasAttribute('data-xq-jm-processed')) continue;
      if (!isJimengImage(img)) continue;
      addButtonToImage(img);
      added++;
    }
    if (added > 0) {
      console.log('[XQ 即梦] 新增按钮:', added);
      updateFloatingPanelUI();
    }
  }

  // ========== 创建悬浮面板 ==========
  function createFloatingPanel() {
    if (floatingPanel) return;

    floatingPanel = document.createElement('div');
    floatingPanel.id = 'xq-jm-panel';
    floatingPanel.style.cssText = `
      position: fixed;
      bottom: 100px;
      right: 30px;
      z-index: 99999;
      background: linear-gradient(135deg, #f5e6d3, #eed9c4);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      width: 240px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.3);
    `;

    floatingPanel.innerHTML = `
      <div class="xq-jm-header" style="
        padding: 12px 16px;
        background: rgba(255,255,255,0.3);
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: space-between;
        user-select: none;
        border-bottom: 1px solid rgba(0,0,0,0.06);
      ">
        <span style="font-size: 14px; font-weight: 600; color: #5c3d2e;">🎨 XQ 即梦</span>
        <button class="xq-jm-minimize" style="
          background: none;
          border: none;
          color: #8b6b4f;
          cursor: pointer;
          font-size: 16px;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">−</button>
      </div>
      <div class="xq-jm-content" style="padding: 16px;">
        <div class="xq-jm-stats" style="
          display: flex;
          align-items: center;
          justify-content: space-around;
          padding: 12px;
          background: rgba(255,255,255,0.5);
          border-radius: 12px;
        ">
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #5c3d2e;" class="xq-jm-img-count">0</div>
            <div style="font-size: 11px; color: #8b6b4f;">已下载图片</div>
          </div>
          <div style="width:1px;height:30px;background:rgba(0,0,0,0.1);"></div>
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #5c3d2e;" class="xq-jm-found-count">0</div>
            <div style="font-size: 11px; color: #8b6b4f;">检测到图片</div>
          </div>
        </div>
        <div style="margin-top: 12px; text-align: center;">
          <p style="font-size: 12px; color: #8b6b4f; margin: 0;">
            ✨ 鼠标悬停图片上方左上角出现下载按钮
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(floatingPanel);

    // 拖拽
    const header = floatingPanel.querySelector('.xq-jm-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('xq-jm-minimize')) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = floatingPanel.getBoundingClientRect();
      panelStartX = rect.left;
      panelStartY = rect.top;
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', stopDrag);
    });

    function onDrag(e) {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      floatingPanel.style.left = (panelStartX + dx) + 'px';
      floatingPanel.style.right = 'auto';
      floatingPanel.style.top = (panelStartY + dy) + 'px';
      floatingPanel.style.bottom = 'auto';
    }

    function stopDrag() {
      isDragging = false;
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', stopDrag);
    }

    // 最小化
    const minimizeBtn = floatingPanel.querySelector('.xq-jm-minimize');
    const content = floatingPanel.querySelector('.xq-jm-content');
    minimizeBtn.onclick = (e) => {
      e.stopPropagation();
      isMinimized = !isMinimized;
      content.style.display = isMinimized ? 'none' : 'block';
      minimizeBtn.textContent = isMinimized ? '+' : '−';
    };
  }

  function updateFloatingPanelUI() {
    if (!floatingPanel) return;
    const imgCount = floatingPanel.querySelector('.xq-jm-img-count');
    const foundCount = floatingPanel.querySelector('.xq-jm-found-count');
    const found = document.querySelectorAll('img[data-xq-jm-processed="true"]').length;
    if (imgCount) imgCount.textContent = downloadStats.images;
    if (foundCount) foundCount.textContent = found;
  }

  // ========== 监听页面变化 ==========
  function debouncedScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scanAndAddAllButtons, 500);
  }

  // ========== 初始化 ==========
  function init() {
    console.log('[XQ 即梦] 插件启动');

    // 注入一些通用样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes xqJmSlideUp {
        from { transform: translateX(-50%) translateY(20px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
      .xq-jm-img-wrapper:hover button {
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);

    createFloatingPanel();
    updateFloatingPanelUI();

    // 多轮扫描确保覆盖
    setTimeout(scanAndAddAllButtons, 500);
    setTimeout(scanAndAddAllButtons, 1500);
    setTimeout(scanAndAddAllButtons, 3000);
    setTimeout(scanAndAddAllButtons, 5000);

    // 监听 DOM 变化
    const observer = new MutationObserver(debouncedScan);
    observer.observe(document.body, { childList: true, subtree: true });

    // 监听滚动
    window.addEventListener('scroll', debouncedScan);

    // 监听统计变化
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.downloadStats) {
        updateFloatingPanelUI();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
