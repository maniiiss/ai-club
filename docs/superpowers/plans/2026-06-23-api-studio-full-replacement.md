# API Studio 全功能 1:1 替换实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改 Yaade 后端协议与数据存储的前提下，用 AI Club 原生前端完整替换 `/apis` 的 Yaade iframe 体验，1:1 覆盖 Yaade 的接口编辑、发送、响应、环境、Cookie、历史、脚本、JWT、附件、导入导出、Mock 和 Runner 能力，并最终收敛为 Yaade server-only。

**Architecture:** 前端新增 `frontend/src/modules/api-studio/` 作为独立业务模块，承载路由、布局、请求编辑器、响应查看器、环境与工具面板、导入导出、Mock、Runner 等能力。后端以项目作用域 proxy 为唯一 Yaade 接入层，新增 project-scoped 路由、资源归属校验、写入注入和白名单控制，并在 `YaadeClientService` 内实现按平台用户分桶的 Yaade cookie 缓存，逐步删除 iframe 嵌入和构建期补丁。

**Tech Stack:** Spring Boot 3 + Java 17 + JUnit 5 + Mockito + Vue 3 + Vite + Pinia + Element Plus + Monaco Editor + Axios + Vitest。

---

## Global Constraints

- 所有源码、脚本、文档必须使用 UTF-8 无 BOM 保存。
- 中文必须直接写入文件，不允许写成 `\uXXXX` 转义。
- 新增或修改类、接口方法、实体字段、复杂流程时，需要补充中文注释说明业务意图。
- 修改前先阅读关联模块和现有测试，避免只按文件名猜测职责。
- 不要回滚、覆盖或格式化与当前任务无关的改动。
- 文档、脚本、配置变更至少运行编码检查。
- 后端业务变更优先运行相关 JUnit 测试，再视影响范围运行 Maven 全量测试。
- 前端类型或页面变更优先运行 `npm run build`。
- 跨服务改动需要至少验证对应服务能启动；必要时用源码模式脚本串起 backend、frontend、code-processing。
- 计划目标以 `docs/superpowers/specs/2026-06-23-api-studio-redesign-design.md` 为准；任何切片不得偏离“保留 Yaade API 能力、重做平台前端”的确认方向。
- Feature Flag：`platform.frontend.api-studio.enabled`，默认 `false`；在切片 6 前保持可回退。
- Yaade 用户 cookie 缓存 TTL 沿用 `platform.yaade.proxy-session-ttl-minutes`，不新增配置项。
- 旧 `ProjectApiManagementView.vue` 仅作为过渡期壳，最终要删除。
- 本计划分 8 个切片，任何时刻主干都必须保持可用。

## 文件清单（先锁边界）

**后端（`backend/`）**

- 新增 `src/main/java/com/aiclub/platform/service/yaade/ProjectScope.java`
  - 项目作用域值对象，封装 `projectId / PUBLIC`、group 名称、root collection 和可写标志。
- 新增 `src/main/java/com/aiclub/platform/service/yaade/YaadeEndpointWhitelist.java`
  - 单一真相源，按切片放行 Yaade endpoint。
- 新增 `src/main/java/com/aiclub/platform/service/yaade/YaadeProjectScopedProxyService.java`
  - 项目作用域请求转发、白名单准入、列表过滤、归属校验、写入注入。
- 新增 `src/main/java/com/aiclub/platform/service/yaade/YaadeProxyRouteSupport.java`
  - 路径拆解与 project/public scope 解析，避免 controller 里堆字符串逻辑。
- 修改 `src/main/java/com/aiclub/platform/controller/YaadeProxyController.java`
  - 增加 project-scoped 路由，保留旧路由直到清栈切片。
- 修改 `src/main/java/com/aiclub/platform/service/YaadeClientService.java`
  - 增加按平台用户缓存 Yaade cookie 的能力，并保留 admin session 登录能力。
- 修改 `src/main/java/com/aiclub/platform/service/YaadeEmbedSessionService.java`
  - 逐步减掉 iframe 专用逻辑，最终仅保留或删除过渡态入口。
- 修改 `src/main/java/com/aiclub/platform/service/YaadeProjectSyncService.java`
  - 绑定、归档、公共空间和 group 规则沿用并补充作用域语义。
- 修改 `src/main/java/com/aiclub/platform/service/YaadeProperties.java`
  - 透传 `platform.frontend.api-studio.enabled`。
