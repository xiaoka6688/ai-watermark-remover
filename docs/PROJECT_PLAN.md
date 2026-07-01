# 📋 PROJECT_PLAN · 项目计划

> **目标**：把"AI去水印"从一个基础插件，升级为"产品级、可扩展、可复刻"的项目。
> **范围**：基于《新人操作指南》第 4 节的"不足 / 优化 / 扩展 / 复刻"四个象限，按三阶段推进。

---

## 🗺️ 路线图总览（三阶段）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Phase 1 ─ 优化（2~3 周）      Phase 2 ─ 扩展（3~4 周）     Phase 3 ─ 复刻   │
│  ════════════════             ════════════════             ════════════    │
│  • 修 P0 不足                  • 加 2~3 个新站点（P0）      • 抽 SiteAdapter │
│  • 提升稳定性                  • Options Page               • 写脚手架 CLI  │
│  • 加 1~2 项体验优化           • 命名模板系统               • 一键 new site  │
│                                  • 下载历史归档                                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
   "先让地基稳"             "再让功能多"            "最后让复制快"
```

---

# 🟡 Phase 1 · 优化（让项目先"不崩"）

> **目标**：把所有 🔴 关键不足修完，把 1~2 项 🟡 体验优化做掉。
> **完成标准**：连续 7 天无 P0 故障，Options Page 上线，下载命名可读。

## 1.1 P0 关键不足修复

| ID | 任务 | 状态 | 负责人 | 预估工时 | 验收标准 |
|---|---|---|---|---|---|
| P1-01 | **持久化 `videoList` 到 `chrome.storage.local`** | 🟢 | 2026-07-01 | 0.5d | 内存缓存 + 并发保护 + 500 条 FIFO 软上限；新增 `CLEAR_VIDEO_LIST` 消息；popup 加清空按钮 |
| P1-02 | **清理 `background.js.bak` 旧版** | 🟢 | 2026-07-01 | 0.1d | 初始化 git 仓库（main 分支 + xiaoka6688 身份）；挪到 `docs/archive/background.js.v1.1.0.bak`；写归档 README；3 次规范提交 |
| P1-03 | **`doubao-downloader.user.js` 治理** | 🟢 | 2026-07-01 | 0.3d | 方案 A：提取核心 JSON.parse 逻辑写成 ~280 行轻量版 `doubao_image/content.js`；旧版归档 `docs/archive/` |
| P1-04 | **`duration15.js` 持久化开关** | 🟢 | 2026-07-01 | 0.3d | postMessage 桥接 chrome.storage.local；popup 滑块开关；统一浮窗函数 |
| P1-05 | **统一错误通知** | 🟢 | 2026-07-01 | 0.3d | `notify()` 内嵌 background.js；popup toast 实时 + 启动积压；关键 catch 块已接入 |
| P1-06 | **跨标签页去重** | 🟢 | 2026-07-01 | 0.2d | `downloadedUrls` Map + TTL 60s；5 个下载入口全部接入；base64 豁免 |

## 1.2 🟡 体验优化

| ID | 任务 | 状态 | 预估工时 | 验收标准 |
|---|---|---|---|---|
| P1-07 | **文件命名模板** | 🟢 | 2026-07-01 | 0.3d | `formatFilename()` 内嵌 background.js；7 个模板变量；5 个入口全部接入；Options Page 预留接口 |
| P1-08 | **Options Page** | 🟢 | 2026-07-01 | 0.5d | `options.html` + `options.js`；站点开关/15s/去重/命名模板/数据管理；manifest 注册 |
| P1-09 | **下载进度反馈** | 🟢 | 2026-07-01 | 0.3d | `chrome.downloads.onChanged` 监听；`broadcastProgress()` 500ms 节流；forwarder + dreamina 按钮显示百分比 |

## 1.3 稳定性

| ID | 任务 | 状态 | 预估工时 |
|---|---|---|---|
| P1-10 | **统一日志分级** | 🟢 | 2026-07-01 | 0.2d | 11 个文件前缀统一为 `[AI去水印·模块名]`；全部语法校验通过 |
| P1-11 | **关键路径单测** | 🟢 | 2026-07-01 | 0.5d | Jest 引入；`lib/utils.js` 提取 6 个纯函数；30 个测试用例全部通过 |
| P1-12 | **CSP 兼容性检查** | 🟢 | 2026-07-01 | 0.2d | xyq inject.js 改为 manifest MAIN world 注入；清理 web_accessible_resources；5 个 MAIN 脚本全部 CSP 安全 |

**Phase 1 合计**：约 8.5 人日

---

# ⚪ Phase 2 · 扩展（让功能"多"起来）

> **目标**：把 P0 站点全部支持到位，做完命名模板、历史归档这些产品级功能。
> **完成标准**：Options Page 全功能可用，3 个新站点稳定支持，下载文件能自动归档。

## 2.1 P0 站点支持

| ID | 站点 | 资源模式 | 状态 | 预估工时 | 备注 |
|---|---|---|---|---|---|
| P2-01 | **可灵 AI**（kling.ai） | fetch 拦截 | 🟡 | 2026-07-01 | 1d | 基础框架完成；manifest/options/background 已注册；待登录研究 API 补充拦截逻辑 |
| P2-02 | **Vidu**（vidu.com） | fetch 拦截 | 🟢 | 2026-07-01 | 0.5d | feed/list API 拦截；media_asset + short_film 两种类型；悬浮指示器 + 下载通道 |
| P2-03 | **PixVerse**（pixverse.ai） | fetch 拦截 | 🟢 | 2026-07-01 | 0.5d | showvideos + content/relation/list API；橙红渐变指示器；视频+图片下载 |

## 2.2 P1 产品功能

| ID | 任务 | 状态 | 预估工时 |
|---|---|---|---|
| P2-04 | **下载历史归档** | 🟢 | 2026-07-01 | 0.3d | formatFilename 返回 `{prefix}/{site}/{date}/{filename}`；Options Page 可配前缀；31 个测试通过 |
| P2-05 | **批量下载会话** | 🟢 | 2026-07-01 | 0.5d | JSZip 打包；3 并发下载 + 进度显示；klingai/vidu/pixverse 统一实现 |
| P2-06 | **失败重试** | 🟢 | 2026-07-01 | 0.2d | fetchWithRetry 指数退避 1s/2s/4s；klingai/vidu/pixverse 统一接入 |
| P2-07 | **暗色模式** | 🟢 | 2026-07-01 | 0.3d | CSS 变量 + prefers-color-scheme；Options Page 手动切换；popup + options 全支持 |

## 2.3 工程化

| ID | 任务 | 状态 | 预估工时 |
|---|---|---|---|
| P2-08 | **Vite + TypeScript 重构** | 🟡 | 2d | 基础设施就绪：tsconfig/vite.config/src 目录/shared 类型+utils/background TS 版本 |
| P2-09 | **ESLint + Prettier** | 🟢 | 2026-07-01 | 0.3d | eslint.config.js + .prettierrc；npm run lint 通过（0 错误）；TS + JS 双模式 |
| P2-10 | **Playwright 测试** | 🟢 | 2026-07-01 | 0.5d | playwright.config.ts；3 个 e2e 测试（扩展加载/popup/options） |

**Phase 2 合计**：约 16 人日

---

# ⚪ Phase 3 · 复刻（让"复制"变简单）

> **目标**：让任何人都能在 30 分钟内给新站点加上支持。
> **完成标准**：`npm run new-site klingai` 一行命令生成完整模板代码。

## 3.1 架构抽象

| ID | 任务 | 状态 | 预估工时 |
|---|---|---|---|
| P3-01 | **抽 `SiteAdapter` 基类**（`canHandle → observe → extract`） | ⚪ | 2d |
| P3-02 | **注册中心**（自动按 URL 分发到对应 adapter） | ⚪ | 1d |
| P3-03 | **通用 UI 组件库**（按钮、toast、工具栏、悬浮面板） | ⚪ | 1.5d |

## 3.2 脚手架

| ID | 任务 | 状态 | 预估工时 |
|---|---|---|---|
| P3-04 | **`create-site` CLI**（交互式生成新站模板） | ⚪ | 1.5d |
| P3-05 | **manifest 注入自动化**（CLI 自动改 manifest.json） | ⚪ | 0.5d |
| P3-06 | **文档自动生成**（adapter 注释 → 站点文档） | ⚪ | 1d |
| P3-07 | **官方模板市场**（`templates/` 收录 4 种"找资源"模式） | ⚪ | 1d |

**Phase 3 合计**：约 8.5 人日

---

# 📊 里程碑

| 里程碑 | 时间 | 标志 |
|---|---|---|
| **M1 · 优化完成** | 启动 + 2~3 周 | Options Page 上线，P0 不足全清 |
| **M2 · 扩展完成** | 启动 + 5~7 周 | 3 个新站点 + 完整产品功能 |
| **M3 · 复刻体系完成** | 启动 + 8~9 周 | CLI 一行命令生成新站点 |
| **M4 · v2.0 发布** | M3 + 1 周 | 商店版本提交 |

---

# 🎯 当前阶段

**当前处于：Phase 1 · 优化阶段**

下一个要做的任务：**P1-01 持久化 videoList**（从 P0 列表第一个开始啃）。

---

# 📌 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 字节系接口持续升级 | 插件静默失效 | 加 `/health-check` 心跳 + 告警 |
| Chrome Web Store 审核更严 | MV3 上架难度大 | 严格遵循权限最小化原则 |
| 部分站点登录态要求 | 没登录无法调接口 | 改用 `credentials: 'include'` + Cookie 复用 |
| 第三方用户脚本协议风险 | doubao-downloader 移植 | Phase 1-03 优先治理 |

---

# 🔄 计划维护规则

- **状态变更**：每完成一项，把状态 emoji 改为 🟢，并在 CHANGELOG.md 追加一行
- **新增任务**：在对应 Phase 表格底部追加（用最新 ID）
- **跨阶段调整**：经过评审后，把任务挪到新 Phase，更新本文件
- **每次会话结束**：在 `PROJECT_STATUS.md` 顶部"最新会话"块记录

---

> 制定于 2026-06-30
> 配套文档：[PROJECT_STATUS.md](./PROJECT_STATUS.md) · [EXPERIENCE.md](./EXPERIENCE.md) · [CHANGELOG.md](./CHANGELOG.md)
