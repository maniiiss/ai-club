# 前端工程规范与配置指南

## 技术栈

- **框架**: Vue 3 + TypeScript
- **构建工具**: Vite 8
- **UI 组件库**: Element Plus 2.8
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **图表库**: @antv/g6, cytoscape
- **终端**: xterm
- **Markdown 编辑器**: md-editor-v3

## 项目结构

```
frontend/
├── src/
│   ├── api/                # API 接口层
│   ├── components/         # 公共组件
│   ├── constants/          # 常量定义
│   ├── layout/             # 布局组件
│   ├── router/             # 路由配置
│   ├── stores/             # Pinia 状态管理
│   ├── styles/             # 全局样式
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 工具函数
│   └── views/              # 页面视图
├── public/                 # 静态资源
├── index.html              # 入口 HTML
├── vite.config.ts          # Vite 配置
├── tsconfig.json           # TypeScript 配置
└── package.json            # 项目依赖
```

## 路由规范

### 路由结构

- 使用 `createWebHistory` 历史模式
- 主布局组件: `AppLayout.vue`
- 路由文件: `src/router/index.ts`

### 路由守卫

1. **认证守卫**: 检查用户登录状态
2. **权限守卫**: 基于 `meta.permission` 字段控制页面访问
3. **运行时能力检查**: 验证服务器管理等模块是否启用

### 路由元信息

```typescript
interface RouteMeta {
  requiresAuth?: boolean    // 是否需要认证，默认 true
  title?: string            // 页面标题
  permission?: string       // 权限码
  activeMenu?: string       // 高亮菜单路径
  requiresServerManagement?: boolean  // 是否需要服务器管理功能
}
```

### 懒加载路由

大型页面使用动态导入实现懒加载：

```typescript
const ServerManagementView = () => import('@/views/ServerManagementView.vue')
```

## 组件规范

### 组件命名

- 使用 PascalCase 命名组件文件
- 页面组件以 `View` 后缀结尾 (如 `DashboardView.vue`)
- 公共组件放在 `src/components/` 目录

### 组件结构

推荐使用 `<script setup>` 语法：

```vue
<template>
  <!-- 模板内容 -->
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
// 组件逻辑
</script>

<style scoped>
/* 组件样式 */
</style>
```

### 公共组件列表

主要公共组件位于 `src/components/`:

- `HermesDrawer.vue` - 智能助手抽屉
- `MarkdownEditor.vue` - Markdown 编辑器
- `PlatformDialogHeader.vue` - 平台对话框头部
- `ListUserDisplay.vue` - 用户列表展示
- `CompactSelectMenu.vue` - 紧凑选择菜单
- `ExecutionTaskCreateDialog.vue` - 执行任务创建对话框
- `KnowledgeGraphCanvas.vue` - 知识图画布
- `MemoryFactPanel.vue` - 记忆事实面板

## 样式规范

### CSS 变量体系

项目使用 CSS 变量实现主题系统，定义在 `src/styles/index.css`:

#### 颜色变量

```css
:root {
  /* 主色调 */
  --app-primary: #904d00;
  --app-primary-container: #ff8c00;
  
  /* 语义颜色 */
  --app-success: #3d6f38;
  --app-warning: #9d5b00;
  --app-danger: #ba1a1a;
  --app-info: #0e5a7e;
  
  /* 表面颜色 */
  --app-surface-base: #f8f9fa;
  --app-surface-card: #ffffff;
  
  /* 文本颜色 */
  --app-text: #191c1d;
  --app-text-soft: #556474;
  --app-text-muted: #758393;
}
```

#### 字体系统

```css
:root {
  --app-font-heading: "Manrope", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --app-font-body: "Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --app-font-mono: "JetBrains Mono", "Consolas", "Courier New", monospace;
}
```

#### 圆角系统

```css
:root {
  --app-radius-2xl: 16px;
  --app-radius-xl: 12px;
  --app-radius-lg: 10px;
  --app-radius-md: 8px;
  --app-radius-sm: 6px;
}
```

### Element Plus 主题覆盖

通过 CSS 变量覆盖 Element Plus 默认主题：

```css
:root {
  --el-color-primary: var(--app-primary);
  --el-border-radius-base: 10px;
  --el-font-family: var(--app-font-body);
}
```

### 响应式断点

```css
/* 大屏 */
@media (max-width: 1280px) { }

/* 中屏 */
@media (max-width: 1200px) { }

/* 小屏/移动端 */
@media (max-width: 900px) { }
```

### 移动端适配

使用 `isMobileViewport` 响应式变量检测移动端，关键特性：

- 底部导航栏
- 抽屉式菜单
- 卡片式列表布局
- 触摸友好的交互尺寸

## 状态管理

### Pinia Stores

1. **appStore** (`src/stores/app.ts`)
   - 侧边栏状态
   - 运行时能力
   - 外观初始化

2. **authStore** (`src/stores/auth.ts`)
   - 用户认证状态
   - 权限管理
   - 会话恢复

