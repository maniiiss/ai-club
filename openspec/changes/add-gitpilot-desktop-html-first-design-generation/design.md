## Context

当前 Desktop Design Mode 的权威数据是 `CanvasDesignDocument`，首轮生成通过 Pi `AgentSession` 暴露 `design_apply_patch`、`design_read_scene` 和计划工具。这个模型适合用户提出局部修改，但首轮页面生成需要模型自行决定工具调用顺序，导致首屏等待、布局质量和图标/字体完整性不稳定。

用户提供的 Stitch 类报文呈现了另一种边界：`generate_design_system`、`predict_shared_components` 和 `generate_design_with_components` 是服务端作业；页面先创建尺寸占位，再异步产生 HTML 和 screenshot；多个页面可以并行。截图中的 HTML 使用 Tailwind 配置、Google Fonts 和 Material Symbols，说明 HTML 是浏览器渲染输入，而 screenshot 是派生产物。

本变更把首轮生成调整为 HTML-first pipeline，同时不牺牲桌面端的可编辑性。HTML 预览和 Canvas 镜像是同一 Design Run 的两个输出，不能互相覆盖，也不能把截图误当作可编辑源文件。

## Goals / Non-Goals

**Goals:**

- 首屏先显示稳定的页面尺寸和容器，再按页面/视觉区域逐批出现内容。
- 设计系统、共享组件、页面和区域作业可并行，初始生成不依赖 ReAct 工具循环。
- HTML 在隔离环境中渲染，支持真实 CSS 布局、字体和图标，并产出可下载 HTML 与 screenshot。
- 使用稳定 DOM locator 支持后续精确修改、区域状态展示和真实 AI 光标定位。
- 将 HTML 支持子集转换为 `CanvasDesignDocument`，使常见文本、容器、按钮、图片、图标和布局仍可编辑。
- 保留现有 `design_apply_patch` 作为后续编辑、澄清和修复通道，并兼容已有 draft/revision 事件。
- 所有作业、产物、镜像事务可幂等、可重连、可中断恢复。

**Non-Goals:**

- 不实现完整 HTML/CSS 到 Canvas 的通用编译器；超出支持子集的效果保持为只读 HTML 预览。
- 不把 screenshot 作为 Canvas 内容或正式 revision 的权威来源。
- 不在首轮生成中启用浏览器操作型 ReAct，也不让 HTML 获得本地文件、Shell、任意 Desktop RPC 权限。
- 不在本变更中实现 Figma 文件格式、多人协作或跨设备实时编辑。
- 不以 token 级半截 HTML 或半截 JSON 作为可见 patch；可见增量必须来自已校验的区域产物或 Canvas 事务。

## Decisions

### 1. 采用双输出模型，而不是替换 Canvas

每个页面同时维护：

- `previewHtml`：经过校验的 HTML/CSS 文档，适合 WebView/浏览器快速渲染和下载；
- `canvasMirror`：由 HTML 支持子集或结构化组件描述转换的 `CanvasDesignDocument`，适合选择、Inspector、移动、缩放、旋转和正式 revision。

HTML 是首屏视觉输入，Canvas 是编辑和持久化输入。二者通过 `screenId`、`regionId`、`nodeId` 和 `sourceHash` 关联；新一轮 HTML 生成不会静默覆盖用户已经提交的 Canvas 修改。

备选方案是只保存 HTML 或只让模型生成 Canvas。只保存 HTML 会失去原生节点编辑能力；只生成 Canvas 会继续承受低级坐标和排版质量问题，因此不采用。

### 2. 首轮采用确定性 Pipeline，Pi 只做结构化生成

sidecar 创建 `DesignRun` 并固定以下作业图：

```text
run_created
  -> design_system_job
  -> shared_components_job
  -> screen_plan_job
  -> screen_job (per screen, parallel)
       -> screen_created
       -> region_job (per visual region, bounded concurrency)
            -> region_html_ready
            -> region_canvas_mirror_ready
       -> screenshot_job
  -> run_settled
```

每个模型作业只接收紧凑上下文并返回严格 schema 的 JSON/HTML，不注册 Design 工具；sidecar 负责校验、拆批、持久化和事件发送。这里要明确区分 Pi 的两层能力：

- **Pi Model Runtime**：模型清单、provider、平台短期 token、请求重试、`streamSimple/completeSimple` 和取消信号；这是首轮 Pipeline 必须复用的基础设施；
- **Pi AgentSession**：消息历史、工具注册、tool call/tool result、follow-up 和 ReAct 生命周期；这是后续编辑才需要的能力。

