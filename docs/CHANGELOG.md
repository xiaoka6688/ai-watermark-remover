# 📝 CHANGELOG · 变更日志

> 记录项目的所有变更。**每完成一项任务就追加一行**。
> 版本约定：遵循 [SemVer](https://semver.org/lang/zh-CN/)。

---

## [v1.3.0] · 2026-07-01 · 初始发布

> 本版本为项目首次完整发布，包含 Phase 1 优化 + Phase 2 扩展的全部成果。

### 支持站点（8 个）

- ✅ Dreamina / 即梦（视频）
- ✅ 即梦图片（Canvas 去水印）
- ✅ 豆包（视频 + 图片 + 15s 时长扩展）
- ✅ 小云雀（批量下载 + ZIP 打包）
- ✅ 千问（图片 + 视频）
- ✅ 可灵 AI（视频 + 图片）
- ✅ Vidu AI（视频）
- ✅ PixVerse（视频 + 图片）

### 核心功能

- **双世界架构**：MAIN world 拦截 + ISOLATED world UI + Service Worker 下载中枢
- **8 站点支持**：统一的 fetch 拦截 + DOM 注入 + 悬浮指示器
- **批量下载**：JSZip 打包 + 3 并发 + 进度显示
- **下载历史归档**：按 `{站点}/{日期}/` 自动归档
- **文件命名模板**：7 个变量（{site}/{title}/{date}/{time}/{idx}/{ext}/{id}）
- **失败重试**：fetchWithRetry 指数退避（1s/2s/4s）
- **跨标签去重**：downloadedUrls Map + TTL 60s
- **下载进度反馈**：downloads.onChanged + 按钮百分比
- **统一错误通知**：notify() + popup toast
- **持久化**：chrome.storage.local 存储视频列表/通知/配置/主题
- **15s 时长扩展**：postMessage 桥接 + popup 滑块开关
- **暗色模式**：CSS 变量 + prefers-color-scheme 自动切换
- **Options Page**：站点开关/功能开关/命名模板/归档目录/数据管理

### 工程化

- **TypeScript 基础设施**：tsconfig.json + vite.config.ts + src/ 目录
- **ESLint + Prettier**：eslint.config.js + .prettierrc
- **Jest 单测**：31 个用例（6 个核心函数）
- **Playwright 端到端**：3 个测试（扩展加载/popup/options）
- **Git 仓库**：.gitignore + .gitattributes（LF 行尾）

### 已知限制

- `doubao_image/doubao-downloader.user.js`（1MB+ 黑盒）仍在项目中
- `src/` TypeScript 版本尚未与 `js/` 版本同步
- 可灵 AI API 拦截待完善（需登录后研究）
- Vidu / PixVerse 视频 URL 含签名，有效期有限

---

## [v1.0.0] · 2026-06-30 · 项目初始化

### 新增

- 项目架构设计（双世界协作模式）
- 文档体系（docs/ 目录）
- 新人操作指南
- 三阶段路线图（优化→扩展→复刻）

---

## 🏷️ 版本规划

| 版本 | 内容 | 状态 |
|---|---|---|
| v1.0.0 | 项目初始化 | ✅ |
| v1.3.0 | Phase 1 + Phase 2 全部完成 | ✅ 当前 |
| v1.4.0 | Phase 2 收尾（可灵 API + TS 全量迁移） | ⚪ 待启动 |
| v2.0.0 | Phase 3 完成 + Vite 构建 + SiteAdapter | ⚪ 规划中 |

---

> 变更日志最后更新：2026-07-01