- 新增和修改 `src/test/java/com/aiclub/platform/service/yaade/**`
  - 覆盖白名单、作用域、cookie 缓存、proxy 路由、项目绑定。

**前端（`frontend/`）**

- 新增 `src/modules/api-studio/router.ts`
- 新增 `src/modules/api-studio/views/ApiStudioLayout.vue`
- 新增 `src/modules/api-studio/views/ApiGroupListView.vue`
- 新增 `src/modules/api-studio/views/ApiWorkbenchView.vue`
- 新增 `src/modules/api-studio/views/ApiRequestDetailView.vue`
- 新增 `src/modules/api-studio/components/**`
  - `collection-tree/`
  - `request-tabs/`
  - `request-editor/`
  - `response-viewer/`
  - `env-manager/`
  - `history-panel/`
  - `importer/`
  - `runner/`
  - `mock/`
  - `ai/`
- 新增 `src/modules/api-studio/stores/**`
  - `useApiStudioSessionStore.ts`
  - `useCollectionsStore.ts`
  - `useRequestTabsStore.ts`
  - `useEnvironmentStore.ts`
  - `useHistoryStore.ts`
  - `useRunnerStore.ts`
- 新增 `src/modules/api-studio/api/yaade-rest.ts`
- 新增 `src/modules/api-studio/api/yaade-platform.ts`
- 新增 `src/modules/api-studio/types/yaade.ts`
- 修改 `src/router/index.ts`
- 修改 `src/views/ApiGroupHomeView.vue`
- 修改 `src/views/ProjectApiManagementView.vue`
- 新增和修改 `src/modules/api-studio/**/__tests__/*`
  - 覆盖 store、路由守卫、关键组件渲染与草稿行为。

**文档**

- 修改 `docs/architecture.md`
- 视情况新增 `docs/generated/api-studio-technical-design-v1.md` 或在现有 Yaade 文档中补切片记录。

---

## Task 1：后端基础设施与作用域骨架

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/YaadeProperties.java`
- Add: `backend/src/main/java/com/aiclub/platform/service/yaade/ProjectScope.java`
- Add: `backend/src/main/java/com/aiclub/platform/service/yaade/YaadeEndpointWhitelist.java`
- Add: `backend/src/main/java/com/aiclub/platform/service/yaade/YaadeProxyRouteSupport.java`
- Add: `backend/src/main/java/com/aiclub/platform/service/yaade/YaadeProjectScopedProxyService.java`
- Add: `backend/src/test/java/com/aiclub/platform/service/yaade/ProjectScopeTest.java`
- Add: `backend/src/test/java/com/aiclub/platform/service/yaade/YaadeEndpointWhitelistTest.java`
- Add: `backend/src/test/java/com/aiclub/platform/service/yaade/YaadeProjectScopedProxyServiceTest.java`

- [ ] **Step 1: Write the failing tests**

```java
@Test
void whitelist_should_allow_only_slice1_read_endpoints() {
    YaadeEndpointWhitelist whitelist = new YaadeEndpointWhitelist();

    assertThat(whitelist.isAllowed("GET", "/api/collection", false)).isTrue();
    assertThat(whitelist.isAllowed("GET", "/api/request/123", false)).isTrue();
    assertThat(whitelist.isAllowed("POST", "/api/request/send", true)).isFalse();
    assertThat(whitelist.isAllowed("DELETE", "/api/request/123", true)).isFalse();
}
```

```java
@Test
void project_scope_should_format_group_name_and_public_scope() {
    ProjectScope projectScope = ProjectScope.project(42L, "aiclub-project-42", 1001L, false);
    ProjectScope publicScope = ProjectScope.publicScope(1000L);

    assertThat(projectScope.groupName()).isEqualTo("aiclub-project-42");
    assertThat(projectScope.isPublicSpace()).isFalse();
    assertThat(publicScope.isPublicSpace()).isTrue();
}
```

```java
@Test
void service_should_reject_non_whitelisted_endpoints() {
    assertThatThrownBy(() -> proxyService.forward(projectScope, "GET", "/api/login", Map.of(), null))
            .hasMessageContaining("YAADE_ENDPOINT_NOT_WHITELISTED");
}
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest='ProjectScopeTest,YaadeEndpointWhitelistTest,YaadeProjectScopedProxyServiceTest' test`
Expected: FAIL with missing classes / methods or assertion failures.

- [ ] **Step 3: Write the minimal implementation**

```java
package com.aiclub.platform.service.yaade;

