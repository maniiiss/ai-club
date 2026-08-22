# GitPilot Desktop Design Mode 绘制与画板实时渲染技术设计 v1

状态：提案，面向现有 CanvasKit 原生画板的增量实现

## 1. 背景与结论

用户希望在 Desktop 的 Design Mode 中看到“智能体一边绘制，画板一边出现内容”，同时也希望手工拖动、框选和自由绘制时没有等待感。当前代码已经具备实现基础：

- `gitpilot-desktop/src/design/canvas-types.ts` 以 `CanvasDesignDocument` 表达场景；
- `DesignCanvasKitBoard` 以单个 CanvasKit canvas 绘制设计内容；
- `design_patch_applied` 事件携带 `CanvasDesignTransaction`，并以 `isDraft` 标记运行中的增量 patch；
- `useDesignStore.applyStreamEvent` 已能在收到 patch 后归约场景；
- sidecar 为一次 Design run 分配 `draft-${runId}`，在 `design_run_settled` 时才创建正式 revision。

本方案不再引入 iframe、DOM 页面或浏览器布局作为第二套内容渲染器，而是在现有链路上补齐三个边界：

1. **双场景状态**：正式场景 `committedScene` 与运行中草稿 `draftScene` 分离，草稿 patch 可立即渲染但不制造 revision。
2. **双通道实时性**：AI patch 通过事件流进入草稿；手工绘制通过指针临时几何进入渲染帧，pointerup 时才提交一个结构化操作。
3. **帧级调度**：所有 patch、指针移动和资源完成事件都合并到下一帧；一帧最多执行一次 CanvasKit flush，避免 token 事件或 pointermove 直接触发重绘风暴。

目标链路如下：

```text
Design Agent tool call              Human pointer input
        │                                  │
        ▼                                  ▼
  sidecar validate + journal       transient stroke / transform
        │                                  │
        └──────────────┬───────────────────┘
                       ▼
              DraftSceneReducer
              (sequence / operationId)
                       │
                       ▼
              RenderScheduler (RAF)
                       │
                       ▼
         CanvasKit SceneRenderer.flush()
                       │
                       ▼
                 单一画布内容
                       │
              pointerup / run settled
                       ▼
             原子提交正式 revision
```

## 2. 当前实现与问题边界

### 2.1 已有链路

当前 Design run 的主要调用关系是：

```text
DesignShell
  -> useDesignStore.sendPrompt/startPrompt
  -> rpc.designPrompt
  -> rpc-mode.ts:designPrompt
  -> AgentSession + design_apply_patch
  -> applyDesignPatch
  -> design_patch_applied(transaction, isDraft=true)
  -> useDesignStore.applyStreamEvent
  -> updatePatchedSnapshot/applyCanvasOperations
  -> DesignCanvasKitBoard
  -> CanvasSceneRenderer.draw
```

实现边界固定为：`canvas-document.ts` 只负责 canonical Canvas 事务归约，`store/design.ts` 负责 committed/draft/transient/manualQueue 事件状态，`render-scheduler.ts` 负责 RAF 与可见性调度，`canvas-renderer.ts` 只负责 CanvasKit 绘制，`canvas-interaction.ts` 负责 pointercancel/失焦/Escape 的 transient 取消语义；sidecar `rpc-mode.ts` 负责 journal、重放和正式/interrupted revision 原子收口。

`applyDesignPatch` 已经在 sidecar 校验节点树、应用操作、写入设计文件并发送增量事件；因此本方案优先复用 `design_patch_applied`，而不是另造一套并行的模型输出协议。

### 2.2 当前缺口