当前 `createAgentSessionServices()` 已经可以只初始化第一层并返回 `modelRuntime`，不创建 `AgentSession`；HTML-first pipeline 应通过一个 `StructuredGenerationGateway` 调用 `modelRuntime.streamSimple()` 或 `completeSimple()`，而不是用“无工具 AgentSession”伪装成流水线。这样既保留 Pi 的 provider/auth/runtime 兼容，又不会引入 Agent loop、工具往返和 Agent settled 语义。`AgentSession` 保留给后续用户修改、需求澄清和质量修复。

结构化调用必须由 Pipeline 自己拥有上下文和生命周期：每个 job 明确输入的 design system、component plan、screen plan、region bounds 和 source hash；模型输出先通过 JSON/HTML schema 校验，失败时最多执行一次同一 job 的格式修复请求，不能自动进入不受控的工具循环。

页面之间并行，单页面区域使用有上限的并发。默认先提交导航、标题、主容器和首屏文字，再提交表单、列表、图标和细节，避免一次生成整页后才展示。

### 3. HTML 产物必须经过受控渲染

sidecar 在保存和渲染前执行 HTML 结构校验：限制文档大小、节点深度、资源数量、脚本标签和内联事件；移除 `javascript:`、任意 iframe、表单外发和未知协议。Desktop 使用隔离 WebView/无头浏览器渲染，注入固定 CSP、资源白名单、超时和取消信号。默认只允许内置字体、图标字典、项目资源和明确允许的静态 CDN；HTML 不获得 Tauri command、RPC bridge、本地路径或 Shell。

下载 HTML 时保留来源信息和资源清单；若外部资源不可用，页面必须仍可渲染并显示资源降级状态，而不是阻塞整个 run。

### 4. 使用稳定 DOM locator，而不是坐标猜测

生成器必须为可见的组件根节点添加：

```html
<section data-gitpilot-node-id="screen.home.hero" data-gitpilot-region-id="hero">
  <button data-gitpilot-node-id="screen.home.hero.primary-cta">...</button>
</section>
```

locator 由 `screenId`、语义组件 ID 和区域 ID 组成，禁止使用随机 CSS class、DOM 序号或像素坐标作为唯一定位依据。sidecar 保存 locator 到 Canvas node 的映射和 HTML `sourceHash`。后续修改先按 locator 找到节点，再产生 HTML 局部变更或 Canvas 事务；找不到 locator 时返回结构化冲突，不允许模糊匹配误改相邻元素。

### 5. 区域事件和旧 patch 事件并存

新增事件：

```ts
design_run_started
design_system_ready
design_components_ready
design_screen_created
design_region_started
design_region_html_ready
design_region_canvas_ready
design_artifact_ready // html | screenshot
design_screen_settled
design_run_settled
```

`design_patch_applied` 保留为 Canvas 镜像事务事件，增加可选 `screenId`、`regionId`、`sourceHash`、`operationIndex`、`dirtyRects` 和 `draftRevisionId`。所有事件继续携带 project/design/request/run/sequence 元数据；旧 sidecar 缺少新字段时 Desktop 退回原有 Canvas patch 归约。

### 6. Canvas 镜像采用支持子集和可解释降级

第一版转换器支持：`section/div` 容器、absolute/flex 常见布局、文本、按钮、输入框、图片、SVG/icon、背景、边框、圆角、透明度和简单阴影。每个转换节点保留 `sourceLocator`、`sourceHash` 和 `editable` 标记。

渐变、复杂滤镜、伪元素、CSS 动画、第三方组件和无法稳定计算的响应式布局不强行转换；这些元素保留在 HTML 预览中，Canvas 对应节点标记为只读，并在 Inspector 显示来源区域。转换错误按区域收敛，不影响其他区域和 HTML 预览。

### 7. 持久化先 journal，后事件和镜像

目录结构扩展为：

```text
.gitpilot/design/<designId>/
├─ design.json
├─ revisions/<revisionId>/
├─ previews/<runId>/<screenId>/<regionId>.html
├─ artifacts/<runId>/<screenId>/screenshot.*
└─ drafts/<runId>/
   ├─ base.json
   ├─ operations.jsonl
   ├─ html-state.json
   └─ checkpoint.json
```

