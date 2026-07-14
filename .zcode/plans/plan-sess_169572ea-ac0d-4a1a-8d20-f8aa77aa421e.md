# 公众端消息中心实施计划（参考管理端）

## 目标
在 `frontend-public/` 实现一版消息中心，**完全参考管理端**：顶部铃铛 + 未读角标 + 右侧滑出抽屉（无独立路由页面），接入 WebSocket 实时推送（新消息实时更新角标、插入列表头部、弹桌面 Toast 提示，断线 3 秒自动重连）。后端 `/api/notifications` 与 `/ws/notifications` 已完整支持且两端共用，无需后端改动。

## 重点：类型与状态全部中文展示
按你的要求，**通知类型（type）和状态/级别（level）一律显示中文，不出现英文枚举**：
- **类型中文映射** `NOTIFICATION_TYPE_LABELS`：
  - `TASK` → 「任务」
  - `GITLAB` → 「代码仓库」
  - `CICD` → 「流水线」
  - `SYSTEM` → 「系统」
- **状态中文映射** `NOTIFICATION_LEVEL_LABELS`：
  - `INFO` → 「普通」
  - `SUCCESS` → 「成功」
  - `WARNING` → 「警告」
  - `ERROR` → 「错误」
- 列表项同时展示「类型标签」和「状态标签」两个 chip，均用中文 + 对应色调（success/warning/danger/info 配设计 token 浅底色）。
- bizType 二级标签沿用管理端 `NOTIFICATION_BIZ_TYPE_LABELS`（20+ 条中文，如「逾期提醒」「自动合并成功」「开发执行完成」「系统公告」），同样全中文。
- 顶部铃铛、抽屉标题、分类 Tab（「全部消息」「未读消息」）、按钮（「全部标记已读」「关闭」）、空状态（「暂无消息」）、加载文案均中文。

## 技术对齐
- 复用公众端现有：Zustand、`api/http.ts`（`unwrap`/`cleanParams`/`AUTH_TOKEN_KEY`/`resolvedApiBaseUrl`）、`SlideDrawer`、`createPortal`、设计 token（`styles/tokens.css`）、动画类（`animate-slideLeft/slideRight/slideUp`）、`date-fns`（已装）。
- 复用管理端逻辑：API 契约、`NotificationItem` 类型、bizType 标签映射、来源/色调解析、相对时间、WS 连接/重连/消息分发。
- 移植管理端 `stores/notifications.ts`（Pinia）→ Zustand 等价实现。

## 新增文件（8 个）

### 1. `src/types/notification.ts` — 类型定义
移植管理端 `types/platform.ts` 中的通知类型：
```ts
NotificationItem { id, type:'TASK'|'GITLAB'|'CICD'|'SYSTEM'|string, level:'INFO'|'SUCCESS'|'WARNING'|'ERROR'|string, title, content, bizType:string|null, bizId:number|null, actionUrl:string|null, read:boolean, senderName, createdAt:string, readAt:string|null }
NotificationUnreadSummary { unreadCount:number }
NotificationRealtimeEvent { eventType:'NEW_NOTIFICATION'|string, notification:NotificationItem, unreadCount:number }
NotificationQuery { page, size, unreadOnly?:boolean, type?:string }
```

### 2. `src/api/notifications.ts` — API 封装
对齐 `api/projects.ts` 风格，用 `unwrap`/`cleanParams`：
- `pageNotifications(query)` → GET `/api/notifications`
- `getUnreadNotificationCount()` → GET `/api/notifications/unread-count`
- `markNotificationRead(id)` → POST `/api/notifications/{id}/read`
- `markAllNotificationsRead()` → POST `/api/notifications/read-all`
- `buildNotificationSocketUrl()` → 参考 `api/chat.ts` 的 `buildChatSocketUrl`，把 pathname 改为 `/ws/notifications`，token 作 query 参数