1. `DesignCanvasKitBoard.drawFrame` 在文档、选择和悬停状态变化时会绘制整个场景；没有统一的 patch 队列和帧调度器。
2. `onPreviewReady` 当前可能跟随每次绘制调用 `canvas.toDataURL`，这会把同步 PNG 编码放进交互热路径。
3. store 以 snapshot 作为主要显示状态，正式场景和运行中草稿的语义没有在类型层明确分开。
4. sidecar 当前会把运行中场景写入 `design.json`。进程在 `settled` 前退出时，磁盘可能留下“没有正式 revision 对应的草稿场景”。
5. `design_apply_patch` 的一个工具调用仍可能包含较大操作数组；即使事件是增量的，模型只有在整个工具调用结束后才会让画布变化。
6. 手工拖动已有临时 transform，但自由路径绘制尚未形成“临时几何 → pointerup 提交”的统一接口。

## 3. 设计原则

- **CanvasDesignDocument 是唯一内容事实源**：React 只承载工具栏、页面树、Inspector、对话和无障碍镜像；设计内容只由 CanvasKit 绘制。
- **接受后才渲染**：只渲染 sidecar 已通过 schema/revision 校验的 patch；不解析模型半截 JSON，也不把未验证的 token 当作场景内容。
- **草稿不等于 revision**：同一 run 的多个 patch 使用稳定 draft 标识，`design_run_settled` 才写入一条正式时间线。
- **输入优先于后台渲染**：指针拖动、选择和文本编辑优先获得下一帧；后台 patch 可以合并，但不能阻塞 pointer 事件。
- **视觉确定性优先**：场景几何不因“出现动画”而改变；最多对受影响节点显示短暂高亮，截图和导出结果始终使用最终几何。
- **失败可恢复**：事件乱序、重复、断线、渲染异常和 sidecar 重启都以 `design_open` 返回的 canonical snapshot 与运行恢复态重新对齐。
- **渲染边界必须可绘制**：sidecar 在 journal 和事件之前把历史 `rectangle`、扁平 `fill`、字符串文本等旧节点归一化为 `CanvasDesignDocument`；Desktop 对旧 sidecar 快照执行同一兼容归一化，不能让缺少 `visible/layout` 的节点静默变成空点阵。

## 4. 运行状态与数据模型

### 4.1 Desktop 草稿状态

在 `DesignState` 中增加显式的运行中草稿字段；`snapshot` 继续表示当前对话可见的权威快照，但 Canvas 绘制优先消费 `renderScene`。

```ts
interface DesignDraftState {
  /** 当前 run 的身份，防止旧项目或旧请求的 patch 进入画布。 */
  runId: string;
  requestId: string;
  baseRevisionId: string;
  draftRevisionId: string;
  scene: CanvasDesignDocument;
  lastSequence: number;
  appliedOperationIds: string[];
  pendingTransactions: CanvasDesignTransaction[];
  /** 受影响节点的短期高亮，不写入 canonical scene。 */
  highlightedNodeIds: string[];
}

interface DesignRenderState {
  committedScene: CanvasDesignDocument;
  draft: DesignDraftState | null;
  /** pointermove 期间的临时变换/路径，不进入 undo、RPC 或 revision。 */
  transient: {
    transforms: Record<string, CanvasTransform>;
    stroke?: { points: Array<{ x: number; y: number }>; style: CanvasStroke };
  } | null;
}
```

业务意图：`draft.scene` 可以在 AI 仍处于 thinking/tool 阶段时不断变化；`committedScene` 只在 settle、用户直接编辑成功提交或明确恢复时更新。停止任务时，已经接受的草稿不能静默丢失，应按“中断的部分完成”生成一条可恢复 revision，或在 UI 明确提供“保留草稿/放弃草稿”选择。

### 4.2 Patch 事件扩展

保留现有 `design_patch_applied` 名称，增加可选字段，不破坏旧 Desktop：

```ts
interface DesignPatchAppliedEvent extends DesignStreamMetadata {
  type: 'design_patch_applied';
  operationId: string;
  pageId: string;
  summary: string;
  transaction: CanvasDesignTransaction;
  affectedNodeIds: string[];
  /** draft-${runId}；正式 revision 仍由 settled 事件产生。 */
  draftRevisionId?: string;
  /** 便于前端统计“第几批已接受绘制”，不是虚假的百分比。 */
  operationIndex?: number;
  /** 可选的 page-local 损坏区域；缺省时前端按节点边界计算。 */
  dirtyRects?: Array<{ x: number; y: number; width: number; height: number }>;
  isDraft?: boolean;
}
```