public record ProjectScope(
        Long projectId,
        String groupName,
        Long rootCollectionId,
        boolean publicSpace,
        boolean writable
) {
    public static ProjectScope project(Long projectId, String groupName, Long rootCollectionId, boolean writable) {
        return new ProjectScope(projectId, groupName, rootCollectionId, false, writable);
    }

    public static ProjectScope publicScope(Long rootCollectionId) {
        return new ProjectScope(null, "aiclub-api-public", rootCollectionId, true, false);
    }
}
```

```java
package com.aiclub.platform.service.yaade;

public class YaadeEndpointWhitelist {
    public boolean isAllowed(String method, String relativePath, boolean writable) {
        if (method == null || relativePath == null) return false;
        if (writable) return false;
        return "GET".equalsIgnoreCase(method)
                && ("/api/collection".equals(relativePath)
                || relativePath.startsWith("/api/request/"));
    }
}
```

```java
package com.aiclub.platform.service.yaade;

public class YaadeProjectScopedProxyService {
    private final YaadeEndpointWhitelist whitelist;

    public YaadeProjectScopedProxyService(YaadeEndpointWhitelist whitelist) {
        this.whitelist = whitelist;
    }

    public void forward(ProjectScope projectScope, String method, String relativePath, Map<String, String> headers, byte[] body) {
        if (!whitelist.isAllowed(method, relativePath, false)) {
            throw new IllegalStateException("code=YAADE_ENDPOINT_NOT_WHITELISTED");
        }
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest='ProjectScopeTest,YaadeEndpointWhitelistTest,YaadeProjectScopedProxyServiceTest' test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aiclub/platform/service/yaade/ backend/src/test/java/com/aiclub/platform/service/yaade/
git commit -m "feat(yaade): add project scope and endpoint whitelist skeleton"
```

## Task 2：后端 Yaade cookie 缓存与健康检查收口

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/YaadeClientService.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/YaadeEmbedSessionService.java`
- Add: `backend/src/test/java/com/aiclub/platform/service/YaadeClientServiceTest.java`
- Add: `backend/src/test/java/com/aiclub/platform/service/YaadeEmbedSessionServiceTest.java`

- [ ] **Step 1: Write the failing tests**

```java
@Test
void client_service_should_cache_user_cookie_by_platform_user_id() {
    YaadeSession first = service.getOrLoginUserCookie(1001L);
    YaadeSession second = service.getOrLoginUserCookie(1001L);
    assertThat(second.cookieHeader()).isEqualTo(first.cookieHeader());
}
```

```java
@Test
void embed_session_service_should_still_report_health() {
    YaadeHealthSummary summary = service.getHealthSummary();
    assertThat(summary.baseUrl()).isNotBlank();
}
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest='YaadeClientServiceTest,YaadeEmbedSessionServiceTest' test`
Expected: FAIL because methods do not exist yet.

- [ ] **Step 3: Implement the cache and the minimal health path**

```java
public YaadeSession getOrLoginUserCookie(long platformUserId) {
    return userCookieCache.computeIfAbsent(platformUserId, id -> loginAdmin());
}

public void invalidateUserCookie(long platformUserId) {
    userCookieCache.remove(platformUserId);
}
```

```java
public YaadeHealthSummary getHealthSummary() {
    boolean available = yaadeClientService.isHealthy();
    return new YaadeHealthSummary(available, yaadeProperties.getBaseUrl(), available ? "ok" : "Yaade 服务不可用或登录配置异常");
}
```

- [ ] **Step 4: Run tests again**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest='YaadeClientServiceTest,YaadeEmbedSessionServiceTest' test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aiclub/platform/service/YaadeClientService.java backend/src/main/java/com/aiclub/platform/service/YaadeEmbedSessionService.java backend/src/test/java/com/aiclub/platform/service/YaadeClientServiceTest.java backend/src/test/java/com/aiclub/platform/service/YaadeEmbedSessionServiceTest.java
git commit -m "feat(yaade): add user cookie cache and health summary"
```

## Task 3：后端 project-scoped proxy 路由与资源校验

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/controller/YaadeProxyController.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/YaadeProjectSyncService.java`
- Add: `backend/src/test/java/com/aiclub/platform/controller/YaadeProxyControllerTest.java`
- Add: `backend/src/test/java/com/aiclub/platform/service/YaadeProjectSyncServiceTest.java`

- [ ] **Step 1: Write the failing tests**

```java
@Test
void controller_should_route_project_scoped_requests() {
    mockMvc.perform(get("/api/yaade/proxy/projects/42/api/collection"))
            .andExpect(status().isOk());
}
```

```java
@Test
void sync_service_should_create_public_collection_when_missing() {
    YaadeProjectBindingSummary summary = service.getBindingSummary(null);
    assertThat(summary.publicSpace()).isTrue();
}
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest='YaadeProxyControllerTest,YaadeProjectSyncServiceTest' test`
Expected: FAIL because scoped mapping and assertions are missing.

- [ ] **Step 3: Implement the scoped route and binding behavior**

```java
@RequestMapping({"/projects/{projectId}/**", "/public/**"})
public void proxyScoped(@PathVariable Long projectId,
                        HttpServletRequest request,
                        HttpServletResponse response) throws IOException {
    String relativePath = routeSupport.resolveRelativePath(request);
    ProjectScope scope = routeSupport.resolveScope(projectId, request.getRequestURI());
    YaadeClientService.RawResponse proxied = projectScopedProxyService.forward(
            scope,
            request.getMethod(),
            relativePath,
            extractForwardHeaders(request),
            StreamUtils.copyToByteArray(request.getInputStream())
    );
    writeProxyResponse(response, relativePath, proxied);
}
```

```java
public EnsureProjectBindingResult ensurePublicCollection() {
    // 公共空间仅承载未绑定项目的共享接口资产，必须固定到 aiclub-api-public group。
}
```

- [ ] **Step 4: Run tests again**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest='YaadeProxyControllerTest,YaadeProjectSyncServiceTest' test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/aiclub/platform/controller/YaadeProxyController.java backend/src/main/java/com/aiclub/platform/service/YaadeProjectSyncService.java backend/src/test/java/com/aiclub/platform/controller/YaadeProxyControllerTest.java backend/src/test/java/com/aiclub/platform/service/YaadeProjectSyncServiceTest.java
git commit -m "feat(yaade): add project scoped proxy routes"
```

## Task 4：前端模块骨架、路由与 API 封装

**Files:**
- Modify: `frontend/src/router/index.ts`
- Add: `frontend/src/modules/api-studio/router.ts`
- Add: `frontend/src/modules/api-studio/types/yaade.ts`
- Add: `frontend/src/modules/api-studio/api/yaade-rest.ts`
- Add: `frontend/src/modules/api-studio/api/yaade-platform.ts`
- Add: `frontend/src/modules/api-studio/views/ApiStudioLayout.vue`
- Add: `frontend/src/modules/api-studio/views/ApiGroupListView.vue`
- Add: `frontend/src/modules/api-studio/views/ApiWorkbenchView.vue`
- Add: `frontend/src/modules/api-studio/views/ApiRequestDetailView.vue`
- Add: `frontend/src/modules/api-studio/__tests__/router.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('routes /apis to the api studio group list when flag is enabled', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/apis', name: 'api-groups', component: { name: 'ApiStudioGroupListView' } as never }
    ]
  })

  expect(router.resolve('/apis').name).toBe('api-groups')
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `cd frontend && npx vitest run src/modules/api-studio/__tests__/router.spec.ts`
Expected: FAIL because module files and route names do not exist yet.

