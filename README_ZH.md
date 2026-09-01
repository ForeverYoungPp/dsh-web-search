<p align="right">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@deepseek-ai/dsh-web-search"><img src="https://img.shields.io/npm/v/@deepseek-ai/dsh-web-search?style=flat-square&amp;color=5B4CF0" alt="npm 版本"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0B7285?style=flat-square" alt="MIT 许可证"></a>
  <a href="./patch.web.yml"><img src="https://img.shields.io/badge/DSH-Web%20%2B%20Headless-5B4CF0?style=flat-square" alt="DSH Web 与 Headless"></a>
  <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&amp;logo=node.js" alt="Node 版本">
</p>

## 一条回退链，八家搜索源

`dsh-web-search` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的静态 Cordis 插件，为它接入可配置、多 provider 的第三方网络搜索后端。每次查询按配置的 provider 顺序执行，失败或结果为空时自动回退到下一个。DuckDuckGo 无需 API key，作为最后的兜底，保证链路始终有一个可用出口。

插件让 Harness 原生 `web_search` 工具走自己的 provider 链路——替换内置的 `deepseek-official` 后端——这样原生网页卡片渲染也能享受多 provider 回退、已配置的 API key 和 DuckDuckGo 作为无需 key 的最终兜底。

> **设计参考：** 本多 provider 搜索方案的设计参考自 Oh My Pi (OMP)。

## 为什么用 dsh-web-search？

| 能力 | 带来的变化 |
| --- | --- |
| **8 个 provider，一条链路** | Tavily、Brave、Exa、Firecrawl、Jina、Kagi、SearXNG、DuckDuckGo——顺序、子集随意配置。 |
| **原生 `web_search` 集成** | Patch override 将 Harness 原生 `web_search` 工具路由到本插件的多 provider 回退链，替换内置的 `deepseek-official` 后端。已配置的 API key 和 DuckDuckGo（无需 key）均可通过原生网页卡片 UI 使用。 |
| **应用内凭据管理** | API key 与 SearXNG endpoint 存放在 harness credential records 中，在专属的「Web Search Providers」设置页管理——保存、清除、连接测试、拖拽排序。 |
| **Fail-loud（故障显式报错）** | 未应用 patch 时，原生 `web_search` 会返回 `WEB_PROVIDER_AMBIGUOUS`，而不是静默降级。 |
| **无需构建** | 纯 ESM 源码直接加载；浏览器端以手写 factory bundle 形式随包发布。 |

## 目录