sidecar 必须按以下顺序处理：

1. 归一化节点类型、可见性、布局、变换、paint 和文本字段；
2. 校验 `baseRevisionId`、page、节点引用、资源引用、操作数量和 operationId 幂等性；
3. 将归一化后的事务追加到 `drafts/<runId>/operations.jsonl`，必要时写 checkpoint；
4. 更新内存 draft scene；
5. 输出 `design_patch_applied`；
6. run settle 时原子写入 canonical `design.json`、正式 revision 和 manifest，并删除 draft journal。

事件输出不能早于 journal 写入，否则 Desktop 已经显示的内容在 sidecar 崩溃后无法恢复。

### 4.2.1 Legacy Canvas 归一化

早期 Agent 可能提交了 `type='rectangle'`、顶层 `fill/radius/stroke`、缺少 `visible/locked/opacity/layout` 或字符串 `text`。这些字段只在边界兼容，不进入新的 canonical 文件：

- `rectangle` 映射为 `rect`；缺少可见性和交互字段时分别默认为 `true/false/1`；
- 根据 `transform` 补齐 absolute `layout`；顶层颜色、描边、圆角和阴影转换到 `paint`；
- 文本转换为完整 `CanvasTextSpec`，至少包含内容、字体、字号、行高、颜色、对齐和换行策略；
- 归一化后再次检查节点类型、`transform`、`layout` 和文本对象；不支持的类型在 journal 之前以节点 ID 报错；
- Desktop 的 `normalizeCanvasDocument` 是旧 sidecar 的最后一道兼容层，若场景节点数大于 1 但解析结果只有页面根节点，则显示重新同步提示而不是静默空画布。

### 4.3 Agent 的批次粒度

不建议解析模型正在生成的半截 JSON。Design Agent 应通过多次 `design_apply_patch` 工具调用形成可接受批次：

- 首批：页面/Frame 与主背景；
- 第二批：导航、标题、主要容器；
- 第三批：按钮、表单、列表和图标；
- 后续批次：文本、状态、间距和细节修正。

每批建议 1～12 个相关操作，单批上限仍由 sidecar 校验。系统提示词应要求“完成一个视觉区域就提交一次 patch”，而不是一次性返回整页所有节点。这样可以在不引入不稳定的 token 级 JSON 解析的前提下获得明显的渐进式绘制效果。

## 5. Desktop 事件归约与帧调度

### 5.1 事件归约

`applyStreamEvent` 继续负责 requestId、runId、sequence 和 operationId 守卫，但 patch 分支改为：

1. 验证事件属于当前 Design 项目和当前 run；
2. 过滤 `sequence <= lastSequence` 或重复 `operationId`；
3. 以 `draft.scene = applyCanvasOperations(draft.scene, transaction.operations)` 归约；
4. 记录 `affectedNodeIds`/`dirtyRects`，将事务交给 RenderScheduler；
5. 不追加正式 revision，不把完整 scene 写进 localStorage；
6. `design_run_settled` 到达后，用返回的权威 snapshot 替换 `committedScene`，清除 draft 队列。

本地归约失败时不能继续绘制“半正确”场景：暂停接收后续 patch，显示“正在重新同步画布”，调用 `design_open` 获取权威 snapshot；同步成功后再按仍有效的 sequence 恢复事件接收。

### 5.2 RenderScheduler

新增 `gitpilot-desktop/src/design/render-scheduler.ts`，职责只有合并更新和安排帧，不持有业务 revision：

