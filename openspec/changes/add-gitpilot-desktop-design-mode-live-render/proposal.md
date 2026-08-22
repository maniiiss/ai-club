## Why

GitPilot Desktop Design Mode 已经能在 CanvasKit 中绘制 CanvasDesignDocument，但 AI patch 仍主要在完整快照更新后才反馈，手工交互和截图编码也可能争用渲染热路径。运行中的草稿直接落到 canonical 文件还会让 sidecar 异常退出后留下没有正式 revision 对应的场景。

## What Changes

- 将 Design 场景拆成正式 committed scene 与 run 内 draft scene，接受的 AI patch 通过事件流立即渲染，只有 completed/interrupted settled 才生成正式 revision。
- 增加 requestAnimationFrame RenderScheduler，合并 AI patch、pointermove、选择变化和资源完成事件，保证一帧最多一次 CanvasKit 绘制/flush。
- 从普通绘制热路径移除 `toDataURL`，改为显式异步 capture；增加 pen transient path，并在 pointerup 生成一个 canonical path transaction。
- 在 sidecar 引入按 run 隔离的 draft journal、checkpoint 和恢复 RPC，支持保留/放弃 orphaned draft。
- AI 运行期间允许选择、平移、缩放和查看 Inspector；结构性手工事务进入 FIFO 队列，在 run 收口后按最新正式 revision 提交。
- 停止任务保留已经接受的内容，并以 `kind=interrupted` revision 收口；没有已接受修改时不新增 revision。

## Capabilities

### New Capabilities

- `desktop-design-live-render`: 定义 Design 增量 patch、帧调度、transient 手绘、draft journal、恢复和 interrupted revision 行为。

### Modified Capabilities

- 现有 Design RPC 与 Desktop Design store 增加可选实时渲染和草稿恢复字段，保持旧 sidecar 的字段兼容。

## Impact

- Desktop：`src/store/design.ts`、`src/rpc/types.ts`、`src/rpc/bridge.ts`、CanvasKit board、renderer 和新增 scheduler。
- Sidecar：`src/modes/rpc/rpc-types.ts`、`rpc-mode.ts`、Design 事件投影与持久化辅助逻辑。
- 测试：Desktop store/renderer/scheduler/board 测试和 CLI Design RPC/恢复测试。
- 文档：同步 Design 实时渲染技术设计、架构总览和设计文档索引。
