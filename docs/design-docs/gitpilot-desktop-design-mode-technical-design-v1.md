# GitPilot Desktop Design Mode 技术设计 v1

状态：提案，面向 v1 HTML 原型实现

## 1. 背景与目标

GitPilot Desktop 当前以 Code/Work 两种工作模式承载 Agent 对话、代码执行和项目协作。Design Mode 用自然语言驱动界面设计，首先产出可运行的 HTML 原型，同时覆盖移动端和桌面端预览；后续再演进到多人协作、设计师画板和工程代码交付。

核心目标是建立一条短闭环：

```text
自然语言需求 -> 设计意图确认 -> HTML/CSS/JS 生成 -> 多尺寸预览 -> 继续对话修改 -> 导出/提交
```

v1 不是 Figma 替代品，也不是完整 IDE。它优先验证“描述界面即可得到可交互原型”的产品价值，并保证产物可追踪、可复现、可回滚。

## 2. 产品定位与用户范围

### 2.1 目标用户

- 产品经理：用需求描述快速验证信息架构和交互流程。
- 设计师：用自然语言生成首稿，再进行结构化调整。
- 开发者：获得可运行、可导出的 HTML 原型作为实现参考。
- 业务团队：在评审前生成移动端和桌面端的同一套响应式方案。

### 2.2 v1 成功标准

- 用户在 5 分钟内完成一个可预览的页面原型。
- 同一设计文档可以切换手机、平板、桌面三类视口，不需要重复生成。
- 每次 AI 修改都有可读的变更摘要，并支持撤销/恢复。
- 导出的 HTML 在无 GitPilot 环境下可以本地打开或通过静态服务器运行。
- 生成过程不直接获得渲染层的文件系统、Shell 或网络权限。

## 3. 功能设计

### 3.1 Design Mode 入口

应用模式从 `code | work` 扩展为 `code | work | design`。顶部模式切换保持现有布局和快捷键体系；进入 Design Mode 时保留 sidecar 连接和当前项目上下文，不创建第二套 Agent 生命周期。

### 3.2 设计项目与页面树

左侧面板展示设计项目、页面和状态：

- 设计项目：名称、描述、当前版本、最近修改时间。
- 页面树：页面、状态、弹窗、空状态、错误状态等画板入口。
- 页面操作：新建、复制、重命名、删除、设置为首页。
- 资产区：图片、图标、字体和颜色变量；v1 仅支持项目内文件和已审核的远程资源。

设计项目落盘在当前项目目录的 `.gitpilot/design/<designId>/`，与代码会话分离但可被 Git 追踪。

### 3.3 中央预览画布

中央区域使用受控 iframe 渲染 HTML 原型：

- 设备预设：Mobile 375×812、Tablet 768×1024、Desktop 1440×900。
- 自定义宽高、缩放、横竖屏切换。
- 刷新、全屏、复制预览地址、打开开发者诊断。
- 点击元素后显示稳定的 `data-design-id`，供右侧对话引用。
- v1 仅做可交互预览，不提供自由拖拽、钢笔、矢量编辑和像素级标注。

### 3.4 自然语言设计对话

右侧对话复用现有 ChatView 的流式消息、模型选择、停止和历史会话能力，增加 Design 专属上下文：

- 首次输入：例如“设计一个 SaaS 项目首页，桌面端有侧边栏，移动端改为底部导航”。
- 目标限定：页面、设备、风格、品牌色、可访问性、交互流程。
- 选中元素后追问：“把这个按钮改成主色，并在移动端置底”。
- 变更前显示计划卡片，包含影响页面、文件、风险和预览截图。
- 变更后显示变更摘要、检查结果和撤销按钮。

对话消息需要区分 `design_request`、`design_plan`、`design_patch`、`design_result` 四类，避免把设计变更混入普通代码执行消息。

### 3.5 设计检查与导出

v1 提供轻量检查：

- HTML 结构和资源引用检查。
- 响应式断点检查：目标视口下是否溢出、横向滚动或元素重叠。
- 基础可访问性检查：标题层级、按钮名称、表单标签、对比度提示。
- 交互冒烟：导航、弹窗、表单提交等由设计文档声明的路径。

导出方式：

- 导出单页 HTML 包（HTML/CSS/JS/assets）。
- 导出设计快照 JSON，便于恢复和后续协作。
- 可选生成实现提示文档，不在 v1 直接生成生产级业务代码。

## 4. 设计数据模型