### 3. `src/stores/notifications.ts` — Zustand store（核心）
移植管理端 Pinia store 逻辑：
- **state**：`items, unreadCount, drawerOpen, loading, unreadOnly, page(1), size(20), total, connected`
- **actions**：`bootstrap()`（拉未读数+列表+连 WS）、`openDrawer()`、`closeDrawer()`、`toggleUnreadOnly(v)`、`loadMore()`（追加去重）、`markRead(id)`（乐观更新未读数-1）、`markAllRead()`（未读归零、列表全标已读）
- **WebSocket**：`connect()`/`disconnect()`/`scheduleReconnect()`（3 秒）。`connect` 用 `buildNotificationSocketUrl()`，守卫重复连接 + 无 token 不连。`onmessage`：解析 `NotificationRealtimeEvent`，校验 `eventType==='NEW_NOTIFICATION'`，列表头部插入（去重，截断 50 条）、更新 unreadCount、total+1，并调用 `useToastStore.getState().addToast(...)` 弹提示（点击跳 actionUrl）。
- WS socket 与 reconnectTimer 用模块级变量（非 state），与 admin 一致。

### 4. `src/stores/toast.ts` — 轻量 Toast 队列（Zustand）
公众端无 toast，新建命令式可调用的 toast 队列：`toasts[], addToast({id,title,message,duration,onClick}), removeToast(id)`。用 Zustand 以便 store/非组件代码（WS 回调）可通过 `useToastStore.getState().addToast()` 调用，无需 React Context。

### 5. `src/components/common/ToastContainer.tsx` — Toast 渲染层
`createPortal` 到 body，固定右下角（`bottom-4 right-4`），订阅 `useToastStore`，每条用 `animate-slideUp` 入场，5 秒自动消失（默认），点击触发 `onClick` 后关闭。卡片用 `bg-[var(--color-bg-card)]` + `shadow-[var(--shadow-lg)]` + `border`。

### 6. `src/lib/notificationRender.ts` — 渲染辅助（移植管理端 + 中文映射）
- **`NOTIFICATION_TYPE_LABELS`**：`TASK→'任务'`、`GITLAB→'代码仓库'`、`CICD→'流水线'`、`SYSTEM→'系统'`
- **`NOTIFICATION_LEVEL_LABELS`**：`INFO→'普通'`、`SUCCESS→'成功'`、`WARNING→'警告'`、`ERROR→'错误'`
- `NOTIFICATION_BIZ_TYPE_LABELS`（20+ 条中文，照搬 admin：逾期提醒/自动合并成功/开发执行完成/系统公告 等）
- `resolveNotificationTypeLabel(item)` → 返回类型中文名
- `resolveNotificationTypeIcon(item)` → 返回 lucide 图标（TASK→ListTodo、GITLAB→GitBranch、CICD→Workflow、SYSTEM→Bell）
- `resolveNotificationLevelLabel(item)` → 返回状态中文名（普通/成功/警告/错误）
- `resolveNotificationSource(item)`（来源，优先 senderName，否则按 type 给中文兜底）、`resolveNotificationContextLabel(item)`（bizType 中文标签）
- `resolveNotificationContextTone(item)`（返回 warning/secondary/info/tertiary/neutral）、`resolveNotificationLevelTone(item)`
- `formatRelativeTime(date)` → 用 `date-fns` 的 `formatDistanceToNowStrict` + `zhCN` locale，产出「3 分钟前」「刚刚」等，对齐管理端体验
- `toneToClass(tone)` → 把 tone 映射到 Tailwind + 设计 token 类名（warning→`bg-[var(--color-warning-light)] text-[var(--color-warning)]` 等）
- `levelToClass(level)` → 状态 chip 配色（ERROR→danger、WARNING→warning、SUCCESS→success、INFO→info）

### 7. `src/components/notifications/NotificationBell.tsx` — 铃铛入口
铃铛按钮（lucide `Bell`）+ 未读角标（`unreadCount>0` 时显示 `bg-[var(--color-danger)]` 小圆点，`animate-scaleIn`）。点击调用 `useNotificationStore.getState().openDrawer()`。在桌面端右侧操作区与移动端右侧独立渲染（**独立于用户下拉菜单**，符合移动端设计文档约束）。

