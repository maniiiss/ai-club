# Wiki 模块实现方案

## 背景

用户希望创建一个 Wiki 模块，用于存储用户生成的内容，包括：
- 文档和笔记
- 需求规格说明和摘要
- 项目知识和记忆
- 任何需要组织和检索的持久化内容

平台已经集成了 Hindsight 作为 Hermes（AI 助手）的记忆提供者，但经过探索，**Hindsight 不适合用于 Wiki 存储**。Hindsight 设计为 LLM 记忆提供者，用于聊天上下文和语义搜索，而非通用文档存储。

相反，平台已经具备强大的内容存储基础设施：
- PostgreSQL 用于结构化数据和丰富的元数据
- MinIO 用于文件/图片存储
- 知识图谱系统用于实体关系
- 支持图片上传的 Markdown 编辑器
- 基于权限的访问控制

Wiki 模块应该利用这些现有模式，而不是尝试使用 Hindsight 进行文档存储。

## 推荐方案

使用现有的 PostgreSQL + 知识图谱基础设施构建 Wiki 模块，遵循代码库中已建立的模式。

### 用户需求（已确认）
- ✅ **版本历史**：在 v1 中实现完整的版本跟踪
- ✅ **访问控制**：页面级权限（公开/项目成员/指定用户）
- ✅ **Hindsight 集成**：将 Wiki 页面同步到 Hindsight，通过 Hermes 进行语义搜索
- ✅ **组织方式**：层级结构（父子关系）

### 架构概览

**存储策略：**
- Wiki 页面内容 → PostgreSQL TEXT 字段（markdown）
- Wiki 页面元数据 → PostgreSQL 列 + JSON 字段
- 图片/附件 → MinIO 对象存储
- 页面关系 → 知识图谱边
- 版本历史 → 独立版本表（v1 需求）
- 页面级权限 → wiki_page_access 表

**集成点：**
- 项目级 Wiki（每个项目有自己的 Wiki）
- 将 Wiki 页面链接到任务、迭代、需求
- 在知识图谱中可视化 Wiki 结构
- 复用现有的 Markdown 编辑器和图片上传
- 同步到 Hindsight 以通过 Hermes 进行语义搜索

### 数据库架构

创建新的迁移文件：`V27__wiki_pages.sql`

```sql
-- Wiki 页面表
CREATE TABLE wiki_page (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    parent_page_id BIGINT REFERENCES wiki_page(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    content TEXT,
    content_type VARCHAR(20) DEFAULT 'markdown',
    author_user_id BIGINT REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_published BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    metadata_json TEXT,
    UNIQUE(project_id, slug)
);

CREATE INDEX idx_wiki_page_project ON wiki_page(project_id);
CREATE INDEX idx_wiki_page_parent ON wiki_page(parent_page_id);
CREATE INDEX idx_wiki_page_slug ON wiki_page(project_id, slug);

-- 版本历史表（v1 需求）
CREATE TABLE wiki_page_version (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    author_user_id BIGINT REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    change_summary VARCHAR(500),
    UNIQUE(page_id, version_number)
);

CREATE INDEX idx_wiki_version_page ON wiki_page_version(page_id);

-- 页面级访问控制（v1 需求）
CREATE TABLE wiki_page_access (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
    access_type VARCHAR(20) NOT NULL, -- 'PUBLIC', 'PROJECT_MEMBERS', 'SPECIFIC_USERS'
    user_id BIGINT REFERENCES "user"(id) ON DELETE CASCADE, -- NULL for PUBLIC/PROJECT_MEMBERS
    permission VARCHAR(20) NOT NULL, -- 'VIEW', 'EDIT'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_wiki_access_page ON wiki_page_access(page_id);
CREATE INDEX idx_wiki_access_user ON wiki_page_access(user_id);
CREATE UNIQUE INDEX idx_wiki_access_unique ON wiki_page_access(page_id, user_id, permission) WHERE user_id IS NOT NULL;
```

### 后端实现

**1. 实体类**

创建 `WikiPageEntity.java`、`WikiPageVersionEntity.java`、`WikiPageAccessEntity.java`（详见英文方案）

**2. Repository**

创建以下 Repository 接口：
- `WikiPageRepository.java`
- `WikiPageVersionRepository.java`
- `WikiPageAccessRepository.java`

**3. DTOs**

