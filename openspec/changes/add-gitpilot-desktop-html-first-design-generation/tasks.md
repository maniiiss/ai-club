## 1. 协议与数据模型

- [ ] 1.1 定义 `DesignRunStage`、`DesignScreenJob`、`DesignRegionJob`、`DesignArtifact` 和 locator/source hash 类型，并为事件携带 project/design/request/run/sequence 元数据。
- [ ] 1.2 扩展 `design_patch_applied`、`design_open` 和 `design_run_settled` 的兼容字段，保留旧 sidecar 缺失字段时的回退行为。
- [ ] 1.3 增加 HTML-first 事件 schema 校验和 operationId/sourceHash 幂等测试。
- [ ] 1.4 设计并实现 `previewHtml`、`canvasMirror`、`editable/readOnly` 和区域状态的持久化 DTO。

## 2. HTML 安全与产物服务

- [ ] 2.1 实现 HTML sanitizer：限制文档大小、节点深度、脚本、事件处理器、iframe、协议和表单外发。
- [ ] 2.2 实现预览 CSP、资源白名单、超时、取消和降级字体/图标策略；禁止访问本地路径、Shell 和 Desktop RPC bridge。
- [ ] 2.3 在 `.gitpilot/design/<designId>/previews` 与 `artifacts` 下保存 HTML、资源清单、source hash 和 screenshot 元数据。
- [ ] 2.4 增加 HTML 产物下载和 artifact ready 事件，保证 HTML 就绪不等待 screenshot。
- [ ] 2.5 增加恶意 HTML、超限文档、资源失败和取消渲染测试。

## 3. Sidecar HTML-first Pipeline

- [ ] 3.1 新增 `design-run-pipeline.ts`，实现 run、design-system、shared-components、screen-plan、screen 和 region 状态机。
- [ ] 3.2 新增 `StructuredGenerationGateway`，复用 `createAgentSessionServices().modelRuntime` 的 `streamSimple/completeSimple`，不创建首轮 `AgentSession`。
- [ ] 3.3 将页面尺寸/frame 初始化从 Agent 工具循环中提取为 `screen_created` 阶段，并支持多页面有界并发。
- [ ] 3.4 接入结构化模型调用：首轮只返回设计系统、组件规划、HTML/CSS 和区域操作，不注册 Design custom tools。
- [ ] 3.5 按视觉区域拆分首屏输出，优先导航、标题、主容器、关键文字，再提交表单、列表、图标和细节。
- [ ] 3.6 将 HTML、screenshot、Canvas mirror 和 screen settlement 的事件接入现有 RPC 输出和日志。
- [ ] 3.7 保留旧 Pi AgentSession 路径作为 feature flag 回退，并确保 follow-up/clarification/repair 仍可用。
- [ ] 3.8 增加 pipeline 的并发、失败、取消、重复 settle 和旧 run 事件测试。

## 4. DOM Locator 与后续修改

- [ ] 4.1 定义 `data-gitpilot-node-id`、`data-gitpilot-region-id` 的生成、唯一性和命名规则。
- [ ] 4.2 实现 HTML locator 索引和 locator 到 Canvas node 的映射持久化。
- [ ] 4.3 实现按 locator 的文本、token/class、图标、插入、移动和删除操作，禁止 DOM 序号和坐标模糊匹配。
- [ ] 4.4 为 locator 缺失、重复、source hash 冲突和用户并发修改返回结构化冲突。
- [ ] 4.5 将后续 Agent patch 的 operationId 与 HTML 局部修改、Canvas mirror 事务关联。

## 5. HTML 到 Canvas 镜像

- [ ] 5.1 新增 HTML 支持子集解析器，覆盖容器、flex/absolute 布局、文本、按钮、输入、图片、SVG/icon、背景、边框、圆角、透明度和简单阴影。
- [ ] 5.2 将解析结果转换为 canonical `CanvasDesignDocument` 节点和 `CanvasDesignOperation[]`，保留 locator/sourceHash/editable 字段。
- [ ] 5.3 对渐变、复杂滤镜、伪元素、动画和第三方组件生成 read-only 标记，不静默丢失 HTML 视觉内容。
- [ ] 5.4 将镜像事务按 journal-first 顺序写入 draft，并复用 `design_patch_applied` 事件。
- [ ] 5.5 增加 HTML fixture 到 Canvas 快照、布局 bounds、文字、图标和只读降级的单元测试。

## 6. Desktop 预览与实时渲染

- [ ] 6.1 新增 Design HTML preview surface，消费 screen/region/artifact 事件并显示加载、就绪、降级和错误状态。
- [ ] 6.2 在 Design store 中增加 HTML preview、区域状态、Canvas mirror 和 source hash 归约，继续隔离 committed/draft/transient。
- [ ] 6.3 将 HTML 更新、Canvas patch、资源完成、选择变化和 pointermove 统一接入 RenderScheduler。
- [ ] 6.4 AI 光标只锚定到 region bounds、node bounds 或 dirty rect；没有真实锚点时显示静态状态，不绘制随机路径。
- [ ] 6.5 HTML 与 Canvas 预览切换时保持 pageId、screenId、regionId、selection 和 zoom 对齐。
- [ ] 6.6 普通绘制路径不调用 `toDataURL`；导出、上传、截图和 settled preview 使用显式异步 capture API。

## 7. Draft 恢复与手工操作

- [ ] 7.1 扩展 `design_open` 返回 active/orphaned draft、HTML artifact、region progress、last sequence 和 source hash。
- [ ] 7.2 实现 `design_recover_draft` 的 keep/discard：keep 生成 interrupted revision，discard 删除 HTML、截图和镜像 journal。
- [ ] 7.3 断线重连时按 journal/checkpoint 重放 HTML 状态和 Canvas mirror，并过滤旧项目、旧 run、重复 operationId 和过期 source hash。
- [ ] 7.4 AI run 期间结构性手工事务进入 FIFO 队列，settled/interrupted 后按最新 revision 提交；冲突停止队列并保留剩余事务。
- [ ] 7.5 增加项目切换、窗口最小化恢复、sidecar 重启和取消任务的桌面状态测试。

## 8. 文档、验证与发布开关

- [ ] 8.1 更新 `docs/architecture.md`，明确 HTML preview、CanvasDesignDocument、DOM locator、镜像转换器和 RenderScheduler 的模块边界。
- [ ] 8.2 新增正式专题文档，记录 HTML-first pipeline、沙箱策略、数据目录、事件时序和回退方案。
- [ ] 8.3 增加 Desktop、CLI、HTML 安全和镜像转换的回归测试，并覆盖旧 sidecar 协议兼容。
- [ ] 8.4 运行 `cd gitpilot-desktop && npm run test`、`npm run build`、`cd gitpilot-cli && npm test`、`npm run build` 和 `python scripts/check_encoding.py`。
- [ ] 8.5 在 1100×720、1440×900、800×500、最小化恢复、重连、项目切换和 HTML/Canvas 切换场景执行 Windows Tauri 冒烟验证。
- [ ] 8.6 通过 feature flag 灰度启用 HTML-first；确认回退到旧 AgentSession 路径时不会删除已生成的 HTML 或正式 Canvas revision。
