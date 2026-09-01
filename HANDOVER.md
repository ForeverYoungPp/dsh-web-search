# dsh-web-search — 交接清单（给下一个 agent）

> 状态：A1 替换已完成；T3 打包已落地；T4 清理已完成；独立安装改造已完成；**发布版 `dsh plugin add` 支持已完成**（`cordis.patch.yml` + `dsh.bundle.patch`，`npm pack --dry-run` 验证 10 文件 + 139 测试全绿）。剩余待办：用户重启验证 + 确认 repository 后执行实际 `npm publish`。下一个 agent 的首要任务是启动验证 + 修复 boot 暴露的问题；用户确认 repository 后执行实际 `npm publish`。

## 0. 一句话现状

`D:\development\dsh-web-search` 已是一份可直接用 `--patch` 加载的静态 Cordis 插件源码
（宿主入口 + 手写浏览器 bundle + remote 命名空间），127 纯函数（npm test）+ 12 环境（npm test:rpc）= 139（prepublishOnly）；
发布版 package.json 已就绪（T3 落地，`npm pack --dry-run` 验证 10 文件）；
**还没跑过真实 dsh 启动**，所有与真实运行时（loader 解析、client 启动图、remote 网关）的
交互都属于待验证项。

## 1. 交接任务清单（按序执行）

### T1 启动验证（用户配合，必须由用户从终端启动）
```bash
pnpm dsh web --patch D:/development/dsh-web-search/patch.web.yml   # 在 D:/development/deepseek-harness 源码工作区执行；web 是 --profile web 的别名
```
> 注意：沙箱内跑任何 dsh CLI（含 --dump-config / --help）都会因写
> `C:\Users\fy\.dsh\profiles\web\cordis.yml` 被 EPERM。**不要申请放权重试**，让用户自己启动。
> 当前 http://127.0.0.1:3080 是本会话运行的 harness，重启会杀掉会话——由用户决定时机。

验证点（逐项核，记录结果）：
1. host 日志无本插件 fiber 报错；加载行成功插入（无 `plugin not found` 类警告）
2. 模型工具列表出现原生 `web_search`（对话里直接调用一次，能返回结果即为工具链 OK；已由本插件 provider 链替换 deepseek 后端）
3. 设置侧边栏出现独立页 **Web Search Providers**（settings.section slot id=`web-search-providers`）
4. 页面上 Tavily（已存 key）显示 Active；点 Test 有 HTTP 判定结果（联网则 ok）
5. 浏览器 console 无 `client bundle purity` / `no strict codec` / `namespace` 类报错
6. ctx.web 注入默认**已启用**：启动日志应出现 `[dsh-web-search] native web_search provider registered ... searchProviderId="dsh-web-search"`——A1 替换生效的核验点