在 `backend/src/main/java/com/aiclub/platform/dto/` 创建：
- `WikiPageSummary.java` - 列表视图（id、标题、slug、作者、日期、浏览量、是否有子页面）
- `WikiPageDetail.java` - 完整页面视图（扩展 summary + 内容、访问类型、版本）
- `WikiPageVersionSummary.java` - 版本历史项
- `CreateWikiPageRequest.java` - 创建请求（标题、内容、父页面ID、访问类型、指定用户ID列表）
- `UpdateWikiPageRequest.java` - 更新请求（标题、内容、变更摘要、访问类型、指定用户ID列表）
- `WikiPageTreeNode.java` - 层级树结构（id、标题、slug、子节点）

**4. 服务层**

创建 `WikiPageService.java`，参考 `KnowledgeGraphService.java` 的模式：

**核心操作：**
- 带页面级权限检查的 CRUD 操作
- Slug 生成和唯一性验证（使用标题生成 URL 友好的 slug）
- 父子层级管理（防止循环引用）
- 每次更新时创建版本历史
- 访问控制管理（PUBLIC/PROJECT_MEMBERS/SPECIFIC_USERS）
- 浏览量跟踪（页面查看时递增）
- 搜索功能（标题/内容匹配）

**版本管理：**
- 页面更新时自动创建版本
- 计算下一个版本号
- 存储用户输入的变更摘要
- 提供版本比较和恢复功能

**权限检查：**
- 检查用户是否可以查看页面（基于 access_type 和 user_id）
- 检查用户是否可以编辑页面（基于 access_type 和 user_id）
- 如果未定义页面级访问权限，则回退到项目级权限
- 支持 PUBLIC 页面（所有人可见）、PROJECT_MEMBERS（仅项目成员）、SPECIFIC_USERS（明确的用户列表）

**Hindsight 集成：**
- 创建/更新时将页面内容同步到 Hindsight
- 使用 Hermes API 将页面存储为记忆/上下文
- 使用页面元数据标记（project_id、page_id、slug）
- 通过 Hermes 聊天界面启用语义搜索

**知识图谱集成：**
- 在知识图谱中创建 WIKI_PAGE 节点
- 创建 HAS_WIKI_PAGE 边（Project → WikiPage）
- 创建 WIKI_CHILD_OF 边（WikiPage → WikiPage 用于层级）
- 页面创建/更新/删除时更新图谱

**5. 控制器**

创建 `WikiPageController.java`，提供以下端点：
- `GET /api/projects/{projectId}/wiki` - 列出页面
- `GET /api/projects/{projectId}/wiki/{slug}` - 获取页面
- `POST /api/projects/{projectId}/wiki` - 创建页面
- `PUT /api/projects/{projectId}/wiki/{id}` - 更新页面
- `DELETE /api/projects/{projectId}/wiki/{id}` - 删除页面
- `GET /api/projects/{projectId}/wiki/tree` - 获取页面树
- `GET /api/projects/{projectId}/wiki/{id}/versions` - 获取版本历史
- `GET /api/projects/{projectId}/wiki/{id}/versions/{versionNumber}` - 获取特定版本
- `POST /api/projects/{projectId}/wiki/{id}/restore/{versionNumber}` - 恢复版本
- `GET /api/projects/{projectId}/wiki/search` - 搜索页面

注意：权限检查将在服务层基于页面级访问控制处理。

### 前端实现

**1. API 客户端**

在 `frontend/src/api/platform.ts` 中添加 Wiki API 函数和类型定义。

**2. 视图**

创建 `frontend/src/views/WikiView.vue`：
- 左侧边栏：页面树导航
- 主区域：页面内容显示/编辑
- 工具栏：创建、编辑、删除、搜索
- 层级面包屑导航
- 复用 `MarkdownEditor.vue` 组件进行编辑

**3. 路由**

在 `frontend/src/router/index.ts` 中添加 Wiki 路由。

**4. 导航**

更新项目导航菜单以包含 Wiki 链接（在项目详情视图或侧边栏中）。

### 知识图谱集成

更新 `KnowledgeGraphService.java` 以包含 Wiki 页面：

1. 将 `WIKI_PAGE` 添加到节点类型枚举
2. 为每个 Wiki 页面创建节点
3. 添加边类型：
   - `HAS_WIKI_PAGE`（Project → WikiPage）
   - `WIKI_CHILD_OF`（WikiPage → WikiPage 用于层级）
   - `WIKI_REFERENCES`（WikiPage → Task/Requirement/等）

### Hindsight 集成（v1 需求）

集成 Hindsight 以实现语义搜索和 AI 驱动的 Wiki 发现：

**实现方法：**