```ts
class RenderScheduler {
  private frame: number | null = null;
  private dirty = false;
  private dirtyRects: Array<{ x: number; y: number; width: number; height: number }> = [];

  /** AI patch、资源完成、选择变化和 pointermove 都走同一入口。 */
  invalidate(rects: Array<{ x: number; y: number; width: number; height: number }> = []): void {
    this.dirty = true;
    this.dirtyRects.push(...rects);
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (!this.dirty) return;
      this.dirty = false;
      const rects = this.dirtyRects.splice(0);
      this.onFrame(rects);
    });
  }

  constructor(private readonly onFrame: (dirtyRects: Array<{ x: number; y: number; width: number; height: number }>) => void) {}
}
```

实现时应加上以下约束：

- 一帧内多个 patch 先全部归约，再调用一次 `CanvasSceneRenderer.draw` 和一次 `surface.flush`；
- pointermove 的临时变换直接更新 transient，不等待 RPC；
- AI patch 不能在 React render 阶段同步绘制；
- 画布不可见或窗口最小化时暂停非必要帧，恢复时执行一次完整 redraw；
- `requestAnimationFrame` 不可用时只作为测试环境降级，不在生产环境使用 `setInterval` 轮询。

### 5.3 CanvasKit 渲染层

首个可交付版本允许每帧重绘可见场景，重点先解决调度和状态正确性；当节点数达到约 2,000～5,000 或连续页面超过 20 个时，再启用损坏区域和空间索引。

渲染器内部拆为四层：

1. 工作区层：底色、点阵和悬停光晕；平移不需要重新解析场景；
2. 内容层：`resolveCanvasPage` 结果、节点填充/文字/图片；
3. 临时交互层：拖动中的节点、自由路径、框选矩形；
4. 选择层：选中框、控制点、受影响节点短暂高亮。

每个节点缓存 `resolvedBounds/worldMatrix`、Paragraph 和 Image 资源；节点或祖先布局发生变化时才使对应缓存失效。`dirtyRects` 仅用于裁剪重绘和后续 tile cache，不能改变命中测试所使用的场景坐标。

特别注意：`canvas.toDataURL('image/png')` 只能在用户请求上传、导出、截图或 run settle 后调用，不能放在普通 `drawFrame` 热路径。预览 PNG 编码应在下一帧或 Worker/sidecar 任务中异步完成。

## 6. 手工绘制与 AI 绘制的统一交互

### 6.1 移动、缩放、旋转

现有 pointer 逻辑已经在 pointerup 时提交结构化 transform。统一改为：

```text
pointerdown -> capture pointer + 保存初始 transform
pointermove  -> 更新 transient.transforms + RenderScheduler.invalidate()
pointerup    -> snap / 约束 / 生成一个 CanvasDesignTransaction
             -> applyCanvasTransaction(source='user')
```

拖动中不得为每个 pointermove 创建 revision 或调用 RPC；如果 RPC 提交失败，恢复 pointerdown 前的 committed/draft 场景并提示冲突。

### 6.2 自由路径

新增 `DesignCanvasTool = 'pen'`，pointermove 只追加受限点列并绘制临时 path：

- 使用屏幕距离阈值进行采样，例如最小 2～4 CSS px，避免高频点列导致 WASM 压力；
- 每 1～2 帧做一次简化（Ramer–Douglas–Peucker 或等价算法），但不要在 pointermove 中阻塞；
- pointerup 生成一个 `create_node(type='path')`，路径命令使用 `moveTo/lineTo/quadTo/cubicTo/close` canonical schema；
- pointercancel、窗口失焦和 Escape 丢弃 transient，不产生空节点；
- 颜色、描边宽度和填充从当前 Design token/Inspector 读取。

### 6.3 AI patch 与手工操作并发

v1 采用安全边界：AI run 期间允许选择、平移、缩放和查看 Inspector；结构性手工修改进入 `manualQueue`，在当前 draft settle 后按 FIFO 提交，并以最新正式 revision 重新校验。这样不需要在多个作者同时修改父子树时实现复杂 rebase。