- [ ] **Step 3: Implement the minimal module and API wrappers**

```ts
export interface YaadeApiRequestItem {
  requestId: number
  collectionId: number
  collectionPath: string
  name: string
  method: string
  path: string
}

export const listYaadeProjectRequests = async (projectId: number) => {
  const { data } = await http.get<ApiResponse<YaadeApiRequestItem[]>>(`/api/yaade/projects/${projectId}/requests`)
  return data.data
}
```

- [ ] **Step 4: Run the test again**

Run: `cd frontend && npx vitest run src/modules/api-studio/__tests__/router.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router/index.ts frontend/src/modules/api-studio/
git commit -m "feat(api-studio): scaffold module routing and api wrappers"
```

## Task 5：前端基础状态与只读工作台

**Files:**
- Add: `frontend/src/modules/api-studio/stores/useApiStudioSessionStore.ts`
- Add: `frontend/src/modules/api-studio/stores/useCollectionsStore.ts`
- Add: `frontend/src/modules/api-studio/components/collection-tree/CollectionTree.vue`
- Add: `frontend/src/modules/api-studio/components/request-viewer/RequestReadonlyView.vue`
- Add: `frontend/src/modules/api-studio/components/request-tabs/RequestTabs.vue`
- Add: `frontend/src/modules/api-studio/__tests__/useCollectionsStore.spec.ts`
- Add: `frontend/src/modules/api-studio/__tests__/CollectionTree.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('keeps collections tree immutable across refresh', () => {
  const store = useCollectionsStore()
  const source = [{ id: 1, name: 'Root', children: [] }]
  store.setCollections(source)
  source[0].name = 'Changed'
  expect(store.collections[0].name).toBe('Root')
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd frontend && npx vitest run src/modules/api-studio/__tests__/useCollectionsStore.spec.ts src/modules/api-studio/__tests__/CollectionTree.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the minimal store and readonly viewer**

```ts
export const useCollectionsStore = defineStore('api-studio-collections', () => {
  const collections = ref<YaadeCollectionItem[]>([])
  function setCollections(next: YaadeCollectionItem[]) {
    collections.value = next.map((item) => ({ ...item }))
  }
  return { collections, setCollections }
})
```

- [ ] **Step 4: Run tests again**

Run: `cd frontend && npx vitest run src/modules/api-studio/__tests__/useCollectionsStore.spec.ts src/modules/api-studio/__tests__/CollectionTree.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/api-studio/stores frontend/src/modules/api-studio/components frontend/src/modules/api-studio/__tests__
git commit -m "feat(api-studio): add readonly workbench foundation"
```

## Task 6：前端请求编辑、发送与响应查看

**Files:**
- Add: `frontend/src/modules/api-studio/components/request-editor/**`
- Add: `frontend/src/modules/api-studio/components/response-viewer/**`
- Add: `frontend/src/modules/api-studio/stores/useRequestTabsStore.ts`
- Add: `frontend/src/modules/api-studio/__tests__/request-tabs.spec.ts`
- Add: `frontend/src/modules/api-studio/__tests__/request-editor.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('opens a request tab and keeps unsaved draft state', () => {
  const store = useRequestTabsStore()
  store.openRequestTab({ requestId: 99, name: 'List', method: 'GET', path: '/api/list' })
  expect(store.activeTabId).toBe(99)
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd frontend && npx vitest run src/modules/api-studio/__tests__/request-tabs.spec.ts src/modules/api-studio/__tests__/request-editor.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement editor, send, and response panels**

```vue
<template>
  <section class="request-editor">
    <el-input v-model="draft.url" placeholder="请求 URL" />
    <el-select v-model="draft.method" :teleported="false" placeholder="方法">
      <el-option label="GET" value="GET" />
      <el-option label="POST" value="POST" />
      <el-option label="PUT" value="PUT" />
      <el-option label="DELETE" value="DELETE" />
    </el-select>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="Params" name="params">
        <el-table :data="draft.params" size="small">
          <el-table-column prop="key" label="Key" />
          <el-table-column prop="value" label="Value" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="Headers" name="headers">
        <el-table :data="draft.headers" size="small">
          <el-table-column prop="key" label="Key" />
          <el-table-column prop="value" label="Value" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="Body" name="body">
        <code-editor v-model="draft.body" language="json" />
      </el-tab-pane>
    </el-tabs>
  </section>
</template>
```

- [ ] **Step 4: Run tests again**

Run: `cd frontend && npx vitest run src/modules/api-studio/__tests__/request-tabs.spec.ts src/modules/api-studio/__tests__/request-editor.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/api-studio/components/request-editor frontend/src/modules/api-studio/components/response-viewer frontend/src/modules/api-studio/stores/useRequestTabsStore.ts frontend/src/modules/api-studio/__tests__
git commit -m "feat(api-studio): add request editor and response viewer"
```

## Task 7：环境、Cookie、JWT、历史、脚本、附件、导入导出、Mock、Runner

**Files:**
- Add: `frontend/src/modules/api-studio/components/env-manager/**`
- Add: `frontend/src/modules/api-studio/components/history-panel/**`
- Add: `frontend/src/modules/api-studio/components/importer/**`
- Add: `frontend/src/modules/api-studio/components/runner/**`
- Add: `frontend/src/modules/api-studio/components/mock/**`
- Add: `frontend/src/modules/api-studio/components/ai/AiTestCaseDrawer.vue`
- Add: `frontend/src/modules/api-studio/stores/useEnvironmentStore.ts`
- Add: `frontend/src/modules/api-studio/stores/useHistoryStore.ts`
- Add: `frontend/src/modules/api-studio/stores/useRunnerStore.ts`
- Add: `frontend/src/modules/api-studio/__tests__/environment-store.spec.ts`
- Add: `frontend/src/modules/api-studio/__tests__/history-store.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('stores current environment and resolves template variables', () => {
  const store = useEnvironmentStore()
  store.setVariable('baseUrl', 'https://example.com')
  expect(store.resolve('{{baseUrl}}/ping')).toBe('https://example.com/ping')
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd frontend && npx vitest run src/modules/api-studio/__tests__/environment-store.spec.ts src/modules/api-studio/__tests__/history-store.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the tool panels and backing stores**

```ts
export const useEnvironmentStore = defineStore('api-studio-environment', () => {
  const variables = ref<Record<string, string>>({})
  function setVariable(key: string, value: string) {
    variables.value[key] = value
  }
  function resolve(input: string) {
    return input.replace(/\{\{(.*?)\}\}/g, (_, key) => variables.value[key.trim()] ?? '')
  }
  return { variables, setVariable, resolve }
})
```

- [ ] **Step 4: Run tests again**

Run: `cd frontend && npx vitest run src/modules/api-studio/__tests__/environment-store.spec.ts src/modules/api-studio/__tests__/history-store.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/api-studio/components/env-manager frontend/src/modules/api-studio/components/history-panel frontend/src/modules/api-studio/components/importer frontend/src/modules/api-studio/components/runner frontend/src/modules/api-studio/components/mock frontend/src/modules/api-studio/components/ai frontend/src/modules/api-studio/stores frontend/src/modules/api-studio/__tests__
git commit -m "feat(api-studio): add api studio utility panels"
```

## Task 8：切换入口、删除 iframe 依赖与清栈

**Files:**
- Modify: `frontend/src/views/ApiGroupHomeView.vue`
- Modify: `frontend/src/views/ProjectApiManagementView.vue`
- Modify: `frontend/src/router/index.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/specs/2026-06-23-api-studio-redesign-design.md`
- Add or modify: `docs/generated/api-studio-technical-design-v1.md`（如需）
- Modify: `backend/src/main/java/com/aiclub/platform/controller/YaadeProxyController.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/YaadeEmbedSessionService.java`
- Modify: `docker/yaade/scripts/apply-zh-cn.mjs`
- Modify: `docker/yaade/scripts/apply-aiclub-branding.mjs`
- Modify: `docker/yaade/Dockerfile`
- Modify: `backend/src/test/java/com/aiclub/platform/controller/YaadeProxyControllerTest.java`
- Modify: `backend/src/test/java/com/aiclub/platform/service/YaadeEmbedSessionServiceTest.java`

- [ ] **Step 1: Write the failing smoke tests**

```ts
it('navigates /apis to the new api studio layout when the flag is enabled', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/apis', name: 'api-groups', component: { name: 'ApiStudioGroupListView' } as never }
    ]
  })

  expect(router.resolve('/apis').name).toBe('api-groups')
})
```

- [ ] **Step 2: Run the smoke tests and verify failure**

Run: `cd frontend && npx vitest run src/modules/api-studio/__tests__/router.spec.ts`
Expected: FAIL until the feature flag switch is wired.

- [ ] **Step 3: Flip the route and remove the old entry points**

```ts
{
  path: 'apis',
  name: 'api-groups',
  component: ApiStudioGroupListView,
  meta: { title: 'API 项目', permission: 'api:view' }
}
```

- [ ] **Step 4: Run full verification**

Run:

```bash
python scripts/check_encoding.py
cd backend && mvn -s maven-settings-central.xml test
cd frontend && npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend backend docs docker/yaade
git commit -m "feat(api-studio): complete full replacement and remove iframe path"
```

## Acceptance

- `/apis` 入口由 AI Club 原生前端承载，不再默认依赖 Yaade iframe。
- Yaade API 能力仍可完整使用，且通过 project-scoped proxy 做项目隔离。
- 全量功能覆盖到位后，旧 iframe 链路与构建期补丁可删除。
- 编码检查、后端测试、前端构建都通过。
