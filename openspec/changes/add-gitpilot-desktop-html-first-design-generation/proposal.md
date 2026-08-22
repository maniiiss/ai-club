## Why

当前 Design Mode 把首屏生成交给 Pi `AgentSession` 和 `design_apply_patch` 工具循环，模型需要自行规划、读取场景并分批提交 Canvas 节点。这个路径适合后续编辑，但不适合首轮高质量界面生成：首屏等待时间长，布局、字体和图标质量不稳定，画笔动画也无法对应真实的生成位置。

用户提供的 Stitch 类报文显示，成熟的界面生成链路更接近 HTML-first 的异步作业流水线：先生成设计系统和共享组件，再并行生成页面 HTML，浏览器负责布局与字体渲染，最后独立产出 screenshot。GitPilot 需要接受 HTML 作为首屏预览产物，同时保留可编辑的 Canvas 场景镜像，才能兼顾生成速度、视觉质量和桌面端编辑能力。

## What Changes

- 新增 HTML-first Design Run 编排器，将设计系统、共享组件、页面和视觉区域拆成可并行的结构化作业。
- 新增受控 HTML 预览产物：每个页面可以先返回 HTML/CSS，再由隔离的 WebView/浏览器渲染 screenshot；HTML 不得访问本地文件、Shell、任意网络或 Desktop RPC。
- 新增页面和区域级状态事件，支持页面尺寸、区域开始、HTML 就绪、Canvas 镜像 patch、screenshot 就绪和页面收口的增量展示。
- 新增 DOM 定位协议，元素使用稳定的 `data-gitpilot-node-id`、区域 ID 和组件 ID，后续修改通过结构化定位更新 DOM，而不是随机画笔坐标。
- 新增 HTML 到 Canvas 的受控镜像转换，只将支持的元素类型转换为 `CanvasDesignDocument` 节点；转换失败时保留 HTML 预览并提示不可编辑区域。
- 保留 `design_apply_patch` 和 Pi AgentSession 作为后续编辑、澄清和修复通道；首轮生成默认不启用 ReAct 工具循环。
- 将 AI 画笔/光标绑定到真实区域作业和节点边界；没有真实 patch 时不绘制随机路径。
- 扩展 draft journal、重连、interrupted revision 和 RAF 渲染协议，保证 HTML 预览和 Canvas 镜像的状态可恢复、可幂等。

## Capabilities

### New Capabilities

- `html-first-design-generation`: 设计系统、共享组件、页面 HTML 预览、DOM 定位、区域级作业和 HTML 到 Canvas 镜像的完整协议与生命周期。

### Modified Capabilities

- 无。现有 Canvas 实时渲染能力保留，首轮生成入口改由新能力编排；旧 `design_patch_applied` 事件继续兼容。

## Impact

- `gitpilot-cli/src/modes/rpc/`：新增 HTML-first pipeline、作业调度、HTML 产物安全校验、DOM locator 和 Canvas 镜像转换；调整 `design_prompt` 首轮路径。
- `gitpilot-desktop/src/components/design/` 与 `gitpilot-desktop/src/design/`：新增 HTML 预览容器、区域状态、镜像归约和真实区域光标；继续使用现有 RenderScheduler 和 CanvasKit Board。
- RPC 协议：新增设计系统/共享组件/页面/区域/产物事件，扩展 `design_open`、`design_run_settled` 和 `design_patch_applied` 的兼容字段。
- Sidecar 文件：在 `.gitpilot/design/<designId>/` 下维护 HTML 产物、区域元数据、镜像事务和 draft journal；正式 Canvas revision 仍不可变保存。
- 安全边界：HTML 在隔离容器中渲染，资源使用白名单和超时；禁止脚本读取本地路径、注入 Desktop API 或通过任意 URL 代理访问网络。
- 测试与文档：增加 HTML 沙箱、DOM 定位、区域并发、镜像转换、断线恢复和性能回归，并同步 Desktop Design 架构文档。
