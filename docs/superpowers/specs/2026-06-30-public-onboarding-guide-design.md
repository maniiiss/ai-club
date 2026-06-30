# 公众端新手引导设计

## 概述

为公众端（`frontend-public/`）设计并实现用户首次登录的在线指引系统。用户首次进入核心页面时，通过遮罩式分步引导了解页面功能区域和操作入口。引导完成状态持久化到后端，跨设备生效。

## 需求摘要

- **覆盖范围**：Dashboard 首页、项目管理、AI 助手/知识库、开发工具四个核心页面
- **交互风格**：遮罩式分步引导（高亮目标元素 + 半透明遮罩 + 上一步/下一步/跳过按钮）
- **触发策略**：仅首次登录自动触发，完成后可通过设置手动重新触发
- **状态持久化**：后端用户表存储已完成状态

## 技术方案

采用 **Driver.js**（~4KB gzipped）作为引导库。Driver.js 是轻量级、无依赖、框架无关的引导库，API 简洁，支持自定义 CSS 与 Tailwind 融合。

### 备选方案对比

| 方案 | 体积 | 优点 | 缺点 |
|------|------|------|------|
| Driver.js（采用） | ~4KB | 轻量、API 简洁、CSS 定制灵活 | 非 React 原生，需 Hook 封装 |
| React Joyride | ~15KB | React 原生、功能丰富 | 体积大、依赖多、样式定制繁琐 |
| 纯自研 | 0 | 完全掌控 | 开发周期长、需处理大量边界 |

## 前端架构

### 新增文件结构

```
frontend-public/src/
├── components/guide/           ← 新增引导组件目录
│   ├── useGuide.ts             ← 核心 Hook，封装 Driver.js 实例管理
│   ├── guideSteps.ts           ← 所有页面的引导步骤配置（集中管理）
│   ├── GuideWrapper.tsx        ← 引导遮罩的自定义 Popover 渲染组件
│   └── guide.css               ← 引导相关自定义样式（覆盖 Driver.js 默认样式）
├── api/guide.ts                ← 新增 API 模块，调用后端引导状态接口
```

### 修改文件

```
frontend-public/src/
├── stores/auth.ts              ← 登录后检查引导状态，决定是否自动触发
└── pages/
    ├── dashboard/DashboardPage.tsx       ← 添加 data-guide-id 属性 + useGuide 集成
    ├── projects/ProjectsPage.tsx         ← 添加 data-guide-id 属性 + useGuide 集成
    ├── knowledge/KnowledgePage.tsx       ← 添加 data-guide-id 属性 + useGuide 集成
    └── api-studio/ApiStudioPage.tsx      ← 添加 data-guide-id 属性 + useGuide 集成
```

### 核心组件职责

| 组件 | 职责 |
|------|------|
| `useGuide` | 封装 Driver.js 的 `driver()` 实例创建、步骤启动、完成回调；接收页面 key 作为参数 |
| `guideSteps` | 按页面 key 导出步骤数组，每步定义目标选择器（CSS selector）、标题、描述 |
| `GuideWrapper` | Driver.js 的自定义 Popover 组件，渲染标题、描述、进度指示器、上一步/下一步/跳过按钮 |
| `guide.css` | 覆盖 Driver.js 默认样式，使用 Tailwind 设计变量统一配色（主色、圆角、阴影） |

### 引导触发流程

```
用户登录 → authStore.restoreSession()
         → 从后端获取 user.guideCompleted (string[])
         → 进入 Dashboard
         → Dashboard 的 useEffect 检查：
             guideCompleted 是否包含 "dashboard"？
             → 否：延迟 500ms 自动启动引导
             → 是：不触发
         → 用户完成引导或点击跳过
             → 调用 API: PUT /api/users/guide-status
             → 后端更新 user.guideCompleted += "dashboard"
```

## 引导步骤配置

### 数据结构

```typescript
// guideSteps.ts
interface GuideStep {
  element: string;      // CSS 选择器，如 '[data-guide-id="dashboard-stats"]'
  popover: {
    title: string;      // 步骤标题
    description: string;// 步骤描述
    side: 'bottom' | 'top' | 'left' | 'right'; // Popover 位置
    align: 'start' | 'center' | 'end';
  };
}

// 按页面 key 组织
const guideStepsConfig: Record<string, GuideStep[]> = {
  dashboard: [/* 5 steps */],
  projects: [/* 4 steps */],
  'ai-assistant': [/* 4 steps */],
  'dev-tools': [/* 3 steps */],
};
```

