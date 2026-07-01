# 💡 EXPERIENCE · 经验沉淀

> 踩过的坑、最佳实践、调试技巧。**遇到问题先翻这里**。
> 维护规则：每解决一个有价值的问题，追加一条到对应分类下。

---

## 📑 目录

- [🚨 坑与雷区](#-坑与雷区)
- [🏆 最佳实践](#-最佳实践)
- [🔧 调试技巧](#-调试技巧)
- [📐 设计模式](#-设计模式)
- [🔍 性能优化](#-性能优化)
- [🤖 AI 协作](#-ai-协作)

---

## 🚨 坑与雷区

### ❌ SW 全局变量 30 秒失效

**症状**：popup 显示的视频数随机关闭再打开变成 0

**根因**：MV3 Service Worker 闲置 30s 后被 Chrome 回收，所有内存变量清零

**反例**：
```js
// background.js - 错误写法
let videoList = [];
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'add') videoList.push(msg.data);
});
```

**正解**：
```js
// 正确写法 1：用 chrome.storage.local
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'add') {
    chrome.storage.local.get({ videoList: [] }, ({ videoList }) => {
      videoList.push(msg.data);
      chrome.storage.local.set({ videoList });
    });
  }
});

// 正确写法 2：用 Map 但接受"可能为空"
const videoMap = new Map(); // 接受重启后清空
```

**教训**：任何"业务状态"都不能放 SW 内存，要存 storage

---

### ✅ SW 持久化模式（推荐模板）

适用于"SW 需要长期持有业务数据"的场景（如本项目的 `videoList` 豆包视频统计）。

**核心设计**：
- 内存缓存（`xxxCache`）+ `chrome.storage.local` 持久化 + `xxxLoading` Promise 并发保护
- 三个工具函数：`loadXxxFromStorage()` / `saveXxxToStorage()` / `appendXxxAndSave()`
- SW 启动时**预热**缓存，避免第一次读请求等待
- 写时**先更新内存**再 set storage（避免 GET 读到旧值）
- 异步消息必须 `return true` 保持 channel

**实现模板**：
```js
const STORAGE_KEY = 'xxxList';
const MAX_SIZE = 500;  // 软上限
let xxxCache = null;        // null = 尚未加载
let xxxLoading = null;      // Promise，并发保护

function loadXxxFromStorage() {
  if (xxxLoading) return xxxLoading;  // 复用同一个加载请求
  xxxLoading = new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const arr = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
      xxxCache = arr;
      xxxLoading = null;
      resolve(arr);
    });
  });
  return xxxLoading;
}

function saveXxxToStorage(arr, callback) {
  // 软上限，FIFO 淘汰
  const toSave = arr.length > MAX_SIZE ? arr.slice(-MAX_SIZE) : arr;
  xxxCache = toSave;  // 先更新内存
  chrome.storage.local.set({ [STORAGE_KEY]: toSave }, () => {
    if (typeof callback === 'function') callback();
  });
}

function appendXxxAndSave(currentList, newData, callback) {
  const existing = new Set(currentList.map((v) => v.id));
  const filtered = newData.filter((v) => v && v.id && !existing.has(v.id));
  if (filtered.length === 0) {
    if (typeof callback === 'function') callback(currentList);
    return;
  }
  saveXxxToStorage(currentList.concat(filtered), function() {
    if (typeof callback === 'function') callback(xxxCache);
  });
}

// 启动预热
loadXxxFromStorage();

// 消息处理（关键：异步 + return true）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_XXX') {
    loadXxxFromStorage().then((list) => {
      sendResponse({ success: true, data: list });
    });
    return true;  // ← 必须
  }
  if (msg.type === 'ADD_XXX') {
    const handler = (current) => {
      appendXxxAndSave(current, msg.data, (updated) => {
        sendResponse({ success: true, count: updated.length });
      });
    };
    if (xxxCache === null) {
      loadXxxFromStorage().then(handler);
    } else {
      handler(xxxCache);
    }
    return true;
  }
});
```

**为什么不用 `chrome.storage.session`？**
- `session` 是会话级（关闭浏览器即清空），不适合做历史统计
- `local` 跨会话持久，符合"统计历史视频"的需求

**调试技巧**：
- 打开 `chrome://extensions/` → SW 蓝色链接 → 控制台执行：
  ```js
  chrome.storage.local.get('videoList', console.log)
  ```
- 或在 DevTools 的 Application 标签 → Storage → Local Storage 也能看到（虽然扩展 storage 不在那里显示，但可在 console 查）

---

### ❌ `sendMessage` 后忘记 `return true`

**症状**：偶发性 `The message port closed before a response was received`

**根因**：异步 `sendResponse` 必须返回 `true` 保持 channel 开启

**反例**：
```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  fetch(url).then(r => r.json()).then(data => {
    sendResponse({ success: true, data });
  });
  // 忘了 return true！
});
```

**正解**：
```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  fetch(url).then(r => r.json()).then(data => {
    sendResponse({ success: true, data });
  });
  return true;  // ← 必须
});
```

---

### ❌ fetch 包装没处理 `Request` 对象

**症状**：包装了 `window.fetch` 但部分请求没被拦截

**根因**：调用方可能传 `new Request(...)` 而不是字符串

**反例**：
```js
const orig = window.fetch;
window.fetch = function(url) {
  console.log(url);  // 可能是 Request 对象而不是字符串
  return orig.apply(this, arguments);
};
```

**正解**：
```js
const orig = window.fetch;
window.fetch = function(input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (url.includes('/api/...')) {
    // 包装 Request 对象
    if (input instanceof Request) {
      const req = new Request(input, init);
      return orig(req).then(resp => { /* ... */ });
    }
    return orig(input, init).then(resp => { /* ... */ });
  }
  return orig.apply(this, arguments);
};
```

---

### ❌ Canvas 跨域图直接 `toBlob` 失败

**症状**：`jimeng_image` 跨域图片 `Canvas.toBlob` 报 `SecurityError`

**根因**：原图未设 `crossOrigin="anonymous"`，被 canvas 视为"污染"

**正解**：
```js
const img = new Image();
img.crossOrigin = 'anonymous';  // ← 关键
img.onload = () => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);
  canvas.toBlob(blob => { /* ... */ });
};
img.src = url;
```

**额外注意**：CDN 必须返回 `Access-Control-Allow-Origin` 头，否则 `img.src` 加载阶段就会失败

---

### ❌ CDN 强制 Referer 校验

**症状**：jimeng 图直接 fetch 拿不到内容，403

**根因**：字节系 CDN 检查 `Referer` 头，不带就拒绝

**正解**：
```js
const resp = await fetch(imageUrl, {
  headers: {
    'Referer': 'https://jimeng.jianying.com/',
    'Origin': 'https://jimeng.jianying.com',
  }
});
```

---

### ❌ `MutationObserver` 风暴

**症状**：页面卡顿、CPU 飙升

**根因**：SPA 切换时一次性添加上千节点，每次添加都触发 callback

**正解**：
```js
let timer;
const observer = new MutationObserver((mutations) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    scanAndInject();
  }, 500);  // debounce 500ms
});
observer.observe(document.body, { childList: true, subtree: true });
```

---

### ❌ 多个 content script 都往 `window` 挂全局变量

**症状**：popup 报 `xxx is not a function`

**根因**：MAIN world 注入的脚本和 ISOLATED world 隔离，但仍可能在同一 world 里冲突

**正解**：
- 用命名空间（如 `__aiwm_d15_enabled`、`__dreaminaDownloaderInterceptorInstalled`）
- 或挂到 `window.__PLUGIN_NAME__`

---

### ❌ base64 里的 UTF-8 字符丢失

**症状**：`atob(base64Str)` 后中文乱码

**根因**：`atob` 返回的二进制串要按 UTF-8 解码

**正解**：
```js
function atobUtf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
```

---

### ❌ `URL.createObjectURL` 内存泄漏

**症状**：长时间使用后内存占用持续上涨

**正解**：
```js
const url = URL.createObjectURL(blob);
chrome.downloads.download({ url });
setTimeout(() => URL.revokeObjectURL(url), 5000);  // 5 秒后再释放
```

---

### ❌ React Fiber 属性名带哈希

**症状**：直接读 `el.__reactFiber$xxx` 失败

**根因**：React 18 用 `__reactFiber$<hash>` 形式，哈希每次构建都变

**正解**：
```js
const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
const fiber = el[fiberKey];
```

更优：缓存到全局变量复用：
```js
let cachedFiberKey = null;
function getFiber(el) {
  if (cachedFiberKey && el[cachedFiberKey]) return el[cachedFiberKey];
  cachedFiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  return el[cachedFiberKey];
}
```

---

## 🏆 最佳实践

### ✅ 统一消息命名空间

约定所有 postMessage 的 type 字段格式：`{pluginName}{Action}`，避免与页面其他脚本冲突

```js
// 拦截器发送
window.postMessage({ source: 'dreamina-interceptor', type: 'VIDEO_INTERCEPTED' }, '*');

// 接收方判断
window.addEventListener('message', (e) => {
  if (e.data?.source !== 'dreamina-interceptor') return;
  // ...
});
```

---

### ✅ DOM 容器定位先看 computed style

注入按钮时记得检查 `position`：

```js
if (getComputedStyle(container).position === 'static') {
  container.style.position = 'relative';
}
```

否则 `position: absolute` 的按钮会"飞"到祖先元素上

---

### ✅ SVG 用 `cloneNode` 复用

DOM 节点创建比 SVG 字符串拼接快 5~10 倍：

```js
// 不好：每次都解析字符串
btn.innerHTML = '<svg>...</svg>';

// 好：预创建 + cloneNode
const TEMPLATE = createSvg();
btn.appendChild(TEMPLATE.cloneNode(true));
```

参考：`xyq/content.js` 的 `downloadSvgTemplate` / `disabledSvgTemplate`

---

### ✅ 分批 + `requestIdleCallback`

大批量 DOM 操作要分批：

```js
function processBatch(deadline) {
  while (deadline.timeRemaining() > 0 && offset < total) {
    injectOne(items[offset++]);
  }
  if (offset < total) requestIdleCallback(processBatch);
}
requestIdleCallback(processBatch);
```

参考：`xyq/content.js` 的 `injectBatch`

---

### ✅ 拦截 fetch 后要 `resp.clone()`

拦截时读了 body，下游就拿不到了：

```js
// 错误
const data = await resp.json();
return resp;  // body 已耗尽

// 正确
const cloned = resp.clone();
cloned.json().then(...);
return resp;
```

---

### ✅ DOM 选择器优先用 `data-testid` / `class*="prefix"`

```js
// 不稳定
'div.row > div.col-md-6:nth-child(2) > a'

// 稳定（class 前缀由项目统一）
'div[class*="card-"]'
'a[href*="/ai-tool/"]'
```

参考：`xyq/content.js:12` 的 `CARD_SELECTOR`

---

### ✅ git commit message 与内容必须匹配

**场景**：`git add -A` 后只写了一个 `.gitattributes` 的 message，但实际包含所有项目文件（35 个）。

**反例**：
```
commit 80a59eb
chore: 添加 .gitattributes 强制 LF 行尾   ← message 只说了 1 个文件
# 但实际包含 background.js / docs/ / manifest.json ... 全部项目文件
```

**正解**：
```bash
# 1. 软回退（保留暂存区内容，撤销 commit）
git reset --soft HEAD~1

# 2. 撤回特定文件的暂存
git reset HEAD .gitattributes

# 3. 重新提交主功能
git commit -m "feat: v1.2.0 品牌重塑 + P1-01 持久化 + 文档体系

- 品牌：更名为「AI去水印」
- P1-01：videoList 持久化到 chrome.storage.local
- 文档：建立 docs/ 项目文档中心
- ..."

# 4. 再单独提交收尾文件
git add .gitattributes
git commit -m "chore: 添加 .gitattributes 强制 LF 行尾"
```

**教训**：
- `git add -A` 是全局操作，commit message 必须覆盖所有新增文件
- 提交前用 `git status --short` 确认暂存区内容
- 用 `git log --stat HEAD` 事后核查提交包含的文件列表

---

### ✅ `.gitattributes` 强制 LF 行尾（Windows 项目必备）

**问题**：Windows 上 `git add` 自动把 LF 转 CRLF，导致 diff 看到整行 ^M 污染。

**正解**：在项目根目录创建 `.gitattributes`：
```
* text=auto eol=lf
*.js   text eol=lf
*.md   text eol=lf
*.css  text eol=lf
*.html text eol=lf
*.json text eol=lf
*.py   text eol=lf
*.user.js text eol=lf   # 用户脚本（虽是文本但容易被误判）
*.min.js  text eol=lf   # 压缩脚本
# 显式声明二进制（避免 git 误改）
*.png binary
*.mp4 binary
*.zip binary
```

参考：本项目 `.gitattributes`（2026-07-01 新建）

---

## 🔧 调试技巧

### 🔍 查看 MAIN world 注入的脚本是否生效

```js
// 在页面控制台
window.fetch.toString();
// 如果是 "function fetch() { [native code] }" 说明被伪装了（这是好事）
```

---

### 🔍 定位 React 组件 props

```js
// 在 DevTools Elements 选中元素，控制台输入
const el = $0;
const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
let fiber = el[key];
while (fiber) {
  if (fiber.memoizedProps?.videoUrl) {
    console.log('FOUND:', fiber.memoizedProps);
    break;
  }
  fiber = fiber.return;
}
```

---

### 🔍 SW 日志查看

`chrome://extensions/` → 找到扩展 → 点 "Service Worker" 蓝色链接 → 弹出 DevTools

---

### 🔍 临时禁用扩展

开发时改 manifest 后不想重启 Chrome？
1. `chrome://extensions/` 找到扩展
2. 关掉"已启用"开关 → 立即停用
3. 改完后再开

---

## 📐 设计模式

### 🧩 双世界桥接模式

```
MAIN world（拿 fetch / Fiber）          ISOLATED world（拿 chrome.*）
          │                                       │
   window.fetch 包装                        postMessage 监听
          │                                       │
   提取数据 ──── postMessage({type,...}) ───▶  更新本地缓存
                                                  │
                                          注入 UI（按钮/面板）
                                                  │
                                          点击 → chrome.runtime.sendMessage
                                                  │
                                                  ▼
                                          Service Worker → chrome.downloads
```

参考实现：`dreamina/interceptor.js` ↔ `dreamina/content.js`

---

### 🧩 兜底匹配模式

精确匹配失败时使用最近一次的数据作为兜底：

```js
// dreamina/content.js
if (!matchData && element.tagName === 'VIDEO' && latestInterceptedVideo) {
  const rect = element.getBoundingClientRect();
  if (rect.width > 250) {  // 尺寸阈值，避免误伤小卡片
    matchData = latestInterceptedVideo;
  }
}
```

---

### 🧩 浮窗开关 + 刷新生效模式

涉及 fetch 包装的功能，必须"开关 → 刷新"：

```js
if (localStorage.getItem('enabled') !== 'true') {
  // 不注入任何功能，仅显示一个"点击启用"的浮窗
  showOffFloater();
  return;  // 早退
}
// 否则才执行 patch 逻辑
```

参考：`doubao_video/duration15.js`

---

## 🔍 性能优化

### ⚡ 缓存 React Fiber key（xyq 模块）

所有卡片的 `__reactFiber$<hash>` key 是同一个字符串，全局只需查找一次：

```js
let cachedFiberKey = null;
function getFiber(el) {
  if (cachedFiberKey) return el[cachedFiberKey];
  cachedFiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  return el[cachedFiberKey];
}
```

**收益**：从 O(N×K) 降到 O(N)

---

### ⚡ 缓存 Fiber 命中深度（xyq 模块）

所有卡片结构相同，资源在 Fiber 树上的深度固定：

```js
let cachedDepth = -1;
function findData(fiber) {
  if (cachedDepth >= 0) {
    let f = fiber;
    for (let i = 0; i < cachedDepth; i++) f = f.return;
    return f.memoizedProps.data;
  }
  // 否则递归找并缓存深度
  // ...
}
```

**收益**：从 O(D) 降到 O(1)

---

### ⚡ 分批 + 空闲调度（xyq 模块）

```js
if (results.length > 30) {
  requestIdleCallback(processNextBatch);  // 每次 20 个
}
```

**收益**：避免 1000+ 卡片一次性注入时阻塞主线程

---

## 🤖 AI 协作

### 📌 给 AI 写新站点代码的 prompt 模板

```markdown
你需要在 `klingai.com` 实现无水印下载。
- 资源获取方式（已调研）：fetch 拦截 /api/v1/videos
- 卡片选择器：`div[data-testid="video-card"]`
- 视频字段：response.data[0].play_url

请：
1. 在 `klingai/` 下创建 content.js（ISOLATED world，注入 UI）
2. 创建 interceptor.js（MAIN world，劫持 fetch）
3. 在 manifest.json 注册（matches + host_permissions）
4. 在 background.js 添加下载分支
5. 保持与现有模块一致的代码风格和注释密度
6. 在 `PROJECT_STATUS.md` 追加会话记录
```

### 📌 提交前让 AI 自查

- [ ] 新模块有命名空间（`window.__<plugin>__`）
- [ ] `sendMessage` 后都有 `return true`
- [ ] `fetch` 包装处理了 `Request` 对象
- [ ] DOM 注入前检查 `position: static`
- [ ] `URL.createObjectURL` 有 revoke
- [ ] 新增消息类型在 `background.js` 已注册
- [ ] manifest 中 `host_permissions` 已添加新域名
- [ ] `CHANGELOG.md` 已追加
- [ ] `PROJECT_STATUS.md` 已更新

---

### ✅ 仓库重建（git checkout --orphan）清理历史

**场景**：项目经历多次迭代后，git 历史里积累了大量"清理旧品牌"、"修复 xxx"等无意义提交，想从干净状态重新开始。

**操作步骤**：
```bash
# 1. 创建无历史的 orphan 分支
git checkout --orphan clean-main

# 2. 暂存所有文件
git add -A

# 3. 一次干净的初始提交
git commit -m "feat: AI去水印 v1.3.0 - 初始发布"

# 4. 删除旧分支引用
git branch -D main

# 5. 重命名新分支
git branch -m clean-main main

# 6. 强制推送到远程
git push -f origin main
```

**效果**：
- GitHub URL 不变
- 提交历史只有 1 条干净的初始提交
- 所有代码完整保留
- 适合"项目重新定位"或"清理敏感历史"场景

**注意事项**：
- `git push -f` 会覆盖远程历史，协作项目需提前通知团队
- 旧历史在本地 reflog 中仍可找回（`git reflog`，保留 90 天）
- 如果有 PR/Issue 引用旧 commit hash，链接会失效

---

> 经验库最后更新：2026-07-01
> 配套文档：[PROJECT_PLAN.md](./PROJECT_PLAN.md) · [PROJECT_STATUS.md](./PROJECT_STATUS.md) · [CHANGELOG.md](./CHANGELOG.md)
