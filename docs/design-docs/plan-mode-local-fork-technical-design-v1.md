# plan-mode 本地 fork 与"其他"自定义反馈技术设计 v1

## 背景

GitPilot Desktop 的 plan 模式确认弹窗原为全屏 Dialog（`ExtensionUIModal`），由 `@narumitw/pi-plan-mode` 扩展的 `showReadyPlanMenu`/`showPlanModeMenu` 经 pi-tui-kit 的 `runMenu` -> `runDialogMenu` -> `ctx.ui.select` 触发。

产品诉求：

1. plan 确认弹窗改为输入框正上方浮层（对齐 `/` 命令面板）。
2. 浮层提供"其他"输入框，用户可提交自定义反馈，且不打断 plan 模式。

## 根因

- `runDialogMenu`（`@narumitw/pi-tui-kit/dist/runtime.js`）在 RPC 模式下用 `ctx.ui.select(title, options)` 取回 `choice`，再以 `rows.find(row => row.label === choice)` 精确匹配选项。**自定义文本不在预设选项内时 `find` 返回 `undefined`，`if (!selectedRow) continue` 会重新循环、重新弹 select**，形成"提交-重弹"死循环。
- 因此无法在 desktop 侧直接回传自定义 `value` 让原扩展处理，必须让 plan-mode **绕过 runMenu、直接调 `ctx.ui.select`**，自行识别非预设 `choice` 为用户反馈。

## 方案：本地 fork plan-mode

`@narumitw/pi-plan-mode` 是外部 npm 包，直接改 `node_modules` 不持久，且 sidecar 为 Bun 编译二进制、patch 后必须重编才生效。项目无 patch-package 基建。故采用**本地 fork**。

### 1. fork 源码

- 将 `node_modules/@narumitw/pi-plan-mode/src/` 全部 18 个 `.ts` 文件拷贝到 `gitpilot-cli/src/extensions/plan-mode/`。
- 文件间相对 import（`./xxx.js`）不变；外部包 import（`@narumitw/pi-tui-kit`、`@earendil-works/*`）仍走 loader 的 VIRTUAL_MODULES/alias。
- fork 顶部注释标注来源版本（0.44.0），上游升级时需手动合并。

### 2. loader 绑定点改指向本地

`gitpilot-cli/src/core/extensions/loader.ts` 三处绑定点：

- 静态 import：`import * as _bundledPlanMode from "../../extensions/plan-mode/index.ts"`
- `VIRTUAL_MODULES`：`"@narumitw/pi-plan-mode/src/index.ts": _bundledPlanMode`（value 已是本地 fork，key 不变以匹配 curated entry）
- `getAliases`：`const planModeEntry = path.resolve(__dirname, "../../extensions/plan-mode/index.ts")`，alias 条目指向本地

`curated-extension-manifest.ts` 的 `entry`/`version`/`packageName` 不动，保留重复安装保护比对能力。

### 3. fork 内菜单绕过 runMenu

`plan-action-menus.ts` 的 `showReadyPlanMenu`/`showPlanModeMenu` 删除 `defineMenu/runMenu`，改为直接 `ctx.ui.select(title, labels, { signal })`：

- 预设 `choice` 匹配已知 label -> 执行对应 action（`stay/close` 语义保留自原 runMenu action 的 transition）。
- `choice === undefined`（用户取消）-> 当 stay / 关闭菜单。
- 非预设 `choice`（自定义文本）-> 调 `options.refine(choice)`。
- `showPlanModeMenu` 用 `while` 循环，`Configure Plan-mode tools` 后 `continue`（原 action 返回 stay），其余 `return`。

`PlanMenuOptions`/`ReadyPlanMenuOptions` 新增 `refine(feedback: string): void`。

### 4. refine 回调：反馈 + 原计划发给 AI

`plan-mode.ts` 的 `showPlanReadyMenu`/`showPlanMenu` 调用处接入 `refine`：

