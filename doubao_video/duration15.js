// ================================================================
//  AI去水印 - 15s 豆包视频时长扩展 (v1.2.0 持久化版)
//  改为通过 postMessage 桥接 forwarder.js → chrome.storage.local
// ================================================================
(function () {
  'use strict';

  const TARGET_DURATION = 15;
  const TARGET_MODEL = 'seedance_v2.0';

  // ==================== 存储（通过 ISOLATED world 桥接） ====================
  // chrome.storage.local 的 key
  const STORAGE_ENABLED_KEY = 'aiwm_d15_enabled';
  const STORAGE_DURATION_KEY = 'codex_doubao_video_duration_choice';

  // 本地状态（先用默认值，等 forwarder 回传真实值）
  let enabled = false;
  let selectedDuration = 0;
  let initialized = false;

  // 向 forwarder.js 请求存储状态
  function requestStateFromStorage() {
    window.postMessage({ type: 'aiwm_d15_get_state' }, '*');
  }

  // 保存状态到 storage（通过 forwarder.js 桥接）
  function saveEnabledToStorage(val) {
    enabled = val;
    window.postMessage({ type: 'aiwm_d15_set_enabled', value: val }, '*');
  }

  function saveDurationToStorage(seconds) {
    selectedDuration = seconds;
    window.postMessage({ type: 'aiwm_d15_set_duration', value: seconds }, '*');
  }

  // 监听 forwarder.js 返回的状态
  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'aiwm_d15_state_result') {
      const data = event.data.data || {};
      enabled = data.enabled === true;
      selectedDuration = Number(data.duration) || 0;
      initialized = true;
      console.log('[AI去水印·15s] 从 storage 恢复状态:', { enabled, selectedDuration });
      onStateReady();
    }
  });

  // ========== 不启用时：仅显示浮窗，什么都不做 ==========
  // 等 forwarder.js 回传状态后再决定是否注入功能
  function onStateReady() {
    if (!enabled) {
      console.log('[AI去水印·15s] ⏸ 已关闭，不注入任何功能');
      createFloater(false); // 灰色浮窗，点击启用
      return;
    }

    console.log('[AI去水印·15s] ✅ 已启用，注入拦截功能');
    createFloater(true); // 绿色浮窗，点击关闭
    startInterception();
  }

  // 启动：向 forwarder.js 请求存储状态
  requestStateFromStorage();

  // 以下代码在 enabled 状态确定后由 onStateReady → startInterception 调用
  // patchFetch / patchXhr 在 IIFE 顶层无条件执行（它们内部检查 selectedDuration）

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
    if (selectedDuration !== TARGET_DURATION) return { changed: false, body: rawBody };

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
    if (typeof window.fetch !== 'function' || window.fetch.__aiwm_d15) return;
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
      } catch (error) { console.warn('[AI去水印·15s] fetch error:', error); }
      return originalFetch.apply(this, arguments);
    }

    patchedFetch.__aiwm_d15 = true;
    window.fetch = patchedFetch;
  }

  function patchXhr() {
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || proto.__aiwm_d15) return;
    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function (method, url) {
      this.__aiwm_d15_url = url;
      return originalOpen.apply(this, arguments);
    };
    proto.send = function (body) {
      try {
        if (body && this.__aiwm_d15_url && isCompletionUrl(this.__aiwm_d15_url)) {
          const patched = patchBody(body);
          if (patched.changed) return originalSend.call(this, patched.body);
        }
      } catch (error) { console.warn('[AI去水印·15s] XHR error:', error); }
      return originalSend.apply(this, arguments);
    };
    proto.__aiwm_d15 = true;
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
        saveDurationToStorage(TARGET_DURATION);
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
      if (selectedDuration === TARGET_DURATION) {
        setTimeout(() => { trigger.textContent = trigger.textContent.replace(/\d+\s*s/i, '15s'); }, 500);
      }
    }
  }

  // ==================== 统一浮窗（启用/关闭两用） ====================
  function createFloater(isOn) {
    const el = document.createElement('div');
    el.id = 'aiwm-d15-floater';
    el.innerHTML = isOn ? '<span>🟢 15s</span>' : '<span>15s</span>';

    const baseStyle = {
      position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483647',
      borderRadius: '30px', padding: '8px 16px', cursor: 'pointer',
      fontFamily: '-apple-system, sans-serif', fontSize: '13px', fontWeight: '700',
      userSelect: 'none', transition: '0.2s'
    };
    const onStyle = {
      background: 'rgba(30,30,40,0.9)', backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.1)', color: '#ffffff',
      boxShadow: '0 2px 16px rgba(0,0,0,0.25)'
    };
    const offStyle = {
      background: 'rgba(100,100,110,0.5)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)'
    };
    Object.assign(el.style, baseStyle, isOn ? onStyle : offStyle);
    el.title = isOn ? '15s 时长扩展 (已启用，点击关闭)' : '15s 时长扩展 (已关闭，点击启用)';

    el.addEventListener('click', () => {
      saveEnabledToStorage(!isOn);
      el.innerHTML = isOn ? '🔴 请刷新页面' : '🔄 请刷新页面';
      el.style.color = isOn ? '#f87171' : '#60a5fa';
      setTimeout(() => location.reload(), 1500);
    });
    el.addEventListener('mouseenter', () => { el.style.opacity = '0.8'; el.style.transform = 'scale(1.05)'; });
    el.addEventListener('mouseleave', () => { el.style.opacity = '1'; el.style.transform = 'scale(1)'; });

    const waitBody = () => {
      if (document.body) document.body.appendChild(el);
      else setTimeout(waitBody, 200);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitBody);
    else waitBody();
  }

  // ==================== 启动（及时 patch，不受开关影响） ====================
  patchFetch();
  patchXhr();

  // UI + 菜单注入（仅在 onStateReady 确认 enabled 后调用）
  function startUI() {
    setupMenuInjection();
    markDurationTrigger();

    const observer = new MutationObserver(() => {
      setupMenuInjection();
      markDurationTrigger();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // startInterception 由 onStateReady 调用
  function startInterception() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startUI, { once: true });
    } else {
      startUI();
    }
  }

  // 向 forwarder.js 请求存储状态（已在顶部调用，此处为注释说明）
  // requestStateFromStorage() → forwarder 回传 → onStateReady() → startInterception()
})();
