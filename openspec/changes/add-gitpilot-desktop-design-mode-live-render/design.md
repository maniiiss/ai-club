## Context

Design Mode 使用 CanvasKit 单画布渲染 CanvasDesignDocument。现有 `design_patch_applied` 已经携带结构化 CanvasDesignTransaction，但 Desktop 将 draft patch 直接并入 snapshot，CanvasKit board 的 draw effect 还会在普通重绘中同步调用 `toDataURL`。sidecar 运行期间也会把 draft 直接写入 canonical `design.json`，无法区分正式版本与未收口运行。

## Goals / Non-Goals

**Goals:**

- AI 每接受一批结构化 patch 后在下一帧显示受影响内容。
- pointermove 与 AI 事件共享帧调度，但不能让后台绘制阻塞手工输入。
- draft 可在 sidecar 重启或 Agent 异常后解释、保留或放弃。
- 停止时保留已接受内容并生成可识别的 interrupted revision。
- 继续以 CanvasDesignDocument 作为唯一内容事实源，不引入 DOM/HTML 第二渲染器。

**Non-Goals:**

- 首轮不实现空间索引、tile cache 或复杂局部重绘；先采用可见场景全量重绘。
- 不允许 AI 运行期间结构性手工修改直接并发 rebase；此类修改只进入 FIFO 队列。
- 不解析模型正在生成的半截 JSON；仍由 sidecar 校验后的工具调用形成 patch 批次。

## Decisions

### 1. Desktop 使用 committed/draft/transient 三层状态

`committedScene` 只代表正式 revision；active run 的 `draft.scene` 由已校验 transaction 归约；pointermove 产生的 transform/stroke 只放在 `transient`。Canvas 视图消费 draft（存在时）叠加 transient，settled 后使用权威 snapshot 清理 draft。

### 2. RenderScheduler 是唯一帧入口

新增 `RenderScheduler`，接收 dirty rect 但不持有 revision 语义。它以可注入的 RAF/cancelRAF 调度 onFrame，一帧合并所有 invalidation；窗口不可见时暂停后台帧，重新可见时完整重绘。

### 3. Sidecar 先 journal、后事件

每个 run 使用 `.gitpilot/design/<designId>/drafts/<runId>/base.json`、`operations.jsonl` 和可选 `checkpoint.json`。patch 通过 schema、revision、节点引用和 operationId 幂等校验后先追加 journal，再更新内存 draft 和输出事件。canonical `design.json` 与正式 revision 只在 completed/interrupted settle 时原子写入。

### 4. 停止与 orphaned draft

`design_abort` 立即停止 Agent；若 draft 有修改，sidecar 生成 `kind=interrupted` revision 并发送 `design_run_settled(reason=interrupted)`。`design_open` 发现没有存活 Agent 的 draft 时返回 orphaned 元数据；`design_recover_draft(action=keep)` 走同一 interrupted 收口，`discard` 删除 journal 并恢复 canonical。

### 5. 手工编辑边界

选择、平移、缩放、旋转和 Inspector 查看在 AI 运行期间即时可用。会改变节点树或节点属性的 transaction 在 store 中排队，run settle 后以最新 revision 重新提交；队列按 FIFO，首个失败会停止继续提交并保留剩余项。

## Data Flow

```text
design_apply_patch -> validate -> journal -> draft reducer -> design_patch_applied
pointermove -> transient -> RenderScheduler
AI/manual/resource invalidation -> RAF -> CanvasSceneRenderer.draw -> surface.flush
settled/interrupt -> canonical revision -> committedScene -> manualQueue FIFO
```

## Compatibility

新增事件字段全部可选，Desktop 对旧 sidecar 缺少 draft 元数据时回退到 committed snapshot；新 journal 恢复能力只对宣告该能力的 sidecar 生效。现有 `revisionId` 和 `isDraft` 字段继续保留。

## Risks / Trade-offs

- 首轮全量可见场景重绘实现简单但大场景成本较高；通过 RAF 合并和节点缓存控制风险，后续再加入空间裁剪。
- interrupted revision 会增加版本时间线条目，但能避免停止任务后用户已看到的内容丢失。
- FIFO 队列降低并发冲突复杂度，但结构性手工修改不会立即改变 canonical scene。