如果产品必须允许“AI 绘制时用户同时拖动节点”，再引入 v2 操作日志：每条操作带 `baseSceneHash` 和 `author`，以节点 ID 为粒度做 rebase；父节点删除、重命名和资源替换冲突必须显示人工决策卡，不能静默覆盖。

## 7. Sidecar 草稿持久化与恢复

建议目录结构：

```text
.gitpilot/design/<designId>/
├─ design.json                  # 最近一次正式/已保留的 canonical scene
├─ manifest.json                # 正式 revision 列表
├─ revisions/<revisionId>/      # 不可变正式快照
└─ drafts/<runId>/
   ├─ base.json                  # baseRevisionId 对应场景摘要/hash
   ├─ operations.jsonl           # 已校验、可重放的事务
   └─ checkpoint.json            # 可选，减少重放时间
```

`design_open` 返回：

- canonical snapshot；
- `execution` 轻量运行态；
- `draft` 元数据（runId、baseRevisionId、operationCount、lastSequence、可选 summary）；active run 同时返回一次性的 `draftSnapshot`，用于重连后从 journal 对应场景继续归约，不写入 localStorage，也不直接传完整 patch 队列。

恢复规则：

1. 有 active draft 且对应 Agent 仍存活：Desktop 显示“正在恢复绘制”，sidecar 继续事件流；
2. 有 active draft 但 Agent 已退出：Desktop 显示“发现未收口草稿”，提供“保留并生成中断版本”或“放弃草稿”；
3. 用户选择保留：sidecar 重放 operations，原子生成 `kind='interrupted'` 的 revision；
4. 用户选择放弃：删除该 draft 目录并重新返回 canonical scene；
5. 任何情况下都不把 draft 内容写入 localStorage，也不使用旧项目的 draft 恢复当前项目。

这比“每个 patch 直接覆盖 design.json，启动时猜测是否已完成”更容易解释，也能避免进程异常造成无 revision 的半成品被误当作正式设计。

## 8. 视觉与交互呈现

截图中的左侧生成进度和中央画板可以映射为：

- 左侧 AI 输出面板显示真实阶段：思考、调用 `design_apply_patch`、已接受第 N 批、等待确认；不显示模型无法提供的百分比；
- 中央画布收到每个 patch 后立即出现受影响节点；对新节点做 120～180ms 的低幅高亮，不改变最终透明度和几何；
- 右侧 Inspector 同步显示当前 draft 节点数、最近事务摘要和校验状态；
- 用户滚动画布或打开历史时，AI 继续后台绘制，但不会强制夺回视口；
- 运行中发送的新需求进入 Design 专属队列；停止会清空未执行队列，但已经接受的 draft 按“中断版本”保留。

## 9. 安全、正确性与性能门槛

### 9.1 正确性

- 事件必须同时匹配 `projectPath/designId/requestId/runId`；
- `sequence` 单调递增，`operationId` 幂等；
- 本地 patch 归约失败时立即重同步，不能继续应用后续 patch；
- `design_run_settled` 是唯一正式 revision 收口事件；
- CanvasKit 渲染、命中测试和 Inspector 使用同一份 resolved geometry；
- draft 与 committed 场景的 revision、undo、导出和上传语义不能混淆。

### 9.2 性能指标

- pointermove 到下一次视觉反馈：P95 ≤ 16.7ms（60Hz）；
- patch 到画布首次出现：P95 ≤ 100ms（不含模型/网络等待）；
- 事件突发 100 条时，渲染帧数按 RAF 合并，不超过可见窗口帧数；
- 普通重绘不调用 `toDataURL`，PNG 截图不阻塞输入；
- 5,000 个节点场景下，先保证可见区域裁剪和节点缓存，再评估 tile cache。

### 9.3 安全

