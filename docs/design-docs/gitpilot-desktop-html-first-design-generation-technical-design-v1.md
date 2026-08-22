# GitPilot Desktop HTML-first Design Generation 技术设计 v1

状态：设计中

## 1. 目标

GitPilot Desktop Design Mode 的首轮生成改为 HTML-first：先由受控生成流水线产出设计系统、共享组件、页面和视觉区域 HTML，再由隔离 WebView/浏览器渲染预览和截图；同时将支持的 HTML 子集转换成 `CanvasDesignDocument`，保留桌面端的节点选择、Inspector、移动、缩放、旋转和正式 revision 能力。

本方案解决三个问题：

- 首屏生成必须先出现稳定的页面尺寸和容器，再逐区域出现内容；
- HTML/CSS、字体和图标由浏览器完成布局，减少模型直接生成底层 Canvas 坐标造成的质量损失；
- “画笔”必须跟随真实生成区域和节点，不再绘制无法对应最终内容的随机路径。

## 2. 关键判断

Stitch 类报文中的 `generate_design_system`、`predict_shared_components` 和 `generate_design_with_components` 是服务端作业，而不是 Pi 的 ReAct 工具调用。页面先出现 `Generating Screen...` 占位，随后独立产生 HTML 和 screenshot；截图由 HTML 渲染得到。

因此初始生成和后续编辑需要采用不同执行模式。这里必须区分 Pi 的模型运行时和 Agent loop：

```text
首轮生成：Pi ModelRuntime.streamSimple + DesignRun Pipeline + HTML/Canvas 双输出
后续编辑：Pi AgentSession + DOM locator + design_apply_patch
```

当前 fork 已提供可复用的非 Agent 入口：`createAgentSessionServices()` 初始化 provider、模型清单、认证和扩展，但不创建 `AgentSession`；返回的 `modelRuntime` 提供 `streamSimple()`/`completeSimple()`。HTML-first pipeline 应新增 `StructuredGenerationGateway`，直接调用这一层并自行维护 job 输入、输出校验、取消、重试和事件 journal。不要通过“创建一个没有工具的 AgentSession”来模拟流水线，因为它仍然会引入 Agent 消息历史、Agent settled 和潜在的 follow-up 生命周期。

首轮每个 job 的输入必须显式包含设计系统、共享组件、页面规划、区域边界和 source hash；输出经过 JSON/HTML schema 校验后才能发布。格式错误最多对同一个 job 发起一次修复请求，不能自动退化为工具循环。这样 Pi 仍负责模型、provider、平台 token、请求重试和流式传输，但 DesignRun 自己负责页面作业编排。

## 3. 模块边界

```text
gitpilot-cli/src/modes/rpc/design-run-pipeline.ts
  负责作业图、并发、阶段状态、取消和 settle

gitpilot-cli/src/modes/rpc/design-html-sandbox.ts
  负责 HTML 清洗、CSP、资源白名单、渲染超时和 artifact 保存

gitpilot-cli/src/modes/rpc/design-dom-locator.ts
  负责 data-gitpilot-node-id / region-id、唯一性和 sourceHash

gitpilot-cli/src/modes/rpc/design-html-canvas-mirror.ts
  负责支持子集的 HTML 到 CanvasDesignOperation 转换

gitpilot-cli/src/modes/rpc/rpc-mode.ts
  负责旧协议兼容、RPC 事件输出、draft journal 和正式 revision

gitpilot-desktop/src/design/design-preview-state.ts
  负责 HTML preview、区域状态和 Canvas mirror 的本地归约

gitpilot-desktop/src/design/render-scheduler.ts
  负责 HTML/Canvas/选择/pointer 更新的 RAF 合并

gitpilot-desktop/src/components/design/DesignHtmlPreview.tsx
  负责隔离 HTML 预览和 artifact 状态展示

gitpilot-desktop/src/components/design/DesignCanvasKitBoard.tsx
  负责 Canvas 镜像、transient 几何和可编辑交互
```

HTML 预览不直接读写 `CanvasDesignDocument`；Canvas 镜像也不反向解析 screenshot。两者只通过 `screenId`、`regionId`、`nodeId`、`operationId` 和 `sourceHash` 关联。

## 4. 运行时序

```text
design_prompt
  -> run_created
  -> design_system_job
  -> shared_components_job
  -> screen_plan_job
  -> screen_created (尺寸、Frame、区域边界)
  -> region_started
  -> region_html_ready
  -> region_canvas_mirror_ready
  -> artifact_ready(html/screenshot)
  -> screen_settled
  -> run_settled
```

