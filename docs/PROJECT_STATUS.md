# 📊 PROJECT_STATUS · 项目状态

> **本文件是项目的"事实表"**：给其他会话窗口、其他 AI 工具、其他 Agent 同步用的快照。
> **维护规则**：每次会话**开始时先读**、**结束时必更新**。

---

## 🚨 最新会话（追加在最上面，新会话覆盖到最顶端）

### 会话 #4 · 2026-07-01

**会话目标**：完成 P1-01（持久化 videoList）

**完成事项**：
- [x] P1-01 持久化 `videoList` 到 `chrome.storage.local`
  - 内存缓存 + Promise 并发保护 + 500 条 FIFO 软上限
  - 新增 `CLEAR_VIDEO_LIST` 消息 + popup "清空数据"按钮
  - `node --check` 语法校验通过
- [x] 经验沉淀：`docs/EXPERIENCE.md` 追加"SW 持久化模式"完整模板
- [x] 进度看板更新：Phase 1 进度 1/12

**待办（下个会话做）**：
- [ ] **P1-02 清理 `background.js.bak`**

**变更文件清单**：
- 修改 `background.js`（顶部持久化模块 + 两个 message handler + 底部 log）
- 修改 `popup.html`（清空数据按钮 + 二次确认）
- 修改 `docs/PROJECT_PLAN.md`（P1-01 标完成）
- 修改 `docs/PROJECT_STATUS.md`（本文件 + 看板 + 下一个任务）
- 修改 `docs/CHANGELOG.md`（P1-01 条目）
- 修改 `docs/EXPERIENCE.md`（追加"SW 持久化模式"完整模板）

---

### 会话 #3 · 2026-07-01

**会话目标**：用用户提供的原图重新裁切 logo（替代之前程序生成的版本）

**完成事项**：
- [x] 读取 `logo/logo.png`（256×256，含"OPC AI 智能体"文字）
- [x] 像素级分析定位方块边界（自动检测算法：y=37~157, x=50~205, 155×120px）
- [x] 裁切 + 居中成正方形 + 4×超采样 → 生成 6 个尺寸
- [x] 更新 `tools/generate_logo.py` 为自动检测版本（不依赖硬编码值）

**待办（下个会话做）**：
- [ ] 进入 Phase 1 第一个正式任务：**P1-01 持久化 videoList**（按 PROJECT_PLAN.md）

**变更文件清单**：
- 修改 `logo.png`、`icons/icon{16,32,48,128,256}.png`
- 修改 `tools/generate_logo.py`（自动检测版本）
- 修改 `docs/CHANGELOG.md`
- 修改 `docs/PROJECT_STATUS.md`（本文件）

---

**会话目标**：替换 logo + 改名 + 搭建文档体系后续

**完成事项**：
- [x] **品牌重塑**：插件名 → "AI去水印"（manifest / popup / 说明文件全量更新）
- [x] **Logo 替换**：用 PIL 程序化生成新 logo（蓝紫渐变方块 + 白线 + 白点），覆盖 5 个尺寸
- [x] 新增 `tools/generate_logo.py`（可复用的 logo 重新生成脚本）
- [x] 更新 CHANGELOG.md 记录本次变更

**待办（下个会话做）**：
- [ ] **P1-01 持久化 videoList**（从 Phase 1 第一个任务开始）

**遗留风险**：
- 新 logo 由代码生成（与你提供的原图视觉一致但**不是**完全像素级还原）；如需像素级一致，需要把原图保存到本地后再用 PIL 二次处理

**变更文件清单**：
- 修改 `manifest.json`（name/description/default_title/version）
- 修改 `popup.html`（title/h1）
- 修改 `使用说明.txt`（标题）
- 修改 `logo.png`、`icons/icon16.png`、`icons/icon32.png`、`icons/icon48.png`、`icons/icon128.png`
- 新增 `tools/generate_logo.py`
- 修改 `docs/CHANGELOG.md`
- 修改 `docs/PROJECT_STATUS.md`（本文件）

---

### 会话 #1 · 2026-06-30

**会话目标**：理解项目架构、产出新人指南、搭建文档体系

**完成事项**：
- [x] 阅读 manifest.json / background.js / popup.html 及 6 个子模块
- [x] 生成 `新人操作指南.md`（架构 + 不足 + 复刻）
- [x] 创建 `docs/` 目录及 4 个核心文档
- [x] 制定三阶段路线图

