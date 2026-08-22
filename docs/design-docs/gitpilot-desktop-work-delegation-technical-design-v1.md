# GitPilot Desktop WORK 模式能力协同技术设计 v1

状态：提案，先设计不开发

## 1. 背景与结论

GitPilot Desktop 目前有三个应用模式：Code（全量工具的编码 Agent）、Work（无 Shell 的日常任务助手）、Design（设计 Agent）。三个模式共享同一个 bun sidecar 进程（`gitpilot-cli/src/modes/rpc/rpc-mode.ts`），但会话、cwd、工具白名单和落盘位置全部刻意隔离，**不存在任何模式间通信机制**。

同时产品正在经历一次定位调整：Design 模式正在改造为 CanvasKit 专业设计渲染器（见 `gitpilot-desktop-design-canvaskit-native-renderer-technical-design-v1.md`），HTML 原型产物不再由 Design 模式承担，而是转移到 Work 模式生成。

本设计让 Work 模式在保持"日常助手"定位的前提下获得跨模式能力，**结论按能力类型拆分为两条路径**：

- **HTML 原型生成/迭代 = WORK 自建（内置技能）**。对齐 Office 技能"内置 Skill + 受控本地生成工具"的既有模式（见 `gitpilot-work-office-skills-technical-design-v1.md`），在 WORK 会话内直接完成，上下文连续。
  不走委托的理由：v1 场景不需要执行环境（无构建、无测试、无 Shell、无 Git），受限 CODE 子会话能做的事（任务区内读写文件）WORK 会话本来就能做，委托只换来一份代码导向提示词，却要付出双 Agent 循环、委托管理器、事件路由与恢复机制的复杂度；且"改成深色主题"式迭代在同会话内上下文连续，体验严格优于每次委托重新打包意图。
- **专业设计稿生成/迭代 = 委托 DESIGN 子会话**。CanvasKit 渲染器、design_* 工具、结构化设计文档、项目设计规范是 WORK 无法自建的独立子系统，委托是唯一路径。HTML 原型移出后，DESIGN 子会话按结构化设计文档方向演进，两者互不重叠。
- **真·编码能力（bash / Git / 项目目录）= 协议已设计，未来实现**。当任务需要 WORK 自身不具备的执行环境时，"按会话隔离安全策略"（受限子会话跑 Shell、主 WORK 会话保持无 Shell 边界）才换来对等价值；届时直接实现，WORK 侧协议零新增。

## 2. 目标与非目标

### 2.1 目标

- WORK Agent 能在会话内直接生成/迭代 HTML 原型：内置技能注入编码规范，复用现有文件工具落盘，对话内 iframe 沙箱预览，迭代不换会话。
- WORK Agent 能经 `delegate_design` 阻塞式工具调用委托 DESIGN 子会话生成/迭代专业设计稿；设计稿导出物（PNG 等）落任务区，可嵌入 WORK 的文档/PPT 产出。
- 委托过程对用户透明可见：委托卡片展示流式进度、文件产出，支持中止。
- 委托协议按 `capability` 字段泛化设计，未来 `delegate_code` 直接复用，不改协议。
- 委托深度固定 1 层，子会话无法再发起委托，避免权限放大。

### 2.2 非目标

- v1 不实现 `delegate_code`（HTML 原型走技能自建；完整协议见第 10 节未来扩展）。
- v1 不做任务内多子会话并行（阻塞式工具调用天然串行）。
- v1 不做审批门禁（DESIGN 子会话沿用 design_* 白名单，无高风险操作）。
- v1 不做 Work->Code 主会话上下文互通，委托只携带 prompt 与显式上下文引用，不共享会话历史。
- v1 不实现多人协作房间（另行设计，见 `gitpilot-desktop-work-room-collaboration-technical-design-v1.md`）。
- 不改变三模式现有的隔离原则：Code 主会话、Work 任务会话、Design 会话的边界保持不变。

## 3. 现状与约束