页面之间允许并行，单页面区域使用有界并发。HTML 就绪不等待 screenshot；Canvas 镜像就绪不阻塞 HTML 预览。事件必须在 journal 成功追加后发送。

## 5. 双输出模型

### 5.1 HTML 预览

HTML 是浏览器渲染输入，适合真实 CSS 布局、字体、Material Symbols 和 Tailwind token。每个页面/区域保存：

- HTML 文本或压缩产物；
- 使用的资源清单；
- DOM locator 索引；
- `sourceHash`；
- 渲染状态和 screenshot 引用。

### 5.2 Canvas 镜像

镜像转换器第一版支持容器、flex/absolute 常见布局、文本、按钮、输入、图片、SVG/icon、背景、边框、圆角、透明度和简单阴影。渐变、复杂滤镜、伪元素、CSS 动画和第三方组件保持 HTML 可见，Canvas 节点标记 `editable: false`。

Canvas 镜像节点必须保留 `sourceLocator` 和 `sourceHash`。当用户修改同一节点或 HTML 发生变化时，sidecar 进行 hash 冲突检查，不能静默覆盖用户修改。

## 6. HTML 安全边界

生成的 HTML 视为不可信内容。保存和渲染前必须：

- 移除脚本、内联事件、`javascript:`、任意 iframe、本地文件协议和未知协议；
- 限制文档大小、节点深度、资源数量和渲染时间；
- 注入固定 CSP，资源仅来自内置资源、项目资源或明确允许的静态 CDN；
- 使用独立 WebView/无头浏览器上下文，不暴露 Tauri command、RPC bridge、本地路径或 Shell；
- 外部字体、图片或图标失败时使用降级资源，不阻塞其他区域。

## 7. DOM 定位协议

组件根节点必须包含稳定语义 ID：

```html
<section data-gitpilot-node-id="screen.home.hero" data-gitpilot-region-id="hero">
  <button data-gitpilot-node-id="screen.home.hero.primary-cta">...</button>
</section>
```

禁止使用 DOM 序号、随机 class 或像素坐标作为唯一定位依据。后续修改先通过 locator 解析目标，再生成 HTML 局部操作和 Canvas mirror 事务；locator 缺失、重复或 `sourceHash` 冲突时必须返回结构化冲突。

## 8. 持久化与恢复

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

处理顺序：校验作业和 source hash → 写入 HTML/事务 journal → 更新内存 draft → 输出区域事件 → 生成 Canvas mirror → 输出 `design_patch_applied` → settle 时原子生成正式 revision。

`design_open` 返回 active、orphaned 或无 draft 状态。`keep` 将已接受内容生成 interrupted revision；`discard` 删除预览、截图和镜像 journal，恢复 canonical scene。

## 9. Desktop 实时反馈

Desktop 的进度光标只允许锚定到 `region_started` 的区域边界、最新节点边界或 dirty rect。没有真实锚点时显示静态状态，不绘制随机路径。HTML preview、Canvas patch、资源完成、选择变化和 pointermove 统一进入 `RenderScheduler`；一帧最多一次场景绘制和一次 flush。普通绘制不调用 `toDataURL`，capture 仅用于导出、上传、截图和 settled preview。

## 10. 迁移与回退

1. 先增加事件、作业和文件结构，旧 `design_patch_applied` 保持兼容。
2. 实现 HTML sanitizer、隔离预览、locator 和 fixture 回放。
3. 接入 pipeline，使用 feature flag 控制首轮 HTML-first；旧 Pi Agent 路径保留为回退。
4. 实现 HTML 支持子集到 Canvas 的镜像转换。
5. 将光标绑定到真实区域，移除无锚点的合成路径。
6. 完成 active/orphaned draft、keep/discard 和 interrupted revision 验证后默认启用。

回退只切换首轮生成路径，不删除已保存 HTML、screenshot 或正式 Canvas revision；关闭 HTML 预览即可继续使用旧 Canvas 渲染。

## 11. 验证重点

- 页面并行作业和区域事件顺序正确；
- HTML 产物可以独立下载、重放和生成 screenshot；
- 恶意脚本、本地路径和任意网络请求被阻断；
- locator 唯一、稳定，source hash 冲突能阻止覆盖；
- 支持子集可转换为正确 Canvas 节点，不支持内容清晰标记为只读；
- 断线、sidecar 重启、keep/discard、取消和旧 sidecar 混布可恢复；
- HTML/Canvas/选择/pointer 更新在一个 RAF 内合并，不在普通绘制热路径调用 `toDataURL`。