**待办（下个会话做）**：
- [ ] 启动 Phase 1 第一个任务 P1-01：把 `background.js` 的 `videoList` 持久化到 `chrome.storage.local`

**遗留风险**：
- 暂无

**变更文件清单**：
- 新增 `新人操作指南.md`
- 新增 `docs/README.md`
- 新增 `docs/PROJECT_PLAN.md`
- 新增 `docs/PROJECT_STATUS.md`（本文件）
- 新增 `docs/EXPERIENCE.md`
- 新增 `docs/CHANGELOG.md`

---

## 📦 项目快照（Project Snapshot）

### 基本信息

| 项 | 值 |
|---|---|
| 项目名 | **AI去水印**（原"小柒去水印插件"，会话 #2 改名） |
| 当前版本 | **v1.2.0**（品牌重塑 + Logo 替换） |
| 协议 | Chrome Extension MV3 |
| 入口 | `manifest.json` |
| 文档入口 | `docs/README.md` |
| 业务代码总量 | ~3000 行（不含第三方 1MB+ 资源） |
| 第三方依赖 | `doubao_image/doubao-downloader.user.js`（1MB+）、`xyq/jszip.min.js`（95KB） |
| Logo 生成工具 | `tools/generate_logo.py` |

### 支持的站点

| 站点 | 视频 | 图片 | 其它 | 子模块路径 |
|---|---|---|---|---|
| Dreamina/即梦 | ✅ | — | — | `dreamina/` |
| 即梦图片 | — | ✅（Canvas 去水印） | — | `jimeng_image/` |
| 豆包 | ✅ | ✅ | ✅ 15s 时长扩展 | `doubao_video/`、`doubao_image/` |
| 小云雀（xyq） | ✅（含批量 zip） | — | — | `xyq/` |
| 千问 | ✅ | ✅ | — | `qianwen/` |

### 核心架构要素

- **双世界协作**：`world: "MAIN"` 改写 `window.fetch` / 读 React Fiber；ISOLATED world 注入 UI；SW 统一下载
- **消息中枢**：`background.js` 路由所有 `chrome.runtime.sendMessage`
- **拦截策略**：fetch 包装 + XHR 包装 + SSE 流解析 + React Fiber 深度遍历
- **性能技巧**：xyq 模块缓存 Fiber key + 命中深度，分批 + `requestIdleCallback`

### 当前技术债

| 优先级 | 问题 | 位置 |
|---|---|---|
| 🔴 P0 | `videoList` 不持久化（SW 30s 休眠后清空） | `background.js:139-153` |
| 🔴 P0 | `background.js.bak` 旧版遗留 | 仓库根 |
| 🔴 P0 | `doubao-downloader.user.js` 黑盒 | `doubao_image/` |
| 🔴 P0 | 15s 浮窗开关需刷新 | `doubao_video/duration15.js:23-60` |
| 🔴 P0 | 错误全部 `console.error`，用户无感 | 全局 |
| 🟡 P1 | 文件名模板缺失 | 全局 |
| 🟡 P1 | 无 Options Page | 不存在 |
| 🟡 P1 | 无下载进度反馈 | `background.js` |
| 🟢 P2 | 站点模块未抽象 | 全局 |
| 🟢 P2 | 无 TS / 构建工具 | 全局 |

---

## 📈 进度看板

### Phase 1 · 优化

| 任务 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
| P1-01 持久化 videoList | 🟢 已完成 | 2026-07-01 | 内存缓存 + chrome.storage.local + 500 条软上限 + CLEAR_VIDEO_LIST 消息 |
| P1-02 清理 .bak | ⚪ 未开始 | — | |
| P1-03 治理 doubao-downloader | ⚪ 未开始 | — | |
| P1-04 持久化 15s 开关 | ⚪ 未开始 | — | |
| P1-05 统一错误通知 | ⚪ 未开始 | — | |
| P1-06 跨标签去重 | ⚪ 未开始 | — | |
| P1-07 命名模板 | ⚪ 未开始 | — | |
| P1-08 Options Page | ⚪ 未开始 | — | |
| P1-09 下载进度反馈 | ⚪ 未开始 | — | |
| P1-10 统一日志 | ⚪ 未开始 | — | |
| P1-11 关键路径单测 | ⚪ 未开始 | — | |
| P1-12 CSP 检查 | ⚪ 未开始 | — | |