预期失败的排查路径（按诊断修，不要推倒重来）：
- 宿主导入失败 → 检查 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-typert-protocol`
  是否在 profile 模块回退里（它们在 dsh 安装闭包内，理论可达；报错时会指明）
- client 半区没进启动图 → 检查 package.json 的 `dsh.client.platform==='web'` 与
  `exports["./client"]` 路径；bundle 文件名必须是 `src/client/bundle.js` 或同步改清单
- remote 调用失败 → 对照 src/remote.js（hostContribution）与 bundle.js（contribution）的
  service/namespace/method/参数名是否一一对应（网关读 typert.local；hostContribution 的
  invocations 必须与客户端 contribution 的 descriptors 镜像）

### T2 启用原生 web_search 增强（已完成）
最终形态：
- **无条件注册** provider id=dsh-web-search（available 恒 true），选择语义完全由 web 行 config 的 searchProvider 控制（resolveProvider configuredId 分支）
- patch 未生效时 native web_search 抛 `WEB_PROVIDER_AMBIGUOUS`（fail-loud，非静默用 deepseek）
- search() 全链失败时按需读取 `web.searchProviders.get('deepseek-official')` 兜底（懒加载，避免 apply 顺序耦合）
- 启动日志打印当前 searchProviderId 供核验
- patch.web.yml 已启用（顶层 `- id: web` override，两个键都写）：
  ```yaml
  - id: web
    config:
      searchProvider: dsh-web-search
      fetchProvider: http
  ```

### T3 npm 打包（已落地，剩余两步在用户侧）
发布版 package.json 已完成：
- name=`@deepseek-ai/dsh-web-search`、version=`0.1.2-alpha.2`、已移除 `private: true`
- 新增 `files=["src/", "README_ZH.md"]`（README_ZH.md 随包发布，npm 只自动含标准 README.md + LICENSE）、
  peerDependencies（4 项）、publishConfig.access=public、repository、engines、prepublishOnly=npm test；
  exports 加了 `./src/*`
- repository 填的是**模板镜像占位**（deepseek-ai/deepseek-harness + packages/web/web-search），
  **待用户确认真实仓库位置**
- 已验证：127 + 12 测试全绿 + `npm pack --dry-run` 出 10 文件（package.json / README.md / README_ZH.md / LICENSE / cordis.patch.yml / src/*）
- 发布版 `dsh plugin add` 支持：`files` 追加 `cordis.patch.yml`；`dsh` 段新增 `bundle: { patch: "./cordis.patch.yml" }`。`dsh plugin add` 经 `exportsPatch()` 检测 `manifest.dsh?.bundle?.patch !== undefined` 认定其为 bundle 并加入 profile 层栈
剩余动作：
1. 用户确认 repository 填真实位置
2. 执行实际 `npm publish`（0.1.2-alpha.2）
> plain JS 直接发布（src/ 原样随包），**不需要 tsdown/typert 生成管线**（本项目已绕开）。

发布命令要点（发布预演实测）：
- **0.1.2-alpha.2 是预发布版，npm 7+ 强制 `--tag`**：裸 `npm publish` 会报 `You must specify a tag using --tag when publishing a prerelease version`，必须显式给 `--tag`
- **发布渠道决策（用户拍板）：按 teams 模式发 `latest` tag**——teams 插件发 latest、宿主钉版本，两边独立。最终命令：`npm publish --tag latest --registry https://registry.npmjs.org/`
- **registry 是 npmmirror（https://registry.npmmirror.com），非官方 npmjs**：发布前必须确认目标 registry + `npm whoami` 登录状态；`@deepseek-ai` scope 应发官方源
- **宿主列车（关键）**：`@deepseek-ai/dsh` 的 dist-tags 为 `{alpha: 0.1.2-alpha.3, latest: 0.1.1-rc.2, next: 0.1.1-rc.2}`——`latest` 是**旧 rc 列车**（无 RemoteError）。裸 `npx @deepseek-ai/dsh web` 或裸 `npm install --global @deepseek-ai/dsh` 会装 0.1.1-rc.2 → RemoteError 崩溃。**npx-latest 假设已被 dist-tags 证伪**。宿主必须显式装：`npm install --global @deepseek-ai/dsh@0.1.2-alpha.2`（alpha 列车，当前 0.1.2-alpha.3）
- 发布前验证命令：`npm publish --dry-run`（prepublishOnly + 打包预演，不发网络）

### T4 收尾清理（已完成）
- `.probe/` **已删除**（过期探针，src/tests 零引用）
- `plugin/` **已保留**（动态版 body 备份，留作恢复基准）
- README 已同步（无条件注册 + 默认 5 条 + 发布版安装方法；无旧测试计数，仅有命令列表）

- 收尾验证 139 测试全绿（127 纯函数 npm test + 12 环境 npm test:rpc）；`npm pack --dry-run` 验证 10 文件含 `cordis.patch.yml`；`dsh.bundle.patch` 字段已添加，`dsh plugin add` 可识别为 bundle。
- 本项目已 `git init`（本地仓库，未 add/commit/设 remote），版本控制归属由 T3 的 repository 决定

## 2. 关键架构事实（除非有强证据，不要推翻）

1. **凭据存储**：records 段 `dsh-web-search/<id>`，`{kind:'api-key'|'grant'}`；不要用 env
   CredentialRef 存 key（环境变量会遮蔽 set）。宿主 realm 下 grant payload 无跨 realm 问题。
2. **provider 注入语义**：无条件注册 provider id=dsh-web-search（available 恒 true）。选择完全由 web 行 config 的 searchProvider 决定（resolveProvider configuredId 分支）；patch 未生效时原生 web_search 抛 WEB_PROVIDER_AMBIGUOUS（fail-loud）。全链失败时按需读取 `web.searchProviders.get('deepseek-official')` 兜底（懒加载，无 apply 顺序耦合）。
   - **结果条数默认**：executeSearch 每查询默认 5 条（`maxResults: params.num_search_results ?? params.limit ?? 5`），在原生 web_search 的 maxResults=8 上限内 → 不触发 capSources 截断提示。
3. **RPC 是手写 Typert remote**（动态版 harness.handle/host.call 是动态插件专属，静态不可用）：
   - 宿主：`WebSearchController extends TypertRemoteService`（`super(ctx,'webSearchController',
     {namespace:'websearch'})` 构造即设置 `this.typertRemote` binding）。宿主侧不模拟
     `@Remote` 装饰器、不依赖 SRC 原型描述符（已装 dsh 运行时中 `remoteMethods()` 读私有
     WeakMap，无法手写写入）；而是把 strict invocations 经 `ctx.typert.register({package,face:'host',
     schemas:[],invocations})` 注册进 `typert.local`（网关 `claimsEndpoint`/`resolveDescriptor`
     的真正数据源）。Codec 全用 `{mode:'src-json'}` 透传；业务错误抛
     `RemoteError(code, message, details)`（`isDSHRemoteError: true` 标记让 remoteErrorOf 识别，rpcFailure 原样过线），网关原样映射为 `{ok:false, error:{code,message,details}}`。
   - 客户端：contribution 手写，strict codec 用透传 `{parse:v=>v}`（TypertSchema 只是接口，无需 zod）；
     apply 里 `await ctx.remote.$mount(contribution)` 自挂 `websearch` 命名空间
   - 以上已按已装 dsh 运行时源码核验。
4. **加载链**：patch.web.yml（本地 --patch）的 insert name 用相对路径 `./src/index.js`，
   按 patch 文件目录锚定转 file://；发布版 cordis.patch.yml 的 insert name 用**包名**
   `@deepseek-ai/dsh-web-search`（从 profile 的 node_modules 解析，`@` 开头需单引号）。
   浏览器半区由 client-modules 向上找 package.json 读 dsh.client + exports["./client"]，
   bundle 是手写 `window.__ModuleLoader__.load({id, factory})` CJS factory（免打包器）。
5. **host-core.js / interaction.js 纯函数不动**（90+37 测试锁定行为）；新逻辑写新文件。

## 3. 陷阱与边界（血泪教训）

- 沙箱内 dsh CLI 一律 EPERM（写 profile 目录）——用户从终端跑
- 当前 GUI 是本会话的 harness——重启 = 杀会话；别自己重启
- 别动 shipped preset / `D:\development\deepseek-harness`（只读参考 + 官方模板来源）
- **bundle 注册 id 需与 package.json name 一致**：改名 `@deepseek-ai/dsh-web-search` 后，
  `src/client/bundle.js` 的 `__ModuleLoader__.load({id, …})` 与 `module.exports.name`
  必须同步改为 scoped 名，否则浏览器半区报 `loaded without registering`
  （smoke 测试 `tests/client-bundle.smoke.mjs` 已断言这两个值）
- 项目里 `src/host-core.js` 保留的 curl/字符串 URL 工具是给既有测试用的；
  运行时传输走 `src/index.js` 的 **fetch**（宿主 realm 有 fetch/URL）
- 本项目已 `git init`（本地仓库，`master` 分支），但**未 add/commit/设 remote**——
  git status 显示全部文件为未跟踪（`??`）；`node_modules/`、`plugin/` 已被
  .gitignore 排除不提交；`pnpm-lock.yaml`、`.npmrc`、`tsconfig.types.json`
  应随源码提交；版本控制归属由 T3 的 repository 字段决定（当前为模板镜像占位，
  待用户确认真实位置）

## 4. 文件索引

| 文件 | 角色 |
|---|---|
| `src/index.js` | 宿主入口：ctx.web 注入 / websearch ops / fetch 传输 |
| `src/remote.js` | websearch remote 命名空间宿主（WebSearchController + invocations via ctx.typert.register） |
| `src/host-core.js` | 纯函数：8 provider 的请求/响应/校验/排序（单测锁定） |
| `src/interaction.js` | 设置页交互 reducer（单测锁定） |
| `src/client/bundle.js` | 浏览器半区：factory bundle + contribution + 设置页 UI（副标题已更新：provider 服务原生 web_search、配置顺序回退、三种激活方式、拖拽排序） |
| `patch.web.yml` | --patch overlay：插 `dsh-web-search` → ./src/index.js + 顶层 `- id: web` override（A1 替换：searchProvider: dsh-web-search + fetchProvider: http） |
| `cordis.patch.yml` | 发布版 bundle patch（随包发布，经 `dsh.bundle.patch` 声明）：`dsh plugin add` 安装时应用，行结构与 patch.web.yml 一致，但 insert name 用**包名** `@deepseek-ai/dsh-web-search`（从 node_modules 解析；相对路径只用于本地 --patch 的 patch.web.yml）+ 顶层 web override |
| `tests/` | host-core.test.mjs / interaction.test.mjs / client-bundle.smoke.mjs / remote-contract.test.mjs |
| `plugin/` | 动态版 body 备份（恢复基准，已保留） |
| `README.md` | 架构与启动说明（已更新） |

## 5. 验证命令

```bash
# 新 clone 流程：git clone → pnpm install → npm test → npm run test:rpc → prepublishOnly（139）
pnpm install       # 独立安装 registry 版 @deepseek-ai/*（0.1.2-alpha.2），无需 harness 工作区
npm test           # 127 纯函数（零依赖，独立 clone 可跑）
npm run test:rpc   # 12 环境相关（解析独立安装的 @deepseek-ai/*，无需 harness 工作区）
npm run prepublishOnly  # 全量 139（发布前必经）
npm pack --dry-run  # 发布前核对随包文件（已验证：10 文件：package.json/README.md/README_ZH.md/LICENSE/cordis.patch.yml/src/*）
```

## 6. 待用户/下一 agent 拍板的问题

1. 用户重启验证（T1）：从终端跑 `pnpm dsh web --patch D:/development/dsh-web-search/patch.web.yml`，逐项核对 6 个验证点，修复 boot 暴露的问题
2. 确认真实 repository 位置（当前 package.json 的 repository 字段是模板镜像占位，指向 deepseek-harness 仓库的 packages/web/web-search 目录——本插件是独立仓库，发布前需改为真实 GitHub 地址），确认后执行实际 `npm publish --tag latest --registry https://registry.npmjs.org/`（0.1.2-alpha.2）
3. 发布后可验证 `dsh plugin --profile web add @deepseek-ai/dsh-web-search`（bundle patch 随包，安装即激活 A1 替换）；沙箱内不可真跑 dsh CLI（EPERM）