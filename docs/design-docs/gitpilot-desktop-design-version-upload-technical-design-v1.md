# GitPilot Desktop Design 版本与 Web 上传技术设计 v1

## 1. 目标与边界

Design 模式以本地修订为事实源，支持查看完整历史、基于历史创建新的当前修订，以及把指定修订上传为 GitPilot Web 项目草稿。RPC 均由 Desktop 可见 UI 控件调用，不通过 Design 对话文本或 Agent 工具调用触发。

回滚和上传是有副作用的操作，Desktop 必须先显示确认弹窗。查看历史快照只读，不得改变当前画布、代码面板或当前 revision。

## 2. 本地修订模型

工作区的当前内容继续位于：

```text
<project>/.gitpilot/design/<designId>/
```

每个新修订同时保存不可变完整快照：

```text
<project>/.gitpilot/design/<designId>/revisions/<revisionId>/
  design.json
  snapshot.json
  pages/...
  shared/...
  assets/...
```

`design.json` 包含该时点的文档、页面、文件元数据和时间线；每一个页面、共享或资源文件在同一目录保留完整内容。`snapshot.json` 保存修订 ID 和项目规范。目录一旦出现不再覆盖，保障查看、上传与回滚可以读取相同事实。

`DesignRevision` 新增：

- `parentRevisionId`：生成该修订前的当前修订。
- `sourceRevisionId`：仅回滚修订指向被恢复历史。
- `kind`：`initial`、`patch` 或 `rollback`。

上传关联保存在 Desktop 项目 bucket 中，按 `(platformProjectId, revisionId)` 去重，保存远端版本 ID、版本号、状态及上传时间。

## 3. Desktop 与 Sidecar RPC

| RPC | UI 触发点 | 行为 |
| --- | --- | --- |
| `design_get_revision` | 版本时间线选择项 | 从不可变目录读取快照并返回，不写 current workspace。 |
| `design_revert` | 版本面板确认回滚 | 读取选中快照的文件和页面，创建新的 revision ID、递增版本号并保留全部历史。 |
| `design_upload` | 版本面板确认上传 | 读取选中修订，构建受控 HTML 预览，调用 CLI Web API；成功后记录远端关联。 |

上传失败不会调用 `design_revert`、不会修改当前文件，也不会删除本地修订。Sidecar 在上传前拒绝超过 10 MB 的快照；单文件与路径校验由本地持久化和 Web 服务重复执行。

## 4. Web 服务契约

CLI 上传入口：

```text
POST /api/cli/projects/{projectId}/design-versions
```

请求体含 `designId`、`revisionId`、`name`、`summary`、完整 `snapshot` 及 `previewHtml`。服务端以 `(project_id, design_id, revision_id)` 保证幂等，重复请求返回已有版本。

项目页面接口：

```text
GET  /api/projects/{projectId}/design-versions
GET  /api/projects/{projectId}/design-versions/{versionId}
POST /api/projects/{projectId}/design-versions/{versionId}/activate
POST /api/projects/{projectId}/design-versions/{versionId}/restore
```

`activate` 将同一 `designId` 的其他 `CURRENT` 版本归档，并将目标标记为 `CURRENT`。`restore` 复制历史快照并创建新的 `DRAFT`，不直接更改旧版本状态或内容。

## 5. 权限与校验

- CLI 上传要求 `cli:design:write`，并复用项目可见性判定。
- 新设备授权默认获得 `cli:design:write`；缺少该 scope 的旧 Token 返回重新设备授权提示。
- Web 查询复用项目可见权限。
- Web 激活和恢复要求项目维护权限。
- 快照总大小不超过 10 MB，单文件不超过 2 MB，预览 HTML 不超过 2 MB。
- 文件路径仅允许相对的安全路径；拒绝路径穿越、反斜杠、双分隔符和未支持扩展名。

## 6. 预览安全

Sidecar 只从选中快照内联页面依赖，外部依赖不进入预览。Desktop 和 Web 均以 `iframe srcDoc` 渲染，并使用 `sandbox="allow-scripts"`，不授予同源、导航、弹窗、表单或下载权限。Web 不生成公开分享链接，预览只在项目权限范围内通过详情接口取得。

## 7. 兼容与失败处理

旧工作区首次写入当前修订时会生成该修订的完整历史目录。无法读取且未曾保存完整快照的旧历史修订会返回明确错误，不会以当前文件冒充历史内容。网络、权限、大小、重复上传和路径校验错误均在 Desktop 版本面板内显示；本地历史始终保留。
