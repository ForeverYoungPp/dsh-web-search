<p align="right">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ian_p/dsh-web-search"><img src="https://img.shields.io/npm/v/@ian_p/dsh-web-search?style=flat-square&amp;color=5B4CF0" alt="npm 版本"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0B7285?style=flat-square" alt="MIT 许可证"></a>
  <img src="https://img.shields.io/badge/DSH-0.2.0--rc.2-5B4CF0?style=flat-square" alt="DSH 宿主版本">
  <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&amp;logo=node.js" alt="Node 版本">
</p>

## 一条回退链，八个 provider

`@ian_p/dsh-web-search` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Cordis 插件，把原生的 `web_search` 后端换成可配置的多 provider 链路。每次查询按你配置的顺序执行，失败或结果为空就回退到下一个；DuckDuckGo 无需 key，作为链路最后一环。

浏览器半边提供独立的 **搜索 Provider** 设置页：管理密钥、测试连接、拖拽排序。

> **设计参考：** 多 provider 方案参考自 Oh My Pi (OMP)。

| 能力 | 带来的变化 |
| --- | --- |
| **8 个 provider，一条链路** | Tavily、Brave、Exa、Firecrawl、Jina、Kagi、SearXNG、DuckDuckGo——顺序、子集随意。 |
| **原生 `web_search` 集成** | Patch 覆盖把 Harness 自己的 `web_search` 工具路由到这条链路。 |
| **Fail-loud** | 未应用 patch 时，原生工具返回 `WEB_PROVIDER_AMBIGUOUS`，而不是静默降级。 |
| **与宿主同源的设置页** | 通过宿主 `locale` 服务做中英文，使用宿主自己的控件契约（`--dsw-*` 设计变量）上色，语言与明/暗主题都跟随宿主。 |
| **可审计的回退链** | 每次搜索在宿主日志打一行：先列出被跳过/失败的 provider，再列出真正作答的那家。 |

## 环境要求

- **Node.js** `^22.19` 或 `>=24`
- **DeepSeek Harness `0.2.0-rc.2`** —— 本插件的 Typert Remote 描述符是手写的，因此只针对一个 DSH 列车：

  ```bash
  npm install --global @deepseek-ai/dsh@0.2.0-rc.2
  ```

  它用到的每一个 `@deepseek-ai/dsh*` 组件都由该宿主构建提供。真正被 import 或参与门禁的三个包以同一列车版本声明为 peer（`^0.2.0-rc.2`）：`dsh-web`（`ctx.web` 缝）、`dsh-typert-protocol`（Remote 描述符）与 `dsh-api-remotes`（写在 `dsh.client.inject`）；`credentials` 经 `ctx.get('credentials')` 取得，故不声明。本项目单独声明的组件：

  | 组件 | 版本 | 作用 |
  | --- | --- | --- |
  | `@deepseek-ai/dsh` | `0.2.0-rc.2` | 宿主运行时（所有 `@deepseek-ai/dsh*` peer 的来源） |
  | `@deepseek-ai/cordis` | `~4.0.4` | 插件/上下文框架（peer + dev，与列车自身声明的范围一致） |
  | `react` | `^18.2` | 仅浏览器端（dev） |
  | `typescript` | `^7.0.2` | `src/host-core.js` 的类型检查（dev） |

## 安装

**从 npm 安装**（包声明了 `dsh.bundle.patch`，`dsh plugin add` 会同时把它激活为 profile bundle）：

```bash
dsh plugin --profile web add @ian_p/dsh-web-search
```