- 继续只允许 Canvas schema 操作，不允许 HTML/CSS/JavaScript/DOM/本地路径；
- draft journal 使用随机 runId 路径和原子写入，拒绝路径穿越；
- 资源加载仍受 MIME、大小和路径白名单约束；
- 预览和导出只读取 canonical scene 或用户明确选择的 revision，不读取任意未验证 transient。

## 10. 分阶段落地

### 阶段 1：实时 patch MVP

- 新增 `DesignDraftState` 和 `RenderScheduler`；
- 保留现有 `design_patch_applied`，补充 `draftRevisionId/operationIndex/dirtyRects`；
- patch 事件按 RAF 合并，settled 替换 canonical snapshot；
- 移除普通 draw 热路径中的 `toDataURL`；
- Agent 系统提示词改为按视觉区域多次提交小 patch。

### 阶段 2：手绘与恢复

- 增加 pen 工具和 transient stroke；
- 引入 `drafts/<runId>/operations.jsonl` 与 `design_open` draft 元数据；
- 支持中断草稿保留/放弃；
- AI 运行期间结构性手工修改进入队列。

### 阶段 3：大场景优化

- 节点 resolved geometry、Paragraph、Image 缓存；
- 可见区域裁剪和空间索引；
- 受影响矩形裁剪、tile cache 和大图异步解码；
- 画布截图与上传改为显式、异步的 capture API。

## 11. 验收测试

### Store / RPC

- 连续 20 个 draft patch 按 sequence 顺序归约，正式 revisions 仍只增加 1 条；
- 重复 `operationId`、重复 sequence、旧 run 和旧项目事件全部丢弃；
- settled 返回权威 snapshot 时覆盖本地 draft，不重复创建消息或 revision；
- 中断 run 能恢复为可解释的 interrupted revision，放弃草稿后回到 canonical scene；
- patch 本地归约失败会触发重同步，不会继续污染场景；
- AI 运行期间手工结构操作按 FIFO 提交并做 revision 校验。

### CanvasKit

- 多个 patch 在一个 RAF 内只 flush 一次；
- pointermove 只改变 transient，pointerup 只产生一个事务；
- pen 工具在 pointercancel/Escape 后不产生空节点；
- 资源加载完成会重新调度一帧，但不重复请求已缓存资源；
- 普通重绘不调用 `toDataURL`，显式 capture 才生成 PNG；
- 渲染与命中测试在缩放、旋转和多选下使用相同 world matrix。

### 原生窗口

- 1100×720、1440×900、800×500 三种窗口尺寸下，AI patch、手绘、右侧面板和输入器互不遮挡；
- 窗口最小化/恢复、项目切换、sidecar 重连不会把其他项目的草稿显示到当前画布；
- `prefers-reduced-motion` 下关闭 patch 高亮动画，但不关闭实时渲染。

## 12. 未决事项

1. “停止”是否默认生成 `interrupted` revision，还是先弹出保留/放弃选择；建议默认保留，降低用户对已见内容丢失的担忧。
2. 是否在 v1 开放 AI 运行期间的结构性手工编辑；建议先排队，等操作日志/rebase 设计完成后再开放并发编辑。
3. 首期是否实现 dirty-rect/tile cache；建议以 RAF 合并 + 全可见场景重绘交付，达到节点阈值后再启用，避免过早增加 CanvasKit surface 管理复杂度。

## 13. v1 落地状态

- Desktop 使用 `RenderScheduler` 合并 patch、pointer 和资源 invalidation，CanvasKit 普通 draw 不再调用 `toDataURL`。
- Design store 维护 committed/draft/transient/manualQueue 运行态，AI 运行期间的结构性手工事务按 FIFO 延后提交。
- Sidecar 运行中的事务写入 `drafts/<runId>/operations.jsonl`，完成或停止时分别生成普通或 `interrupted` revision；`design_open` 与 `design_recover_draft` 负责 active/orphaned 草稿恢复。
- 首轮仍采用可见场景全量重绘；空间索引、dirty-rect 裁剪和 tile cache 留待大场景阶段。
