# GitPilot CLI 登录流程对齐 Pi 原生 + 移除内置 Provider

## 背景

原 gitpilot extension 自建 `/gitpilot login|logout|status` 命令做设备授权，未接入 Pi 原生 `/login`：gitpilot provider 注册时只给了 `apiKey: "${GITPILOT_CLI_TOKEN}"`、未声明 `oauth`，故 Pi 原生 `/login` 列表看不到平台。同时 `/model` 因 Pi 内置 38 个 provider catalog（anthropic/openai/gemini 等）的存在，选到的是 Pi 自带模型而非平台模型。

## 决策

1. **复用 Pi 原生 `/login`**：把设备授权流程包进 `ProviderConfig.oauth.login`，平台作为 OAuth 登录项出现在原生 `/login` 列表。
2. **删除 `/gitpilot` 命令**（login/logout/status 全删），登录登出统一走 Pi 原生 `/login` `/logout`。
3. **`/model` 只留平台模型**：改 `src/core/model-runtime.ts` 的 `create()`，不加载 `builtinProviders()` 内置 catalog。

## 关键实现

### `platform-model.ts`：gitpilot provider 加 oauth

- `oauth.login(callbacks: OAuthLoginCallbacks)`：复用 `createDeviceAuthorization` / `pollDeviceToken`，通过 `callbacks.onDeviceCode` 把设备码推给 TUI，`openBrowser` 打开授权页，轮询拿到 gpt_ token 后 `saveCliToken` 存 keyring 并返回 `OAuthCredentials { access: gpt_, refresh: gpt_, expires: 远期 }`。
- `oauth.getApiKey(credentials)` 返回 `credentials.access`（gpt_ token），使 Pi 判定 gitpilot provider「已配置鉴权」、进入 `configuredProviders`、出现在 `/model`。
- `oauth.refreshToken` 为 no-op（gpt_ 是长期令牌）。
- gpt_ token 双写：keyring（供 refreshModels/streamSimple 内部 resolveCliToken 取用）+ Pi credential store（OAuthCredentials，供 Pi auth 状态管理）。
- `streamSimple` 不变：仍用 gpt_ token 经 `ensureModelSession` 换短期 gms_ 会话，再改写 baseUrl/apiKey 走平台模型代理。

### `model-runtime.ts`：过滤内置 catalog

`create()` 第 143-155 行原 `builtinProviderCatalog.builtinProviders().map(withRemoteCatalog(...))` 改为 `const providers: Provider[] = []`。`defaultBuiltins`/`builtins` 为空，`providerIds()` 不含内置 id，`recomposeProvider` 对内置 id 走删除分支，`/model` 只剩 extension 注册的 gitpilot provider。

`radius` 动态 provider 不受影响：它走 `configureRadiusProviders` 从 config 独立实例化，不依赖 `builtinProviders()` 列表。

> 选择改源码而非 extension API 的原因：`pi.unregisterProvider()` 只删 extension provider，对 builtins 是 no-op（`recomposeProvider` 会从 `this.builtins` 重建）；无 env/flag/settings 能关闭内置 catalog。改 `create()` 是唯一可靠方式。

### `interactive-mode.ts`：登录后自动选模型

Pi 登录完成后 `completeProviderAuthentication` 会尝试自动选默认 model：原逻辑在 `!hasDefaultModelProvider(providerId)` 时直接报 `no default model is configured ... Use /model`。gitpilot 平台模型 id 动态（从平台拉的数字 id），无法预置进 `defaultModelPerProvider` 表，故登录后撞上该报错。

改该分支：无预置默认模型时，若该 provider 有可用模型则选第一个并 `setModel`，避免登录成功后仍需手选。对有默认模型的内置 provider 无影响（走 else 分支）。

### 删除 `platform-auth.ts`，清理 `index.ts`

设备授权逻辑已并入 `oauth.login`，`/gitpilot` 命令注册删除，`index.ts` 移除 `platformAuthExtension` 调用。

## 已知限制

- **`/logout` 不彻底**：Pi 原生 `/logout` 只删 credential store（OAuthCredentials），keyring 的 gpt_ token 与 `GITPILOT_CLI_TOKEN` 环境变量不会自动清/revoke（ExtensionAPI 无 logout 事件钩子）。下次 `/login` 覆盖；需立即失效则平台侧 revoke。保留 `apiKey: "${GITPILOT_CLI_TOKEN}"` 配置可兼容历史 keyring token 平滑过渡。
- **登录后自动选第一个平台模型**：改 `interactive-mode.ts` 的 `completeProviderAuthentication`，provider 无预置默认模型时选该 provider 第一个可用模型并 `setModel`（原行为是报错提示 `/model` 手选）。
- **改 Pi 核心源码**：`model-runtime.ts` 改动在后续 Pi 升级 merge 时需手动维护（gitpilot-cli 本是 fork，可接受）。

## 验证

- `npm run build` 通过（tsc + copy-assets）。
- `gitpilot exec -p "hi"` 启动链路正常：extension 加载、provider 注册、model-runtime 创建均无崩溃；未登录时报 `No API key found` 并提示原生 `/login`。
- `/login` 出现 GitPilot 平台登录项、`/model` 只显示平台模型、推理走平台，需在 TUI 实测。