该命令解析的是 `latest` 标签，它目前指向 `0.2.0-rc.1` 这个预发版；需要可复现安装时请显式固定版本（`… add @ian_p/dsh-web-search@0.2.0-rc.1`）。仍停留在 DSH `0.1.5-rc.3` 的宿主与该版本不兼容，应装 `@ian_p/dsh-web-search@0.1.5-rc.3` —— 两个列车不可互换。各版本发布说明见 [GitHub Releases](https://github.com/ForeverYoungPp/dsh-web-search/releases)。

**本地开发** —— 在 harness 源码工作区里执行；该覆盖文件直接加载 `src/index.js`，不需要构建：

```bash
pnpm dsh web --patch /path/to/dsh-web-search/patch.web.yml
```

`web` 是启动器里 `--profile web` 的别名。覆盖文件（`patch.web.yml`）插入插件行，并在原生 `web` 行上设置 `searchProvider: dsh-web-search`；浏览器半边通过 `dsh.client` manifest 与 `exports["./client"]` 被发现。

**link 本地 checkout**（`dsh plugin --profile web add "link:/path/to/checkout"`）加载的是发布形态，也就是 `dist/` —— 改完 `src/` 必须 `pnpm run build`（`pnpm install` 也会通过 `prepare` 脚本构建）。两种方式都需要重启宿主。

## 链路行为

顺序来自设置页（拖拽排序），存在 `dsh-web-search/config` 凭据记录里。解析规则：你的有序、未排除的 provider 在前，其余按内置顺序接在后面。

对每个 provider，依次执行：

1. `available()` —— 本地检查，**不联网**：带 key 的需要凭据记录，SearXNG 需要 endpoint，DuckDuckGo 恒可用。不可用 ⇒ 跳过。
2. `search()`，每家一个超时（默认 60 秒，见配置记录里的 `timeout`）。
3. **成功** = 有非空 answer **或** 至少一条 source；此时立即返回，后面的 provider 不再尝试。没有并发、不合并多家、不重试、不缓存。
4. **失败** = HTTP 非 2xx、非法 JSON、抛错、或"没有可渲染内容"；记录原因后试下一个。

全部失败时，错误信息会指出最后尝试的那家；随后插件会再试一次原生 `deepseek-official`，都失败才放弃。

每次搜索会向宿主日志打一行：

```text
[14:32:07] [dsh-web-search] firecrawl: HTTP 429: ... → tavily: served (8 sources, 4437ms)
[14:32:09] [dsh-web-search] trying exa
[14:33:01] [dsh-web-search] brave: not configured → ... → all providers failed
```

只有 `trying` 而没有后续完成行，说明那家还在请求中（harness 日志本身无时间戳，所以由插件自己加）。

## Providers

| ID | 名称 | 类型 | 激活方式 |
| --- | --- | --- | --- |
| `tavily` | Tavily | API key | 保存 Tavily API key |
| `brave` | Brave | API key | 保存 Brave API key |
| `exa` | Exa | API key | 保存 Exa API key |
| `firecrawl` | Firecrawl | API key | 保存 Firecrawl API key |
| `jina` | Jina | API key | 保存 Jina API key |
| `kagi` | Kagi | API key | 保存 Kagi API key |
| `searxng` | SearXNG | Endpoint | 保存 SearXNG 实例 endpoint |
| `duckduckgo` | DuckDuckGo | 无 | 始终可用（默认最后兜底） |

几个值得知道的 provider 细节：

- **Tavily** —— `results[].content` 是**页面分块**而不是描述，因此请求里带 `chunks_per_source: 1`（只要一块最相关的正文，而不是三块站点外壳）与 `include_published_date: true`。
- **Firecrawl** —— 它用 HTTP 200 + `success: false` + `warning` 报告自己的失败；这些会被当作该 provider 的失败原因暴露出来，而不是看起来"结果为空"。
- **DuckDuckGo** —— 无需 key；解析 HTML 前端页，遇到机器人挑战页则返回 0 条，让链路继续。
- **SearXNG** —— 自建实例；`week` 会被映射成 `month`，因为实例只认 day/month/year。

## 配置

### 凭据

所有 provider 密钥都存放在 harness **credential records** 的 `dsh-web-search/` 作用域下，由设置页管理——不使用环境变量。（用环境变量名做凭据引用会遮蔽已保存的值，设置页就存不进去了。）

- **带 API key 的 provider** —— `api-key` 记录，例如 `dsh-web-search/tavily`。
- **SearXNG** —— `grant` 记录，载荷是实例 `endpoint`。
- **DuckDuckGo** —— 无 key。
- **插件配置** —— `dsh-web-search/config` 的 `grant` 记录：

  ```yaml
  order: [firecrawl, tavily, brave, exa, jina, kagi, searxng, duckduckgo]
  exclude: []
  timeout: 60        # 秒，每家 provider
  ```

  设置页只写 `order`；`exclude` 与 `timeout` 目前只能改记录。

### 设置页

注册为 Plugins 页面里 `plugins.item` 插槽上的插件页面（id `web-search-providers`，order 12），与原生网页搜索页分开（原生页保留自己的 `web-search` 页面）。它按生效顺序列出 provider，可保存/清除 key 或 endpoint、运行连接测试、拖拽卡片调整回退顺序。页面对宿主通信走插件的 `websearch` Remote 命名空间（`list` / `setKey` / `unsetKey` / `setOrder` / `testProvider`）。

同一个组件渲染两种视图：Plugins 页面列表卡片用的一行 `summary`，以及详情页的完整 provider 列表。

页面向宿主 `locale` 服务注册 `en` / `zh` 字典（侧边栏标签同样跟随），并用 `--dsw-*` 变量 + 宿主自己的按钮/输入框/卡片尺寸上色，因此语言与主题都跟宿主一致。

## 交给宿主的结果长什么样

`web_search` 的结果按原生路径整形：

- **Sources** 只带 `url`、`title?`、`snippet?`、`publishedAt?`。snippet 会先清洗（去 markdown 标题符、折叠空白、去分块拼接符），并限制在 **150 字符**——原生引用摘录的文档上限——被切掉的部分以 `…` 标记。
- **provider 自己的答案**（Tavily、Exa 会产生）作为 `content` 传出，限制在 **400 字符**，以 Markdown 渲染在来源列表上方。原生 provider 从不返回它。
- **截断由 seam 决定。** 插件把 provider 的完整来源列表交回并保持 `truncated: false`；由 harness 裁到 `request.maxResults` 并置 `truncated: true`，这才是"来源已截断"提示（用户与模型都能看到）的来源。
- 工具侧**没有**"哪个 provider 作答"的字段，因此改为打在宿主日志里（见上）。

## 架构 / 项目结构

```
dsh-web-search/
├── patch.web.yml            # 本地开发的 --patch 覆盖（相对路径 ./src/index.js）
├── cordis.patch.yml         # 发布用 bundle patch（包名），由 dsh.bundle.patch 声明
├── src/                     # 唯一真实来源（不发布）
│   ├── index.js             # host 入口：ctx.web provider、链路编排、凭据 RPC 操作
│   ├── host-core.js         # 纯函数：查询解析、各 provider 请求构造与响应归一化、
│   │                        # snippet/answer 策略
│   ├── remote.js            # websearch Remote 命名空间（WebSearchController）
│   └── client/bundle.js     # 浏览器半边：手写 __ModuleLoader__ factory bundle（无打包器）：
│                            # 设置页 + 只保留一份的状态机
├── scripts/build.mjs        # 构建：把 src/ 干净拷成 dist/（发布树）
├── dist/                    # 构建产物——发布到 npm，被 git 忽略
├── tests/                   # 140 个纯函数测试 + 19 个环境相关测试（见下）
├── docs/DESIGN.md           # 依赖的宿主契约，以及代码为何长这样
└── package.json             # main/exports → dist/，files: ["dist/", …]，prepare 构建 dist/
```

## 开发 / 测试

```bash
pnpm install             # 安装 peer/dev 依赖，并跑 prepare（构建 dist/）
pnpm run build           # 把 dist/ 从 src/ 生成（干净拷贝，无打包器、无新依赖）
pnpm test                # 140 个纯函数测试（node:test，零依赖）
pnpm run test:rpc        # 19 个环境相关测试（解析 0.2.0-rc.2 的 peer）
pnpm run typecheck       # tsc -p tsconfig.types.json（src/host-core.js 的 JSDoc 类型）
pnpm run prepublishOnly  # 发布前：构建 + 两层测试 + 类型检查
```

| 层级 | 套件 | 数量 | 覆盖内容 |
| --- | --- | --- | --- |
| 纯函数 | `tests/manifest.test.mjs` | 6 | 单列车 manifest 守卫：peer 范围、已死的 `dsh-tools` 声明、无运行时版本探测、bundle 机制未变 |
| 纯函数 | `tests/host-core.test.mjs` | 97 | 查询解析、各 provider 请求体、响应归一化、snippet/answer 策略、凭据记录辅助函数 |
| 纯函数 | `tests/interaction.test.mjs` | 37 | 设置页状态机（跑在发货的 client bundle 上） |
| 环境 | `tests/remote-contract.test.mjs` | 18 | 对已安装运行时的兼容性闸门、Typert Remote 贡献，以及 client bundle 严格 codec 在两个 registry face 上的校验 |
| 环境 | `tests/client-bundle.smoke.mjs` | 1 | bundle 注册、`plugins.item` 注册、`apply()`、注入的样式表 |

`src/index.js`（host 入口：传输、链路、凭据操作、`ctx.web` 注入）没有测试覆盖——它需要 harness 运行时；`docs/DESIGN.md` 记录这留下了什么未钉住的东西。

## 许可证

[MIT](./LICENSE) © ForeverYoungPp
