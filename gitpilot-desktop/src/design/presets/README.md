# Design Presets

每个内置预设使用一个小写 kebab-case 子目录，并包含以下三个 UTF-8 文件：

```text
<preset-id>/
  DESIGN-MANIFEST.json
  DESIGN-HANDOFF.md
  index.html
```

`DESIGN-MANIFEST.json` 的 `schema` 必须是 `open-design.design-manifest.v1`，`entryFile` 必须是 `index.html`，并声明至少一个合法的 `responsiveViewports`。预设由 Desktop 在构建时发现；不要在运行时从网络下载，也不要把 `index.html` 写入用户项目的 Design Workspace。

将外部预设加入本目录前，必须确认其来源、许可证和再分发权限，并在 manifest 中保留 `source`、`license` 和 `attribution` 元数据。

当前目录中的 152 个预设由 `open-design/design-systems/` 迁移而来。需要从相邻的 Open Design 源码重新生成时，在 `gitpilot-desktop/` 下运行：

```text
node scripts/migrate-open-design-presets.mjs
```

迁移脚本保留稳定的预设目录 id，将页面显示名称写为中文，并以源包的 `DESIGN.md`、`components.html` 分别生成 handoff 和受限预览入口。