**Phase 1 总进度**：0 / 12（0%）

### Phase 2 · 扩展

| 任务 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
**Phase 1 总进度**：1 / 12（8%）

### Phase 2 · 扩展

| 任务 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
| P2-01 可灵 AI | ⚪ 未开始 | — | |
| P2-02 Vidu | ⚪ 未开始 | — | |
| P2-03 PixVerse | ⚪ 未开始 | — | |
| P2-04 历史归档 | ⚪ 未开始 | — | |
| P2-05 批量下载会话 | ⚪ 未开始 | — | |
| P2-06 失败重试 | ⚪ 未开始 | — | |
| P2-07 暗色模式 | ⚪ 未开始 | — | |
| P2-08 Vite + TS 重构 | ⚪ 未开始 | — | |
| P2-09 ESLint + Prettier | ⚪ 未开始 | — | |
| P2-10 Playwright 测试 | ⚪ 未开始 | — | |

**Phase 2 总进度**：0 / 10（0%）

### Phase 3 · 复刻

| 任务 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
| P3-01 SiteAdapter 基类 | ⚪ 未开始 | — | |
| P3-02 注册中心 | ⚪ 未开始 | — | |
| P3-03 通用 UI 组件库 | ⚪ 未开始 | — | |
| P3-04 create-site CLI | ⚪ 未开始 | — | |
| P3-05 manifest 自动注入 | ⚪ 未开始 | — | |
| P3-06 文档自动生成 | ⚪ 未开始 | — | |
| P3-07 官方模板市场 | ⚪ 未开始 | — | |

**Phase 3 总进度**：0 / 7（0%）

---

## 🛠️ 快速开发指引

### 当前正在做

✅ **P1-01 持久化 videoList**（已完成 2026-07-01）

### 下一个该做的

📌 **P1-02：清理 `background.js.bak` 旧版本**

任务描述：
- 仓库根目录有 `background.js.bak`（385 行）和 `background.js`（新版 234+ 行）
- `.bak` 是已废弃的旧版本，新人容易误改
- 建议处理方式：
  - 选项 A：直接删除（如果 git 历史可查）
  - 选项 B：移动到 `docs/archive/` 目录归档
  - 选项 C：纳入 git 提交后通过 `.gitignore` 排除
- 注意：删除前确认 git/版本控制里能找到

参考经验：`docs/EXPERIENCE.md` 中"代码归档"原则

验收：
- [ ] `background.js.bak` 不再出现在根目录
- [ ] 在 CHANGELOG / PROJECT_STATUS 记录清理动作
- [ ] 现行 `background.js` 功能未受影响（用户已加载的扩展需重新加载）

### 关键文件位置速查

| 想改什么 | 去看这个文件 |
|---|---|
| 添加新下载消息类型 | `background.js` |
| 修改 Dreamina 拦截逻辑 | `dreamina/interceptor.js` + `dreamina/content.js` |
| 修改豆包视频下载 | `doubao_video/content.js` + `doubao_video/forwarder.js` |
| 修改 15s 时长 | `doubao_video/duration15.js` |
| 修改即梦图片去水印 | `jimeng_image/content.js` |
| 修改小云雀（xyq） | `xyq/content.js` + `xyq/inject.js` |
| 修改 popup UI | `popup.html` |
| 修改 manifest 权限/注入 | `manifest.json` |

---

## 🏷️ 标签索引（按主题找任务）

- **稳定性** → P1-01, P1-05, P1-10, P1-12
- **去重** → P1-06
- **UX** → P1-04, P1-07, P1-08, P1-09
- **新站点** → P2-01, P2-02, P2-03
- **批量/历史** → P2-04, P2-05
- **工程化** → P2-08, P2-09, P2-10
- **架构** → P3-01, P3-02
- **脚手架** → P3-04, P3-05, P3-06, P3-07

---

> 状态快照创建于 2026-06-30
> 配套文档：[PROJECT_PLAN.md](./PROJECT_PLAN.md) · [EXPERIENCE.md](./EXPERIENCE.md) · [CHANGELOG.md](./CHANGELOG.md)
