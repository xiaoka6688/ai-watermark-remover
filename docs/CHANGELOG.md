# 📝 CHANGELOG · 变更日志

> 记录项目的所有变更。**每完成一项任务就追加一行**。
> 版本约定：遵循 [SemVer](https://semver.org/lang/zh-CN/)。当前处于 v1.x → v2.0 演进期。

---

## [Unreleased] · 优化中

> 当前正在做的版本：v1.2.0（Phase 1 优化）

### 已完成（本会话）

- [x] **P1-10 统一日志分级**
  - 所有模块日志前缀统一为 `[AI去水印·模块名]` 格式
  - 模块映射：background / 豆包视频 / Dreamina / 即梦图片 / 千问 / 小云雀 / 豆包图片 / 15s
  - 涉及 11 个文件，全部语法校验通过
- [x] **P1-09 下载进度反馈**
  - `background.js` 新增 `chrome.downloads.onChanged` 监听器
  - `activeDownloads` Map 跟踪活跃下载（id → percent/totalBytes）
  - `broadcastProgress()` 广播进度到所有标签页（500ms 节流）
  - `doubao_video/forwarder.js` 新增 `updateButtonProgress()` 显示百分比
  - `dreamina/content.js` 新增 `DOWNLOAD_PROGRESS` 监听器显示百分比
- [x] **P1-08 Options Page**
  - 新增 `options.html`（完整设置页面，渐变头部 + 卡片布局）
  - 新增 `options.js`（加载/保存/重置逻辑）
  - 功能：站点模块开关（5 个站点）、15s 时长开关、下载去重开关、文件名模板编辑、数据管理（清空统计/下载记录/通知/全部重置）
  - `manifest.json` 注册 `options_page: "options.html"`
  - `background.js` 新增 `GET_SITE_MODULES` 消息（content script 查询站点开关）
- [x] **P1-07 文件命名模板**
  - `background.js` 新增 `formatFilename(data)` 函数
  - 模板变量：`{site}` / `{title}` / `{date}` / `{time}` / `{idx}` / `{ext}` / `{id}`
  - 默认模板：`{site}_{date}_{idx}.{ext}`
  - 5 个下载入口全部改用模板：dreamina / xyq / doubao / qianwen / jimeng
  - 新增 `GET/SET_FILENAME_TEMPLATE` 消息（给 Options Page 预留接口）
  - 模板持久化到 `chrome.storage.local`
- [x] **P1-06 跨标签页去重**
  - `background.js` 新增 `downloadedUrls` Map（URL → 过期时间戳，TTL 60s，上限 200 条）
  - 新增 `isDuplicateDownload(url)` 函数（检查 + 记录 + 自动清理过期条目）
  - 所有 5 个下载入口接入去重：`downloadVideo` / `DOWNLOAD` / `download_video` / `downloadFile` / `downloadImage`
  - base64 URL 不参与去重（每次生成的 blob URL 不同）
- [x] **P1-05 统一错误通知**
  - `background.js` 新增 `notify(level, msg, context)` 函数（写入 `chrome.storage.local`，限 20 条）
  - 新增 `consumeNotifications()` + `CONSUME_NOTIFICATIONS` 消息（popup 读取后清空）
  - 关键 catch 块（视频下载/文件下载/图片下载/storage 保存失败）调用 `notify`
  - `popup.html` 新增通知 toast 系统：启动时读积压通知 + `chrome.storage.onChanged` 实时监听
- [x] **P1-04 持久化 15s 浮窗开关**
  - `duration15.js` 从 `localStorage` 改为 postMessage 桥接 → `forwarder.js` → `chrome.storage.local`
  - `forwarder.js` 新增 3 个桥接消息：`xq_d15_get_state` / `xq_d15_set_enabled` / `xq_d15_set_duration`
  - `background.js` 新增 `GET_15S_STATE` / `SET_15S_ENABLED` 消息（popup 专用）
  - `popup.html` 新增 15s 开关滑块（含启用/关闭状态实时同步 + 提示 toast）
  - 统一浮窗：旧的 off/on 两个浮窗合并为 `createFloater(isOn)` 一个函数
- [x] **P1-03 治理 `doubao-downloader.user.js` 黑盒**（方案 A）
  - 原版 22,880 行 1MB+ Vite 编译产物 → 轻量版 ~280 行 `doubao_image/content.js`
  - 保留核心机制：`JSON.parse` 猴子补丁拦截 `creations` 响应
  - 去掉 React UI / Dexie IndexedDB / StreamSaver.js / FileSaver.js
  - 改用轻量 DOM 浮窗 + `chrome.runtime.sendMessage` 下载 + `chrome.storage.local` 持久化
  - 旧版归档到 `docs/archive/doubao-downloader.user.js.v1.2.6.bak`
  - `manifest.json` 注入脚本已替换（`run_at: document_start`）
- [x] **P1-02 清理 `background.js.bak` + 初始化 git 仓库**
  - 旧版 `background.js.bak`（385 行，含已下线的 zbgd.vip 授权验证机制）挪到 `docs/archive/background.js.v1.1.0.bak`
  - 新建 `docs/archive/README.md`（归档机制 + 旧版 vs 新版对比表）
  - 初始化 git 仓库：main 分支 + xiaoka6688 身份
  - 3 次规范提交：`.gitignore` / v1.2.0 主功能 / `.gitattributes`
- [x] **P1-01 持久化 videoList 到 chrome.storage.local**
  - 新增 `loadVideoListFromStorage()` / `saveVideoListToStorage()` / `appendVideosAndSave()` 三个工具函数
  - 内存缓存（`videoListCache`）+ Promise 并发保护（`videoListLoading`）
  - 500 条软上限，FIFO 淘汰
  - 新增 `CLEAR_VIDEO_LIST` 消息（用于重置）
  - popup.html 增加"清空数据"按钮（含 confirm 二次确认）
  - SW 启动时预热缓存
  - 相关经验沉淀到 `docs/EXPERIENCE.md`
- [x] **Logo 二次优化**：用用户提供的原始 `logo/logo.png`（256×256，含"OPC AI 智能体"文字）裁切生成
  - 自动检测方块边界（155×120）→ 居中成正方形 → 4×超采样缩放
  - 底部文字完全去除
  - 覆盖：`logo.png`、`icons/icon{16,32,48,128,256}.png`
  - 更新 `tools/generate_logo.py` 为自动检测版本（不依赖硬编码边界）
- [x] **品牌重塑**：插件名由"小柒去水印插件"改为 **"AI去水印"**
  - `manifest.json`: `name` / `description` / `default_title`
  - `popup.html`: 标题与 H1
  - `使用说明.txt`: 标题
  - 版本号同步升至 v1.2.0
- [x] **Logo 替换 v1**：从"柒字印章" → "渐变方块"几何风格（后被 v2 覆盖）

### 计划中

- [ ] P1-04 持久化 15s 浮窗开关
- [ ] P1-05 统一错误通知
- [ ] P1-06 跨标签页去重
- [ ] P1-07 文件命名模板
- [ ] P1-08 Options Page
- [ ] P1-09 下载进度反馈
- [ ] P1-10 统一日志分级
- [ ] P1-11 关键路径单测
- [ ] P1-12 CSP 兼容性检查

---

## [1.2.0] · 2026-06-30 · 品牌重塑

### Changed
- 🔄 插件名由"小柒去水印插件" → **"AI去水印"**
- 🎨 Logo 替换：旧"柒字印章" → 新"蓝紫渐变方块 + 白线 + 白点"几何风格

### Files
- `manifest.json` / `popup.html` / `使用说明.txt`
- `logo.png` + `icons/icon{16,32,48,128}.png`
- 新增 `tools/generate_logo.py`

---

## [1.1.1] · 2026-06-26 · 集成发布

> 当前商店/本地版本

### 新增
- ✅ 整合 7 个站点模块：Dreamina/即梦视频、即梦图片、豆包视频、豆包图片、豆包 15s 时长、小云雀、千问
- ✅ 双世界桥接架构（MAIN + ISOLATED + SW）
- ✅ Dreamina fetch/XHR 拦截 + 卡片多 key 匹配
- ✅ 豆包视频走 `get_play_info` 接口获取无水印地址
- ✅ 即梦图片 Canvas 重绘去水印
- ✅ 小云雀 React Fiber 提取 + 批量 zip 打包
- ✅ 15s 时长扩展（默认关闭，右下角浮窗开关）

### 技术细节
- Manifest V3
- Service Worker: `background.js`
- 内容脚本 8 个（含 MAIN world 4 个）
- 第三方依赖：`doubao-downloader.user.js`（1MB+）、`xyq/jszip.min.js`（95KB）

---

## [1.1.0] · 2026-05-17 · 豆包视频新版

### 新增
- ✅ 豆包视频改用 `get_play_info` 接口
- ✅ 旧版 `bigmusic_share_save` 作为兜底

### 修复
- 兼容新版豆包页面 DOM 结构

---

## [1.0.0] · 2026-04-13 · 初版整合

### 新增
- ✅ 初版插件发布
- ✅ 整合 4 个模块：Dreamina/即梦视频、豆包视频、豆包图片、小云雀
- ✅ 基础 Service Worker 路由
- ✅ popup.html 弹窗

---

## 🏷️ 版本标签

- **v1.0.0** - 4 站点初版
- **v1.1.0** - 豆包视频 get_play_info 升级
- **v1.1.1** - 7 站点完整版
- **v1.2.0** - 品牌重塑（更名 "AI去水印" + Logo 替换）
- **v1.3.0** - Phase 1 优化完成（待启动）
- **v1.4.0** - P0 新站点（可灵/Vidu/PixVerse）
- **v2.0.0** - Vite + TS 重构 + SiteAdapter 架构

---

## 📐 变更分类标签

- `Added` 新增功能
- `Changed` 已有功能变更
- `Deprecated` 即将移除
- `Removed` 已移除
- `Fixed` Bug 修复
- `Security` 安全相关
- `Performance` 性能优化
- `Docs` 文档
- `Refactor` 重构

---

> 变更日志创建于 2026-06-30
> 配套文档：[PROJECT_PLAN.md](./PROJECT_PLAN.md) · [PROJECT_STATUS.md](./PROJECT_STATUS.md) · [EXPERIENCE.md](./EXPERIENCE.md)