```ts
refine: (feedback) => {
    const plan = state.latestPlan?.trim();
    sendPlanModeUserMessage(
        `用户对当前计划的反馈：${feedback}\n\n当前计划：\n${plan ?? "（无）"}\n\n请根据反馈修改计划，完成后再次调用 plan_mode_complete 提交新计划。`,
        ctx,
    );
},
```

闭环：`refine` -> `sendPlanModeUserMessage` -> `pi.sendUserMessage` -> 新回合（`before_agent_start` 清 `state.latestPlan`，但原计划已随消息发给 AI）-> AI 修改 -> `agent_end` -> `plan_mode_complete` -> `acceptCompletedPlan` 重设 `latestPlan/awaitingAction` -> `onAgentSettled` -> `showReadyPlanMenu` 再弹。plan 模式 `enabled` 全程保留，不打断。

## Desktop 端协同

- `ExtensionUISelectCard`（`gitpilot-desktop/src/components/ExtensionUIModal.tsx`）在输入框正上方浮层渲染 select 选项，复用 `/` 命令面板的定位与样式。
- 浮层下方"其他"输入框：用户输入文本回车 -> `respondValue(自定义文本)` -> sidecar `ctx.ui.select` 返回该文本 -> fork 识别为 `refine`。
- 点击外部不关闭（动作型 select 是当前回合前置决策，只能 Esc 取消或选择/提交）。
- **"其他"输入框仅对支持自定义 choice 的 plan 确认菜单显示**（`FEEDBACK_SELECT_TITLES = {"Proposed plan ready. What next?", "Plan mode"}`）。其他 plan-mode 菜单（`Plan-mode tools`/`Active implementation plan`/`Saved plan`）仍走 runMenu，自定义 choice 会死循环，故不显示"其他"输入框。

## 边界与风险

- **fork 维护**：上游 `@narumitw/pi-plan-mode` 升级时需手动合并到本地 fork。
- **title 硬编码**：desktop 的 `FEEDBACK_SELECT_TITLES` 与 fork 内 `ctx.ui.select` 的 title 耦合，fork 改 title 需同步 desktop。
- **不改 pi-tui-kit**：所有改动在 plan-mode fork 内，`runDialogMenu` 不动（`showToolSelector` 等其他菜单仍用）。
- **sidecar 重编**：fork 改动需重跑 `gitpilot-desktop/sidecar/build.sh`（Bun 编译二进制）才在桌面生效。
- **custom choice 恰好等于预设 label**：极低概率，按 label 精确匹配当预设处理，可接受。
- **session_start resume 保留 pending 确认**：`plan-mode.ts` 的 `session_start` 处理器原无条件 `menuController.abort()` + `++menuGeneration`，而切换会话（切回既有会话）会触发 `session_start`（reason `resume`），导致用户待响应的 plan 确认 `ctx.ui.select` 被当作旧菜单取消、agent 未确认即继续，且响应因 `sessionGeneration !== menuGeneration` 被判 stale 丢弃。修复：`resume` 时不 abort、不递增 `menuGeneration`，仅 `new`/`fork`/`startup`/`reload` 等真正新会话才重置菜单代次。配合 desktop 前端按会话隔离展示 pending 弹框（切走隐藏、切回恢复），切换会话不再丢失 plan 确认。

## 涉及文件

- `gitpilot-cli/src/extensions/plan-mode/`（新增 fork，18 文件）
- `gitpilot-cli/src/extensions/plan-mode/plan-action-menus.ts`（绕过 runMenu）
- `gitpilot-cli/src/extensions/plan-mode/plan-mode.ts`（接入 refine）
- `gitpilot-cli/src/core/extensions/loader.ts`（3 处绑定点）
- `gitpilot-desktop/src/components/ExtensionUIModal.tsx`（`ExtensionUISelectCard` + "其他"输入框 + `FEEDBACK_SELECT_TITLES`）
- `gitpilot-desktop/src/components/ExtensionUIModal.module.css`（`.selectCard` 等浮层样式）
- `gitpilot-desktop/src/components/InputBox.tsx`（渲染 `ExtensionUISelectCard`、`/` 命令面板互斥、编辑器 `handleKeyDown` 放行）
- `docs/architecture.md`（精选扩展段落补充 fork 说明）