- [环境要求](#环境要求)
- [安装 / 加载](#安装--加载)
- [快速开始](#快速开始)
- [配置](#配置)
- [Providers](#providers)
- [架构 / 项目结构](#架构--项目结构)
- [开发 / 测试](#开发--测试)
- [许可证](#许可证)

## 环境要求

- **Node.js** `^22.19` 或 `>=24`
- **deepseek-harness** 源码工作区（用于本地 `--patch` 加载）或已安装的 `dsh` CLI（用于发布版 npm 包）

### 宿主：DeepSeek Harness `0.1.2` alpha 列车（必需）

本插件经 Typert Remote 协议调用宿主，并从 `@deepseek-ai/dsh-typert-protocol` import `RemoteError`（自 `0.1.2-alpha.2` 起存在），因此宿主必须运行 `0.1.2` alpha 构建——显式钉版本安装：

```bash
npm install --global @deepseek-ai/dsh@0.1.2-alpha.2
```

> **警告：** npm 上 `@deepseek-ai/dsh` 的 `latest` 标签当前是 `0.1.1-rc.2`——没有 `RemoteError` 的旧 rc 列车。裸 `npx @deepseek-ai/dsh web` 或裸 `npm install --global @deepseek-ai/dsh` 会装旧版，导致 RemoteError 崩溃。必须显式钉 `@0.1.2-alpha.2`（新列车在 `alpha` tag，当前为 `0.1.2-alpha.3`）。

- Peer 依赖（均为可选，随 npm 包一起安装）：

  | 包 | 版本 |
  |---|---|
  | `@deepseek-ai/dsh-api-remotes` | `^0.1.2-alpha.2` |
  | `@deepseek-ai/dsh-tools` | `^0.1.2-alpha.2` |
  | `@deepseek-ai/dsh-typert-protocol` | `^0.1.2-alpha.2` |
  | `@deepseek-ai/dsh-web` | `^0.1.2-alpha.2` |
  | `@deepseek-ai/cordis` | `^4.0.2` |

## 安装 / 加载

### 本地开发（`--patch`，直接加载源码）

在 deepseek-harness 源码工作区（存放 `dsh` 启动器与 `@deepseek-ai/*` 包的地方）内运行：

```bash
pnpm dsh web --patch D:/development/dsh-web-search/patch.web.yml
```

`web` 是 dsh 启动器中 `--profile web` 的硬编码别名。补丁覆盖文件（`patch.web.yml`）把 `src/index.js` 作为插件行插入 `web` profile，并在原生 `web` 行上设置 `searchProvider: dsh-web-search`，使其 `web_search` 工具路由到本插件。无需构建或打包：

- 相对行路径以补丁文件所在目录为基准，解析成 `file://` URL，由 Node 原生 ESM 直接加载。
- 浏览器端通过本项目 `package.json` 的 `dsh.client` manifest + `exports["./client"]` 被发现，指向 `src/client/bundle.js`（手写 `__ModuleLoader__` factory，不使用打包器）。

发布后可用 `dsh plugin --profile web add @deepseek-ai/dsh-web-search` 持久安装到 `web` profile（包声明了 `dsh.bundle.patch`，`dsh plugin add` 会把它激活为 profile bundle）；本地开发继续用 `--patch`。

### 发布版（从 npm 安装）

先装宿主，再装插件——宿主必须钉在 `0.1.2` alpha 列车（见[环境要求](#环境要求)）：

```bash
npm install --global @deepseek-ai/dsh@0.1.2-alpha.2   # 宿主，0.1.2 alpha 列车（必需）
dsh --version
dsh plugin --profile web add @deepseek-ai/dsh-web-search   # 解析 @latest
```

`dsh plugin add` 解析插件的 `@latest` dist-tag；由于包声明了 `dsh.bundle.patch`，安装即激活为 profile bundle。

## 快速开始

加载完成后，Harness 原生 `web_search` 工具的后端即被替换为本插件的多 provider 回退链（替换内置的 `deepseek-official`）。patch override（或在 `web` 行上的等效配置）设置 `searchProvider: dsh-web-search` 后，结果以原生网页卡片 UI 渲染；仅当所有插件 provider 均无可用结果时，链路才会回退到 `deepseek-official`。

无需独立工具——原生 `web_search` 是唯一入口。查询字符串中支持 `site:` 域名过滤（透传给 provider），并遵循配置的结果数。设置页可管理 API key、重排 provider 顺序和测试连接。

## 配置

### 凭据

所有 provider 密钥都存放在 harness **credential records** 的 `dsh-web-search/` 作用域下，由设置页管理——无需环境变量。

- **API key 类 provider** —— 存为 `api-key` record，例如 `dsh-web-search/tavily`。
- **SearXNG** —— 存为携带实例 `endpoint` 的 `grant` record。
- **DuckDuckGo** —— 无 key；始终可用。

> **注意：** 不要把环境变量名（如 `TAVILY_API_KEY`）当作密钥的 credential ref——启动环境会把它们视为只读并遮蔽已保存的值。record 必须是 `{kind: 'api-key'}` 或 `{kind: 'grant'}`，且 key 必须包含 `/`，否则凭据解析失败，所有 set/unset 操作都会抛错。

### Provider 顺序与数量

- **顺序** —— provider 回退顺序可配置；设置页支持拖拽排序，存于 `grant` record（`dsh-web-search/config`）。
- **每次查询结果数** —— 默认 5 条（在原生 `maxResults` 上限以内，不会触发截断提示）。

### 设置页

插件注册了一个独立的设置区块 **Web Search Providers**（id `web-search-providers`），与原生网页搜索配置页分开。在这里可以：

- 保存或清除某个 provider 的 API key / endpoint
- 测试与 provider 的连接
- 拖拽调整回退链顺序

设置页通过插件的 `websearch` Remote 命名空间与宿主通信（`list` / `setKey` / `unsetKey` / `setOrder` / `testProvider`）。

## Providers

| ID | 名称 | 类型 | 激活方式 |
|---|---|---|---|
| `tavily` | Tavily | API key | 设置 Tavily API key |
| `brave` | Brave | API key | 设置 Brave API key |
| `exa` | Exa | API key | 设置 Exa API key |
| `firecrawl` | Firecrawl | API key | 设置 Firecrawl API key |
| `jina` | Jina | API key | 设置 Jina API key |
| `kagi` | Kagi | API key | 设置 Kagi API key |
| `searxng` | SearXNG | Endpoint | 设置 SearXNG 实例 endpoint |
| `duckduckgo` | DuckDuckGo | 无 | 始终可用（默认最后兜底） |

## 架构 / 项目结构

```
dsh-web-search/
├── patch.web.yml            # --patch 覆盖：把 src/index.js 插入 web profile
├── src/
│   ├── index.js             # 静态插件 host 入口：ctx.web provider / remote 操作 / fetch 传输
│   ├── host-core.js         # host 端纯函数（凭据、查询解析、各 provider 请求/响应归一化）
│   ├── interaction.js       # 设置页交互状态机（纯 reducer，有单元测试）
│   ├── remote.js            # websearch Remote 命名空间 host（WebSearchController）
│   └── client/
│       └── bundle.js        # 浏览器端：手写 __ModuleLoader__ factory bundle（无打包器）
├── tests/
│   ├── host-core.test.mjs       # host-core 纯函数测试
│   ├── interaction.test.mjs     # reducer 交互测试
│   ├── remote-contract.test.mjs # Remote RPC 契约测试
│   └── client-bundle.smoke.mjs  # client bundle factory 契约冒烟测试
└── package.json             # exports["./client"] + dsh.client manifest
```

设计要点：

- **Provider 注册表** —— 定义在 `PROVIDER_SPECS`；`resolveCandidates()` 按配置的顺序/排除项排列 provider。
- **回退链** —— `executeSearch()` 依序尝试 provider，先检查凭据可用性，失败或结果为空时回退，全部失败时返回错误结果（不抛出异常）。
- **HTTP 传输** —— host 域内使用原生 `fetch`。
- **`ctx.web` 注入** —— 无条件注册 id 为 `dsh-web-search` 的 provider；是否选用由 web 行配置的 `searchProvider` 决定。未应用 patch 时，原生 `web_search` 会抛出 `WEB_PROVIDER_AMBIGUOUS`（fail-loud）。
- **Host ↔ Client RPC** —— 静态插件使用 Typert Remote 协议：host 方法经 `ctx.typert.register` 注册（`src-json` codec）；client bundle 通过 `ctx.remote.$mount` 自行挂载 `websearch` 命名空间。

## 开发 / 测试

全新 clone：`git clone` → `pnpm install`（从 registry 安装 `@deepseek-ai/*` peer/dev 依赖，见 `.npmrc`）→ 执行下面的命令。

```bash
npm test         # 127 个纯函数测试（零依赖，独立 clone 即可运行）
npm run test:rpc # 12 个环境相关测试（解析独立安装的 @deepseek-ai/*）
npm run prepublishOnly  # 发布前跑满 139 个
```

139 个测试分为两层：

| 层级 | 套件 | 文件 | 数量 |
|---|---|---|---|
| 纯函数 | Host core | `tests/host-core.test.mjs` | 90 |
| 纯函数 | Interaction | `tests/interaction.test.mjs` | 37 |
| 环境 | Remote contract | `tests/remote-contract.test.mjs` | 11 |
| 环境 | Client bundle smoke | `tests/client-bundle.smoke.mjs` | 1 |

**`npm test`** 运行 127 个纯函数测试。这些测试只 import `node:*` 与 `../src/host-core.js` / `../src/interaction.js`——两者都是零依赖的纯 ESM 模块。没有 deepseek-harness 工作区的独立 clone 也能直接运行 `npm test`，无需任何准备。

**`npm run test:rpc`** 运行 12 个环境相关测试。这些测试 import `@deepseek-ai/dsh-typert-protocol` 与 `react`，通过独立安装的 `@deepseek-ai/*` 包解析（`pnpm install` 从 registry 拉取，无需 harness junction）。新 clone 无需 deepseek-harness 工作区即可安装并跑完整测试套件。

**`npm run prepublishOnly`** 在发布前同时运行两层（全部 139 个测试）。所有测试都是纯 Node 脚本——没有测试框架。

## 许可证

[MIT](./LICENSE) © DeepSeek