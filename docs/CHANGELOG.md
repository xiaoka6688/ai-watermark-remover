# 📝 CHANGELOG · 变更日志

> 记录项目的所有变更。**每完成一项任务就追加一行**。
> 版本约定：遵循 [SemVer](https://semver.org/lang/zh-CN/)。当前处于 v1.x → v2.0 演进期。

---

## [Unreleased] · 优化中

> 当前正在做的版本：v1.2.0（Phase 1 优化）

### 已完成（本会话）

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

- [ ] P1-03 治理 doubao-downloader.user.js
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