处理顺序固定为：校验作业和 source hash → 追加 HTML/事务 journal → 更新内存 draft → 输出区域事件 → 生成镜像 patch → 输出 Canvas patch 事件 → settle 时原子生成正式 revision。`design_open` 返回 active、orphaned 或无 draft 状态；keep 生成 interrupted revision，discard 删除预览和 journal 并恢复 canonical scene。

### 8. 实时绘制只跟随真实作业

Desktop 以 `region_started` 的区域边界和最后一个已接受节点作为 AI 光标锚点。HTML 区域完成但 Canvas 镜像尚未完成时显示“预览已就绪，正在转换为可编辑图层”；没有区域边界或已取消的作业不绘制路径。RAF scheduler 合并 HTML iframe 更新、Canvas patch、选择变化和 pointermove；普通绘制不调用 `toDataURL`。

### 9. 后续编辑采用 DOM 操作语义，但落地为双写事务

Agent 后续修改可以引用 locator 和语义操作，例如替换文本、调整 class/token、移动组件或替换图标。sidecar 先生成 HTML 局部 patch，再重新计算受影响区域的镜像 Canvas 事务；若用户已经修改同一节点，按 `sourceHash` 检测冲突并进入确认流程。成功后 HTML 预览和 Canvas draft 必须使用同一 operationId，避免两条历史分叉。

## Risks / Trade-offs

- [HTML 与 Canvas 可能出现视觉差异] → 每个区域保存 source hash 和转换状态；截图只由 HTML 生成，Canvas 镜像提供差异提示；正式导出明确选择 HTML 或 Canvas。
- [HTML 沙箱引入 WebView/浏览器资源和内存开销] → 限制并发页面、文档大小、字体和资源数量；窗口不可见时暂停截图和非必要渲染。
- [外部字体/CDN 不稳定] → 内置常用字体和图标字典；资源下载有超时、缓存和降级字体；资源失败只影响对应节点。
- [不受信任 HTML 造成脚本或数据泄漏] → sanitize + CSP + 独立上下文 + 禁止任意桥接；渲染器不复用主窗口的 RPC bridge。
- [DOM locator 失效或模型重复 ID] → sidecar 在保存前全局唯一性校验，冲突时拒绝该区域并要求重新生成；禁止基于位置的模糊修复。
- [镜像转换覆盖用户修改] → sourceHash/baseRevisionId 双重检查；冲突进入 manual review，不自动覆盖。
- [双输出增加持久化和协议复杂度] → 首轮只实现常见 HTML 子集，保留旧 Canvas patch 兼容路径，按区域增量迁移。

## Migration Plan

1. 先增加 `html-first-design-generation` 协议类型、作业状态和 sidecar 文件布局，不改变现有 `design_prompt` 默认行为。
2. 增加 HTML sanitizer、隔离预览容器、资源策略和 DOM locator 校验，使用固定 fixture 验证 HTML/screenshot 可重放。
3. 接入设计系统、共享组件、页面和区域 pipeline；以 feature flag 控制 HTML-first 首轮路径，旧 Pi Agent 路径作为回退。
4. 实现 HTML 支持子集到 Canvas 的镜像转换，并在 Desktop 同时展示预览和可编辑镜像状态。
5. 将真实区域事件接入 RenderScheduler，移除无作业锚点的合成画笔；保留用户手绘和后续 Agent patch。
6. 完成 active/orphaned draft 恢复、keep/discard、interrupted revision 和项目切换回归后，默认启用 HTML-first。
7. 若回退开关开启，新的 HTML 产物保留但不写入正式 Canvas revision；旧 `design_patch_applied` 和 Canvas 渲染继续工作，关闭 HTML WebView 即可回滚展示路径。

## Open Questions

- Desktop 首轮预览采用 Tauri WebView、独立浏览器进程还是 sidecar 截图服务；需要结合安装包体积和 Windows 资源隔离测试决定。
- HTML 与 Canvas 是否在 UI 中并排展示，还是 HTML 只作为短暂生成预览后自动切换到 Canvas；默认建议保留“预览/可编辑”状态切换。
- 需要支持哪些 CSS 布局和组件类型进入第一版镜像子集；建议先覆盖登录页、工作台和表单类页面。
- 外部图像、字体和图标是否允许联网获取；默认仅允许项目资源和内置白名单，用户显式开启后才允许 CDN。
- HTML-first 生成是否需要独立的模型 Profile；建议首轮使用低推理档位和严格结构化输出，后续编辑继续使用当前 Design Profile。
