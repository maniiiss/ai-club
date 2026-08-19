# GitPilot Skill 管理技术设计 v1

## 目标与边界

GitPilot Desktop 的设置页管理用户级 Skill 的启用状态和三种工作模式分配。管理范围固定为 GitPilot 用户目录 `skills/` 与 `~/.agents/skills/`；项目 `.gitpilot/skills`、项目/祖先 `.agents/skills` 继续由项目可信度和既有 ResourceLoader 规则控制，不被设置页改写。

Skill 内容仍是本地文件，设置页不编辑、导入或删除文件，仅写入用户级 `skill-scopes.json`。

## 来源登记与配置

安装包内置 Skill 首次安装到用户目录后，在同级 `bundled-skills.json` 登记名称、安装路径和 `SKILL.md` SHA-256。旧版本已存在的目录只有在内容与当前发布资源一致时才迁移为内置来源；内容不同的同名目录视为个人 Skill，避免覆盖或误标用户内容。

`skill-scopes.json` 使用以下 v1 结构：

```json
{
  "version": 1,
  "skills": {
    "skill-name": { "enabled": true, "modes": ["code"] }
  }
}
```

损坏或缺失配置按安全默认恢复：`enabled: true`、`modes: ["code"]`。写入采用同目录临时文件加 rename，避免桌面端读到半写入 JSON。

## 发现与过滤链路

`skill_list` 只扫描两个用户级标准目录，返回脱敏 `ManagedSkill` 摘要（名称、描述、来源、路径、启用状态、模式和手动调用标记）。同名条目按 GitPilot 用户目录优先，并返回冲突诊断。

项目 `.gitpilot/skills` 与项目/祖先 `.agents/skills` 仍被视为项目资源：它们沿用既有项目可信度和 ResourceLoader 发现链路，且都不读取 `skill-scopes.json`，因此团队规则不会被用户的 Desktop 设置覆盖。

每个 AgentSession 的 `DefaultResourceLoader` 接收 `skillMode`：

1. 先按既有规则发现项目、用户、包和临时 Skill；
2. 仅对两个用户级目录中的 Skill 读取 `skill-scopes.json`；
3. 停用或未分配当前模式的用户级 Skill 被移除；
4. 项目级、包级和显式临时 Skill 保持原有加载行为。

因此过滤同时作用于系统提示中的 `<available_skills>` 和 `/skill:name` 命令注册，`enableSkillCommands` 仍是命令注册总开关。

## RPC 与会话刷新

Desktop 通过 `skill_list`、`skill_set_enabled`、`skill_set_modes`、`skill_reload` 管理配置。更新响应携带：

```ts
{ reloadedModes: SkillMode[]; deferredModes: SkillMode[] }
```

空闲模式直接调用已有 `AgentSession.reload()`。如果 Code、任一 Work 会话或 Design 请求正在运行，则只记录待刷新模式，不中断当前工具调用；对应 `agent_settled` 后自动刷新。Design 请求完成后会释放会话，下一次请求也会重新读取最新配置。

## Desktop 交互

设置页新增 Skill 分区，提供搜索、来源筛选、内置/个人分组、启用开关和 `CODE / WORK / DESIGN` 模式按钮。最后一个模式不可取消，停用 Skill 会保留原模式选择。运行中延迟刷新、扫描诊断和空状态均以可访问提示展示；项目级 Skill 的不受控边界在页头明确说明。
