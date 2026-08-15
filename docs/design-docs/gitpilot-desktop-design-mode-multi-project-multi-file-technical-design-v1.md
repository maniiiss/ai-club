# GitPilot Desktop Design Mode 多项目与多文件技术设计 v1

状态：实现中，作为 Design Mode 多项目与 canonical file manifest 的正式边界

## 1. 目标与边界

Design Mode 从“当前进程内一个随机 designId、固定三文件”升级为“一项目一个 Design Workspace”。设计产物只写入项目内 `.gitpilot/design/`，不直接修改业务源码；页面是预览入口，文件是实际变更单位。

v1 暂不支持同一项目多个独立设计稿，也不支持在 Desktop 直接编辑二进制文件。一个 workspace 同时只有一个 Agent run，但不同项目可以并行运行并在切换后恢复。

## 2. 身份与恢复

```ts
interface ProjectDesignContext {
  projectId: string;
  projectPath: string;
  designId: string;
}
```

`projectId` 由规范化项目路径稳定计算，`designId` 由项目首次创建 workspace 时生成，之后只从 `.gitpilot/design/manifest.json` 恢复。没有 manifest 的项目由 Desktop 展示“创建设计工作区”，不能复用 demo snapshot。

Desktop 以规范化项目路径分桶保存 snapshot、页面/文件选择、消息、队列、审批、预览和执行快照。sidecar 事件必须同时带 `projectId + projectPath + designId + requestId + runId + sequence`；Desktop 先按项目和 designId 路由，再按 requestId 与 sequence 去重。切换项目只改变前台视图，不 abort 原项目的 Design run。

## 3. Canonical 数据模型

`design.json` 是唯一结构化事实源，文件内容由 canonical file manifest 索引：

```ts
interface DesignFile {
  id: string;
  path: string;
  scope: 'page' | 'shared' | 'asset';
  language: 'html' | 'css' | 'javascript' | 'json' | 'image' | 'unknown';
  content?: string;
  hash?: string;
}

interface DesignPage {
  id: string;
  name: string;
  route: string;
  entryFileId: string;
  fileIds: string[];
}
```

页面树只负责切换入口，文件树负责打开代码和定位变更。新页面必须有 HTML 入口；删除入口文件、共享依赖、批量覆盖属于高风险 patch，必须通过审批。页面与文件不再各自保存一份内容。

## 4. 落盘与迁移

```text
<project>/.gitpilot/design/
  manifest.json
  <designId>/
    design.json
    pages/<pageId>/...
    shared/...
    assets/...
    revisions/
    .session/
```

sidecar 在写入前规范化路径，拒绝绝对路径、路径穿越、反斜杠、未知页面和超大文件；`design.json`、manifest 和文件内容使用临时文件 + rename 原子替换。写入前按 `baseRevisionId` 检查当前 revision，不匹配直接返回冲突，不自动合并。删除或重命名会同步清理/更新 canonical 文件索引。

旧三文件快照打开时，将旧顶层 `files` 或页面内嵌 `files` 迁移到 `pages/<entryPageId>/`，生成 `entryFileId`、`fileIds`、文件元数据和新 manifest；迁移结果立即落盘，后续不再读取旧副本。

## 5. RPC 与 patch

现有 Design RPC 名称保留，但所有请求增加项目上下文：`design_open`、`design_create`、`design_get_snapshot`、`design_prompt`、`design_follow_up`、`design_abort`、`design_apply_patch`、`design_preview`、`design_check`、`design_export`。

patch 操作白名单为 `create_file`、`replace_file`、`replace_text`、`rename_file`、`delete_file`。每个 patch 携带 page、base revision、operationId 和受影响路径；sidecar 以 operationId 幂等处理重复请求。Design Agent 没有 Shell、Git、任意文件工具或网络资源，只能通过 Design custom tools 修改 workspace。

## 6. 预览链路

```text
选择项目 -> 选择页面 -> design_preview(projectId, designId, pageId, revisionId)
  -> sidecar 校验入口与依赖 -> 构建受控 previewHandle
  -> sandbox iframe srcDoc -> data-design-id postMessage
```

sidecar 从 canonical manifest 解析页面入口、相对路径和 `shared/` 依赖，将本地 CSS/JS 构建到当前 revision 的受控预览载荷；外部 URL 不直接加载，只返回检查 warning。缺失依赖、页面入口缺失或 revision 冲突返回检查结果/错误。Desktop 只把 previewHandle 放进 `sandbox="allow-scripts"` iframe，不让 iframe 读取宿主项目文件。

## 7. Desktop 工作台

顶部显示项目切换器和 workspace 状态；左侧显示页面树、当前页面文件和共享资源；中间显示预览/代码；右侧保留 Design 对话、工具步骤、审批；底部显示设备尺寸、当前页面、当前文件和 revision。输入区明确展示当前项目、页面、文件及影响范围。

项目切换时先保存旧 bucket，再加载新项目的 manifest/snapshot 和对应 UI bucket。旧项目后台事件只更新对应项目的运行标记，不能覆盖当前项目的消息、文件、队列或预览。

## 8. Landing 项目历史

Desktop 继续使用 `gitpilot-desktop.design-projects` 作为本地项目索引，并为每条记录维护 `hasWorkspace` 与 `lastOpenedAt`。项目被选择但尚未成功创建 Design Workspace 时只保留为可选目录，不进入 Landing 的“项目历史”。历史卡片从项目索引和对应 bucket 派生，只展示能恢复 snapshot 的 workspace，并按最近打开时间倒序排列；损坏或缺失 bucket 不阻断其它项目展示。

点击历史卡片执行 `openProjectHistory(path)`：先保存当前项目 bucket，再恢复目标项目的 snapshot、页面/文件选择、代码/预览 Tab、消息、revision、审批、队列和 execution，随后调用 `design_open(path)` 以 sidecar 快照刷新文件事实源。`resetProject()` 只把 `isProjectStarted` 置为 false 返回 Landing，不删除 workspace bucket 或历史索引，因此当前项目也可以从历史卡片重新进入。旧 bucket 没有 `hasWorkspace` 时，按 bucket、snapshot context 和旧 `isProjectStarted` 标记兼容推断并完成索引迁移。

## 9. 验证门槛

- Desktop：多项目打开、创建、切换、恢复；后台 run、乱序/重复事件、revision 冲突和队列隔离。
- Sidecar：manifest 恢复、两个项目同名文件隔离、原子写入、路径穿越、超大文件、缺失依赖、循环依赖和旧快照迁移。
- Harness：`gitpilot-desktop` test/build、`gitpilot-cli` Design 定向 test/build、编码检查和 `git diff --check`。
- 交付前用原生 Tauri Desktop 验证项目切换、后台运行恢复、页面树/文件树一致性与 iframe 隔离。
