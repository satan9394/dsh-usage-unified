# dsh-usage-unified

[![CI](https://github.com/satan9394/dsh-usage-unified/actions/workflows/ci.yml/badge.svg)](https://github.com/satan9394/dsh-usage-unified/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/satan9394/dsh-usage-unified)](https://github.com/satan9394/dsh-usage-unified/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-brightgreen)](https://nodejs.org)

**DeepSeek Harness（`dsh`）的全机 Token 统计。** 一个仪表盘统管本机所有会话日志：趋势、
按模型拆分、会话排行、调用明细、导出，以及可选的本机成本估算。全部本地运行——插件从不联网。

[English](./README.md) | 中文

## 目录

- [这是什么](#这是什么)
- [功能](#功能)
- [环境要求](#环境要求)
- [安装](#安装)
- [使用](#使用)
- [配置](#配置)
- [数据与隐私](#数据与隐私)
- [成本估算（可选）](#成本估算可选)
- [已知边界](#已知边界)
- [架构](#架构)
- [开发](#开发)
- [兼容性](#兼容性)
- [跨 Agent 排行榜（可选）](#跨-agent-排行榜可选)
- [致谢](#致谢)

## 这是什么

`dsh` 为每个会话写一份日志。想知道「这台机器到底花了多少、花在哪」，只能去读这些日志——
harness 自带的投影只覆盖它当前运行的那个 home。

本插件把两个上游插件**在数据层合并**（而不是并排两套），所以一份索引喂一个仪表盘，各处数字一致：

| 上游 | 贡献 |
| --- | --- |
| [`lanlandeli/dsh-usage-stats`](https://github.com/lanlandeli/dsh-usage-stats) | 界面：侧边栏入口与全屏浮层、按天趋势、逐调用明细表（筛选 + 分页）、CSV/JSON 导出、工作区与任务范围筛选、中英双语、主题自适应。 |
| [`zoyluoblue/deepseek-harness-token`](https://github.com/zoyluoblue/deepseek-harness-token) | 数据核心：发现全部 dsh home、直接读 zstd 原始日志、纯函数可续算折叠、增量持久索引、连续天数、高峰时段、模型四桶拆分、覆盖度披露、设置分区。 |

## 功能

- **全部 dsh home、两代日志格式。** `~/.dsh`、`~/.dsh_desktop/<version>`、`$DSH_HOME`，外加你自列的额外根。
  同时读旧格式 `session.jsonl[.zstd]` 与版本化 `session.v<N>.jsonl[.zstd]`，**不依赖** harness 的私有解码器。
- **一个区间贯穿全页。** 今天 / 近 7 天 / 近 14 天 / 近 30 天 / 全部，外加自定义区间，同时决定顶部卡片、
  趋势图、模型面板、会话排行、调用明细与成本。自定义有两种模式：**起止**，或**起 → 至今**——后者由宿主按
  「今天」解析上界，窗口随日历自然延长。只有「连续天数」是全时属性，那两张卡会明确标注。
- **一个模型面板。** 每行给出：占比、输入/缓存读/缓存写/输出的堆叠条、调用数，以及（有定价时）成本；
  长尾模型默认收起。
- **会话排行 + 下钻。** 按所选区间的 Token 排序；点一行即把调用明细筛到该会话。
- **平滑多序列趋势**（总 / 输入 / 输出 / 缓存读），图例可点开关、悬停读数，任何区间（含全部）都渲染。
  「今天」只有一个天桶，因此改画宿主的 24 个小时桶；小时桶只带总量，所以该视图只给总量一条线。
- **面板打开时每 60 秒自动刷新。**
- **调用明细**：时间、响应耗时、输入、输出、缓存率、模型、思考程度，支持模型/提供商/阈值筛选、
  分页与可配置条数上限。
- **CSV / JSON 导出**当前区间。
- **面板可折叠**、中英双语、浅深色；页脚披露被跳过/被替换的内容，而不是悄悄丢掉。
- **可选成本估算**（本机定价表，含峰谷加权，见下）。

## 环境要求

- `dsh` 插件 API 0.1.5-rc.1 或更新（见[兼容性](#兼容性)）。
- Node `^22.19.0 || >=24.0.0`——即 harness 自身使用的运行时。
- 无运行时依赖。`react` 与 `@deepseek-ai/*` 均为 peer，由 harness 提供。

## 安装

```powershell
# 从 GitHub
dsh plugin --profile web add github:satan9394/dsh-usage-unified

# 从本地检出
dsh plugin --profile web add E:\path\to\dsh-usage-unified
```

然后重启 Web profile。仪表盘出现在**侧边栏底部的「使用统计」**，以及**设置**里的一个分区。

> **DSH STORE 收录状态。** 商城里本插件显示为 `blocked`。它的自动准入策略拒绝任何「运行时代码会触碰
> 文件系统 / 网络 / 命令 / 凭据」的插件，而本插件必然触碰：宿主半侧要从磁盘读会话日志，浏览器半侧要取
> 自己的回环路由。商城保留了上面这条**手动安装入口**，而 [docs/SECURITY.md](./docs/SECURITY.md)
> 逐条写明了运行时对这些能力的使用方式。插件的行为与本文描述一致，没有额外动作。

### 更新

运行时（`lib/`）是在 harness 启动时加载的，所以**新构建必须重启 Web profile 才生效**。

- **从检出或 `link:` 安装**——在该目录 `git pull`，源码变了就重新构建（`npm run build`），然后重启。
  `link:` 依赖是**目录联接**，没有副本需要刷新：profile 直接读这个检出目录。
- **从 GitHub 或 npm 安装**——再执行一次 `dsh plugin --profile web add <同一个目标>`。那种安装会**钉住
  某个 commit**，重新 add 才是移动它的方式。

无论哪种，**只有运行时变更需要重启**；文档与 `scripts/` 的改动不需要。

## 使用

打开侧边栏底部入口（或 设置 → 使用统计）。选一个区间——区间控件下方的说明行与趋势图标题栏都会写明
当前统计的确切窗口。

宿主在 `/usage-unified/v1` 下提供四个同源、**仅回环**的路由：`/snapshot`、`/calls`、
`/export.csv`、`/export.json`。非回环调用返回 `403`。

## 配置

在 profile 的插件行里设置（形状见 [`cordis.patch.yml`](./cordis.patch.yml)）。

| 键 | 类型 | 默认值 | 含义 |
| --- | --- | --- | --- |
| `extraSessionRoots` | `string[]` | `[]` | 额外扫描的 dsh home 目录。home 发现是启发式的，只能通过未设置的 `$DSH_HOME` 到达的 home 必须在这里列出。 |
| `includeCompaction` | `boolean` | `true` | 是否计入生成 compaction 摘要的 Token。设为 `false` 可与 harness 自带投影 1:1 对账。 |
| `refreshIntervalMs` | `number` | `30000` | 多久重扫一次追加的会话。 |
| `indexChunkYieldMs` | `number` | `16` | 扫描时的协作让出间隔，保证冷启动期间仍可响应。 |
| `indexConcurrency` | `number` | `4` | 并行解码的会话数。实测：2–4 最佳，8 以上反而退化。 |
| `apiPath` | `string` | `/usage-unified/v1` | 同源只读 API 前缀。 |
| `cachePath` | `string` | `$DSH_HOME/usage-unified/index-v1.json` | 索引缓存位置。 |
| `pricingPath` | `string` | `$DSH_HOME/usage-unified/pricing.json` | 成本表。文件不存在则不显示成本。 |
| `cacheWriteDelayMs` | `number` | `1000` | 索引写盘的防抖延迟。**只在索引真的变化时才写。** |

## 数据与隐私

全部事实如下；细节与失败边界见 [docs/SECURITY.md](./docs/SECURITY.md)。

- **读取**——所有已发现 dsh home 下的会话日志，以及（用于成本估算的）一个可选定价文件。只读：
  从不写入会话，也不写入其它 home。
- **写入**——**只有一个文件**：`$DSH_HOME/usage-unified/index-v1.json`，原子写（临时文件 + rename）、
  权限 `0600`，且仅在索引发生变化时写。
- **网络**——**零**。运行时不发任何外部请求、不自行开监听套接字。它只在 harness 提供的 web server 上
  注册一条路由，且**仅响应回环调用**（其它一律 `403`）。其导入仅 `node:fs/promises`、`node:path`、
  `node:os`、`node:zlib` 与 `@deepseek-ai/*`。
- **进程与凭据**——**无**。不用 `child_process`、不起 shell、不用 eval；不读、不写、不记录任何密钥。
- **工具面**——**无**。插件不注册任何面向模型的工具、不追加任何会话事件，所以挂载它对对话零开销。

## 成本估算（可选）

`dsh` 本身不带价目表，所以本插件**默认不算钱**。当定价表存在时，会多出一张「估算成本」卡片与每行
模型的成本；没有定价的模型计入**「未定价」而不是当作免费**，卡片与页脚都会披露已定价比例。

```powershell
npm run pricing:setup     # 写 $DSH_HOME/usage-unified/pricing.json
```

两个来源合并，后者覆盖前者：

1. **主来源**——CC Switch 的 `~/.cc-switch/model-pricing.json`（`--source` 可换成任意本项目
   `{ models: { id: {...} } }` 格式的文件）。
2. **覆盖表**——`scripts/pricing.override.json`（**入 git**）：主表缺的模型与峰谷两档费率。放在这里
   而不是 CC Switch 里，是因为 CC Switch 的 models.dev 自动同步可能冲掉手工条目；每次
   `pricing:setup` 都会重新合并。

**峰谷计价。** DeepSeek 全系按官方时段计价：高峰 = UTC 周一至周五 01:00–04:00 与 06:00–10:00
（占全周 35/168 小时）。条目可同时声明空闲表与 `peak` 档，插件按
`空闲 × (1 − peakShare) + 高峰 × peakShare` 折算有效费率，`peakShare` 默认 **0.2083**，并在卡片上
披露该比例——既不按乐观的空闲价低估，也不按高峰价高估。随包取值与
[DeepSeek 官方定价页](https://api-docs.deepseek.com/quick_start/pricing)、
[OpenCode Go](https://opencode.ai/docs/go)、
[Command Code](https://commandcode.ai/docs/resources/pricing-limits) 一致。

## 已知边界

一律披露而非隐藏——页脚会重复当前数据真正命中的那几条。

- **重试步骤只保留最终用量。** 某一步的用量上报被替换过，说明两次尝试都计费了，而日志只留下存活的那条。
  页脚以 `retried` 披露。
- **有界区间可能小于全时总量。** 时间戳未通过时钟偏移校验的 Token 应进总量但不该上日历，因此全时读
  会话的权威计数器，有界区间由按天切片求和。
- **「天」按宿主进程时区切**，在建立索引那一刻定死。若机器系统时区与使用者所在时区不同，「今天」指的是
  **那个时区**的今天；改时区会触发全量重建。
- **调用明细有上限**，由可配置的明细上限控制（默认 1,000，最大 10,000）。
- **冷启动建立索引需要数分钟**（本机约 1,380 个日志文件、约 790MB 压缩日志）。面板会渲染部分结果并报告进度。
- **活跃热力图已移除**——它与趋势图重复。

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
    index.tsx       侧边栏 + 浮层 + 设置三处注册，仪表盘
    i18n.ts         中英词典
    source.ts       唯一传输层
    styles.ts       仪表盘样式
```

值得知道的设计决策（完整论证见 [PLAN.md](./PLAN.md)）：

- **读取层与 harness 版本无关。** 旧格式是 JSONL *存储记录*，流式内容被打包且没有 `seq`；新格式是纯事件。
  计费只需要带序号的记录，所以读取层保留「字符串 `type` + 数字 `seq`」的行——**不依赖会改名的私有
  `decodeStorageRecord`**。
- **每个 `(turn, step)` 一条调用。** 用量每步上报两次（流式块 + 最终消息），折叠采用**替换而非累加**，
  并为明细表保留每步一条；compaction 摘要单独成条。
- **文件缓存，不依赖可选服务。** 索引写入 `$DSH_HOME` 下的普通文件而非 `ctx.storageDomain`，
  所以「可选服务缺失」永远不会导致面板加载不出来。
- **不猜数字。** 未定价的模型标为未定价；覆盖度、重试步骤、跳过日志一律披露。

## 开发

```powershell
npm install          # .npmrc 设 legacy-peer-deps（@deepseek-ai peer 树）
npm run typecheck    # tsc --noEmit
npm run test         # vitest（68 项）
npm run build        # tsdown → lib/index.js + lib/client.js
npm run check        # typecheck + test + build
npm run verify:realdata   # 只读扫本机真实 dsh home
npm run smoke:local       # 本地起 HTTP 路由跑真实数据自测（不装载）
npm run smoke:serve       # 同上并常驻，打印查看器 URL
npm run pricing:setup     # 由本机 CC Switch 生成成本估算用的定价表
npm run report            # 生成静态自包含报告（全部时间）并打开
npm run report:30d        # 同上，近 30 天
```

`smoke:local` 就是「在工作区里跑、指向真实数据」的路径：**不碰** DSH profile。它用普通 Node 服务器把同一批
宿主路由挂到空闲回环端口、索引指向真实 `~/.dsh`，跑九项 HTTP 断言。`verify:realdata` 遍历每份真实会话日志，
把折叠总量与独立编码的用量重建逐位核对（本机为精确相等、delta 0）。

`lib/` **已提交进仓库**，因为 DSH STORE 要求运行时产物存在于固定 commit 内。因此 CI 会断言「提交的构建产物与
源码一致」，源码改了没重建就不可能被当成旧代码装出去。

静态报告与插件**同源同口径**：`--range` 决定头部卡片，并带同样的合并版模型面板、会话排行与成本卡；
热力图同样被移除。

> `scripts/` 下的脚本只在**源码检出**里可用，不随 npm 包发布。

## 兼容性

- 插件 API：`@deepseek-ai/*` 的 `peerDependencies`（当前 `^0.1.5-rc.1`）；Node `^22.19.0 || >=24.0.0`。
- 会话日志：旧格式 `session.jsonl[.zstd]` **与**版本化 `session.v<N>.jsonl[.zstd]`。
- 平台：Windows / macOS / Linux。仅可选的排行榜任务使用 Windows 计划任务，其余脚本跨平台。
- `package.json` 的 `dsh.compatibility` **只声明实际验证过的版本**：`>=0.1.5-rc.2 <0.1.6`，且
  `dshReleases["0.1.5-rc.2"] = "compatible"`。刻意不用 `^`——那会顺带声称 rc.3+ 也兼容，而它们没被验证过。

各条声明背后的证据见 [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md)。

## 跨 Agent 排行榜（可选）

本仪表盘**只统计 DSH**，且完全离线。把机器上所有 Agent（DSH、Claude Code、Codex、OpenCode……）汇成一个
数字并提交到 [tokscale](https://github.com/junhoyeo/tokscale) 排行榜是**可选**的，只有你**从仓库克隆**后
运行引导脚本才会发生：

```powershell
git clone https://github.com/satan9394/dsh-usage-unified && cd dsh-usage-unified
npm install
npm run leaderboard:setup     # 引导：安装/登录 tokscale、导出、首次提交
npm run leaderboard:off       # 撤销：删除每日任务、停止提交
```

`leaderboard:setup` 遵循 [docs/LEADERBOARD.md](./docs/LEADERBOARD.md)，其中逐条说明**离开本机的数据**，
并在上传前征求确认。一次提交只带**聚合数据**——按天的 Token 桶、估算成本、消息数、client 与模型名、
MCP server 名、会话时长指标、随机设备键与 CLI 版本。**绝不**带提示词、回复、源码或工作目录路径。
有两项在**上传端无法脱敏**：模型/provider 名与 MCP server 名（介意就改 MCP 配置里的名字）。

## 致谢

MIT —— 见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。衍生自两个 MIT 许可的插件
[`lanlandeli/dsh-usage-stats`](https://github.com/lanlandeli/dsh-usage-stats) 与
[`zoyluoblue/deepseek-harness-token`](https://github.com/zoyluoblue/deepseek-harness-token)，
其源码保留在 `_upstream/` 供对照。

变更历史：[CHANGELOG.md](./CHANGELOG.md)。
