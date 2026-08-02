# GitPilot Desktop UI replacement baseline

记录时间：2026-08-02

## 工作区边界

本次变更允许修改：

- `gitpilot-desktop/src/App.tsx`
- `gitpilot-desktop/src/components/desktop/**`
- `gitpilot-desktop/src/components/workbench/**`
- `gitpilot-desktop/src/components/features/**`
- `gitpilot-desktop/src/components/ui/**`
- `gitpilot-desktop/src/components/` 中被目标 UI 直接替换的业务组件
- `gitpilot-desktop/src/styles/**`
- `gitpilot-desktop/src/index.css`
- `gitpilot-desktop/package.json`、`package-lock.json`
- 对应 OpenSpec、设计文档和验证脚本

工作区中其他既有改动属于用户当前迁移工作，不能回滚或覆盖。

## 静态基线对比

| 指标 | 当前值 |
|---|---:|
| `src/index.css` + `src/styles/*.css`（迁移前） | 614 行 |
| `src/index.css` + `src/styles/*.css`（当前） | 263 行 |
| 迁移前 `index.css` + `tokens.css` | 431 行 |
| 新语义 token 引用（迁移前记录） | 约 229 |
| 旧 `--color-*` token 引用（迁移前记录） | 约 199 |
| 旧 `--color-*` token 引用（当前入口与 styles） | 0 |
| `!important`（迁移前记录） | 35 |
| `!important`（当前入口与 styles） | 4（均为 reduced-motion 全局兜底） |
| `components/ui` 文件 | 15 |
| 生产 JS 主包（迁移前记录） | 约 468.49 kB |
| 生产 JS 主包（当前） | 468.92 kB |
| 生产 CSS（迁移前记录） | 约 77.32 kB |
| 生产 CSS（当前） | 71.46 kB |

## 当前验证

- `gitpilot-desktop`: `npm.cmd run test`（8 个文件、36 个测试）通过
- `gitpilot-desktop`: `npm.cmd run build` 通过
- `gitpilot-desktop`: `npm.cmd run check:ui-boundaries` 通过
- OpenSpec 变更校验通过
- `python scripts/check_encoding.py` 通过
- `git diff --check` 通过

## 当前仍需原生验证

- 1100×720、1440×900、800×500 原生 Tauri 截图
- 原生键鼠交互矩阵

静态清理已完成：生产入口不再包含 Legacy 渲染树、旧业务选择器或旧 token alias。