3. **notificationStore** (`src/stores/notifications.ts`)
   - 消息通知管理
   - WebSocket 连接

## API 层规范

### HTTP 客户端

使用 Axios，配置在 `src/api/http.ts`

### API 模块划分

```
src/api/
├── auth.ts           # 认证相关
├── access.ts         # 权限管理
├── project-api.ts    # 项目接口
├── gitlab.ts         # GitLab 集成
├── cicd.ts           # CI/CD 流水线
├── models.ts         # 模型管理
├── servers.ts        # 服务器管理
├── hermes.ts         # 智能助手
└── notifications.ts  # 消息通知
```

## 交互工程化

### 全局交互规范

1. **按钮交互**
   - 主要按钮: 渐变背景 + 悬浮阴影
   - 悬浮效果: `transform: translateY(-1px)`
   - 禁用状态: `cursor: not-allowed`

2. **表单交互**
   - 输入框底部边框样式
   - 聚焦状态高亮
   - 统一的 placeholder 颜色

3. **表格交互**
   - 无边框设计
   - 行悬浮高亮
   - 表头大写字母样式

4. **对话框交互**
   - 毛玻璃遮罩: `backdrop-filter: blur(10px)`
   - 圆角设计
   - 自适应高度

### 移动端交互

- 底部安全区域适配: `env(safe-area-inset-bottom)`
- 触摸目标最小尺寸: 44px
- 卡片式布局替代表格

## 构建配置

### Vite 配置

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173
  }
})
```

### TypeScript 配置

- 严格模式启用
- 路径别名: `@/` 指向 `src/`
- Vue 类型支持: `env.d.ts`

## 开发规范

### 代码风格

1. 使用 TypeScript 严格类型
2. 组件使用 `<script setup>` 语法
3. CSS 使用 scoped 作用域
4. 遵循 Vue 3 组合式 API 最佳实践

### 命名规范

- 文件名: PascalCase (组件) / camelCase (工具函数)
- CSS 类名: kebab-case
- TypeScript 接口: PascalCase + Interface 后缀

### 注释规范

- 组件顶部添加功能说明注释
- 复杂业务逻辑添加中文注释
- API 函数添加参数和返回值说明

## 性能优化

1. **路由懒加载**: 大型页面使用动态导入
2. **组件懒加载**: 非首屏组件延迟加载
3. **图片优化**: 使用 WebP 格式，添加懒加载
4. **代码分割**: Vite 自动代码分割
5. **缓存策略**: 合理使用浏览器缓存

## 调试与测试

### 开发调试

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

### 类型检查

```bash
# TypeScript 类型检查
vue-tsc --noEmit
```

## 部署配置

### Docker 部署

- 生产环境: `Dockerfile`
- 主机环境: `Dockerfile.host`
- Nginx 配置: `nginx.conf`

### 环境变量

- `.env` - 默认环境变量
- `.env.server` - 服务器环境配置
- `.env.example` - 环境变量示例

## 移动端设计规范

详细设计方案参见: `docs/mobile-console-technical-design-v1.md`

### 设计原则

1. **首屏优先**: 优先展示操作内容，避免装饰性元素抢占空间
2. **操作聚合**: 主操作按钮并入搜索/筛选区，不单独占行
3. **信息压缩**: KPI 摘要卡使用两列网格，长文本必须截断
4. **连续浏览**: 采用瀑布流式加载，隐藏桌面分页 footer
5. **触控安全**: 按钮可点击区域统一，避免误触

### 响应式检测

```typescript
const isMobileViewport = ref(false)

function syncViewportMode() {
  if (typeof window === 'undefined') return
  isMobileViewport.value = window.innerWidth <= 900
}
```

### 移动端瀑布流分页

通用工具: `src/utils/mobileWaterfallPagination.ts`

- 桌面端: 沿用 `page/size` 分页
- 移动端: 固定请求第 1 页，逐步放大 `size`
- 底部哨兵触发下一段加载

### 已接入移动端适配的页面

- 项目管理、执行中心、测试管理
- 智能体管理、代码仓库、Jenkins 服务
- 模型管理、用户管理、角色管理
- 迭代管理中的工作项列表

### 新模块落地检查清单

1. 是否有多余标题/说明影响首屏高度
2. 新增按钮是否单独占行
3. 是否保留桌面端分页 footer
4. 长文本是否溢出
5. 顶部按钮是否误包进下拉菜单触发区
6. 横向滚动区是否贴边

## 最佳实践

1. **组件设计原则**
   - 单一职责
   - Props 向下，Events 向上
   - 合理使用 provide/inject

2. **状态管理原则**
   - 全局状态使用 Pinia
   - 组件状态使用 ref/reactive
   - 避免过度使用全局状态

3. **样式管理原则**
   - 优先使用 CSS 变量
   - 避免 !important
   - 使用 scoped 样式

4. **性能优化原则**
   - 合理使用 computed 和 watch
   - 避免不必要的响应式
   - 使用 shallowRef 优化大数据

---

*本文档基于项目现有代码规范整理，持续更新中。*