### Dashboard 首页（5 步）

| 步骤 | 目标区域 | 标题 | 描述 |
|------|----------|------|------|
| 1 | 统计卡片区 | 数据概览 | 这里展示您的项目数、任务数、智能体数和代码仓库数的总体概况 |
| 2 | 我的任务区 | 我的任务 | 查看分配给您的任务状态，包括进行中、待处理的任务数量 |
| 3 | 活跃项目区 | 活跃项目 | 快速访问您参与的项目，点击项目卡片即可进入项目详情 |
| 4 | 近期任务列表 | 近期任务 | 这里列出您最近的任务动态，方便跟踪进度 |
| 5 | 新建项目按钮 | 开始使用 | 点击这里创建您的第一个项目，开始协作开发之旅 |

### 项目管理页（4 步）

| 步骤 | 目标区域 | 标题 | 描述 |
|------|----------|------|------|
| 1 | 项目列表/网格 | 项目列表 | 以列表或网格视图浏览所有项目，支持搜索和筛选 |
| 2 | 项目卡片 | 项目详情 | 每个项目卡片展示名称、描述、成员和最近活动 |
| 3 | 创建项目入口 | 新建项目 | 创建项目时可选择关联 Git 仓库，配置智能体和 CICD 流水线 |
| 4 | 分页/筛选 | 管理项目 | 项目较多时可使用搜索和筛选快速定位目标项目 |

### AI 助手/知识库页（4 步）

| 步骤 | 目标区域 | 标题 | 描述 |
|------|----------|------|------|
| 1 | Hermes 对话区 | AI 助手 | Hermes 是您的 AI 编程助手，可以进行代码分析、问题解答和知识问答 |
| 2 | 聊天输入框 | 开始对话 | 在这里输入问题或指令，Hermes 会实时回复 |
| 3 | 知识库入口 | 知识库 | 管理项目的知识文档，AI 助手会参考这些文档提供更精准的回答 |
| 4 | 会话列表 | 历史会话 | 查看和管理之前的对话记录，可随时继续未完成的讨论 |

### 开发工具页（3 步）

| 步骤 | 目标区域 | 标题 | 描述 |
|------|----------|------|------|
| 1 | API Studio 入口 | API 调试 | API Studio 让您直接在浏览器中调试和测试项目 API |
| 2 | 代码审查区 | 代码审查 | 查看和管理代码合并请求，AI 自动审查代码质量 |
| 3 | CICD 流水线 | 持续集成 | 监控构建和部署流水线的运行状态 |

### 页面锚点标记

各页面组件在关键 DOM 元素上添加 `data-guide-id` 属性作为引导锚点：

```html
<!-- DashboardPage.tsx -->
<div data-guide-id="dashboard-stats" className="...">统计卡片区</div>
<div data-guide-id="dashboard-my-tasks" className="...">我的任务</div>
<div data-guide-id="dashboard-active-projects" className="...">活跃项目</div>
<div data-guide-id="dashboard-recent-tasks" className="...">近期任务</div>
<button data-guide-id="dashboard-create-project" className="...">新建项目</button>
```

## 后端 API 与数据持久化

### 数据模型变更

在现有 `users` 表新增字段（不需要新建表）：

```sql
-- Flyway 迁移脚本
ALTER TABLE users ADD COLUMN guide_completed VARCHAR(500) DEFAULT '';
-- 存储格式：逗号分隔的页面 key，如 "dashboard,projects,ai-assistant"
-- 合法 key 白名单：dashboard, projects, ai-assistant, dev-tools
```

### API 接口

**1. 获取引导状态**（登录时随用户信息一起返回，无需单独接口）

`GET /api/auth/me` 响应的 `CurrentUserInfo` 新增字段：

```json
{
  "id": 1,
  "username": "zhangsan",
  "...": "...",
  "guideCompleted": ["dashboard", "projects"]
}
```

**2. 更新引导状态**

```
PUT /api/users/guide-status
Authorization: Bearer <token>
Body: { "pageKeys": ["dashboard", "projects", "ai-assistant"] }
Response: 200 OK
```

