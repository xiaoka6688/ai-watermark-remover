# 📊 PROJECT_STATUS · 项目状态

> **本文件是项目的"事实表"**：给其他会话窗口、其他 AI 工具、其他 Agent 同步用的快照。
> **维护规则**：每次会话**开始时先读**、**结束时必更新**。

---

## 🚨 最新会话（追加在最上面，新会话覆盖到最顶端）

### 会话 #1 · 2026-07-01（仓库重建后首次）

**会话目标**：全面梳理项目状态，更新所有文档

**完成事项**：
- [x] 修复 `src/background/index.ts` 中残留的 `XQ_D15_ENABLED` 引用 → `AIWM_D15_ENABLED`
- [x] TypeScript 类型检查通过
- [x] 全面重写 PROJECT_STATUS.md（本文件）
- [x] 更新 CHANGELOG.md / PROJECT_PLAN.md / EXPERIENCE.md / docs/README.md

**待办（下个会话做）**：
- [ ] **P2-01 可灵 AI API 完善**（需用户登录 kling.ai 后研究 API）
- [ ] **P2-08 Vite + TS 全量迁移**（基础设施就绪，逐步迁移各 content script）
- [ ] **Phase 3 启动**（P3-01 SiteAdapter 基类）

**遗留风险**：
- `doubao_image/doubao-downloader.user.js`（1MB+ 黑盒）仍在项目中，未被轻量版完全替代
- `src/` 目录的 TypeScript 版本尚未与 `js/` 版本同步，两套代码并行

---

## 📦 项目快照（Project Snapshot）

### 基本信息

| 项 | 值 |
|---|---|
| 项目名 | **AI去水印** |
| 当前版本 | **v1.3.0** |
| 协议 | Chrome Extension Manifest V3 |
| 入口 | `manifest.json` |
| 文档入口 | `docs/README.md` |
| 仓库 | https://github.com/xiaoka6688/ai-watermark-remover |
| Git 状态 | 1 次提交（clean slate） |
| 业务代码 | ~3500 行 JS + ~600 行 TS |
| 测试 | 31 个单元测试 + 3 个端到端测试 |
| 工程化 | Vite + TypeScript + ESLint + Prettier + Playwright + Jest |

### 支持的站点（8 个）

| 站点 | 视频 | 图片 | 其它 | 子模块路径 |
|---|---|---|---|---|
| Dreamina / 即梦 | ✅ | — | — | `dreamina/` |
| 即梦图片 | — | ✅（Canvas 去水印） | — | `jimeng_image/` |
| 豆包 | ✅ | ✅ | ✅ 15s 时长扩展 | `doubao_video/`、`doubao_image/` |
| 小云雀 | ✅（含批量 zip） | — | — | `xyq/` |
| 千问 | ✅ | ✅ | — | `qianwen/` |
| 可灵 AI | ✅ | ✅ | — | `klingai/` |
| Vidu AI | ✅ | — | — | `vidu/` |
| PixVerse | ✅ | ✅ | — | `pixverse/` |

### 核心架构

- **双世界协作**：`world: "MAIN"` 改写 `window.fetch` / 读 React Fiber；ISOLATED world 注入 UI；SW 统一下载
- **消息中枢**：`background.js` 路由所有 `chrome.runtime.sendMessage`
- **拦截策略**：fetch 包装 + XHR 包装 + SSE 流解析 + React Fiber 深度遍历
- **批量下载**：JSZip 打包 + 3 并发 + 进度显示
- **失败重试**：`fetchWithRetry` 指数退避（1s/2s/4s）
- **持久化**：`chrome.storage.local` 存储视频列表/通知/配置/主题
- **暗色模式**：CSS 变量 + `prefers-color-scheme` 自动切换

### 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Chrome Extension MV3 Service Worker + Content Scripts |
| 语言 | JavaScript（主）+ TypeScript（src/ 基础设施） |
| 构建 | Vite + vite-plugin-web-extension |
| 测试 | Jest（单元）+ Playwright（端到端） |
| 代码质量 | ESLint + Prettier |
| UI | 原生 HTML/CSS（popup.html + options.html） |

---

## 📈 进度看板

### Phase 1 · 优化 ✅ 全部完成