1. **同步服务** - 创建 `WikiPageHindsightSyncService.java`：
   - 创建/更新时将 Wiki 页面同步到 Hindsight
   - 使用 Hermes 聊天 API 将页面内容存储为对话上下文
   - 格式：发送带有元数据标签的页面内容（project_id、page_id、slug、title）
   - 页面删除时从 Hindsight 删除

2. **Hermes 集成**：
   - 复用现有的 `HermesGatewayService.java` 进行 API 调用
   - 为 Wiki 索引创建专用会话（例如 `wiki-index:{projectId}`）
   - 将每个页面作为消息存储在会话中
   - Hindsight 将自动索引内容以进行语义搜索

3. **搜索增强**：
   - 添加语义搜索端点：`GET /api/projects/{projectId}/wiki/semantic-search?query={query}`
   - 使用用户的搜索查询查询 Hermes
   - Hindsight 返回语义相关的 Wiki 页面
   - 与关键词搜索结果结合以实现全面搜索

4. **Hermes 聊天集成**：
   - 当用户与 Hermes 助手聊天时，自动检索相关的 Wiki 页面
   - 在聊天界面中显示 Wiki 页面建议
   - 在 Hermes 抽屉中添加"相关 Wiki 页面"部分

**技术细节：**
- 使用现有的 `HermesConversationSessionService` 模式进行会话管理
- 在 `metadata_json` 字段中存储 Wiki 同步元数据（last_synced_at、hindsight_session_id）
- 优雅地处理同步失败（重试逻辑、错误日志）
- 初始 Wiki 导入的批量同步（同步所有现有页面）

## 关键文件修改/创建

**后端：**
- `backend/src/main/resources/db/migration/V27__wiki_pages.sql`（新建 - 3 个表）
- `backend/src/main/java/com/aiclub/platform/domain/model/WikiPageEntity.java`（新建）
- `backend/src/main/java/com/aiclub/platform/domain/model/WikiPageVersionEntity.java`（新建）
- `backend/src/main/java/com/aiclub/platform/domain/model/WikiPageAccessEntity.java`（新建）
- `backend/src/main/java/com/aiclub/platform/repository/WikiPageRepository.java`（新建）
- `backend/src/main/java/com/aiclub/platform/repository/WikiPageVersionRepository.java`（新建）
- `backend/src/main/java/com/aiclub/platform/repository/WikiPageAccessRepository.java`（新建）
- `backend/src/main/java/com/aiclub/platform/service/WikiPageService.java`（新建 - 核心 CRUD + 权限 + 版本）
- `backend/src/main/java/com/aiclub/platform/service/WikiPageHindsightSyncService.java`（新建 - Hindsight 集成）
- `backend/src/main/java/com/aiclub/platform/controller/WikiPageController.java`（新建）
- `backend/src/main/java/com/aiclub/platform/dto/WikiPageSummary.java`（新建）
- `backend/src/main/java/com/aiclub/platform/dto/WikiPageDetail.java`（新建）
- `backend/src/main/java/com/aiclub/platform/dto/WikiPageVersionSummary.java`（新建）
- `backend/src/main/java/com/aiclub/platform/dto/WikiPageTreeNode.java`（新建）
- `backend/src/main/java/com/aiclub/platform/dto/request/CreateWikiPageRequest.java`（新建）
- `backend/src/main/java/com/aiclub/platform/dto/request/UpdateWikiPageRequest.java`（新建）
- `backend/src/main/java/com/aiclub/platform/service/KnowledgeGraphService.java`（修改 - 添加 WIKI_PAGE 节点和边）

**前端：**
- `frontend/src/api/platform.ts`（修改 - 添加 Wiki API 函数 + 类型）
- `frontend/src/views/WikiView.vue`（新建 - 主 Wiki 视图，带树导航 + 内容显示/编辑）
- `frontend/src/components/WikiPageTree.vue`（新建 - 层级树组件）
- `frontend/src/components/WikiVersionHistory.vue`（新建 - 版本历史对话框）
- `frontend/src/components/WikiAccessControl.vue`（新建 - 访问控制设置）
- `frontend/src/router/index.ts`（修改 - 添加 Wiki 路由）
- `frontend/src/components/HermesDrawer.vue`（修改 - 添加 Wiki 页面建议部分）