设计文档采用“语义树 + 文件产物”双层模型。语义树用于 AI 理解和跨设备约束，文件产物用于浏览器运行和 Git diff。

```ts
interface DesignDocument {
  id: string;
  name: string;
  description?: string;
  version: number;
  entryPageId: string;
  targetProfiles: TargetProfile[];
  tokens: DesignTokens;
  pages: DesignPage[];
  history: DesignRevision[];
}

interface DesignPage {
  id: string;
  name: string;
  route: string;
  htmlPath: string;
  cssPath: string;
  scriptPath?: string;
  componentTree: DesignNode[];
}

interface TargetProfile {
  id: 'mobile' | 'tablet' | 'desktop' | 'custom';
  width: number;
  height: number;
  orientation?: 'portrait' | 'landscape';
}

interface DesignRevision {
  id: string;
  parentRevisionId?: string;
  prompt: string;
  patch: DesignPatch;
  createdAt: string;
  previewStatus: 'pending' | 'passed' | 'warning' | 'failed';
}
```

每个页面建议包含 `index.html`、`styles.css` 和可选 `main.js`。组件节点必须带稳定 ID、语义角色、响应式约束和可选交互动作。禁止把随机生成的 CSS 类名作为长期引用标识。

## 5. 技术架构

### 5.1 复用现有三进程模型

```text
React Design Workbench
  -> Tauri invoke / event
  -> Rust SidecarBridge
  -> gitpilot --mode rpc (bun sidecar)
  -> Pi Agent Core + Design Extension
  -> Design Artifact Store / Preview Server
```

- React：工作台布局、设备预览、设计状态和变更交互。
- Rust：继续只负责窗口、sidecar 生命周期、IPC 白名单和事件转发。
- sidecar：负责设计上下文组装、Agent 调用、文件读写、HTML 检查和导出。
- Artifact Store：v1 使用项目目录文件系统；后续可替换为对象存储和协作服务。

### 5.2 RPC 扩展

新增命名空间命令，避免把设计语义编码到普通 `prompt/execute_command`：

| 命令 | 作用 |
|---|---|
| `design_create` | 创建设计项目和首个页面 |
| `design_get_snapshot` | 获取设计文档、当前修订和页面树 |
| `design_generate` | 根据自然语言生成或重生成页面 |
| `design_apply_patch` | 应用结构化设计补丁 |
| `design_preview` | 构建预览包并返回受控预览句柄 |
| `design_check` | 执行结构、响应式和可访问性检查 |
| `design_revert` | 回滚到指定修订 |
| `design_export` | 导出 HTML 包或设计快照 |

事件沿用现有 JSONL 事件流，并增加 `design_plan`、`design_patch_ready`、`design_preview_ready`、`design_check_result`、`design_error`。每个事件附带 `designId`、`pageId`、`revisionId`、`sessionFile` 和单调递增 `sequence`，遵守现有会话隔离和恢复规则。

### 5.3 Agent 生成流程

1. 解析用户意图，补齐目标设备、页面范围、风格和交互约束。
2. 输出严格 JSON 的设计计划，不允许直接输出无法审查的整段代码。
3. 将计划转换为组件树和 Design Patch。
4. sidecar 在沙箱工作区应用补丁并生成 HTML/CSS/JS。
5. 运行检查器，构建预览包。
6. 将计划、差异、检查结果和预览句柄推送到 React。
7. 用户确认后提交修订；拒绝则丢弃临时工作区。

AI 不直接修改生产源代码。v1 只允许修改 `.gitpilot/design/` 下的设计产物；需要转为工程代码时，生成独立的“实现建议”供 Code Mode 接管。

## 6. 预览与安全边界

- 预览运行在独立 iframe，开启 `sandbox`，默认禁用顶层导航、弹窗和同源访问。
- 预览包由 Tauri 本地受控协议或本地临时 HTTP 服务提供，不允许页面任意读取宿主文件。
- CSP 默认禁止任意远程脚本；图片、字体和 API 资源必须经过白名单。
- HTML 清洗器移除脚本中的文件系统、进程、危险 URL 和内联事件注入。
- 所有文件写入、导出、删除和覆盖都经 sidecar 权限策略；React 不直接调用 fs/shell。
- 预览页面产生的消息只允许访问约定的 `postMessage` 类型，不能反向调用 RPC 任意命令。

## 7. 与现有模块的落点

建议新增以下前端模块，不破坏现有 Code/Work：