```text
AppMode = 'code' | 'work' | 'design'          (gitpilot-desktop/src/store/app-mode.ts)
三个工作台常驻挂载，aria-hidden 切换         (gitpilot-desktop/src/App.tsx)

sidecar (rpc-mode.ts) 内三组会话并行共存：
  session          - Code 主会话，cwd = 项目目录，全量工具
  workSessions     - 每任务一个 AgentSession，cwd = 任务工作区，excludeTools: ["bash"]
  designSessions   - 每 designId 一个，noTools: "builtin"，design_* 白名单工具
```

关键约束：

1. **模式是前端概念**：sidecar 不感知"当前模式"，只是并行维护三组会话集合。跨模式能力必须建在 sidecar 的会话层，而不是 UI 层。
2. **单一 model 槽位**：三模式共享 sidecar 的 `session.model`，切换时靠 `applyModeModel` 恢复各模式上次选中模型。委托子会话必须使用创建时捕获的 model 快照，独立持有。
3. **DESIGN 改造进行中**：`delegate_design` 的协议必须面向"结构化设计文档 + designId"，不绑定 HTML 产物形态，保证 CanvasKit 渲染器落地后 WORK 侧零改动。
4. **安全边界**：Work 模式现有边界是无 Shell、无任意网络、联网研究仅经 `/api/cli/work/research`。任何新路径不得弱化该边界。
5. **技能化先例**：Office 三件套已验证"内置 Skill + 受控本地生成工具"模式，HTML 原型技能直接复用该框架，不新建机制。

## 4. 总体架构

```text
WORK 会话
 ├─ 路径一：HTML 原型（自建，不新增会话）
 │    Work Agent 激活 html-prototype 内置技能
 │      -> 会话内文件工具写入 workspaces/<taskId>/prototype/<名称>/
 │      -> 既有文件事件 -> 前端原型预览卡片（iframe sandbox）
 │      -> 迭代 = 同会话直接读改文件，上下文连续
 │
 └─ 路径二：专业设计稿（委托 DESIGN 子会话）
      Work Agent 调用 delegate_design(prompt, designId?)（阻塞式工具）
        -> sidecar 委托管理器创建 DESIGN 子会话（复用 designSessions 机制）
        -> 事件流 work_delegate_* -> 前端委托卡片实时展示
        -> 产物落 .gitpilot/design/<designId>/；导出物落任务区 assets/
        -> 完成后 { summary, artifacts } 回流 Work Agent，对话继续
```

路径二执行时序：

```text
Work Agent 调用 delegate_design(prompt)
  -> 委托管理器：生成 delegateId、创建 DESIGN 子会话、发射 work_delegate_started
  -> 子会话运行，work_delegate_delta / work_delegate_tool / work_delegate_file 旁路推前端
  -> 子会话结束：work_delegate_complete { summary, artifacts }
  -> 委托工具将 { summary, artifacts } 作为工具结果返回 Work Agent
  -> Work Agent 基于结果继续对话
```

委托工具实现运行在 sidecar 进程内，直接调用委托管理器，不走 RPC 往返。sidecar 侧新增独立模块 `work-delegate.ts`（创建/中止/状态表），rpc-mode.ts 只负责把它的事件接入现有 RPC 事件通道，避免继续膨胀已有近 3000 行的 rpc-mode.ts。

## 5. HTML 原型技能（路径一：自建）

### 5.1 技能组成

- **技能定义**：对齐 Office 技能模式，注入 HTML/CSS/JS 编码指导--单文件优先（index.html 内联样式脚本，资源走相对路径）、移动/桌面视口适配、无外部网络依赖（资源本地化，预览不请求外网）、可访问性基线（语义标签、对比度）。
- **工具**：复用 WORK 会话现有文件读写工具（与 Office 技能同一生成通道），落盘 `workspaces/<taskId>/prototype/<原型名>/`。
- **模式分配**：经现有 SkillMode 机制分配给 work 模式，默认随 Desktop 内置技能打包。
- **激活**：用户意图为"画页面 / 出原型 / 生成 HTML"时由 Agent 自主启用，与 Office 技能共用激活框架。

