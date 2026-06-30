// ============================================================
// AI去水印 - Options Page 逻辑
// ============================================================
(function () {
  'use strict';

  // ========== Toast ==========
  function showToast(msg, type) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type || 'info'}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ========== 站点开关 ==========
  const SITE_KEY = 'site_modules';
  const siteCheckboxes = {
    dreamina: document.getElementById('site_dreamina'),
    doubao: document.getElementById('site_doubao'),
    jimeng: document.getElementById('site_jimeng'),
    xyq: document.getElementById('site_xyq'),
    qianwen: document.getElementById('site_qianwen')
  };

  function loadSiteModules() {
    chrome.storage.local.get([SITE_KEY], (result) => {
      const saved = result[SITE_KEY] || {};
      for (const [site, cb] of Object.entries(siteCheckboxes)) {
        // 默认全部启用（saved[site] 未定义时为 true）
        cb.checked = saved[site] !== false;
        cb.addEventListener('change', saveSiteModules);
      }
    });
  }

  function saveSiteModules() {
    const config = {};
    for (const [site, cb] of Object.entries(siteCheckboxes)) {
      config[site] = cb.checked;
    }
    chrome.storage.local.set({ [SITE_KEY]: config }, () => {
      showToast('站点配置已保存', 'success');
    });
  }

  // ========== 15s 开关 ==========
  const toggle15s = document.getElementById('toggle_15s');

  function load15sState() {
    chrome.runtime.sendMessage({ type: 'GET_15S_STATE' }, (resp) => {
      if (resp?.success) toggle15s.checked = resp.enabled;
    });
  }

  toggle15s.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'SET_15S_ENABLED', value: toggle15s.checked }, (resp) => {
      if (resp?.success) {
        showToast(toggle15s.checked ? '✅ 15s 已启用（需刷新豆包页面）' : '🔴 15s 已关闭', 'success');
      }
    });
  });

  // ========== 去重开关 ==========
  const toggleDedup = document.getElementById('toggle_dedup');
  const DEDUP_KEY = 'dedup_enabled';

  function loadDedupState() {
    chrome.storage.local.get([DEDUP_KEY], (result) => {
      // 默认启用
      toggleDedup.checked = result[DEDUP_KEY] !== false;
    });
  }

  toggleDedup.addEventListener('change', () => {
    chrome.storage.local.set({ [DEDUP_KEY]: toggleDedup.checked }, () => {
      showToast(toggleDedup.checked ? '去重已启用' : '去重已关闭', 'success');
    });
  });

  // ========== 文件名模板 ==========
  const templateInput = document.getElementById('filename_template');
  const DEFAULT_TEMPLATE = '{site}_{date}_{idx}.{ext}';

  function loadTemplate() {
    chrome.runtime.sendMessage({ type: 'GET_FILENAME_TEMPLATE' }, (resp) => {
      if (resp?.success) {
        templateInput.value = resp.template || DEFAULT_TEMPLATE;
      }
    });
  }

  document.getElementById('btn_save_template').addEventListener('click', () => {
    const val = templateInput.value.trim();
    if (!val) {
      showToast('模板不能为空', 'error');
      return;
    }
    if (!val.includes('{ext}')) {
      showToast('模板必须包含 {ext} 变量', 'error');
      return;
    }
    chrome.runtime.sendMessage({ type: 'SET_FILENAME_TEMPLATE', template: val }, (resp) => {
      if (resp?.success) showToast('✅ 模板已保存', 'success');
    });
  });

  document.getElementById('btn_reset_template').addEventListener('click', () => {
    templateInput.value = DEFAULT_TEMPLATE;
    chrome.runtime.sendMessage({ type: 'SET_FILENAME_TEMPLATE', template: DEFAULT_TEMPLATE }, (resp) => {
      if (resp?.success) showToast('已恢复默认模板', 'info');
    });
  });

  // ========== 数据管理 ==========
  document.getElementById('btn_clear_videos').addEventListener('click', () => {
    if (!confirm('确认清空豆包视频统计？')) return;
    chrome.runtime.sendMessage({ type: 'CLEAR_VIDEO_LIST' }, (resp) => {
      if (resp?.success) showToast('✅ 视频统计已清空', 'success');
    });
  });

  document.getElementById('btn_clear_downloads').addEventListener('click', () => {
    if (!confirm('确认清空下载记录？')) return;
    chrome.storage.local.remove(['doubao_downloaded_images'], () => {
      showToast('✅ 下载记录已清空', 'success');
    });
  });

  document.getElementById('btn_clear_notifications').addEventListener('click', () => {
    chrome.storage.local.remove(['notifications'], () => {
      showToast('✅ 通知队列已清空', 'success');
    });
  });

  document.getElementById('btn_reset_all').addEventListener('click', () => {
    if (!confirm('确认恢复全部默认设置？这将重置所有配置项。')) return;
    chrome.storage.local.remove([
      'xq_d15_enabled', 'codex_doubao_video_duration_choice',
      'filenameTemplate', 'site_modules', 'dedup_enabled',
      'notifications', 'doubao_downloaded_images', 'videoList'
    ], () => {
      showToast('✅ 全部设置已重置，请刷新页面', 'success');
      setTimeout(() => location.reload(), 1500);
    });
  });

  // ========== 初始化 ==========
  loadSiteModules();
  load15sState();
  loadDedupState();
  loadTemplate();
})();
