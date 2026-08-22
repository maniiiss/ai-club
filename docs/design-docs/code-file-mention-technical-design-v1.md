# CODE 模式 @ 文件提及技术设计 v1

## 1. 背景与目标

CODE 工作台的输入框（`InputBox`）目前只能通过右侧文件树"添加到对话框"或拖拽引用工作空间文件。
本设计为输入框增加 `@` 提及：输入 `@` 弹出文件搜索面板，键入文件名即时筛选，选中后与文件树"添加到对话框"走完全相同的附件链路。

核心约束：工作空间文件扫描遵循各级 `.gitignore`，上限 2 万条目、16 层深度（`code_file_list` 契约），搜索交互在任何文件量下不得造成输入卡顿。

范围边界：

- 仅 CODE 模式的 `InputBox`（`floating` 与 `inline` 两个变体共用同一实现）。
- Work 模式 composer、Design 模式不涉及。
- 只提及文件，不提及目录（目录无法走附件读取链路）。

## 2. 交互设计

- 光标前文本构成待完成的 `@` 提及词时打开面板；与 `/` 命令不同，允许在正文中间触发。
- 面板交互与 `CommandPalette`（Slash 命令面板）一致：↑↓ 移动高亮、Enter 选中、Esc 关闭、点击面板外部关闭。
- Esc 关闭后抑制重新打开，直到触发条件失效（用户离开 `@` 词或删除 `@`），避免"关不掉"。
- 中文输入法：触发检测基于文档文本而非按键事件，IME 打出 `@` 自然触发；面板键盘监听忽略 `isComposing`/keyCode 229 事件，避免拼音回车确认被误当作选中文件。
- 选中文件后：删除正文里的 `@query` 文本范围，编辑器保持焦点；文件进入附件 chip 列表，发送时内容按现有附件协议注入上下文。正文不保留任何提及标记，附件 chip 是唯一可视化形态，序列化与草稿逻辑零改动。
- 与 `/` 命令面板互斥：`@` 提及优先（`/@foo` 场景打开文件面板而非命令面板）。

## 3. 触发检测（纯函数）

`detectFileMention(textBeforeCursor, textAfterCursor, blockStart, cursorPos)` 返回 `{ query, from, to } | null`，
`from`/`to` 为 ProseMirror 文档位置，供选中后 `deleteRange` 精确删除 `@query`。

判定规则：

1. 光标必须位于词尾：光标后是块尾或空白字符（光标移入词中间时面板关闭）。
2. 光标前文本尾部匹配 `@([^@\s]*)$`（`@` 到光标之间无空白、无第二个 `@`）。
3. `@` 的前一个字符不得是字母/数字/下划线/点/横线（排除 `user@example.com` 等既有单词内部场景）；行首、空白、中文、命令 token 后的 `@` 均触发。

实现要点：编辑器当前文本块的文本经 `textBetween(0, parentOffset, undefined, '\uFFFC')` 取得，
原子节点（命令 token、硬换行）以 `\uFFFC` 占位，占位符 1 字符对齐 1 个文档位置，
`blockStart + 本地偏移` 即为文档位置。选区非空时不触发。

检测时机：`onUpdate` 与 `onSelectionUpdate` 各同步一次，光标移动（不改文档）也能正确开合面板。

## 4. 数据流与新鲜度

数据源复用 `useProjectFilesStore`（sidecar `code_file_list`，扁平 `CodeProjectFileEntry[]`），不新增 RPC 命令。

新鲜度策略为 stale-while-revalidate：

- 面板打开时触发一次 `refresh(composerWorkspacePath)`。
- 无缓存：面板显示加载态；同工作区重复刷新时 store 保留旧 entries，有缓存时面板立即展示旧结果、后台刷新返回后原地更新，不闪空。
- store 的 `refreshVersion` 竞态守卫天然覆盖会话快速切换场景。
- 会话无工作目录（`composerWorkspacePath` 为空）时不刷新，面板提示无匹配。

## 5. 过滤排序与性能预算

性能核心原则：**渲染节点数与文件总量无关，过滤计算让位打字渲染。**

- `buildFileMentionRows(entries)`：entries 变化时预计算一次搜索行（小写化文件名/路径、层级深度），键入过滤零字符串分配。
- `filterFileMentionRows(rows, query, limit=30)`：单次线性扫描 + 排序，2 万条目实测仅数毫秒。
  - 评分：文件名前缀 > 文件名子串 > 路径子串；同级浅路径优先、路径短优先、`localeCompare` 收尾。
  - 空 query（刚输入 `@`）按最近修改时间降序，便于引用刚改过的文件。
- 查询词经 React 19 `useDeferredValue` 包裹：过滤渲染以低优先级调度，输入事件永不阻塞。
- 结果固定 top-30 截断，不引入虚拟列表。

## 6. 落地链路

选中文件 → `addInputs([{ path: joinWorkspacePath(workspacePath, relativePath), name }])`
→ `rpc.prepareAttachments`（sidecar `resolveReadPath` 读取）→ 附件 chip → 发送时注入上下文。

与文件树"添加到对话框"（`queueProjectFileAttachments` 消费路径）唯一差别：@ 提及在输入框内部直接调用 `addInputs`，不经工作台队列（队列用于跨组件传递，此处同组件内无需中转）。

## 7. 组件与改动清单

| 文件 | 职责 |
| --- | --- |
| `gitpilot-desktop/src/components/file-mention.ts`（新增） | 触发检测、搜索行构建、过滤排序、路径拼接纯函数 |
| `gitpilot-desktop/src/components/FileMentionPalette.tsx`（新增） | 面板组件：键盘导航、外点关闭、加载/错误/空态、截断提示 |
| `gitpilot-desktop/src/components/FileMentionPalette.module.css`（新增） | 面板样式，视觉与 `CommandPalette` 同族 |
| `gitpilot-desktop/src/components/InputBox.tsx` | 键盘门控纳入提及面板、触发同步、stale-while-revalidate、挂载面板 |

`InputBox.handleKeyDown` 的浮层门控条件扩展为 `showPalette || hasActionSelect || mentionOpen`：
浮层打开时方向键/Enter/Esc 由编辑器放行冒泡，面板 window 级监听接管。

## 8. 错误与空态

| 状态 | 表现 |
| --- | --- |
| 首次加载 | "正在扫描工作空间文件…" |
| 加载失败 | 错误信息 + "重试"按钮 |
| 无匹配 | "没有匹配的文件"，`@query` 保留在正文 |
| 扫描截断（`truncated`） | 面板底部注明"文件较多，结果可能不完整" |

## 9. 测试

vitest 纯函数测试（`file-mention.test.ts`），覆盖：

- 触发检测：行首/空格后/中文后/token 后触发；邮箱不触发；`@` 后空格关闭；光标入词中关闭；路径片段 query。
- 过滤排序：前缀>子串>路径；浅路径 tie-break；top-N 截断；目录排除；大小写不敏感；空 query 按最近修改。
- 路径拼接：Windows/POSIX 分隔符。

## 10. 后续演进（不在本期）

- 目录提及（需新增目录级附件语义或展开搜索）。
- 模糊匹配（子序列）与拼音首字母匹配（引入评分索引后可考虑 Web Worker）。
- Work 模式 composer 复用（其为纯 textarea，需单独接入）。