### 5.2 预览与迭代

- 前端依据文件事件检测 `prototype/` 目录下的 `.html` 产出，在对话流插入**原型预览卡片**：iframe srcDoc + sandbox（沿用 DESIGN 模式现有 iframe 沙箱配置），复用 `work_file_*` 的下载 / 发送到对话能力。
- 迭代在同一 WORK 会话内直接读取已有原型文件修改，不产生新会话、不重打包上下文。
- 目录约定：`workspaces/<taskId>/prototype/<原型名>/index.html`（多页原型为同目录多个 html + 共享 assets/）。

## 6. DESIGN 委托（路径二：delegate_design）

### 6.1 工具与子会话

- `delegate_design` 工具注册进 `createModeExtensions("work")` 的工具集：参数 `{ prompt, designId? }`，**阻塞式执行**（工具调用期间子会话运行，天然任务内串行）。
- 子会话完全复用 designSessions 的创建逻辑：`DESIGN_SYSTEM_PROMPT` + `design_*` 白名单工具 + `.gitpilot/design/<designId>/` 落盘。
- `designId` 可传入（迭代已有设计稿）或新建。
- 协议面向结构化设计文档（`CanvasDesignDocument` 方向），不绑定 HTML 产物形态；CanvasKit 渲染器落地后，子会话使用的工具集自然切换，WORK 侧协议零改动。
- 设计稿导出（PNG 等）写入任务区 `workspaces/<taskId>/assets/`，供 WORK 的文档/PPT 产出引用。
- **model 快照**：子会话创建时捕获当前 WORK 会话使用的 model，独立持有，不受 `applyModeModel` 切换影响。
- **防递归**：delegate 工具只注册进 Work 模式 AgentSession 的工具集，DESIGN 子会话的工具集天然不含它，委托深度固定为 1。
- **中止**：`work_delegate_abort` 终止子会话，工具调用以 `aborted` 结果返回 WORK Agent，已产出文件保留。

### 6.2 委托管理器

- sidecar 新增模块 `work-delegate.ts`：创建、中止、状态表 `Map<delegateId, DelegateState>`（进行中/已完成/失败/已中止）。
- 状态持久化到任务工作区的轻量 JSON，sidecar 重启后恢复检查将运行中条目标记 `interrupted`，产物文件不丢。

## 7. RPC 协议

新增命令与事件全部对齐现有 `work_*` / `design_*` 的命名与载荷风格（见 `gitpilot-desktop/src/rpc/types.ts`）。

### 7.1 命令

委托工具运行在 sidecar 进程内，创建子会话不需要 RPC 命令；RPC 层只需要 UI 侧的控制与恢复入口：

```ts
// 中止进行中的委托（委托卡片"中止"按钮触发）。
work_delegate_abort: {
  delegateId: string;
} => {}

// 断线/重启后恢复委托状态快照（Work 会话恢复时随任务数据一并请求）。
work_delegate_list: {
  taskId: string;
} => {
  delegates: WorkDelegateSnapshot[];   // 状态表投影：delegateId/status/summary/artifacts
}
```

### 7.2 事件

```ts
work_delegate_started:   { delegateId, taskId, capability, sessionId }   // v1 capability 恒为 'design'
work_delegate_delta:     { delegateId, delta }                    // 子会话文本输出流
work_delegate_tool:      { delegateId, toolName, summary }        // 工具调用摘要
work_delegate_file:      { delegateId, path, kind }               // 文件产出（相对任务区路径）
work_delegate_complete:  { delegateId, summary, artifacts[] }     // artifacts: {path, kind, preview?}
work_delegate_error:     { delegateId, message, code }
```

