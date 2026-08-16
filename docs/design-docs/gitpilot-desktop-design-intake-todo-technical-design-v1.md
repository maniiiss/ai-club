# GitPilot Desktop Design Intake 与待办技术设计 v1

状态：实现中，作为 Design Mode 首轮需求确认和执行进度的正式边界

## 1. 背景与目标

参考设计模式中的分步确认卡片，Design Mode 在真正调用 Pi Design Agent 前先收集最小但高价值的设计输入：页面目标、视觉基调、版式偏好和补充约束。确认完成后将结构化答案注入首条设计请求，避免 Agent 在没有上下文时直接生成首稿。

同一工作区需要把“已确认的方向”和“接下来要完成的工作”显式保留。待办是项目级 UI 状态，不替代 Design revision，也不写入业务源码；它只帮助用户理解 Agent 当前处于哪一个设计阶段。

## 2. 交互流程

```text
用户输入首条需求
  -> 创建/恢复 Design Workspace
  -> Design Intake 1/4 页面目标
  -> 2/4 视觉基调（色板预览）
  -> 3/4 首选版式
  -> 4/4 补充约束（可跳过）
  -> 确认摘要并启动 Pi Design Agent
  -> 待办从“锁定方向”推进到“预览/检查/交付”
```

- 每一步只有一个核心问题，选项使用互斥单选；允许“其他”进入短文本输入。
- “上一步”保留已选值；“跳过”只对非必填步骤可用。
- 需求卡片固定在对话流中，不使用全屏弹窗，避免丢失用户原始描述。
- 首条 Agent prompt 包含原始描述和 `designIntake` JSON 摘要；后续对话不重复注入。

## 3. 前端数据模型

```ts
interface DesignIntake {
  sourcePrompt: string;
  step: 0 | 1 | 2 | 3;
  status: 'pending' | 'confirmed' | 'skipped';
  answers: {
    productType?: string;
    visualTone?: string;
    layout?: string;
    notes?: string;
  };
  confirmedAt?: number;
}

interface DesignTodoItem {
  id: string;
  text: string;
  state: 'pending' | 'active' | 'done';
}
```

`DesignIntake` 和 `DesignTodoItem[]` 跟随项目 bucket 保存，切换项目或恢复历史时一起恢复。它们不是 `DesignSnapshot` 的事实源，不参与 revision hash；sidecar 仍只负责页面文件、revision 和规范。

## 4. 待办推进规则

初次创建 workspace 时生成五项：锁定视觉方向、搭建页面骨架、实现交互状态、响应式适配与多断点验证、预交付检查。确认 Intake 后第一项标记为完成、第二项标记为进行中；每次新的 Design revision 产生后按顺序推进，用户也可以在待办页签手动切换状态或新增/删除条目。

待办状态只表达进度，不会自动触发 Agent。用户点击待办条目不会修改文件；需要修改仍通过对话或明确的设计 patch。

## 5. Pi Agent 插件评估

- `@narumitw/pi-plan-mode`（仓库内已 fork 为 `gitpilot-cli/src/extensions/plan-mode`）：已有 `plan_mode_question` 和计划确认语义，可作为未来 Design Intake 的 Agent-side 触发协议。
- `@narumitw/pi-goal`：适合长流程持续执行，可作为“交付检查”阶段的可选执行器。
- `questionnaire` 与 `todo`：当前是 `examples/extensions` 的 TUI 示例，依赖 `ctx.ui.custom`，不能直接复用到 Desktop RPC 的 React 卡片。
- RPC 已支持 `select/input/editor` 的扩展 UI 请求，但只能逐题返回；本版本因此由 Desktop 承担四步卡片和持久化，Pi 只接收确认后的结构化摘要。这样不把 TUI 组件、session entry 或第三方插件状态误当作 Design 工作区事实源。

后续若需要让 Agent 动态追问，可以新增 `design_intake_question` RPC extension UI 请求，在现有 select/input 协议上增加 `flowId/step/total/options` 元数据；本版本不扩大协议，避免影响 Code/Work 会话。

## 6. 验收与 harness

- Intake 每一步可前进、后退、跳过和恢复；必填项缺失时不能确认。
- 选中的视觉基调在卡片中显示色板，并进入首条 Agent prompt。
- 待办切换项目后不串数据，刷新后仍保留状态。
- Design Agent 仍通过现有 `design_prompt/design_apply_patch` 路径运行，插件不可用时不会阻塞 Design。
- 运行 `cd gitpilot-desktop && npm run test && npm run build`，并运行 `python scripts/check_encoding.py`。
