// ================================================================
//  小柒去水印插件 - 15s 豆包视频时长扩展
//  右下角浮窗控制启停，启用时注入拦截，不启用时什么都不做
// ================================================================
(function () {
  'use strict';

  const LS_KEY = 'xq_d15_enabled';
  const TARGET_DURATION = 15;
  const TARGET_MODEL = 'seedance_v2.0';
  const STORAGE_KEY = 'codex_doubao_video_duration_choice';

  // ========== 读取启用状态（默认关闭） ==========
  function isEnabled() {
    return localStorage.getItem(LS_KEY) === 'true';
  }

  function setEnabled(val) {
    localStorage.setItem(LS_KEY, val ? 'true' : 'false');
  }

  // ========== 不启用时：仅显示浮窗，什么都不做 ==========
  if (!isEnabled()) {
    console.log('[小柒15s] ⏸ 已关闭，不注入任何功能');

    function createOffFloater() {
      const el = document.createElement('div');
      el.id = 'xq-d15-floater';
      el.innerHTML = '<span>15s</span>';
      Object.assign(el.style, {
        position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483647',
        background: 'rgba(100,100,110,0.5)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '30px', padding: '8px 14px', cursor: 'pointer',
        fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: '700',
        color: 'rgba(255,255,255,0.5)', userSelect: 'none',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)', transition: '0.2s'
      });
      el.title = '15s 时长扩展 (已关闭，点击启用)';
      el.addEventListener('click', () => {
        setEnabled(true);
        el.textContent = '🔄 请刷新页面';
        el.style.color = '#60a5fa';
        setTimeout(() => location.reload(), 1500);
      });
      el.addEventListener('mouseenter', () => { el.style.opacity = '0.8'; });
      el.addEventListener('mouseleave', () => { el.style.opacity = '1'; });

      const waitBody = () => {
        if (document.body) { document.body.appendChild(el); }
        else { setTimeout(waitBody, 200); }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitBody);
      } else { waitBody(); }
    }

    createOffFloater();
    return; // 退出脚本，什么都不注入
  }

  // ================================================================
  //  以下代码仅在启用时执行
  // ================================================================
  console.log('[小柒15s] ✅ 已启用，注入拦截功能');

  // ==================== 存储 ====================
  function selectedDuration() {
    try { return Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch (_) { return 0; }
  }
  function saveDuration(seconds) {
    try {
      if (seconds) localStorage.setItem(STORAGE_KEY, String(seconds));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  // ==================== 请求拦截 ====================
  function isCompletionUrl(input) {
    const raw = typeof input === 'string' ? input : (input && (input.url || input.href)) || String(input || '');
    try {
      const url = new URL(raw, location.href);
      return /(^|\.)doubao\.com$/.test(url.hostname) && url.pathname === '/chat/completion';
    } catch (_) {
      return /\/chat\/completion(?:\?|$)/.test(raw);
    }
  }

  function parseAbilityParam(value) {
    if (value && typeof value === 'object') return { ...value };
    if (typeof value === 'string' && value.trim()) {
      try { return JSON.parse(value); } catch (_) {}
    }
    return {};
  }

  function patchBody(rawBody) {
    if (typeof rawBody !== 'string' || !rawBody.trim()) return { changed: false, body: rawBody };
    if (selectedDuration() !== TARGET_DURATION) return { changed: false, body: rawBody };

    let payload;
    try { payload = JSON.parse(rawBody); } catch (_) { return { changed: false, body: rawBody }; }

    const ability = payload && payload.chat_ability;
    if (!ability || Number(ability.ability_type) !== 17) return { changed: false, body: rawBody };

    const param = parseAbilityParam(ability.ability_param);
    param.model = TARGET_MODEL;
    param.duration = TARGET_DURATION;
    ability.ability_param = JSON.stringify(param);
    return { changed: true, body: JSON.stringify(payload) };
  }

  function patchFetch() {
    if (typeof window.fetch !== 'function' || window.fetch.__xq_d15) return;
    const originalFetch = window.fetch;

    async function patchedFetch(input, init) {
      try {
        if (!isCompletionUrl(input)) return originalFetch.apply(this, arguments);
        if (init && Object.prototype.hasOwnProperty.call(init, 'body')) {
          const patched = patchBody(init.body);
          if (patched.changed) return originalFetch.call(this, input, { ...init, body: patched.body });
          return originalFetch.apply(this, arguments);
        }
        if (window.Request && input instanceof window.Request && String(input.method || '').toUpperCase() === 'POST') {
          const raw = await input.clone().text();
          const patched = patchBody(raw);
          if (patched.changed) return originalFetch.call(this, new window.Request(input, { body: patched.body }), init);
        }
      } catch (error) { console.warn('[小柒15s] fetch error:', error); }
      return originalFetch.apply(this, arguments);
    }

    patchedFetch.__xq_d15 = true;
    window.fetch = patchedFetch;
  }

  function patchXhr() {
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || proto.__xq_d15) return;
    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function (method, url) {
      this.__xq_d15_url = url;
      return originalOpen.apply(this, arguments);
    };
    proto.send = function (body) {
      try {
        if (body && this.__xq_d15_url && isCompletionUrl(this.__xq_d15_url)) {
          const patched = patchBody(body);
          if (patched.changed) return originalSend.call(this, patched.body);
        }
      } catch (error) { console.warn('[小柒15s] XHR error:', error); }
      return originalSend.apply(this, arguments);
    };
    proto.__xq_d15 = true;
  }

  // ==================== UI 注入（适配新版豆包页面） ====================
  function findDurationTrigger() {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = (btn.textContent || '').replace(/\s+/g, '').trim();
      if (/^(5|10)s$/.test(text)) {
        const parentText = (btn.closest('[class*="creation"], [class*="video"], main, [role="main"]') || document.body).textContent || '';
        if (parentText.includes('Seedance') || parentText.includes('视频') || parentText.includes('比例')) return btn;
      }
    }
    return null;
  }

  let menuObserver = null;
  function setupMenuInjection() {
    if (menuObserver) menuObserver.disconnect();
    menuObserver = new MutationObserver(() => {
      const menu = document.querySelector('[role="menu"]');
      if (!menu) return;
      const menuText = menu.textContent || '';
      if (!menuText.includes('时长') && !menuText.match(/\d+s/)) return;
      if (menu.querySelector('[data-15s-injected]')) return;

      const items = menu.querySelectorAll('[role="menuitem"], [role="option"]');
      let targetItem = null;
      for (const item of items) {
        const t = (item.textContent || '').replace(/\s+/g, '').trim();
        if (t === '10s') { targetItem = item; break; }
      }
      if (!targetItem) targetItem = items[items.length - 1];
      if (!targetItem || !targetItem.parentElement) return;

      const newItem = targetItem.cloneNode(true);
      newItem.removeAttribute('data-state');
      newItem.removeAttribute('aria-checked');
      newItem.setAttribute('data-15s-injected', 'true');

      const textNodes = [];
      const walker = document.createTreeWalker(newItem, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      let textReplaced = false;
      for (const node of textNodes) {
        if (/\d+\s*s/i.test(node.nodeValue || '')) {
          node.nodeValue = node.nodeValue.replace(/\d+\s*s/i, '15s');
          textReplaced = true;
        }
      }
      if (!textReplaced) newItem.textContent = '15s';

      const checks = newItem.querySelectorAll('svg, [class*="check"], [class*="Check"], [class*="selected"]');
      for (const c of checks) c.remove();

      targetItem.parentElement.insertBefore(newItem, targetItem.nextSibling);

      newItem.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        saveDuration(TARGET_DURATION);
        const trigger = findDurationTrigger();
        if (trigger) trigger.textContent = trigger.textContent.replace(/\d+\s*s/i, '15s');
        setTimeout(() => document.body.click(), 30);
      }, true);
    });
    menuObserver.observe(document.body, { childList: true, subtree: true });
  }

  function markDurationTrigger() {
    const trigger = findDurationTrigger();
    if (trigger && !trigger.hasAttribute('data-15s-monitored')) {
      trigger.setAttribute('data-15s-monitored', 'true');
      if (selectedDuration() === TARGET_DURATION) {
        setTimeout(() => { trigger.textContent = trigger.textContent.replace(/\d+\s*s/i, '15s'); }, 500);
      }
    }
  }

  // ==================== 右下角浮窗 ====================
  function createOnFloater() {
    const el = document.createElement('div');
    el.id = 'xq-d15-floater';
    el.innerHTML = '<span>🟢 15s</span>';
    Object.assign(el.style, {
      position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483647',
      background: 'rgba(30,30,40,0.9)', backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '30px', padding: '8px 16px', cursor: 'pointer',
      fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: '700',
      color: '#ffffff', userSelect: 'none',
      boxShadow: '0 2px 16px rgba(0,0,0,0.25)', transition: '0.2s'
    });
    el.title = '15s 时长扩展 (已启用，点击关闭)';
    el.addEventListener('click', () => {
      setEnabled(false);
      el.innerHTML = '🔴 请刷新页面';
      el.style.color = '#f87171';
      setTimeout(() => location.reload(), 1500);
    });
    el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.05)'; });
    el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

    const waitBody = () => {
      if (document.body) document.body.appendChild(el);
      else setTimeout(waitBody, 200);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitBody);
    else waitBody();
  }

  // ==================== 启动（及时 patch + 延迟 UI） ====================
  patchFetch();
  patchXhr();

  function startUI() {
    createOnFloater();
    setupMenuInjection();
    markDurationTrigger();

    const observer = new MutationObserver(() => {
      setupMenuInjection();
      markDurationTrigger();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startUI, { once: true });
  } else {
    startUI();
  }
})();