`artifacts[].kind`：`'design-doc' | 'design-export' | 'file'`，前端按 kind 决定卡片呈现（缩略图跳转 / 文件条目）。HTML 原型属于路径一，走普通文件事件与原型预览卡片，不占用委托事件。委托事件与 `work_delta` 等 Work 会话事件并存，靠 `delegateId` 区分。

## 8. 前端（Work UI）

### 8.1 状态

`work.ts` store 新增 `delegates` 状态表（IndexedDB 持久化，对齐 Work 任务现有持久化方式）：

```ts
interface WorkDelegate {
  delegateId: string;
  taskId: string;
  capability: 'design' | 'code';   // v1 仅 'design'，'code' 为未来扩展预留
  status: 'running' | 'complete' | 'error' | 'aborted' | 'interrupted';
  summary?: string;
  artifacts: WorkDelegateArtifact[];
  startedAt: number;
}
```

### 8.2 卡片

- **WorkDelegateCard（委托卡片）**：运行中流式展示 delta 文本 + 工具调用摘要 + 中止按钮；完成后按 artifacts kind 呈现--
  - `design-doc`：缩略图 + "在 DESIGN 模式打开"按钮（切换 appMode 并定位 designId）。
  - `design-export` / `file`：文件条目（下载/插入产出）。
- **原型预览卡片**：见 5.2，iframe srcDoc + 下载，挂在产出该文件的助手消息内。
- 用户始终停留在 WORK 模式完成闭环，跳转 DESIGN 编辑是显式可选动作。委托不改变 `AppMode` 语义。

## 9. 错误处理

| 场景 | 行为 |
|---|---|
| DESIGN 子会话失败 | `work_delegate_error`，卡片展示错误；Work Agent 收到错误结果，可自主重试或换方案 |
| 用户中止 | 子会话终止，工具返回 `aborted`；已产出文件保留在任务区 |
| sidecar 重启 | 内存态丢失；恢复时 `work_delegate_list` + 任务区 DelegateState JSON 将运行中条目标记 `interrupted`，产物文件不丢 |
| 原型技能路径异常 | 无子会话，风险仅在文件层面：会话失败时已写入文件保留，Agent 重试即可 |
| 预览安全 | iframe 沿用 DESIGN 模式 sandbox 配置（无脚本网络访问等） |
| 委托期间切换模式 | 不影响：子会话在 sidecar 内运行，卡片状态由事件驱动，回到 WORK 可见 |

## 10. 未来扩展：delegate_code（协议已定，暂不实现）

- **触发条件**：任务需要 WORK 自身不具备的执行环境（bash、Git、项目目录访问）时实现。
- **工具**：`delegate_code(prompt)` 阻塞式调用；子会话 cwd 锁定目标目录（任务区或用户显式确认的项目目录），工具集由集中常量 `workDelegateToolPolicy` 定义（起步排除 bash/Git/web，扩展即唯一改动点；策略含 bash 时同步引入 `approval_required` 审批流复用）。
- **协议零新增**：`capability: 'code'` 直接复用第 7 节命令与事件，防递归与 model 快照规则同 6.1。
- **任务内并行**：协议已按 delegateId 路由事件，放开并发只需去掉阻塞式工具的串行约束并处理文件冲突。

## 11. 验收场景

1. "帮我画个登录页 HTML 原型" -> WORK Agent 激活原型技能，会话内直接产出 -> 原型预览卡片 iframe 预览，文件落任务区 prototype/ 目录。
2. "改成深色主题" -> 同一 WORK 会话内直接读改原型文件，无新会话、无上下文重打包。
3. "出两版首页视觉方案" -> `delegate_design` -> 委托卡片流式展示 -> 完成后缩略图 + 跳 DESIGN 模式编辑。
4. "用设计稿导出图生成提案 PPT" -> design-export 产物落入任务区 assets/，Office 技能引用该文件。
5. 中止进行中的委托、子会话失败后 Work Agent 重试、sidecar 重启后卡片标记中断且产物仍在--三种异常路径均符合第 9 节定义。