### 8. `src/components/notifications/MessageCenterDrawer.tsx` — 消息中心抽屉
基于 `SlideDrawer`（`open` 绑定 store.drawerOpen，`width="420px"`，`title="消息中心"`，`description="系统通知与未读消息"`，`headerActions` 放「全部标记已读」按钮）：
- **分类 Tab**（`sticky top-0`）：全部消息 / 未读消息（功能态），与管理端一致
- **消息列表**：每项展示
  - 头部行：来源（中文）+ 相对时间
  - 标题、内容
  - 底部 chip 行：**类型标签（中文，如「任务」「代码仓库」）** + **状态标签（中文，如「警告」「成功」）** + bizType 中文标签（如「逾期提醒」），三者均用对应色调浅底 chip
  - 未读项用 `bg-[var(--color-primary-light)]` 高亮、左侧未读小圆点
- **点击项**：`markRead(id)` → `closeDrawer()` → 若有 `actionUrl` 用 `useNavigate` 跳转
- **无限滚动**：列表底部放哨兵 `<div ref>`，用 `IntersectionObserver` 检测进入视口 → `loadMore()`（零侵入，不改 SlideDrawer）
- **状态**：加载中（文案「加载中...」）、空状态（「暂无消息」）、已加载全部文案（「已加载全部消息」）

## 修改文件（3 个）

### 1. `src/app/providers.tsx`
在 `RouterProvider` 旁挂载 `<ToastContainer />`（全局单例）。

### 2. `src/layouts/ProductLayout.tsx`
- 调用 `useNotificationBootstrap()`：mount 时若已登录则 `bootstrap()`（拉未读数+列表+连 WS），unmount 时 `disconnect()`。用 ref 守卫避免 React StrictMode 双调用。
- 渲染全局唯一 `<MessageCenterDrawer />`（与管理端单实例一致）

### 3. `src/components/navigation/TopNav.tsx`
- 桌面端：在「右侧空间 `<div className="flex-1" />`」之后、积分按钮之前，插入 `<NotificationBell />`
- 移动端：在汉堡菜单按钮之前插入 `<NotificationBell />`，保证独立于用户下拉区

## 关键实现要点
1. **类型/状态全中文**：`NOTIFICATION_TYPE_LABELS` + `NOTIFICATION_LEVEL_LABELS` + bizType 映射，列表项三 chip 全中文展示，UI 文案全中文。
2. **WS 生命周期**：全局单例，登录后常驻、登出断开。`connect()` 守卫重复连接 + 无 token 不连；`onclose` 触发 3 秒重连；token 已清则不重连。
3. **乐观更新**：`markRead` 本地立即 `unreadCount-1`（不重拉列表），与管理端一致。
4. **Toast 命令式调用**：WS 回调内 `useToastStore.getState().addToast({...})`，点击跳 actionUrl。
5. **配色随主题**：全部用 `var(--color-*)` token，不写死 hex，确保随 `data-theme` 切换。
6. **移动端**：抽屉 `width` 响应式（桌面 420px，移动端 100%），Tab 与列表触控安全。

## 不做的事
- 不新增独立 `/messages` 路由页面（按你的选择，仅抽屉）
- 不做批量删除/批量已读（后端无此接口，仅单条已读 + 全部已读）
- 不改后端（接口已两端共用）
- 不改 `SlideDrawer` 共享组件（用 IntersectionObserver 哨兵实现无限滚动，零侵入）

## 验证（Harness）
按 AGENTS.md 公众端规范：
1. `python scripts/check_encoding.py` — 确保新文件 UTF-8 无 BOM、中文直写
2. `cd frontend-public && npm run test` — 类型/测试
3. `cd frontend-public && npm run build` — 构建通过
4. 视情况源码模式启动验证铃铛角标、抽屉、WS 实时推送、Toast、中文展示