- 接收完整的已完成页面 key 列表（全量覆盖，非增量）
- 需要认证（携带 token）
- 后端校验 pageKey 是否在白名单内（`dashboard`, `projects`, `ai-assistant`, `dev-tools`），防止注入非法值

### 后端代码变更点

| 层级 | 文件 | 变更 |
|------|------|------|
| 数据库 | Flyway 迁移脚本 | 新增 `guide_completed` 字段 |
| Entity | `UserEntity` | 新增 `guideCompleted` 字段 |
| DTO | `CurrentUserInfo` | 新增 `guideCompleted: List<String>` |
| Service | `UserService` | 新增 `updateGuideStatus(userId, pageKeys)` 方法 |
| Controller | `UserController` | 新增 `PUT /api/users/guide-status` 端点 |
| Mapper | `UserMapper` | 新增字段映射 |

## 前端集成

### useGuide Hook

```typescript
// useGuide.ts
function useGuide(pageKey: string) {
  const authStore = useAuthStore();
  const isCompleted = authStore.user?.guideCompleted?.includes(pageKey) ?? false;

  const startGuide = () => {
    const steps = guideStepsConfig[pageKey];
    if (!steps) return;

    const driverObj = driver({
      popoverClass: 'custom-guide-popover',
      showProgress: true,
      steps,
      onDestroyStarted: () => {
        // 引导完成或跳过时更新后端状态
        markGuideCompleted(pageKey);
        driverObj.destroy();
      },
    });

    driverObj.drive();
  };

  const markGuideCompleted = async (key: string) => {
    const currentKeys = authStore.user?.guideCompleted ?? [];
    const newKeys = [...new Set([...currentKeys, key])];
    try {
      await guideApi.updateGuideStatus(newKeys);
      authStore.updateGuideCompleted(newKeys);
    } catch {
      // 静默失败，下次进入页面重试
    }
  };

  const resetGuide = async () => {
    try {
      await guideApi.updateGuideStatus([]);
      authStore.updateGuideCompleted([]);
    } catch {
      // 静默失败
    }
  };

  return { isCompleted, startGuide, resetGuide };
}
```

### 页面集成示例

```typescript
// DashboardPage.tsx
const { isCompleted, startGuide } = useGuide('dashboard');

useEffect(() => {
  if (!isCompleted && authStore.user) {
    // 延迟 500ms 启动，确保页面渲染完成
    const timer = setTimeout(() => startGuide(), 500);
    return () => clearTimeout(timer);
  }
}, [authStore.user, isCompleted]);
```

### 手动重新触发

在用户菜单中增加"重新播放新手引导"选项：

```typescript
async function handleResetGuide() {
  await guideApi.updateGuideStatus([]);
  authStore.updateGuideCompleted([]);
  window.location.href = '/dashboard';
}
```

## 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| API 调用失败（更新引导状态） | 静默失败，下次进入页面重试引导，不阻断用户操作 |
| 引导目标元素不存在（如页面数据为空） | 跳过该步骤，继续下一步；如果所有步骤都跳过则直接标记完成 |
| 用户中途刷新页面 | 引导中断但状态未更新，下次进入同页面会重新触发 |
| SSO 登录用户 | 与普通登录一致，`restoreSession` 获取用户信息后检查引导状态 |
| 移动端/小屏幕 | 引导步骤配置 `side` 属性自动适配，Driver.js 内置响应式定位 |
| 用户快速操作（连点下一步） | Driver.js 内置动画防抖，无需额外处理 |

## 样式融合

在 `guide.css` 中覆盖 Driver.js 默认样式：

- 遮罩层颜色：`rgba(0, 0, 0, 0.5)`（半透明黑）
- Popover 按钮背景色：项目主色（与 Tailwind 的 `--color-primary` 一致）
- 圆角：`8px`
- 阴影：`shadow-lg`
- 进度指示器：`3/5` 数字格式
- 字体：继承项目全局字体

## 依赖变更

```json
// frontend-public/package.json
{
  "dependencies": {
    "driver.js": "^1.x"
  }
}
```

## 影响范围

- **前端**：新增 4 个文件（`components/guide/*`）、新增 1 个 API 文件、修改 4 个页面组件、修改 1 个 Store、修改 `package.json`
- **后端**：新增 1 个 Flyway 迁移脚本、修改 Entity/DTO/Service/Controller/Mapper 各 1 个文件
- **风险**：低风险。纯增量功能，不影响现有业务流程
