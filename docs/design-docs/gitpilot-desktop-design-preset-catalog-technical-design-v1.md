# GitPilot Desktop Design Preset Catalog 技术设计 v1

状态：实现中，作为 Desktop 内置 Design 预设的发布、解析和应用边界。

## 1. 目标与边界

Desktop 提供随安装包发布的只读 Design Preset Catalog。预设是设计参考和项目规范的来源，不是用户项目的页面模板：用户不导入 ZIP，Desktop 不请求网络，也不调用后端 Catalog API。

预设选择后只生成并保存当前项目的 `DesignProjectGuidelines`。预设的 `index.html` 只在 Desktop 的 sandbox iframe 内预览，绝不进入 `.gitpilot/design/<designId>/` 的文件树、revision 或导出内容。后续 Design Agent 继续通过既有项目级 guidelines 上下文读取约束，不增加额外 Prompt 协议。

## 2. 发布目录与许可

预设目录位于 `gitpilot-desktop/src/design/presets/<preset-id>/`，`preset-id` 使用小写 kebab-case：

```text
<preset-id>/
  DESIGN-MANIFEST.json
  DESIGN-HANDOFF.md
  index.html
```

`DESIGN-MANIFEST.json` 必须声明 `open-design.design-manifest.v1`、非空标题、`entryFile: "index.html"` 和至少一个合法的 `responsiveViewports`。Catalog 保留 manifest 的 `source`、`license` 与 `attribution` 元数据；未声明许可证统一标记为 `unknown`。任何外部下载的预设在确认来源、再分发许可和署名要求前不得加入目录或安装包。

## 3. 构建期解析

`src/design/design-presets.ts` 使用 Vite `import.meta.glob` 在构建期加载上述三个文件，并以目录 id 汇总。缺少 manifest、handoff、入口文件、非法 schema、标题或响应式视口的目录会被拒绝，同时以 Catalog issue 保留诊断；不影响其它合法预设加载。

解析规则如下：

- CSS 自定义属性是颜色、字体、间距、圆角和阴影的实际视觉值来源；
- `DESIGN-HANDOFF.md` 提供品牌描述、组件规则、布局规则、响应式规则和 Agent Prompt Guide；
- Markdown 出现与 CSS Token 不一致的颜色时记录 warning，仍以 CSS 值写入 guidelines；
- handoff 的组件规则写入 `components`，布局、响应式和 Agent 规则写入 `rules`，再通过既有 `design_save_guidelines` 归一化和持久化。

## 4. 预览隔离

Catalog 将 `index.html` 预先清理后才交给预览 Dialog：移除全部 script、Open Design `data-od-*` 桥接代码、外部 URL、可嵌入文档、刷新跳转和 HTML 事件属性；iframe 使用空 `sandbox` 属性，不授予脚本、同源、弹窗或顶层导航权限。

因此预设预览不能向宿主 `postMessage`、加载第三方资源或写入项目文件。此隔离仅适用于 Catalog 预览，已创建的项目页面预览仍遵循既有 Design Preview sidecar 链路。

## 5. 项目应用链路

```text
内置 presets 目录
  -> Desktop Catalog（构建期发现、校验、解析）
  -> DesignPresetPicker（搜索、预览、选择）
  -> project-guidelines.json（design_save_guidelines）
  -> Design Agent（下次 design_prompt 自动读取）
```

已有 workspace 选择预设时，Desktop 立即调用现有 `design_save_guidelines`，sidecar 返回的新 snapshot 同步刷新右侧“规范”面板和项目 bucket。

尚未创建 workspace 的项目只在该项目 bucket 中暂存预设 id 和结构化 guidelines，不缓存预览 HTML。首次 `design_create` 成功后，Desktop 必须按以下顺序执行：先保存预设 guidelines，保存成功后再发送用户的首次设计请求。保存失败时不得发送首条 prompt，避免 Agent 读取默认规范。

项目 bucket 中的预设 id 只用于 UI 回显；`project-guidelines.json` 是跨重启、跨版本和 Agent 消费的权威数据。没有新增 RPC 命令或后端 Catalog 状态。

## 6. 验证

Desktop 测试覆盖 Catalog 发现、缺文件和非法 schema 拒绝、Token/Handoff 解析、HTML 清理、首次创建的保存顺序，以及已有项目立即保存和 bucket 回写。交付门槛为 `gitpilot-desktop` 的 `npm run test` 与 `npm run build`、仓库编码检查和 `git diff --check`。
