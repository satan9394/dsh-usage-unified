# dsh-usage-unified

[English](./README.md) | 中文

一个 DeepSeek Harness（`dsh`）插件，把两个上游插件**合并为一个**，消灭「一个有这个功能、另一个没有」：

| 上游 | 贡献 |
| --- | --- |
| [`lanlandeli/dsh-usage-stats`](https://github.com/lanlandeli/dsh-usage-stats) | 界面强：侧边栏 + 全屏浮层、按天 Token 趋势、模型环图、Token 构成卡、逐调用明细表（筛选 + 分页）、CSV/JSON 导出、工作区/任务范围筛选、中英双语、主题自适应。 |
| [`zoyluoblue/deepseek-harness-token`](https://github.com/zoyluoblue/deepseek-harness-token) | 数据强：发现**全部** dsh home（`~/.dsh`、`~/.dsh_desktop/<version>`、`$DSH_HOME`）、直接读取原始会话日志（zstd 多帧容器）、纯函数可续算折叠、增量持久索引、全部/7 天/30 天、当前与最长连续天数、高峰时段、模型四桶拆分、覆盖度披露、设置页。 |

两者是**在数据层合并**的（不是并排两套）：一份全机索引同时喂一个仪表盘，所以各处数字一致。

## 功能对照（合并后）

| 功能 | 上游 #1 | 上游 #2 | 本插件 |
| --- | :---: | :---: | :---: |
| 全机（所有 dsh home / 旧 Desktop 版本） | ✗ | ✓ | ✓ |
| 两种日志格式（`session.jsonl.zstd`、`session.v3.jsonl.zstd`） | n/a | ✗（仅 v0） | ✓ |
| 侧边栏入口 + 全屏浮层 | ✓ | ✗ | ✓ |
| 设置 → 使用统计 | ✗ | ✓ | ✓ |
| Token 总量（含缓存读） | ✓ | ✓ | ✓ |
| 7 天 / 30 天 / 全部 趋势 | ✓ | ✓ | ✓ |
| 自定义时间段 | ✗ | ✗ | ✓ |
| 平滑多序列趋势（总 / 输入 / 输出 / 缓存读） | ✗ | ✗ | ✓ |
| 当前连续天数 | ✓ | ✓ | ✓ |
| 最长连续天数 | ✗ | ✓ | ✓ |
| 高峰时段 | ✗ | ✓ | ✓ |
| 缓存命中率 + 调用次数卡片 | ✗ | ✗ | ✓ |
| 模型用量面板（占比 + 四桶拆分 + 调用数，一行一个模型） | 半 | 半 | ✓ |
| 面板可折叠 / 模型长尾默认收起 | ✗ | ✗ | ✓ |
| 会话排行 + 点击下钻该会话的调用明细 | ✗ | ✗ | ✓ |
| 可选成本估算（读本机定价表，缺价不猜） | ✗ | ✗ | ✓ |
| 逐调用明细（时间、耗时、Token、缓存率、模型、思考程度） | ✓ | ✗ | ✓ |
| 工作区 + 主任务/子任务筛选 | ✓ | ✗ | ✓ |
| CSV / JSON 导出 | ✓ | ✗ | ✓ |
| 覆盖度 + home + 跳过日志披露 | ✗ | ✓ | ✓ |
| 中英双语、浅色/深色 | ✓ | ✓ | ✓ |

> 两个上游都带的**活跃热力图**在本插件里被**移除**——它与趋势图重复。两个上游各有一个模型面板（一个只有占比、一个只有四桶拆分），本插件把它们**并成一个**：同一行给出占比、四桶堆叠条、调用数与（可选）成本，模型多于 6 个才出现「展开全部」。

## 安装

```powershell
# 直接从 GitHub（运行产物已随仓库提交，安装时不构建）：
dsh plugin --profile web add github:satan9394/dsh-usage-unified

# 从 npm 发布版（发布后）：
dsh plugin --profile web add dsh-usage-unified

# 从本地检出：
dsh plugin --profile web add E:\path\to\dsh-usage-unified
```

重启 Web profile。仪表盘会出现在**侧边栏底部的「使用统计」**，以及**设置**里的一个分区。所有数据留在本机；接口仅响应回环（loopback）调用。

兼容范围见 [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md)，权限/依赖/失败边界见 [docs/SECURITY.md](./docs/SECURITY.md)。

## 架构

```
src/
  index.ts          宿主入口：Config、挂载索引 + 路由 + 刷新循环
  homes.ts          发现全部 dsh home（按 sessions realpath 去重）
  reader.ts         遍历会话日志；两种磁盘格式都能解码（不依赖私有 API）
  zstd-frames.ts    扫描拼接的 zstd 帧（续读游标按帧对齐）
  fold.ts           纯函数可续算折叠：会话 → 总量、按天/小时切片、调用
  aggregate.ts      快照 + 会话排行 + 调用行 + 连续天数/高峰时段 + CSV
  pricing.ts        可选定价表：读取、按模型 id 匹配、成本与覆盖度
  index-store.ts    增量索引（并行解码），缓存在 DSH_HOME 下的文件
  transport.ts      /snapshot、/calls（含 ?session= 下钻）、/export.*（仅回环）
  types.ts          两半共享的传输契约
  client/
    index.tsx       侧边栏 + 浮层 + 设置三处注册，仪表盘（可折叠面板 + 会话下钻）
    i18n.ts         合并后的中英词典
    source.ts       唯一传输层
    styles.ts       仪表盘样式
```

关键设计（完整论证见 [PLAN.md](./PLAN.md)）：

- **读取层与 harness 版本无关。** 旧格式是 JSONL *存储记录*，流式内容被打包（`text-chunks` 等）且没有 `seq`；新格式是纯事件。计费只需要带序号的 `assistant/message`，所以读取层保留「字符串 `type` + 数字 `seq`」的行、跳过打包块——**不依赖会改名的私有 `decodeStorageRecord`**。
- **每个 `(turn, step)` 一条调用。** 用量每步上报两次（流式 `assistant/chunk` + 最终 `assistant/message`），折叠采用**替换而非累加**，并为明细表保留每步一条；compaction 单独成条。
- **全部 vs 有界区间。** 全部时间读会话的权威计数器（时间戳被判为异常的用量也计入）；有界区间由按天切片求和（因此可能更小——这是诚实的行为）。
- **区间贯穿全页。** 顶部卡片与趋势图、模型、会话排行、调用明细、成本取自**同一个所选区间**（`snapshot.totals`）；只有「连续天数」是全时属性，故在卡片上标注「全时」，避免误读。区间控件下方与趋势图标题栏都会写明当前统计区间（起止日期）。
- **文件缓存。** 索引原子写入 `$DSH_HOME/usage-unified/index-v1.json`，不依赖可选的 `ctx.storageDomain`，保证面板始终能加载。
- **并行索引。** 扫描先做一轮只读 stat 发现全部会话，再按有界并发（默认 4）解码；未变更的会话只付一次 stat，因此冷启动不再被单个大日志堵住。
- **不猜数字。** 定价表缺项时该模型标为「未定价」并计入未定价总量，成本卡片只在定价表存在时出现；覆盖度、重试步骤、跳过日志一律在页脚披露。

## 成本估算（可选，opt-in）

DSH 本身不带价目表，所以本插件**默认不算钱**。只有当 `$DSH_HOME/usage-unified/pricing.json` 存在时，才会多出一张「估算成本」卡片与每行模型的成本；没有定价的模型**计入「未定价」而不是当作免费**，卡片与页脚都会披露已定价比例。

生成定价表（合并两个来源，后写的手工表优先）：

```powershell
npm run pricing:setup     # 写 $DSH_HOME/usage-unified/pricing.json
```

1. **主来源**：CC Switch 的 `~/.cc-switch/model-pricing.json`（`--source` 可换成任意本项目 `{ models: { id: {...} } }` 格式的文件）。
2. **覆盖表**：`scripts/pricing.override.json`（入 git）——放主表缺的模型与**峰谷两档**的费率。放在这里而不是 CC Switch 里，是因为 CC Switch 的 models.dev 自动同步可能把手工条目冲掉；每次 `pricing:setup` 都会重新合并，冲不掉。

**峰谷计价**：DeepSeek 全系按 DeepSeek 官方时段计价（高峰 = UTC 周一至周五 01:00–04:00 与 06:00–10:00，即北京 09:00–12:00 / 14:00–18:00，占全周 35/168h）。表里可给一条模型同时写空闲与 `peak` 两档，插件按 `peakShare`（默认 **0.2083**）折算成有效费率 = 空闲×(1−s) + 高峰×s，并在成本卡上披露折算比例——既不按乐观的空闲价低估，也不按高峰价高估。取值口径与 [DeepSeek 官方定价页](https://api-docs.deepseek.com/quick_start/pricing)、[OpenCode Go](https://opencode.ai/docs/go) 与 [Command Code](https://commandcode.ai/docs/resources/pricing-limits) 的逐模型价目表一致。

价格单位是**每百万 Token 的美元价**，四个桶（输入 / 缓存读 / 缓存写 / 输出）各一档，与用量口径一一对应。重启 DSH web 后生效（每次索引扫描会重读定价表，改价无需重装插件）。

## 开发

```powershell
npm install          # .npmrc 设 legacy-peer-deps（dsh 依赖树）
npm run typecheck    # tsc --noEmit
npm run test         # vitest（67 项）
npm run build        # tsdown → lib/index.js + lib/client.js
npm run check        # typecheck + test + build
npm run verify:realdata   # 只读扫本机真实 dsh home
npm run smoke:local       # 本地起 HTTP 路由跑真实数据自测（不装载）
npm run smoke:serve       # 同上并常驻，打印查看器 URL
npm run pricing:setup     # 由本机 CC Switch 生成成本估算用的定价表
npm run report            # 生成静态自包含报告（全部时间）并打开
npm run report:30d        # 同上，近 30 天
```

> `scripts/` 下的脚本只在**源码检出**里可用，不随 npm 包发布。

静态报告与插件**同源同口径**：`--range` 决定头部卡片（把筛选前后的数字都写死成区间值），并有同一个合并版「模型用量」面板（占比 + 四桶 + 调用 + 成本，超出 6 个折叠）、同样的「会话排行」、成本卡与峰谷折算披露；与插件一样**移除了活跃热力图**（与按天柱状图重复）。

`smoke:local` 就是「在工作区里跑、指向真实数据」的路径：**不碰** DSH profile。它用普通 Node 服务器把同一批宿主路由挂到空闲回环端口、索引指向真实 `~/.dsh`，跑 7 项 HTTP 断言（snapshot 7d/all、main scope、calls、CSV、JSON、404）；配 `smoke:serve` 还会提供一个内置查看器，不用 DSH UI 也能看到真实数字。首次冷扫需数分钟；索引缓存在 `.smoke-cache/`（已 gitignore），之后数秒。

`verify:realdata` 遍历每份真实会话日志、折叠，并把折叠总量与独立编码的用量重建逐位核对；打印发现结果、两种格式、总量、模型、工作区、覆盖度、calls 接口与持久化往返。

## 兼容性

- 面向 `dsh` 0.1.5-rc.1 插件 API（`peerDependencies`），并同时读取旧/新两种日志布局，不局限于某一代 harness。
- `package.json` 的 `dsh.compatibility` **只声明实际验证过的版本**：目前是 `>=0.1.5-rc.2 <0.1.6` 与 `dshReleases["0.1.5-rc.2"] = "compatible"`。不写 `^` 是因为那会顺带声称 rc.3+ 也兼容，而它们没被验证过；后续稳定 rc 发布后再补声明（DSH STORE 的版本窗口会用「官方最新三版」，旧的精确声明滑出窗口时条目会转为 `unlisted` 而非被拒）。
- 浏览器半侧对注入的运行时缝隙自带最小结构类型（`src/client/runtime.d.ts`），不 import `@deepseek-ai/dsh-client-runtime`（其公开发布线已与 harness 实际提供的偏离）。`@deepseek-ai/*` 客户端模块仍是 `peerDependencies`，由 harness 在加载时提供。

## 跨 Agent 排行榜（可选，opt-in）

本仪表盘**只统计 DSH**，且完全离线——安装插件不联网、不上传任何东西。把机器上所有 Agent（DSH、Claude Code、Codex、OpenCode……）汇成一个数字并提交到 [tokscale](https://github.com/junhoyeo/tokscale) 排行榜是**可选**的，只有你**从仓库克隆**后运行引导脚本才会发生（插件本身永远不需要）：

```powershell
git clone https://github.com/satan9394/dsh-usage-unified && cd dsh-usage-unified
npm install
npm run leaderboard:setup     # 引导：安装/登录 tokscale、导出、首次提交
npm run leaderboard:off       # 撤销：删除每日任务、停止提交
```

`leaderboard:setup` 遵循 [docs/LEADERBOARD.md](./docs/LEADERBOARD.md)，其中逐条说明**离开本机的数据**，并在上传前征求确认。该文档也覆盖仅剩的一个补充导出器（`scripts/ccswitch-export.mjs`，处理 CC Switch 代理侧的 Claude 用量）、定价表（`scripts/custom-pricing.mjs`）与每日刷新任务。

> **DSH 已经不需要补充导出器。** 本仓库原来那个 `scripts/tokscale-export.mjs` 是因为 tokscale 不认版本化日志 `session.v<N>.jsonl.zstd` 才存在的；该缺陷已由 [junhoyeo/tokscale#1328](https://github.com/junhoyeo/tokscale/pull/1328) 修复，并随 tokscale **v4.17.0**（2026-09-15）发布。本机实测：在 4.17.0 上继续保留导出器与其 `extraScanPaths.dsh` 条目，DSH 会被读成 **24.80B**（原生只读是 15.38B），所以两者已一并**退休**。排行榜流程现在要求 tokscale ≥ 4.17.0，低于此版本 `leaderboard:setup` 会告警。

### 隐私速览

一次提交只带**聚合数据**——按天的 Token 桶、估算成本、消息数、client 名与模型名、MCP server 名、会话时长指标、随机设备键 `dev_…`、CLI 版本。**绝不**带提示词、回复、源码或工作目录/文件路径。有两项在**上传端无法脱敏**：模型/provider 名 与 MCP server 名（介意就改 MCP 配置里的名字）。在 `npm run report` 前设 `TOKSCALE_USERNAME` 可内嵌你的个人卡片；不设则报告保持匿名。

## 许可证

MIT —— 见 [LICENSE](./LICENSE)。衍生自两个 MIT 许可的插件；其源码见 `_upstream/`。