```text
gitpilot-desktop/src/components/design/
  DesignWorkbench.tsx
  DesignPageTree.tsx
  DesignPreview.tsx
  DesignInspector.tsx
  DesignPlanCard.tsx
gitpilot-desktop/src/store/design.ts
gitpilot-desktop/src/design/
  design-types.ts
  design-rpc.ts
  preview-message.ts
```

后续 sidecar 代码建议放在 `gitpilot-cli/src/extensions/design-mode/`，先以扩展方式接入，避免在 RPC 主循环中堆积设计领域逻辑。公共协议类型可从 CLI 的 rpc-types 生成或显式同步到 Desktop，保持编译期校验。

## 8. 分阶段落地方案

### 阶段 0：协议和体验验证（1 周）

- 固化 DesignDocument、DesignPatch、TargetProfile 和检查结果 schema。
- 用 mock sidecar 完成 Design Workbench 静态交互原型。
- 选择 3 个示例：SaaS 首页、移动端任务列表、桌面端数据看板。
- 验收：无真实模型时也能加载快照、切换设备、查看 diff 和回滚。

### 阶段 1：v1 HTML 闭环（3～4 周）

- 新增 `design` AppMode 和三栏工作台。
- sidecar 增加 design extension、项目文件落盘和结构化补丁应用。
- 接入 HTML 预览 iframe、设备预设、基础资源管理。
- 实现 `design_generate / preview / check / export` RPC。
- 验收：自然语言生成首个页面，修改一次，切换手机/桌面并导出可运行 HTML。

### 阶段 2：质量与工程衔接（2～3 周）

- 增加响应式溢出检测、可访问性检查和交互冒烟。
- 增加设计修订时间线、局部回滚、版本对比和预览截图。
- 提供“转为实现任务”入口，把页面结构、tokens 和交互约束交给 Code Mode。
- 验收：设计修订可追踪，Code Mode 能基于快照生成实现计划而不丢失上下文。

### 阶段 3：多人协作基础（4～6 周）

- 设计文档服务端化，建立项目成员、角色和权限。
- 以修订序列和操作日志为基础实现乐观并发、评论和分享链接。
- 预览资源上传对象存储，Desktop 只保留缓存和离线快照。
- 验收：两名用户可同时查看同一设计，冲突可解释、可恢复，不覆盖彼此修订。

### 阶段 4：设计师画板（6～8 周）

- 引入基于节点的画板模型、拖拽布局、对齐、分组、标注和组件库。
- 自然语言操作转为画板命令（移动、复制、改色、改布局），与 Design Patch 共用修订链。
- 增加多人实时光标、评论锚点和审阅模式。
- 验收：画板编辑与 HTML 预览双向同步，AI 操作可撤销且不破坏手工布局。

## 9. 测试与交付门槛

- 前端：`design` store、patch 合并、设备切换、预览消息和快捷键单测。
- 协议：RPC 命令/事件 schema 合约测试，覆盖超时、乱序、重复事件和断线恢复。
- 视觉：固定示例快照做桌面/移动端截图回归。
- 安全：恶意 HTML、外链脚本、路径穿越、postMessage 伪造和导出目录覆盖测试。
- Harness：阶段 1 至少运行 `cd gitpilot-desktop && npm run test && npm run build`，并运行 `python scripts/check_encoding.py`；涉及 sidecar 时增加 RPC spike 和 Windows 源码模式启动验证。

## 10. 风险与决策

| 风险 | 应对 |
|---|---|
| AI 生成结果不可重复 | 固化 schema、模型参数、提示词版本和修订输入 |
| HTML 执行带来本地安全风险 | iframe 沙箱、CSP、资源白名单和 sidecar 权限边界 |
| 设计树与 HTML 演进不一致 | 语义树为主、文件为派生物；每次补丁都记录映射和校验结果 |
| v1 过早引入画板复杂度 | 明确阶段边界，v1 只做预览和对话，不做自由绘制 |
| 后续多人协作难以迁移 | v1 从第一天记录 revision/operation，不把 localStorage 当唯一事实源 |

## 11. 推荐的首批实施任务

1. 新增 `AppMode = 'design'` 与模式切换入口。
2. 建立 `design-types.ts` 和 mock `design` store。
3. 实现 `DesignWorkbench` 三栏布局及设备预览壳。
4. 在 sidecar 增加 `design_create/get_snapshot/generate/preview/check/export` 命令骨架。
5. 实现 `.gitpilot/design/` 文件格式、修订记录和补丁回滚。
6. 接入一个固定模板和一个真实自然语言生成示例，完成端到端验收。