**复用现有：**
- `frontend/src/components/MarkdownEditor.vue`（用于内容编辑）
- `frontend/src/utils/taskImageUpload.ts`（用于 Wiki 中的图片上传）
- `backend/src/main/java/com/aiclub/platform/util/RichTextUtils.java`（用于内容清理）
- `backend/src/main/java/com/aiclub/platform/service/TaskCommentImageStorageService.java`（用于图片存储）
- `backend/src/main/java/com/aiclub/platform/service/HermesGatewayService.java`（用于 Hindsight 同步）
- `backend/src/main/java/com/aiclub/platform/service/HermesConversationSessionService.java`（用于会话管理模式）

## 验证步骤

1. **数据库迁移**
   - 运行应用程序并验证 V27 迁移成功执行
   - 检查 `wiki_page`、`wiki_page_version` 和 `wiki_page_access` 表是否存在且架构正确
   - 验证外键约束和索引

2. **后端 API 测试**
   - 通过 POST `/api/projects/{projectId}/wiki` 创建 Wiki 页面
   - 通过 GET `/api/projects/{projectId}/wiki` 列出页面
   - 通过 GET `/api/projects/{projectId}/wiki/{slug}` 获取页面
   - 通过 PUT `/api/projects/{projectId}/wiki/{id}` 更新页面（验证版本已创建）
   - 通过 DELETE `/api/projects/{projectId}/wiki/{id}` 删除页面
   - 通过 GET `/api/projects/{projectId}/wiki/{id}/versions` 获取版本历史
   - 通过 POST `/api/projects/{projectId}/wiki/{id}/restore/{versionNumber}` 恢复版本
   - 测试页面级权限检查（PUBLIC、PROJECT_MEMBERS、SPECIFIC_USERS）

3. **前端测试**
   - 导航到项目 Wiki 视图
   - 创建带有 Markdown 内容的新 Wiki 页面
   - 在 Markdown 编辑器中上传图片
   - 编辑现有页面并验证更改持久化
   - 查看版本历史并恢复以前的版本
   - 删除页面并验证已删除
   - 测试页面层级（父子关系）
   - 验证面包屑导航工作正常
   - 测试访问控制设置（将页面设置为 PUBLIC/PROJECT_MEMBERS/SPECIFIC_USERS）

4. **知识图谱集成**
   - 刷新包含 Wiki 页面的项目的知识图谱
   - 验证 WIKI_PAGE 节点出现在图谱中
   - 验证边连接 Wiki 页面到项目
   - 检查 Wiki 页面在图谱可视化中可见

5. **Hindsight 集成测试**
   - 创建/更新 Wiki 页面并验证它同步到 Hindsight
   - 检查 Hindsight 日志以查看同步活动
   - 使用 Hermes 聊天语义搜索 Wiki 内容
   - 验证 Wiki 页面建议出现在 Hermes 抽屉中
   - 测试语义搜索端点返回相关页面

6. **权限测试**
   - 使用不同的用户角色测试（管理员、成员、查看者）
   - 验证非成员无法访问项目 Wiki
   - 测试 PUBLIC 页面（所有用户可访问）
   - 测试 PROJECT_MEMBERS 页面（仅项目成员可查看）
   - 测试 SPECIFIC_USERS 页面（仅指定用户可查看/编辑）
   - 验证编辑权限正常工作

7. **版本历史测试**
   - 对页面进行多次编辑
   - 验证每次编辑创建新版本
   - 查看版本历史并比较版本
   - 恢复旧版本并验证内容已恢复
   - 检查版本号正确递增

## 实施阶段

**阶段 1：核心 Wiki（MVP）- 所有 v1 需求**
- 数据库架构和迁移（3 个表：wiki_page、wiki_page_version、wiki_page_access）
- 带页面级权限的后端 CRUD 操作
- 版本历史跟踪和恢复功能
- 基本前端视图，带列表和详情
- 带图片上传的 Markdown 编辑
- 页面层级和树导航
- 访问控制 UI（PUBLIC/PROJECT_MEMBERS/SPECIFIC_USERS）
- 用于语义搜索的 Hindsight 集成
- 知识图谱集成

**阶段 2：增强功能（未来）**
- 带过滤器的高级搜索（按作者、日期、标签）
- 常见文档类型的页面模板
- 批量操作（批量删除、移动页面）
- 导出为 PDF/HTML
- 页面评论/讨论
- 活动流（最近更改、谁编辑了什么）
- 页面分析（查看统计、热门页面）

**阶段 3：高级功能（未来）**
- 实时协作编辑
- 页面附件（非图片文件）
- 高级版本比较（差异视图）
- 页面审批工作流
- 跨所有项目的 Wiki 范围搜索
- 通过 Hermes 的 AI 驱动内容建议
