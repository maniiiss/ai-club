# GitPilot Desktop Design Mode 项目级设计规范技术设计 v1

状态：实现中，作为 Design Workspace 的项目级长期约束边界

## 1. 目标与边界

每个本地项目的 Design Workspace 都拥有一份独立的项目级设计规范，用于沉淀品牌风格、设计 Token、组件约束、交互规则和可访问性要求。规范属于项目，不属于某次页面 revision；同一项目后续创建页面、切换页面或恢复历史工作区时继续生效。

规范只影响 `.gitpilot/design/` 内的 Design 产物和 Design Agent 上下文，不直接修改业务源码，也不作为普通文件出现在页面/文件树中。v1 提供结构化查看与编辑，不实现完整的可视化 Design System 编辑器。

## 2. 数据模型

```ts
interface DesignProjectGuidelines {
  version: 1;
  brand: { name: string; tone: string };
  tokens: {
    colors: Record<string, string>;
    typography: Record<string, string>;
    spacing: Record<string, string>;
    radius: Record<string, string>;
    shadows: Record<string, string>;
  };
  components: Record<string, string>;
  rules: string[];
  accessibility: { minContrast: 'AA' | 'AAA' };
  updatedAt: string;
}
```

`design.json` 仍然是页面、文件和 revision 的结构化事实源；`project-guidelines.json` 是项目级规范的事实源。Desktop snapshot 同时携带 `guidelines`，并随项目 bucket 持久化，使项目切换和历史工作区恢复时一次恢复完整上下文。

## 3. Sidecar 落盘与安全

规范固定落盘在：

```text
<project>/.gitpilot/design/project-guidelines.json
```

sidecar 对规范做结构化归一化：限制字段类型、Token 名称和单值长度，未知字段丢弃，损坏或缺失文件回退到默认规范。写入使用临时文件加 rename 的原子替换，并限制文件总大小；规范保存始终在当前项目路径下执行，不允许跨项目或写入业务源码。

`design_create` 和已有 workspace 的 `design_open` 都返回规范。首次创建或其它 Design 持久化操作会生成默认规范文件。`design_save_guidelines` 只接受当前 `projectPath + designId`，保存后返回完整 snapshot，避免 Desktop 维护第二份权威状态。

## 4. Agent 上下文

每次 `design_prompt` 和兼容的 `design_generate` 都从当前项目 snapshot 读取规范，并以内部 JSON 上下文注入 Design Agent。规范不会要求 Agent 在用户可见正文中复述，也不会开放 Shell、Git、任意文件或网络权限。规范更新不新增 revision，下一次 Design run 即使用最新版本。

## 5. Desktop 交互

右侧 Inspector 使用与 Code 模式一致的多 Tab 结构，默认提供“执行过程”“文件”“规范”三个 Tab。规范 Tab 支持：

- 品牌名称、设计语气和最低对比度；
- 颜色、字体、间距、圆角、阴影 Token 的 key/value 编辑；
- 组件规则和逐行设计规则编辑；
- 保存中、保存成功和 sidecar 错误状态。

规范 Tab 不把 `project-guidelines.json` 作为普通文件展示，避免结构化表单和代码编辑形成两套写入入口。保存成功后 snapshot、当前项目 bucket 和历史卡片派生数据保持一致。

## 6. 兼容与验证

旧 workspace 没有规范字段时使用默认规范，不影响旧页面、文件和 revision 恢复。项目 A 与项目 B 的规范分别由各自项目路径解析，不能通过 Desktop bucket 或 sidecar 内存缓存串用。

验证覆盖 Desktop 的规范 Tab、项目切换和历史恢复，Sidecar 的默认值、损坏回退、路径隔离、原子写入和 Agent prompt 注入；交付前运行 Desktop/CLI 构建、相关测试、编码检查和 `git diff --check`。