| 任务 | 状态 | 完成日期 | 核心改动 |
|---|---|---|---|
| P1-01 持久化 videoList | 🟢 | 2026-07-01 | chrome.storage.local + 500 条软上限 |
| P1-02 清理 .bak + git 初始化 | 🟢 | 2026-07-01 | git 仓库 + docs/archive/ 归档 |
| P1-03 治理 doubao-downloader | 🟢 | 2026-07-01 | 22880 行 → ~280 行轻量版 |
| P1-04 持久化 15s 开关 | 🟢 | 2026-07-01 | postMessage 桥接 + popup 滑块 |
| P1-05 统一错误通知 | 🟢 | 2026-07-01 | notify() + popup toast |
| P1-06 跨标签去重 | 🟢 | 2026-07-01 | downloadedUrls Map + TTL 60s |
| P1-07 命名模板 | 🟢 | 2026-07-01 | formatFilename() 7 个变量 |
| P1-08 Options Page | 🟢 | 2026-07-01 | options.html 完整设置页 |
| P1-09 下载进度反馈 | 🟢 | 2026-07-01 | downloads.onChanged + 按钮百分比 |
| P1-10 统一日志 | 🟢 | 2026-07-01 | 11 个文件前缀统一 |
| P1-11 关键路径单测 | 🟢 | 2026-07-01 | Jest 31 个测试 |
| P1-12 CSP 检查 | 🟢 | 2026-07-01 | xyq inject.js 修复 |

**Phase 1**：12/12 ✅

### Phase 2 · 扩展 🟡 进行中

| 任务 | 状态 | 完成日期 | 核心改动 |
|---|---|---|---|
| P2-01 可灵 AI | 🟡 | 2026-07-01 | 基础框架完成，API 拦截待完善 |
| P2-02 Vidu AI | 🟢 | 2026-07-01 | feed/list API 拦截 |
| P2-03 PixVerse | 🟢 | 2026-07-01 | showvideos + content/relation/list API |
| P2-04 历史归档 | 🟢 | 2026-07-01 | formatFilename 归档目录 |
| P2-05 批量下载 | 🟢 | 2026-07-01 | JSZip 打包 + 3 并发 |
| P2-06 失败重试 | 🟢 | 2026-07-01 | fetchWithRetry 指数退避 |
| P2-07 暗色模式 | 🟢 | 2026-07-01 | CSS 变量 + prefers-color-scheme |
| P2-08 Vite + TS | 🟡 | 2026-07-01 | 基础设施就绪，全量迁移待后续 |
| P2-09 ESLint + Prettier | 🟢 | 2026-07-01 | eslint.config.js + .prettierrc |
| P2-10 Playwright | 🟢 | 2026-07-01 | 3 个 e2e 测试 |

**Phase 2**：8/10 完成，2 个进行中（P2-01 API 完善、P2-08 全量迁移）

### Phase 3 · 复刻 ⚪ 未开始

| 任务 | 状态 |
|---|---|
| P3-01 SiteAdapter 基类 | ⚪ |
| P3-02 注册中心 | ⚪ |
| P3-03 通用 UI 组件库 | ⚪ |
| P3-04 create-site CLI | ⚪ |
| P3-05 manifest 自动注入 | ⚪ |
| P3-06 文档自动生成 | ⚪ |
| P3-07 官方模板市场 | ⚪ |

**Phase 3**：0/7

---

## 🛠️ 快速开发指引

### 当前正在做

🟡 **Phase 2 收尾 + Phase 3 准备**

### 下一个该做的

1. **P2-01 可灵 AI API 完善**（需用户登录 kling.ai）
2. **P2-08 Vite + TS 全量迁移**（逐步迁移各 content script）
3. **Phase 3 启动**（P3-01 SiteAdapter 基类）

### 关键文件速查

| 想改什么 | 去看这个文件 |
|---|---|
| 添加新下载消息类型 | `background.js` |
| 修改 Dreamina 拦截逻辑 | `dreamina/interceptor.js` + `dreamina/content.js` |
| 修改豆包视频下载 | `doubao_video/content.js` + `doubao_video/forwarder.js` |
| 修改 15s 时长 | `doubao_video/duration15.js` |
| 修改即梦图片去水印 | `jimeng_image/content.js` |
| 修改小云雀（xyq） | `xyq/content.js` + `xyq/inject.js` |
| 修改 popup UI | `popup.html` |
| 修改 Options Page | `options.html` + `options.js` |
| 修改 manifest 权限/注入 | `manifest.json` |
| 核心工具函数 | `lib/utils.js`（JS）/ `src/shared/utils.ts`（TS） |
| 类型定义 | `src/shared/types.ts` |
| Logo 生成 | `tools/generate_logo.py` |

---

> 状态快照最后更新：2026-07-01
> 配套文档：[PROJECT_PLAN.md](./PROJECT_PLAN.md) · [EXPERIENCE.md](./EXPERIENCE.md) · [CHANGELOG.md](./CHANGELOG.md)
