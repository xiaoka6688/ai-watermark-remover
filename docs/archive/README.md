# docs/archive/ · 历史归档

> **本目录存放已废弃但有保留价值的旧版本代码与文档。**
> 维护原则：留作历史参考，不参与构建，不要修改；如需彻底删除，先在 git 找到引用方再操作。

---

## 📁 当前归档文件

### `background.js.v1.1.0.bak`（2025-06-23 版本）

| 字段 | 值 |
|---|---|
| **来源** | 仓库根目录 `background.js.bak`（项目未 git 化时遗留） |
| **版本** | v1.1.0（"小柒去水印插件"时期） |
| **大小** | 13,247 字节 / 385 行 |
| **状态** | ⚠️ **已废弃，请勿使用** |
| **归档时间** | 2026-07-01（会话 #5，P1-02 任务） |

#### 为什么归档而不是删除？

1. **项目接入 git 之前没有版本历史**——直接删除会永久丢失
2. 旧版含一段**已下线的"授权验证机制"**（zbgd.vip 论坛验证），有反编译/对比参考价值
3. 当前版本（v1.2.0 "AI去水印"）已删除该验证机制，改用纯无水印下载流程

#### 与当前版本（v1.2.0）的关键差异

| 维度 | 旧版 v1.1.0 | 当前 v1.2.0 |
|---|---|---|
| 插件名 | 小柒去水印插件 | **AI去水印** |
| 授权验证 | ✅ 有（zbgd.vip 远程校验） | ❌ 无（无验证版） |
| `videoList` 存储 | 内存 `const videoList = []` | `chrome.storage.local` 持久化 |
| 软上限 | 无 | 500 条 FIFO |
| 清空接口 | 无 | `CLEAR_VIDEO_LIST` 消息 |
| popup 清空按钮 | 无 | 有 |
| 文件总行数 | 385 | ~307 |

#### 何时可以彻底删除？

满足以下任一条件即可：
- [ ] 项目已有 3+ 次 git 提交（确保 .bak 内容被 commit 过）
- [ ] .bak 中的"授权验证逻辑"已经无任何参考价值

---

### `doubao-downloader.user.js.v1.2.6.bak`（2025-06-26 版本）

| 字段 | 值 |
|---|---|
| **来源** | `doubao_image/doubao-downloader.user.js`（Vite + vite-plugin-monkey 编译产物） |
| **版本** | v1.2.6（豆包下载器 Tampermonkey 脚本移植版） |
| **大小** | 1,062,085 字节 / 22,880 行 |
| **状态** | ⚠️ **已废弃，已被 `doubao_image/content.js` 替代** |
| **归档时间** | 2026-07-01（P1-03 任务） |

#### 为什么归档？

- 1MB+ 的编译产物，调试极其困难（无法设断点、无法理解上下文）
- 包含 React + Dexie + StreamSaver.js + FileSaver.js 完整依赖栈（全部内联打包）
- 与项目其他模块（`qianwen/`、`dreamina/` 等）代码风格完全不一致

#### 轻量替代方案（`doubao_image/content.js`，~280 行）

保留了原版最核心的机制——`JSON.parse` 猴子补丁拦截 `creations` 响应：
- `JSON.parse` 劫持 → 递归搜索 `creations[] → image.image_ori_raw.url`
- 同时修补 `image_ori/preview/thumb` URL，让页面直接显示无水印图
- 去掉了 React UI、Dexie IndexedDB、StreamSaver.js 流式 ZIP
- 改用轻量 DOM 浮窗 + `chrome.runtime.sendMessage` 下载 + `chrome.storage.local` 持久化

#### 如果轻量版出问题？

1. 从本文件恢复：`cp docs/archive/doubao-downloader.user.js.v1.2.6.bak doubao_image/doubao-downloader.user.js`
2. 在 `manifest.json` 里把 `doubao_image/content.js` 改回 `doubao_image/doubao-downloader.user.js`
3. 刷新扩展

---

## 🔒 维护规则

1. **只读**：本目录文件不参与构建，编辑器打开只看不改
2. **改名归档**：新废弃文件统一加 `.v{version}.bak` 后缀
3. **加 README 条目**：每个归档文件都在本 README 登记，说明"为什么留"
4. **彻底删除走 git**：`git rm` 即可，留痕清晰

---

> 归档机制建立于 2026-07-01（P1-02 任务）
> 配套：[`../PROJECT_PLAN.md`](../PROJECT_PLAN.md) · [`../CHANGELOG.md`](../CHANGELOG.md)
