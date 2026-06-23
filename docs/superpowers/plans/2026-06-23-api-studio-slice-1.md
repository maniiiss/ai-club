# API Studio 重写 · 切片 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 API Studio 重写的"基础设施 + 只读 MVP"：用 Vue 3 + Element Plus 在 `/apis` 路由下提供新前端的 Collection 树与单 Request 只读详情，后端新增 project-scoped proxy 路径与白名单服务，并通过 Feature Flag 与旧 iframe 并行。

**Architecture:** 后端新增 `/api/yaade/proxy/projects/{projectId}/**` 与 `/public/**` 两个 project-scoped 路径，由新服务 `YaadeProjectScopedProxyService` 做白名单准入 + 列表过滤 + 归属校验；鉴权改为平台 Bearer Token，cookie 在 `YaadeClientService` 内存按 platformUserId 分桶缓存。前端在 `frontend/src/modules/api-studio/` 下新建路由/视图/store/api 层，旧 `ProjectApiManagementView` 在 Feature Flag 关闭时仍是默认体验。

**Tech Stack:** Spring Boot 3 + Java 17 + JUnit 5 + Mockito + Vue 3 + Vite + Pinia + Element Plus + Axios + Vitest（前端单测沿用现有约定，无则用 `vitest`）。

## Global Constraints

- 所有源码、脚本、文档必须使用 UTF-8 无 BOM 保存。
- 中文必须直接写入文件，不允许写成 `\uXXXX` 转义。
- 新增或修改类、接口方法、实体字段、复杂流程时，需要补充中文注释说明业务意图。
- 修改前先阅读关联模块和现有测试，避免只按文件名猜测职责。
- 不要回滚、覆盖或格式化与当前任务无关的改动。
- 编码检查：`python scripts/check_encoding.py`
- 后端测试入口：`cd backend && mvn -s maven-settings-central.xml test`
- 前端构建入口：`cd frontend && npm run build`
- Feature Flag：`platform.frontend.api-studio.enabled`，默认 `false`；新增字段后旧客户端必须仍能解析（默认 false 即可）。
- Yaade 用户 cookie 缓存 TTL 沿用 `platform.yaade.proxy-session-ttl-minutes`（默认 120 分钟），不引入新配置项。
- 后端包名前缀 `com.aiclub.platform`，新文件统一放到 `service.yaade` 子包（新增）。

## 文件清单（一次性建好的目录与文件）

**后端（`backend/`）**

- 新增 `src/main/java/com/aiclub/platform/service/yaade/YaadeProjectScopedProxyService.java`
  · 职责：单一入口判断 `(method, relativePath, projectScope)` 是否合法 → 必要时附 group 过滤 / 归属校验。
- 新增 `src/main/java/com/aiclub/platform/service/yaade/ProjectScope.java`
  · 不可变值对象：项目作用域 (`projectId | PUBLIC`)、对应 `groupName`、`rootCollectionId`、是否可写。
- 新增 `src/main/java/com/aiclub/platform/service/yaade/YaadeEndpointWhitelist.java`
  · 切片 1 仅放行只读 endpoint（详见 Task 4）；后续切片扩。
- 修改 `src/main/java/com/aiclub/platform/controller/YaadeProxyController.java`
  · 增加 `/api/yaade/proxy/projects/{projectId}/**`、`/api/yaade/proxy/public/**` 两个 mapping 方法；旧 mapping 保留供老 iframe 用，但 javadoc 标注"切片 8 删除"。
- 修改 `src/main/java/com/aiclub/platform/service/YaadeClientService.java`
  · 增加 `YaadeSession getOrLoginUserCookie(long platformUserId)` 与 `void invalidateUserCookie(long platformUserId)`；新增内部缓存类 `UserCookieCache`（按用户分桶 + TTL）。
- 修改 `src/main/java/com/aiclub/platform/service/YaadeProperties.java`
  · 新增 `getApiStudioEnabled()` 方法（绑定 `platform.frontend.api-studio.enabled`，默认 false）。
- 修改 `src/main/java/com/aiclub/platform/dto/RuntimeCapabilities.java`
  · 新增字段 `boolean apiStudioEnabled`。
- 修改 `src/main/java/com/aiclub/platform/service/RuntimeCapabilityService.java`
  · 注入 `YaadeProperties`，把 `apiStudioEnabled` 填进 `RuntimeCapabilities`。
- 修改 `src/main/java/com/aiclub/platform/security/AuthInterceptor.java`
  · 在 `isPublicPath` 之外增加例外：`/api/yaade/proxy/projects/`、`/api/yaade/proxy/public/` 不属于 public path，必须经过鉴权。
- 修改 `src/main/resources/application.yml`
  · 增加 `platform.frontend.api-studio.enabled: false`。

**后端测试（`backend/src/test/java/com/aiclub/platform/`）**

- 新增 `service/yaade/YaadeEndpointWhitelistTests.java`
- 新增 `service/yaade/YaadeProjectScopedProxyServiceTests.java`
- 修改 `service/YaadeClientServiceTests.java`（追加 cookie 缓存测试）
- 修改 `controller/YaadeProxyControllerTests.java`（若已存在；否则新增）

**前端（`frontend/`）**

- 修改 `src/types/platform.ts`（或同义文件） · `RuntimeCapabilitiesItem` 加 `apiStudioEnabled: boolean`。
- 新增 `src/modules/api-studio/router.ts` · 导出子路由数组。
- 新增 `src/modules/api-studio/views/ApiStudioLayout.vue` · 左/中 split 总布局。
- 新增 `src/modules/api-studio/views/ApiGroupListView.vue` · 新版 GROUP 列表（仅 placeholder，复用既有 `ApiGroupHomeView` 数据源；切片 6 再美化）。
- 新增 `src/modules/api-studio/views/ApiWorkbenchView.vue` · 项目工作台（左树 + 右只读详情）。
- 新增 `src/modules/api-studio/components/collection-tree/CollectionTree.vue`
- 新增 `src/modules/api-studio/components/request-viewer/RequestReadonlyView.vue`
- 新增 `src/modules/api-studio/stores/useApiStudioSessionStore.ts`
- 新增 `src/modules/api-studio/stores/useCollectionsStore.ts`
- 新增 `src/modules/api-studio/api/yaade-rest.ts`
- 新增 `src/modules/api-studio/types/yaade.ts`
- 修改 `src/router/index.ts` · `/apis` 与 `/apis/projects/:projectId` 路由按 Feature Flag 切换组件。

**前端测试**

- 新增 `src/modules/api-studio/stores/__tests__/useCollectionsStore.spec.ts`

---

## Task 1：后端 — Feature Flag 字段串通到 RuntimeCapabilities

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/YaadeProperties.java`
- Modify: `backend/src/main/java/com/aiclub/platform/dto/RuntimeCapabilities.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/RuntimeCapabilityService.java`
- Modify: `backend/src/main/resources/application.yml`
- Test: `backend/src/test/java/com/aiclub/platform/service/RuntimeCapabilityServiceTests.java`（若不存在则新增）

**Interfaces:**
- Produces:
  - `YaadeProperties.isApiStudioEnabled() : boolean`（默认 false）
  - `RuntimeCapabilities(boolean serverManagementEnabled, boolean apiStudioEnabled)`
  - `application.yml` 新增 `platform.frontend.api-studio.enabled: false`

### Step 1.1 写失败测试

```java
// backend/src/test/java/com/aiclub/platform/service/RuntimeCapabilityServiceTests.java
package com.aiclub.platform.service;

import com.aiclub.platform.dto.RuntimeCapabilities;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.assertj.core.api.Assertions.assertThat;

class RuntimeCapabilityServiceTests {

    @Test
    void capabilitiesShouldExposeApiStudioFlag() {
        ServerModuleGateService gate = Mockito.mock(ServerModuleGateService.class);
        Mockito.when(gate.isEnabled()).thenReturn(true);
        YaadeProperties properties = new YaadeProperties(
                "http://localhost:9339/api/yaade/proxy",
                "admin",
                "password",
                "password",
                "未关联项目",
                120,
                true /* apiStudioEnabled */
        );

        RuntimeCapabilityService service = new RuntimeCapabilityService(gate, properties);
        RuntimeCapabilities capabilities = service.getCapabilities();

        assertThat(capabilities.serverManagementEnabled()).isTrue();
        assertThat(capabilities.apiStudioEnabled()).isTrue();
    }
}
```

注：Step 1.4 在 `YaadeProperties` 增加新的"7 参"测试构造函数 `(baseUrl, adminUsername, adminPassword, defaultUserPassword, publicCollectionName, proxySessionTtlMinutes, apiStudioEnabled)`，原 6 参构造函数透传 `apiStudioEnabled=false`，保持既有测试不破。

- [ ] **Step 1.2 跑测试确认失败**

```
cd backend && mvn -s maven-settings-central.xml -Dtest=RuntimeCapabilityServiceTests test
```
Expected: FAIL（`apiStudioEnabled` 字段不存在）

### Step 1.3 修改 `RuntimeCapabilities`

```java
// backend/src/main/java/com/aiclub/platform/dto/RuntimeCapabilities.java
package com.aiclub.platform.dto;

/**
 * 前端运行时能力开关。
 * 新字段必须保留向前兼容默认值，避免旧前端解析失败。
 */
public record RuntimeCapabilities(
        boolean serverManagementEnabled,
        boolean apiStudioEnabled
) {
}
```

### Step 1.4 在 `YaadeProperties` 增加开关读取

将以下内容追加到 `YaadeProperties` 类内（构造函数与 getter 之间的合适位置，遵循现有 `@Value` 模式）：

```java
private final boolean apiStudioEnabled;

// 构造函数顶部新增 @Value 注入：
// @Value("${platform.frontend.api-studio.enabled:false}") boolean apiStudioEnabled
// 并把该参数透传到所有重载构造里（默认 false）

/**
 * 控制平台是否启用新版 API Studio 前端。
 * 默认关闭：旧 iframe 仍是默认体验，灰度通过该开关在运营侧开启。
 */
public boolean isApiStudioEnabled() {
    return apiStudioEnabled;
}
```

（具体注入位置：在主 `@Autowired` 构造函数加 `@Value` 参数；其它重载构造函数透传 false。`normalizedConstructor` 那条私有构造也加 `boolean apiStudioEnabled` 参数。）

### Step 1.5 修改 `RuntimeCapabilityService`

```java
// backend/src/main/java/com/aiclub/platform/service/RuntimeCapabilityService.java
package com.aiclub.platform.service;

import com.aiclub.platform.dto.RuntimeCapabilities;
import org.springframework.stereotype.Service;

/**
 * 汇总前端在当前运行期需要感知的模块能力开关。
 */
@Service
public class RuntimeCapabilityService {

    private final ServerModuleGateService serverModuleGateService;
    private final YaadeProperties yaadeProperties;

    public RuntimeCapabilityService(ServerModuleGateService serverModuleGateService,
                                    YaadeProperties yaadeProperties) {
        this.serverModuleGateService = serverModuleGateService;
        this.yaadeProperties = yaadeProperties;
    }

    public RuntimeCapabilities getCapabilities() {
        return new RuntimeCapabilities(
                serverModuleGateService.isEnabled(),
                yaadeProperties.isApiStudioEnabled()
        );
    }
}
```

### Step 1.6 修改 `application.yml`

在 `platform:` 节点下增加：

```yaml
platform:
  # 现有配置不变 ...
  frontend:
    api-studio:
      enabled: false
```

- [ ] **Step 1.7 跑测试确认通过**

```
cd backend && mvn -s maven-settings-central.xml -Dtest=RuntimeCapabilityServiceTests test
```
Expected: PASS

- [ ] **Step 1.8 编码检查 + 全量后端测试样本**

```
python scripts/check_encoding.py
cd backend && mvn -s maven-settings-central.xml -Dtest='RuntimeCapabilityServiceTests,YaadeClientServiceTests' test
```
Expected: 编码检查通过，相关测试通过。

- [ ] **Step 1.9 提交**

```
git add backend/src/main/java/com/aiclub/platform/dto/RuntimeCapabilities.java \
        backend/src/main/java/com/aiclub/platform/service/RuntimeCapabilityService.java \
        backend/src/main/java/com/aiclub/platform/service/YaadeProperties.java \
        backend/src/main/resources/application.yml \
        backend/src/test/java/com/aiclub/platform/service/RuntimeCapabilityServiceTests.java
git commit -m "feat(yaade): RuntimeCapabilities 增加 apiStudioEnabled Feature Flag"
```

---

## Task 2：后端 — `YaadeClientService` 用户 cookie 缓存

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/YaadeClientService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/YaadeClientServiceTests.java`

**Interfaces:**
- Consumes: 既有 `login(username, password)`、`YaadeUserSyncService.loginCurrentUserWithSyncedGroups(null)` / `reauthenticateManagedUser(userId)`。
- Produces:
  - `YaadeSession getOrLoginUserCookie(long platformUserId)`
    · 若缓存内有未过期 cookie 直接返回；否则委托 `YaadeUserSyncService.reauthenticateManagedUser` 重新登录并入缓存。
  - `void invalidateUserCookie(long platformUserId)`
  - cookie 缓存 TTL 沿用 `YaadeProperties.getProxySessionTtlMinutes()`。
  - 缓存上限 1024 用户（LRU 淘汰），用 `LinkedHashMap` 简单实现。

### Step 2.1 写失败测试

```java
// 追加到 YaadeClientServiceTests.java 内
@Test
void getOrLoginUserCookieShouldCacheUntilInvalidated() {
    YaadeUserSyncService userSync = Mockito.mock(YaadeUserSyncService.class);
    YaadeClientService.YaadeSession session = new YaadeClientService.YaadeSession("yaade.session=abc");
    Mockito.when(userSync.reauthenticateManagedUser(42L))
            .thenReturn(new YaadeUserSyncService.YaadeAuthenticatedUserSession("aiclub-42", session, 99L));

    YaadeClientService service = new YaadeClientService(testProperties(), new ObjectMapper(), HttpClient.newHttpClient());
    service.setUserSyncProvider(() -> userSync); // 见 Step 2.3 引入的 setter

    YaadeClientService.YaadeSession first = service.getOrLoginUserCookie(42L);
    YaadeClientService.YaadeSession second = service.getOrLoginUserCookie(42L);

    assertThat(first.cookieHeader()).isEqualTo("yaade.session=abc");
    assertThat(second).isSameAs(first);
    Mockito.verify(userSync, Mockito.times(1)).reauthenticateManagedUser(42L);

    service.invalidateUserCookie(42L);
    service.getOrLoginUserCookie(42L);
    Mockito.verify(userSync, Mockito.times(2)).reauthenticateManagedUser(42L);
}
```

（`testProperties()` 沿用文件里已有的工厂方法；若无，复制一个返回 TTL = 120、其它字段任意的 `YaadeProperties`。）

- [ ] **Step 2.2 跑测试确认失败**

```
cd backend && mvn -s maven-settings-central.xml -Dtest=YaadeClientServiceTests#getOrLoginUserCookieShouldCacheUntilInvalidated test
```
Expected: FAIL（方法不存在）

### Step 2.3 在 `YaadeClientService` 实现

```java
// 类字段区域
private Supplier<YaadeUserSyncService> userSyncProvider;
private final UserCookieCache userCookieCache = new UserCookieCache(1024);

// 由 Spring 通过 setter 注入，避免与现有构造函数耦合
@Autowired(required = false)
public void setUserSyncService(YaadeUserSyncService userSyncService) {
    this.userSyncProvider = () -> userSyncService;
}

void setUserSyncProvider(Supplier<YaadeUserSyncService> provider) {
    this.userSyncProvider = provider;
}

/**
 * 取得指定平台用户对应的 Yaade 会话 cookie。
 * 命中缓存直接返回；未命中委托 YaadeUserSyncService 走代登链路并入缓存。
 * cookie TTL 与 platform.yaade.proxy-session-ttl-minutes 一致。
 */
public YaadeSession getOrLoginUserCookie(long platformUserId) {
    YaadeSession cached = userCookieCache.get(platformUserId);
    if (cached != null) {
        return cached;
    }
    if (userSyncProvider == null) {
        throw new IllegalStateException("YaadeUserSyncService 未注入，无法代登 Yaade 用户");
    }
    YaadeUserSyncService.YaadeAuthenticatedUserSession session =
            userSyncProvider.get().reauthenticateManagedUser(platformUserId);
    userCookieCache.put(platformUserId, session.session(),
            Duration.ofMinutes(yaadeProperties.getProxySessionTtlMinutes()));
    return session.session();
}

/**
 * 当 Yaade 返回 401 或用户主动登出时调用，强制下次重新代登。
 */
public void invalidateUserCookie(long platformUserId) {
    userCookieCache.invalidate(platformUserId);
}

/**
 * 简单的按用户 LRU + TTL cookie 缓存。
 * 不引入额外依赖，sync 块够用：cookie 取用频率远低于 HTTP 转发本身的 IO 开销。
 */
private static final class UserCookieCache {

    private final int capacity;
    private final LinkedHashMap<Long, Entry> store;

    UserCookieCache(int capacity) {
        this.capacity = capacity;
        this.store = new LinkedHashMap<>(capacity, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<Long, Entry> eldest) {
                return size() > UserCookieCache.this.capacity;
            }
        };
    }

    synchronized YaadeSession get(long userId) {
        Entry entry = store.get(userId);
        if (entry == null) {
            return null;
        }
        if (entry.expiresAt.isBefore(Instant.now())) {
            store.remove(userId);
            return null;
        }
        return entry.session;
    }

    synchronized void put(long userId, YaadeSession session, Duration ttl) {
        store.put(userId, new Entry(session, Instant.now().plus(ttl)));
    }

    synchronized void invalidate(long userId) {
        store.remove(userId);
    }

    private record Entry(YaadeSession session, Instant expiresAt) {
    }
}
```

需要相应 `import java.time.Instant; import java.util.function.Supplier; import org.springframework.beans.factory.annotation.Autowired;`。

- [ ] **Step 2.4 跑测试确认通过**

```
cd backend && mvn -s maven-settings-central.xml -Dtest=YaadeClientServiceTests test
```
Expected: PASS

- [ ] **Step 2.5 编码检查**

```
python scripts/check_encoding.py
```

- [ ] **Step 2.6 提交**

```
git add backend/src/main/java/com/aiclub/platform/service/YaadeClientService.java \
        backend/src/test/java/com/aiclub/platform/service/YaadeClientServiceTests.java
git commit -m "feat(yaade): YaadeClientService 增加按用户分桶的 Yaade cookie 缓存"
```

---

## Task 3：后端 — `ProjectScope` 与 `YaadeEndpointWhitelist`

**Files:**
- Create: `backend/src/main/java/com/aiclub/platform/service/yaade/ProjectScope.java`
- Create: `backend/src/main/java/com/aiclub/platform/service/yaade/YaadeEndpointWhitelist.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/yaade/YaadeEndpointWhitelistTests.java`

**Interfaces:**
- Produces:
  - `record ProjectScope(Long projectId, String groupName, Long rootCollectionId, boolean isPublicSpace, boolean writable)`
    · `projectId == null` 表示 PUBLIC 空间。
  - `enum WhitelistDecision { ALLOW_PASS_THROUGH, ALLOW_FILTER_COLLECTION_LIST, ALLOW_ENFORCE_RESOURCE_OWNERSHIP, DENY }`
  - `YaadeEndpointWhitelist.classify(String method, String relativePath, ProjectScope scope) : WhitelistDecision`
  - 切片 1 仅 ALLOW 以下 4 条只读组合：
    · `GET  /api/collection`                           → `ALLOW_FILTER_COLLECTION_LIST`
    · `GET  /api/collection/{collectionId}`            → `ALLOW_ENFORCE_RESOURCE_OWNERSHIP`
    · `GET  /api/request/{requestId}`                  → `ALLOW_ENFORCE_RESOURCE_OWNERSHIP`
    · `GET  /api/health`                               → `ALLOW_PASS_THROUGH`
  - 其它一律 `DENY`。

### Step 3.1 写失败测试

```java
// backend/src/test/java/com/aiclub/platform/service/yaade/YaadeEndpointWhitelistTests.java
package com.aiclub.platform.service.yaade;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class YaadeEndpointWhitelistTests {

    private final YaadeEndpointWhitelist whitelist = new YaadeEndpointWhitelist();
    private final ProjectScope projectScope = new ProjectScope(42L, "aiclub-project-42", 100L, false, false);
    private final ProjectScope publicScope = new ProjectScope(null, "aiclub-api-public", 200L, true, false);

    @Test
    void collectionListShouldRequireFiltering() {
        assertThat(whitelist.classify("GET", "/api/collection", projectScope))
                .isEqualTo(YaadeEndpointWhitelist.WhitelistDecision.ALLOW_FILTER_COLLECTION_LIST);
    }

    @Test
    void singleCollectionShouldRequireOwnershipCheck() {
        assertThat(whitelist.classify("GET", "/api/collection/100", projectScope))
                .isEqualTo(YaadeEndpointWhitelist.WhitelistDecision.ALLOW_ENFORCE_RESOURCE_OWNERSHIP);
    }

    @Test
    void singleRequestShouldRequireOwnershipCheck() {
        assertThat(whitelist.classify("GET", "/api/request/777", publicScope))
                .isEqualTo(YaadeEndpointWhitelist.WhitelistDecision.ALLOW_ENFORCE_RESOURCE_OWNERSHIP);
    }

    @Test
    void healthShouldPassThrough() {
        assertThat(whitelist.classify("GET", "/api/health", projectScope))
                .isEqualTo(YaadeEndpointWhitelist.WhitelistDecision.ALLOW_PASS_THROUGH);
    }

    @Test
    void unknownEndpointShouldDeny() {
        assertThat(whitelist.classify("GET", "/api/environment", projectScope))
                .isEqualTo(YaadeEndpointWhitelist.WhitelistDecision.DENY);
        assertThat(whitelist.classify("POST", "/api/collection", projectScope))
                .isEqualTo(YaadeEndpointWhitelist.WhitelistDecision.DENY);
        assertThat(whitelist.classify("PUT", "/api/request", projectScope))
                .isEqualTo(YaadeEndpointWhitelist.WhitelistDecision.DENY);
    }
}
```

- [ ] **Step 3.2 跑测试确认失败**

```
cd backend && mvn -s maven-settings-central.xml -Dtest=YaadeEndpointWhitelistTests test
```
Expected: FAIL（类不存在）

### Step 3.3 创建 `ProjectScope`

```java
// backend/src/main/java/com/aiclub/platform/service/yaade/ProjectScope.java
package com.aiclub.platform.service.yaade;

/**
 * 后端 proxy 层认定的"当前项目作用域"。
 * projectId 为 null 时表示公共空间（aiclub-api-public group），rootCollectionId 仍指向该空间根 collection。
 * writable 在切片 1 恒为 false（只读 MVP），后续切片按业务能力放开。
 */
public record ProjectScope(
        Long projectId,
        String groupName,
        Long rootCollectionId,
        boolean isPublicSpace,
        boolean writable
) {
}
```

### Step 3.4 创建 `YaadeEndpointWhitelist`

```java
// backend/src/main/java/com/aiclub/platform/service/yaade/YaadeEndpointWhitelist.java
package com.aiclub.platform.service.yaade;

import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Yaade REST endpoint 白名单。
 * 切片 1 仅放行只读必需的最小集合，未在表里的路径默认 DENY，
 * 用于在升级 YAADE_REF 后第一时间发现上游协议变化。
 */
@Component
public class YaadeEndpointWhitelist {

    private static final Pattern COLLECTION_BY_ID = Pattern.compile("^/api/collection/\\d+$");
    private static final Pattern REQUEST_BY_ID = Pattern.compile("^/api/request/\\d+$");

    public enum WhitelistDecision {
        ALLOW_PASS_THROUGH,
        ALLOW_FILTER_COLLECTION_LIST,
        ALLOW_ENFORCE_RESOURCE_OWNERSHIP,
        DENY
    }

    public WhitelistDecision classify(String method, String relativePath, ProjectScope scope) {
        if (method == null || relativePath == null || scope == null) {
            return WhitelistDecision.DENY;
        }
        String normalizedMethod = method.toUpperCase(Locale.ROOT);
        String pathOnly = stripQuery(relativePath);
        if ("GET".equals(normalizedMethod)) {
            if ("/api/health".equals(pathOnly)) {
                return WhitelistDecision.ALLOW_PASS_THROUGH;
            }
            if ("/api/collection".equals(pathOnly)) {
                return WhitelistDecision.ALLOW_FILTER_COLLECTION_LIST;
            }
            if (COLLECTION_BY_ID.matcher(pathOnly).matches()
                    || REQUEST_BY_ID.matcher(pathOnly).matches()) {
                return WhitelistDecision.ALLOW_ENFORCE_RESOURCE_OWNERSHIP;
            }
        }
        return WhitelistDecision.DENY;
    }

    private String stripQuery(String relativePath) {
        int index = relativePath.indexOf('?');
        return index < 0 ? relativePath : relativePath.substring(0, index);
    }
}
```

- [ ] **Step 3.5 跑测试确认通过**

```
cd backend && mvn -s maven-settings-central.xml -Dtest=YaadeEndpointWhitelistTests test
```
Expected: PASS

- [ ] **Step 3.6 编码检查 + 提交**

```
python scripts/check_encoding.py
git add backend/src/main/java/com/aiclub/platform/service/yaade/ \
        backend/src/test/java/com/aiclub/platform/service/yaade/YaadeEndpointWhitelistTests.java
git commit -m "feat(yaade): 新增 ProjectScope 与 YaadeEndpointWhitelist 切片 1 只读白名单"
```

---

## Task 4：后端 — `YaadeProjectScopedProxyService`

**Files:**
- Create: `backend/src/main/java/com/aiclub/platform/service/yaade/YaadeProjectScopedProxyService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/yaade/YaadeProjectScopedProxyServiceTests.java`

**Interfaces:**
- Consumes:
  - `YaadeProjectSyncService.requireVisibleProject(Long)` / `findBindingByProjectId(Long)` / `ensurePublicCollection()`
  - `YaadeClientService.getOrLoginUserCookie(long)` / `invalidateUserCookie(long)` / `forwardProxyRequest(...)` / `listCollections(YaadeSession)` / `findCollectionById(YaadeSession, Long)`
  - `YaadeEndpointWhitelist.classify(...)`
  - `AuthContextHolder.get()`
  - `YaadeProperties.projectGroupName(Long)` / `getPublicGroupName()`
- Produces:
  - `record ProxyOutcome(int statusCode, byte[] body, Map<String, List<String>> headers, String contentType)`
  - `ProxyOutcome dispatch(Long platformUserId, ProjectScope scope, String method, String relativePathWithQuery, Map<String, String> headers, byte[] body)`
    · 内部：classify → 解析作用域 → 转发 → 按 decision 做过滤 / 校验。
  - 失败语义：
    · DENY → 抛 `IllegalAccessException` 子类 / 自定义 `YaadeProxyDeniedException(reason, code)`；切片 1 简单用 `IllegalStateException` 包装，message 含 `code=YAADE_ENDPOINT_NOT_WHITELISTED`。
    · 资源越权 → 抛同类型异常，message 含 `code=YAADE_RESOURCE_OUT_OF_SCOPE`。

### Step 4.1 写失败测试

```java
// backend/src/test/java/com/aiclub/platform/service/yaade/YaadeProjectScopedProxyServiceTests.java
package com.aiclub.platform.service.yaade;

import com.aiclub.platform.service.YaadeClientService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class YaadeProjectScopedProxyServiceTests {

    private YaadeClientService yaadeClientService;
    private YaadeEndpointWhitelist whitelist;
    private YaadeProjectScopedProxyService service;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        yaadeClientService = Mockito.mock(YaadeClientService.class);
        whitelist = new YaadeEndpointWhitelist();
        objectMapper = new ObjectMapper();
        service = new YaadeProjectScopedProxyService(yaadeClientService, whitelist, objectMapper);
    }

    @Test
    void denyUnknownEndpoint() {
        ProjectScope scope = new ProjectScope(42L, "aiclub-project-42", 100L, false, false);
        assertThatThrownBy(() -> service.dispatch(1L, scope, "POST", "/api/collection", Map.of(), new byte[0]))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("YAADE_ENDPOINT_NOT_WHITELISTED");
    }

    @Test
    void collectionListShouldBeFilteredToProjectGroup() {
        ProjectScope scope = new ProjectScope(42L, "aiclub-project-42", 100L, false, false);
        Mockito.when(yaadeClientService.getOrLoginUserCookie(1L))
                .thenReturn(new YaadeClientService.YaadeSession("ck"));
        ArrayNode raw = objectMapper.createArrayNode();
        raw.add(collectionNode(100L, "API-42", "aiclub-project-42"));
        raw.add(collectionNode(200L, "API-43", "aiclub-project-43"));
        byte[] body = bytes(raw);
        Mockito.when(yaadeClientService.forwardProxyRequest(
                        Mockito.eq("GET"), Mockito.eq("/api/collection"),
                        Mockito.anyString(), Mockito.anyMap(), Mockito.any()))
                .thenReturn(new YaadeClientService.RawResponse(200, body, Map.of(), List.of()));

        YaadeProjectScopedProxyService.ProxyOutcome outcome =
                service.dispatch(1L, scope, "GET", "/api/collection", Map.of(), new byte[0]);

        String json = new String(outcome.body(), StandardCharsets.UTF_8);
        assertThat(json).contains("\"id\":100").doesNotContain("\"id\":200");
    }

    @Test
    void singleCollectionOutOfScopeShouldReject() {
        ProjectScope scope = new ProjectScope(42L, "aiclub-project-42", 100L, false, false);
        Mockito.when(yaadeClientService.getOrLoginUserCookie(1L))
                .thenReturn(new YaadeClientService.YaadeSession("ck"));
        byte[] body = bytes(collectionNode(200L, "API-43", "aiclub-project-43"));
        Mockito.when(yaadeClientService.forwardProxyRequest(
                        Mockito.eq("GET"), Mockito.eq("/api/collection/200"),
                        Mockito.anyString(), Mockito.anyMap(), Mockito.any()))
                .thenReturn(new YaadeClientService.RawResponse(200, body, Map.of(), List.of()));

        assertThatThrownBy(() -> service.dispatch(1L, scope, "GET", "/api/collection/200", Map.of(), new byte[0]))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("YAADE_RESOURCE_OUT_OF_SCOPE");
    }

    @Test
    void healthShouldPassThroughVerbatim() {
        ProjectScope scope = new ProjectScope(42L, "aiclub-project-42", 100L, false, false);
        Mockito.when(yaadeClientService.getOrLoginUserCookie(1L))
                .thenReturn(new YaadeClientService.YaadeSession("ck"));
        byte[] body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
        Mockito.when(yaadeClientService.forwardProxyRequest(
                        Mockito.eq("GET"), Mockito.eq("/api/health"),
                        Mockito.anyString(), Mockito.anyMap(), Mockito.any()))
                .thenReturn(new YaadeClientService.RawResponse(200, body, Map.of(), List.of()));

        YaadeProjectScopedProxyService.ProxyOutcome outcome =
                service.dispatch(1L, scope, "GET", "/api/health", Map.of(), new byte[0]);

        assertThat(new String(outcome.body(), StandardCharsets.UTF_8)).isEqualTo("{\"ok\":true}");
    }

    @Test
    void unauthorizedShouldInvalidateCookieAndRetryOnce() {
        ProjectScope scope = new ProjectScope(42L, "aiclub-project-42", 100L, false, false);
        Mockito.when(yaadeClientService.getOrLoginUserCookie(1L))
                .thenReturn(new YaadeClientService.YaadeSession("ck-old"))
                .thenReturn(new YaadeClientService.YaadeSession("ck-new"));
        byte[] body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
        Mockito.when(yaadeClientService.forwardProxyRequest(
                        Mockito.eq("GET"), Mockito.eq("/api/health"),
                        Mockito.anyString(), Mockito.anyMap(), Mockito.any()))
                .thenReturn(new YaadeClientService.RawResponse(401, new byte[0], Map.of(), List.of()))
                .thenReturn(new YaadeClientService.RawResponse(200, body, Map.of(), List.of()));

        YaadeProjectScopedProxyService.ProxyOutcome outcome =
                service.dispatch(1L, scope, "GET", "/api/health", Map.of(), new byte[0]);

        assertThat(outcome.statusCode()).isEqualTo(200);
        Mockito.verify(yaadeClientService).invalidateUserCookie(1L);
        Mockito.verify(yaadeClientService, Mockito.times(2))
                .forwardProxyRequest(Mockito.anyString(), Mockito.anyString(),
                        Mockito.anyString(), Mockito.anyMap(), Mockito.any());
    }

    private ObjectNode collectionNode(long id, String name, String groupName) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", id);
        node.put("ownerId", 0);
        node.put("version", "1.0.0");
        ObjectNode data = node.putObject("data");
        data.put("name", name);
        ArrayNode groups = data.putArray("groups");
        groups.add(groupName);
        return node;
    }

    private byte[] bytes(Object node) {
        try {
            return objectMapper.writeValueAsBytes(node);
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }
}
```

- [ ] **Step 4.2 跑测试确认失败**

```
cd backend && mvn -s maven-settings-central.xml -Dtest=YaadeProjectScopedProxyServiceTests test
```
Expected: FAIL（类不存在）

### Step 4.3 实现 `YaadeProjectScopedProxyService`

```java
// backend/src/main/java/com/aiclub/platform/service/yaade/YaadeProjectScopedProxyService.java
package com.aiclub.platform.service.yaade;

import com.aiclub.platform.service.YaadeClientService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Yaade 项目作用域 proxy 服务。
 * 按 (method, relativePath, projectScope) 决定放行与改写策略，
 * 上层 controller 只负责 HTTP 层 IO 与响应回写。
 */
@Service
public class YaadeProjectScopedProxyService {

    private final YaadeClientService yaadeClientService;
    private final YaadeEndpointWhitelist whitelist;
    private final ObjectMapper objectMapper;

    public YaadeProjectScopedProxyService(YaadeClientService yaadeClientService,
                                          YaadeEndpointWhitelist whitelist,
                                          ObjectMapper objectMapper) {
        this.yaadeClientService = yaadeClientService;
        this.whitelist = whitelist;
        this.objectMapper = objectMapper;
    }

    public ProxyOutcome dispatch(long platformUserId,
                                 ProjectScope scope,
                                 String method,
                                 String relativePathWithQuery,
                                 Map<String, String> headers,
                                 byte[] body) {
        YaadeEndpointWhitelist.WhitelistDecision decision = whitelist.classify(method, relativePathWithQuery, scope);
        if (decision == YaadeEndpointWhitelist.WhitelistDecision.DENY) {
            throw new IllegalStateException("Yaade 端点未放行，code=YAADE_ENDPOINT_NOT_WHITELISTED, method="
                    + method + ", path=" + relativePathWithQuery);
        }

        YaadeClientService.YaadeSession session = yaadeClientService.getOrLoginUserCookie(platformUserId);
        YaadeClientService.RawResponse raw = yaadeClientService.forwardProxyRequest(
                method, relativePathWithQuery, session.cookieHeader(), headers, body);
        if (raw.isUnauthorized()) {
            yaadeClientService.invalidateUserCookie(platformUserId);
            session = yaadeClientService.getOrLoginUserCookie(platformUserId);
            raw = yaadeClientService.forwardProxyRequest(
                    method, relativePathWithQuery, session.cookieHeader(), headers, body);
        }

        byte[] outBody = switch (decision) {
            case ALLOW_PASS_THROUGH -> raw.body();
            case ALLOW_FILTER_COLLECTION_LIST -> filterCollectionList(raw.body(), scope);
            case ALLOW_ENFORCE_RESOURCE_OWNERSHIP -> enforceOwnership(raw.body(), scope);
            case DENY -> throw new IllegalStateException("不应到达 DENY 分支");
        };
        return new ProxyOutcome(raw.statusCode(), outBody, raw.headers(), raw.contentType());
    }

    /**
     * 按当前作用域 groupName 过滤 Yaade collection 列表的顶层节点。
     * Yaade 的 children 嵌套结构本身已经按父-子关系组织，过滤顶层 = 过滤项目。
     */
    private byte[] filterCollectionList(byte[] body, ProjectScope scope) {
        if (body == null || body.length == 0) {
            return body;
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            if (!(root instanceof ArrayNode array)) {
                return body;
            }
            ArrayNode filtered = objectMapper.createArrayNode();
            array.forEach(node -> {
                if (matchesScope(node, scope)) {
                    filtered.add(node);
                }
            });
            return objectMapper.writeValueAsBytes(filtered);
        } catch (IOException ex) {
            throw new IllegalStateException("Yaade collection 列表过滤失败", ex);
        }
    }

    private byte[] enforceOwnership(byte[] body, ProjectScope scope) {
        if (body == null || body.length == 0) {
            return body;
        }
        try {
            JsonNode node = objectMapper.readTree(body);
            if (!matchesScope(node, scope)) {
                throw new IllegalStateException("Yaade 资源不在当前项目作用域，code=YAADE_RESOURCE_OUT_OF_SCOPE, scope=" + scope.groupName());
            }
            return body;
        } catch (IOException ex) {
            throw new IllegalStateException("Yaade 资源所有权校验失败", ex);
        }
    }

    private boolean matchesScope(JsonNode node, ProjectScope scope) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return false;
        }
        JsonNode dataNode = node.path("data");
        JsonNode groupsNode = dataNode.path("groups");
        List<String> groupNames = new ArrayList<>();
        if (groupsNode.isArray()) {
            groupsNode.forEach(g -> groupNames.add(g.asText("")));
        }
        // request 节点没有 groups，需要通过 collectionId 与 scope.rootCollectionId 校验；切片 1 通过测试覆盖。
        if (groupNames.isEmpty()) {
            JsonNode collectionId = node.path("collectionId");
            if (collectionId.isIntegralNumber() && scope.rootCollectionId() != null) {
                return collectionId.asLong() == scope.rootCollectionId();
            }
            return false;
        }
        return groupNames.contains(scope.groupName());
    }

    public record ProxyOutcome(int statusCode,
                               byte[] body,
                               Map<String, List<String>> headers,
                               String contentType) {
    }
}
```

- [ ] **Step 4.4 跑测试确认通过**

```
cd backend && mvn -s maven-settings-central.xml -Dtest=YaadeProjectScopedProxyServiceTests test
```
Expected: PASS

- [ ] **Step 4.5 编码检查 + 提交**

```
python scripts/check_encoding.py
git add backend/src/main/java/com/aiclub/platform/service/yaade/YaadeProjectScopedProxyService.java \
        backend/src/test/java/com/aiclub/platform/service/yaade/YaadeProjectScopedProxyServiceTests.java
git commit -m "feat(yaade): 新增 YaadeProjectScopedProxyService（白名单分发 / 列表过滤 / 归属校验 / 401 重试）"
```

---

## Task 5：后端 — `YaadeProxyController` 新增 project-scoped 路由

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/controller/YaadeProxyController.java`
- Modify: `backend/src/main/java/com/aiclub/platform/security/AuthInterceptor.java`
- Test: `backend/src/test/java/com/aiclub/platform/controller/YaadeProxyControllerScopedTests.java`

**Interfaces:**
- 新路径 `GET/POST/PUT/DELETE /api/yaade/proxy/projects/{projectId}/**`
- 新路径 `GET/POST/PUT/DELETE /api/yaade/proxy/public/**`
- 调用方必须携带 `Authorization: Bearer <token>`；`AuthContextHolder.get()` 必须能解析出 `userId`。
- 失败语义：白名单拒绝 → 403 + JSON `{ "code": "YAADE_ENDPOINT_NOT_WHITELISTED", "message": "..." }`；资源越权 → 403 + `YAADE_RESOURCE_OUT_OF_SCOPE`；项目可见性失败 → 沿用现有异常。

### Step 5.1 写失败测试

```java
// backend/src/test/java/com/aiclub/platform/controller/YaadeProxyControllerScopedTests.java
package com.aiclub.platform.controller;

import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.yaade.ProjectScope;
import com.aiclub.platform.service.yaade.YaadeProjectScopedProxyService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class YaadeProxyControllerScopedTests {

    private YaadeProjectScopedProxyService scopedProxy;
    private YaadeProxyController controller;

    @BeforeEach
    void setUp() {
        scopedProxy = Mockito.mock(YaadeProjectScopedProxyService.class);
        projectSync = Mockito.mock(YaadeProjectSyncService.class);
        Mockito.when(projectSync.requireVisibleProject(42L)).thenReturn(stubProject(42L));
        PlatformYaadeProjectBindingEntity binding = new PlatformYaadeProjectBindingEntity();
        binding.setProjectId(42L);
        binding.setYaadeCollectionId(100L);
        binding.setYaadeGroupName("aiclub-project-42");
        binding.setStatus("ACTIVE");
        Mockito.when(projectSync.findBindingByProjectId(42L)).thenReturn(binding);
        Mockito.when(projectSync.ensurePublicCollection()).thenReturn(
                new YaadeProjectSyncService.EnsureProjectBindingResult(
                        new YaadeProjectBindingSummary(null, true, true, 200L,
                                "aiclub-api-public", "ACTIVE", "未关联项目", null, null),
                        false));

        controller = new YaadeProxyController(
                Mockito.mock(YaadeEmbedSessionService.class),
                Mockito.mock(YaadeClientService.class),
                scopedProxy,
                projectSync);
        AuthContextHolder.set(new AuthContext(1L, "alice", "Alice", Set.of(), Set.of(), "token"));
    }

    private ProjectEntity stubProject(long id) {
        ProjectEntity project = new ProjectEntity();
        project.setId(id);
        return project;
    }

    @AfterEach
    void tearDown() {
        AuthContextHolder.clear();
    }

    @Test
    void projectScopedRouteShouldDispatchWithProjectScope() throws Exception {
        Mockito.when(scopedProxy.dispatch(
                Mockito.eq(1L), Mockito.any(ProjectScope.class),
                Mockito.eq("GET"), Mockito.eq("/api/collection"),
                Mockito.anyMap(), Mockito.any()))
                .thenReturn(new YaadeProjectScopedProxyService.ProxyOutcome(
                        200, "[]".getBytes(), Map.of(), "application/json"));

        MockHttpServletRequest request = new MockHttpServletRequest("GET",
                "/api/yaade/proxy/projects/42/api/collection");
        request.setContextPath("");
        MockHttpServletResponse response = new MockHttpServletResponse();

        controller.proxyProject(42L, request, response);

        ArgumentCaptor<ProjectScope> scopeCaptor = ArgumentCaptor.forClass(ProjectScope.class);
        Mockito.verify(scopedProxy).dispatch(Mockito.eq(1L), scopeCaptor.capture(),
                Mockito.eq("GET"), Mockito.eq("/api/collection"),
                Mockito.anyMap(), Mockito.any());
        assertThat(scopeCaptor.getValue().projectId()).isEqualTo(42L);
        assertThat(scopeCaptor.getValue().isPublicSpace()).isFalse();
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void publicScopedRouteShouldDispatchWithPublicScope() throws Exception {
        Mockito.when(scopedProxy.dispatch(
                Mockito.eq(1L), Mockito.any(ProjectScope.class),
                Mockito.eq("GET"), Mockito.eq("/api/health"),
                Mockito.anyMap(), Mockito.any()))
                .thenReturn(new YaadeProjectScopedProxyService.ProxyOutcome(
                        200, "{}".getBytes(), Map.of(), "application/json"));

        MockHttpServletRequest request = new MockHttpServletRequest("GET",
                "/api/yaade/proxy/public/api/health");
        MockHttpServletResponse response = new MockHttpServletResponse();

        controller.proxyPublic(request, response);

        ArgumentCaptor<ProjectScope> scopeCaptor = ArgumentCaptor.forClass(ProjectScope.class);
        Mockito.verify(scopedProxy).dispatch(Mockito.eq(1L), scopeCaptor.capture(),
                Mockito.eq("GET"), Mockito.eq("/api/health"),
                Mockito.anyMap(), Mockito.any());
        assertThat(scopeCaptor.getValue().projectId()).isNull();
        assertThat(scopeCaptor.getValue().isPublicSpace()).isTrue();
    }
}
```

注：构造器签名后续在 Step 5.3 落地；测试代码里的占位 `null` 写在该步会替换为真实依赖。

- [ ] **Step 5.2 跑测试确认失败**

```
cd backend && mvn -s maven-settings-central.xml -Dtest=YaadeProxyControllerScopedTests test
```
Expected: FAIL（方法 `proxyProject` / `proxyPublic` 不存在）

### Step 5.3 修改 `YaadeProxyController`

向 controller 注入两个新依赖 `YaadeProjectScopedProxyService scopedProxy`、`YaadeProjectSyncService projectSync`，并新增两个 mapping：

```java
@Autowired
public YaadeProxyController(YaadeEmbedSessionService yaadeEmbedSessionService,
                            YaadeClientService yaadeClientService,
                            YaadeProjectScopedProxyService scopedProxy,
                            YaadeProjectSyncService projectSync) {
    this.yaadeEmbedSessionService = yaadeEmbedSessionService;
    this.yaadeClientService = yaadeClientService;
    this.scopedProxy = scopedProxy;
    this.projectSync = projectSync;
}

@RequestMapping("/projects/{projectId}/**")
public void proxyProject(@PathVariable Long projectId,
                         HttpServletRequest request,
                         HttpServletResponse response) throws IOException {
    Long userId = AuthContextHolder.get()
            .map(AuthContext::userId)
            .orElseThrow(() -> new UnauthorizedException("Not logged in"));
    ProjectEntity project = projectSync.requireVisibleProject(projectId);
    PlatformYaadeProjectBindingEntity binding = projectSync.findBindingByProjectId(projectId);
    if (binding == null) {
        writePlain(response, HttpStatus.NOT_FOUND, "项目尚未与 Yaade collection 绑定，请先点击重新载入");
        return;
    }
    ProjectScope scope = new ProjectScope(
            projectId,
            binding.getYaadeGroupName(),
            binding.getYaadeCollectionId(),
            false,
            false /* 切片 1 只读 */
    );
    dispatchScoped(userId, scope, projectId, request, response, "/projects/" + projectId);
}

@RequestMapping("/public/**")
public void proxyPublic(HttpServletRequest request, HttpServletResponse response) throws IOException {
    Long userId = AuthContextHolder.get()
            .map(AuthContext::userId)
            .orElseThrow(() -> new UnauthorizedException("Not logged in"));
    YaadeProjectSyncService.EnsureProjectBindingResult publicResult = projectSync.ensurePublicCollection();
    YaadeProjectBindingSummary summary = publicResult.summary();
    ProjectScope scope = new ProjectScope(
            null,
            summary.yaadeGroupName(),
            summary.yaadeCollectionId(),
            true,
            false
    );
    dispatchScoped(userId, scope, null, request, response, "/public");
}

private void dispatchScoped(Long userId,
                            ProjectScope scope,
                            Long projectId,
                            HttpServletRequest request,
                            HttpServletResponse response,
                            String scopePrefix) throws IOException {
    String relativePath = resolveScopedRelativePath(request, scopePrefix);
    String relativeWithQuery = appendQuery(relativePath, request.getQueryString());
    byte[] body = StreamUtils.copyToByteArray(request.getInputStream());
    Map<String, String> headers = extractForwardHeaders(request);
    try {
        YaadeProjectScopedProxyService.ProxyOutcome outcome = scopedProxy.dispatch(
                userId, scope, request.getMethod(), relativeWithQuery, headers, body);
        writeScopedResponse(response, outcome);
    } catch (IllegalStateException ex) {
        String message = ex.getMessage() == null ? "" : ex.getMessage();
        if (message.contains("YAADE_ENDPOINT_NOT_WHITELISTED")) {
            writeJson(response, HttpStatus.FORBIDDEN, "{\"code\":\"YAADE_ENDPOINT_NOT_WHITELISTED\",\"message\":" + jsonString(message) + "}");
            return;
        }
        if (message.contains("YAADE_RESOURCE_OUT_OF_SCOPE")) {
            writeJson(response, HttpStatus.FORBIDDEN, "{\"code\":\"YAADE_RESOURCE_OUT_OF_SCOPE\",\"message\":" + jsonString(message) + "}");
            return;
        }
        throw ex;
    }
}

private String resolveScopedRelativePath(HttpServletRequest request, String scopePrefix) {
    String uri = request.getRequestURI();
    String contextPath = request.getContextPath() == null ? "" : request.getContextPath();
    String fullPrefix = contextPath + PROXY_PREFIX + scopePrefix;
    if (!uri.startsWith(fullPrefix)) {
        return "/";
    }
    String relative = uri.substring(fullPrefix.length());
    return relative.isBlank() ? "/" : relative;
}

private void writeScopedResponse(HttpServletResponse response,
                                  YaadeProjectScopedProxyService.ProxyOutcome outcome) throws IOException {
    response.setStatus(outcome.statusCode());
    outcome.headers().forEach((headerName, values) -> {
        if (headerName == null || values == null || values.isEmpty()) {
            return;
        }
        String normalized = headerName.toLowerCase(Locale.ROOT);
        if (HOP_BY_HOP_HEADERS.contains(normalized) || "set-cookie".equals(normalized)) {
            return;
        }
        values.forEach(value -> response.addHeader(headerName, value));
    });
    if (outcome.contentType() != null && !outcome.contentType().isBlank()) {
        response.setContentType(outcome.contentType());
    }
    if (outcome.body() != null && outcome.body().length > 0) {
        response.getOutputStream().write(outcome.body());
    }
}

private void writeJson(HttpServletResponse response, HttpStatus status, String json) throws IOException {
    response.setStatus(status.value());
    response.setContentType("application/json;charset=UTF-8");
    response.getWriter().write(json);
}

private String jsonString(String value) {
    String escaped = value.replace("\\", "\\\\").replace("\"", "\\\"");
    return "\"" + escaped + "\"";
}
```

注意：现有 `proxy(...)` 旧路由（无作用域）保留，但 javadoc 标注"切片 8 删除"。

### Step 5.4 修改 `AuthInterceptor`

将 `isPublicPath` 中 `/api/yaade/proxy` 这一条加上例外：新作用域路径必须鉴权。

```java
private boolean isPublicPath(String requestUri) {
    // 新版 API Studio 走 Bearer Token + 项目作用域，禁止以 public path 跳过鉴权。
    if (requestUri.startsWith("/api/yaade/proxy/projects/")
            || requestUri.startsWith("/api/yaade/proxy/public/")) {
        return false;
    }
    return requestUri.startsWith("/api/auth/login")
            || requestUri.startsWith("/api/auth/register")
            || requestUri.startsWith("/api/cicd/public/")
            || requestUri.startsWith("/api/gitlab/public/")
            || requestUri.startsWith("/api/yaade/health")
            || requestUri.startsWith("/api/yaade/proxy")
            || requestUri.startsWith("/api/common/public-files/")
            || requestUri.startsWith("/comment-images")
            || requestUri.startsWith("/actuator/health")
            || requestUri.startsWith("/error");
}
```

- [ ] **Step 5.5 跑测试确认通过**

```
cd backend && mvn -s maven-settings-central.xml -Dtest=YaadeProxyControllerScopedTests test
```
Expected: PASS

- [ ] **Step 5.6 跑相关回归 + 编码检查**

```
python scripts/check_encoding.py
cd backend && mvn -s maven-settings-central.xml -Dtest='YaadeProxyControllerScopedTests,YaadeControllerPermissionTests,YaadeEmbedSessionServiceTests,YaadeProjectScopedProxyServiceTests,YaadeEndpointWhitelistTests,YaadeClientServiceTests,YaadeProjectSyncServiceTests,YaadeUserSyncServiceTests' test
```
Expected: PASS

- [ ] **Step 5.7 提交**

```
git add backend/src/main/java/com/aiclub/platform/controller/YaadeProxyController.java \
        backend/src/main/java/com/aiclub/platform/security/AuthInterceptor.java \
        backend/src/test/java/com/aiclub/platform/controller/YaadeProxyControllerScopedTests.java
git commit -m "feat(yaade): YaadeProxyController 新增 project-scoped / public 路由并接入鉴权"
```

---

## Task 6：前端 — Feature Flag 字段透传

**Files:**
- Modify: `frontend/src/types/platform.ts`
- Modify: `frontend/src/stores/app.ts`
- Test: 手工跑 `npm run build`，不强制单测（类型扩展 + store 字段简单赋值）。

**Interfaces:**
- `RuntimeCapabilitiesItem` 增加 `apiStudioEnabled: boolean`
- `useAppStore` 增加 `apiStudioEnabled` ref 与 `refreshRuntimeCapabilities` 写回。

### Step 6.1 修改 `types/platform.ts`

查找 `RuntimeCapabilitiesItem` 并增字段：

```ts
export interface RuntimeCapabilitiesItem {
  serverManagementEnabled: boolean
  // 是否启用新版 API Studio 前端。默认 false：旧 iframe 仍是默认体验，运营侧可灰度开启。
  apiStudioEnabled: boolean
}
```

### Step 6.2 修改 `stores/app.ts`

```ts
const apiStudioEnabled = ref(false)

const refreshRuntimeCapabilities = async () => {
  const capabilities = await getRuntimeCapabilities()
  serverManagementEnabled.value = capabilities.serverManagementEnabled
  apiStudioEnabled.value = Boolean(capabilities.apiStudioEnabled)
  runtimeCapabilitiesLoaded.value = true
  return capabilities
}
```

并把 `apiStudioEnabled` 加入 store return。

- [ ] **Step 6.3 构建验证**

```
cd frontend && npm run build
```
Expected: 构建通过。

- [ ] **Step 6.4 提交**

```
git add frontend/src/types/platform.ts frontend/src/stores/app.ts
git commit -m "feat(api-studio): 前端 RuntimeCapabilities 透传 apiStudioEnabled Flag"
```

---

## Task 7：前端 — 模块骨架与类型 / API 层

**Files:**
- Create: `frontend/src/modules/api-studio/types/yaade.ts`
- Create: `frontend/src/modules/api-studio/api/yaade-rest.ts`

**Interfaces:**
- Produces:
  - `interface YaadeCollectionNode { id: number; name: string; groups: string[]; parentId: number | null; rank: number | null; children: YaadeCollectionNode[]; requests: YaadeRequestSummary[] }`
  - `interface YaadeRequestSummary { id: number; collectionId: number; name: string; method: string; url: string; type: string }`
  - `interface YaadeRequestDetail extends YaadeRequestSummary { headers: Array<{ key: string; value: string; isEnabled?: boolean }>; body?: { type: string; raw?: string; form?: unknown } }`
  - `listCollections(projectScope: { kind: 'project'; projectId: number } | { kind: 'public' }) : Promise<YaadeCollectionNode[]>`
  - `getCollection(scope, collectionId) : Promise<YaadeCollectionNode>`
  - `getRequest(scope, requestId) : Promise<YaadeRequestDetail>`

### Step 7.1 创建 `types/yaade.ts`

```ts
// frontend/src/modules/api-studio/types/yaade.ts

/** API Studio 用到的 Yaade 远端对象类型。
 *  字段命名与后端 proxy 透传一致，避免在 store 内多一层 mapper。 */

export interface YaadeRequestSummary {
  id: number
  collectionId: number
  name: string
  method: string
  url: string
  type: string
}

export interface YaadeRequestHeader {
  key: string
  value: string
  isEnabled?: boolean
}

export interface YaadeRequestBody {
  type: string
  raw?: string
  form?: unknown
}

export interface YaadeRequestDetail extends YaadeRequestSummary {
  headers: YaadeRequestHeader[]
  body?: YaadeRequestBody
}

export interface YaadeCollectionNode {
  id: number
  name: string
  groups: string[]
  parentId: number | null
  rank: number | null
  children: YaadeCollectionNode[]
  requests: YaadeRequestSummary[]
}

export type ApiStudioScope =
  | { kind: 'project'; projectId: number }
  | { kind: 'public' }
```

### Step 7.2 创建 `api/yaade-rest.ts`

```ts
// frontend/src/modules/api-studio/api/yaade-rest.ts
import { http } from '@/api/http'
import type { ApiStudioScope, YaadeCollectionNode, YaadeRequestDetail } from '../types/yaade'

const buildScopePath = (scope: ApiStudioScope) =>
  scope.kind === 'project' ? `/api/yaade/proxy/projects/${scope.projectId}` : '/api/yaade/proxy/public'

const parseRawCollection = (raw: any): YaadeCollectionNode => {
  // 后端 proxy 透传 Yaade 原始结构，这里只做必要扁平化与默认值。
  const data = raw?.data ?? {}
  return {
    id: Number(raw?.id ?? 0),
    name: String(data?.name ?? ''),
    groups: Array.isArray(data?.groups) ? data.groups.map((g: unknown) => String(g)) : [],
    parentId: data?.parentId == null ? null : Number(data.parentId),
    rank: typeof data?.rank === 'number' ? data.rank : null,
    children: Array.isArray(raw?.children) ? raw.children.map(parseRawCollection) : [],
    requests: Array.isArray(raw?.requests)
      ? raw.requests.map((r: any) => ({
          id: Number(r?.id ?? 0),
          collectionId: Number(r?.collectionId ?? raw?.id ?? 0),
          name: String(r?.data?.name ?? ''),
          method: String(r?.data?.method ?? 'GET'),
          url: String(r?.data?.uri ?? r?.data?.url ?? ''),
          type: String(r?.type ?? 'REST')
        }))
      : []
  }
}

const parseRawRequest = (raw: any): YaadeRequestDetail => {
  const data = raw?.data ?? {}
  return {
    id: Number(raw?.id ?? 0),
    collectionId: Number(raw?.collectionId ?? 0),
    name: String(data?.name ?? ''),
    method: String(data?.method ?? 'GET'),
    url: String(data?.uri ?? data?.url ?? ''),
    type: String(raw?.type ?? 'REST'),
    headers: Array.isArray(data?.headers)
      ? data.headers.map((h: any) => ({
          key: String(h?.key ?? ''),
          value: String(h?.value ?? ''),
          isEnabled: h?.isEnabled === undefined ? true : Boolean(h.isEnabled)
        }))
      : [],
    body: data?.body
      ? {
          type: String(data.body?.type ?? 'text'),
          raw: typeof data.body?.raw === 'string' ? data.body.raw : undefined,
          form: data.body?.form
        }
      : undefined
  }
}

export const listCollections = async (scope: ApiStudioScope): Promise<YaadeCollectionNode[]> => {
  const { data } = await http.get<any>(`${buildScopePath(scope)}/api/collection`)
  return Array.isArray(data) ? data.map(parseRawCollection) : []
}

export const getCollection = async (scope: ApiStudioScope, collectionId: number): Promise<YaadeCollectionNode> => {
  const { data } = await http.get<any>(`${buildScopePath(scope)}/api/collection/${collectionId}`)
  return parseRawCollection(data)
}

export const getRequest = async (scope: ApiStudioScope, requestId: number): Promise<YaadeRequestDetail> => {
  const { data } = await http.get<any>(`${buildScopePath(scope)}/api/request/${requestId}`)
  return parseRawRequest(data)
}
```

- [ ] **Step 7.3 构建验证**

```
cd frontend && npm run build
```
Expected: 通过。

- [ ] **Step 7.4 提交**

```
git add frontend/src/modules/api-studio/types/yaade.ts \
        frontend/src/modules/api-studio/api/yaade-rest.ts
git commit -m "feat(api-studio): 新增 yaade 类型与 REST 客户端"
```

---

## Task 8：前端 — Pinia stores

**Files:**
- Create: `frontend/src/modules/api-studio/stores/useApiStudioSessionStore.ts`
- Create: `frontend/src/modules/api-studio/stores/useCollectionsStore.ts`
- Test: `frontend/src/modules/api-studio/stores/__tests__/useCollectionsStore.spec.ts`

**Interfaces:**
- `useApiStudioSessionStore`: 持有当前 `scope`、`selectedRequestId`、`isApiStudioEnabled`（从 useAppStore 派生）。
- `useCollectionsStore`:
  - state: `{ rootCollections: YaadeCollectionNode[], loading: boolean, error: string | null }`
  - actions:
    - `loadCollections(scope: ApiStudioScope): Promise<void>`
    - `findRequest(requestId: number): YaadeRequestSummary | null`
  - getters: `flatRequests: YaadeRequestSummary[]`

### Step 8.1 写失败测试（前端单测）

如果 `frontend/` 尚未配置 vitest，先在 Step 8.0 安装（无需新依赖：检查 `package.json`，若已有 `vitest` 直接用；若无则跳过 vitest 部分，仅留 `npm run build` 做编译校验）。

```ts
// frontend/src/modules/api-studio/stores/__tests__/useCollectionsStore.spec.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollectionsStore } from '../useCollectionsStore'
import * as yaadeRest from '../../api/yaade-rest'

vi.mock('../../api/yaade-rest', () => ({
  listCollections: vi.fn(),
  getCollection: vi.fn(),
  getRequest: vi.fn()
}))

describe('useCollectionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadCollections 把扁平 request 缓存供后续 findRequest 查询', async () => {
    ;(yaadeRest.listCollections as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 100,
        name: 'API-42',
        groups: ['aiclub-project-42'],
        parentId: null,
        rank: 0,
        children: [],
        requests: [
          { id: 1001, collectionId: 100, name: 'login', method: 'POST', url: '/login', type: 'REST' }
        ]
      }
    ])

    const store = useCollectionsStore()
    await store.loadCollections({ kind: 'project', projectId: 42 })

    expect(store.rootCollections).toHaveLength(1)
    expect(store.flatRequests).toHaveLength(1)
    expect(store.findRequest(1001)?.name).toBe('login')
  })

  it('loadCollections 出错时记录 error 且 loading 复位', async () => {
    ;(yaadeRest.listCollections as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))

    const store = useCollectionsStore()
    await store.loadCollections({ kind: 'project', projectId: 42 })

    expect(store.error).toBe('boom')
    expect(store.loading).toBe(false)
    expect(store.rootCollections).toEqual([])
  })
})
```

### Step 8.2 创建 `useApiStudioSessionStore`

```ts
// frontend/src/modules/api-studio/stores/useApiStudioSessionStore.ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import type { ApiStudioScope } from '../types/yaade'

export const useApiStudioSessionStore = defineStore('apiStudioSession', () => {
  const scope = ref<ApiStudioScope | null>(null)
  const selectedRequestId = ref<number | null>(null)
  const appStore = useAppStore()
  const isApiStudioEnabled = computed(() => Boolean(appStore.apiStudioEnabled))

  const setScope = (next: ApiStudioScope | null) => {
    scope.value = next
    selectedRequestId.value = null
  }

  const setSelectedRequest = (requestId: number | null) => {
    selectedRequestId.value = requestId
  }

  return { scope, selectedRequestId, isApiStudioEnabled, setScope, setSelectedRequest }
})
```

### Step 8.3 创建 `useCollectionsStore`

```ts
// frontend/src/modules/api-studio/stores/useCollectionsStore.ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as yaadeRest from '../api/yaade-rest'
import type { ApiStudioScope, YaadeCollectionNode, YaadeRequestSummary } from '../types/yaade'

export const useCollectionsStore = defineStore('apiStudioCollections', () => {
  const rootCollections = ref<YaadeCollectionNode[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const flatRequests = computed<YaadeRequestSummary[]>(() => {
    const result: YaadeRequestSummary[] = []
    const visit = (node: YaadeCollectionNode) => {
      result.push(...node.requests)
      node.children.forEach(visit)
    }
    rootCollections.value.forEach(visit)
    return result
  })

  const loadCollections = async (scope: ApiStudioScope) => {
    loading.value = true
    error.value = null
    try {
      rootCollections.value = await yaadeRest.listCollections(scope)
    } catch (ex) {
      error.value = ex instanceof Error ? ex.message : String(ex)
      rootCollections.value = []
    } finally {
      loading.value = false
    }
  }

  const findRequest = (requestId: number) => {
    return flatRequests.value.find((r) => r.id === requestId) ?? null
  }

  return { rootCollections, loading, error, flatRequests, loadCollections, findRequest }
})
```

- [ ] **Step 8.4 跑前端单测**

如 `frontend/package.json` 含 `test` / `vitest`：
```
cd frontend && npx vitest run src/modules/api-studio/stores/__tests__/useCollectionsStore.spec.ts
```
Expected: PASS。
若仓库目前未启用 vitest：跳过单测命令，记入"待补"，并以 `npm run build` 做最低保障。

- [ ] **Step 8.5 提交**

```
git add frontend/src/modules/api-studio/stores/
git commit -m "feat(api-studio): 新增 ApiStudio session / collections Pinia stores"
```

---

## Task 9：前端 — 视图、路由切换与 Feature Flag

**Files:**
- Create: `frontend/src/modules/api-studio/components/collection-tree/CollectionTree.vue`
- Create: `frontend/src/modules/api-studio/components/request-viewer/RequestReadonlyView.vue`
- Create: `frontend/src/modules/api-studio/views/ApiStudioLayout.vue`
- Create: `frontend/src/modules/api-studio/views/ApiWorkbenchView.vue`
- Create: `frontend/src/modules/api-studio/views/ApiGroupListView.vue`
- Create: `frontend/src/modules/api-studio/router.ts`
- Modify: `frontend/src/router/index.ts`

**Interfaces:**
- 路由仍为 `/apis` 与 `/apis/projects/:projectId`；组件按 `useAppStore().apiStudioEnabled` 在新旧之间切换。
- 切片 1 不引入 Monaco（只读详情用 `<pre>` + JSON 简单缩进即可，避免引入体积过早膨胀）。

### Step 9.1 创建 `CollectionTree.vue`（基于 el-tree）

```vue
<!-- frontend/src/modules/api-studio/components/collection-tree/CollectionTree.vue -->
<template>
  <el-tree
    :data="treeData"
    :props="treeProps"
    node-key="key"
    highlight-current
    :expand-on-click-node="false"
    @node-click="handleNodeClick"
    class="api-studio-tree"
  >
    <template #default="{ data }">
      <span class="tree-node">
        <el-tag v-if="data.kind === 'request'" :type="methodTagType(data.method)" size="small" class="method-tag">
          {{ data.method }}
        </el-tag>
        <span class="tree-label">{{ data.label }}</span>
      </span>
    </template>
  </el-tree>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { YaadeCollectionNode } from '../../types/yaade'

interface TreeNode {
  key: string
  label: string
  kind: 'collection' | 'request'
  method?: string
  requestId?: number
  children?: TreeNode[]
}

const props = defineProps<{ collections: YaadeCollectionNode[] }>()
const emit = defineEmits<{ (e: 'select-request', requestId: number): void }>()

const treeProps = { children: 'children', label: 'label' }

const toNode = (node: YaadeCollectionNode): TreeNode => ({
  key: `c-${node.id}`,
  label: node.name || `Collection ${node.id}`,
  kind: 'collection',
  children: [
    ...node.children.map(toNode),
    ...node.requests.map((r) => ({
      key: `r-${r.id}`,
      label: r.name || `Request ${r.id}`,
      kind: 'request' as const,
      method: (r.method || 'GET').toUpperCase(),
      requestId: r.id
    }))
  ]
})

const treeData = computed<TreeNode[]>(() => props.collections.map(toNode))

const handleNodeClick = (node: TreeNode) => {
  if (node.kind === 'request' && typeof node.requestId === 'number') {
    emit('select-request', node.requestId)
  }
}

const methodTagType = (method: string) => {
  switch (method.toUpperCase()) {
    case 'GET': return 'success'
    case 'POST': return 'warning'
    case 'PUT': return 'primary'
    case 'DELETE': return 'danger'
    default: return 'info'
  }
}
</script>

<style scoped>
.api-studio-tree { padding: 8px; }
.tree-node { display: inline-flex; align-items: center; gap: 6px; }
.method-tag { font-family: var(--el-font-family-monospace, monospace); font-size: 11px; }
.tree-label { color: var(--el-text-color-primary); }
</style>
```

### Step 9.2 创建 `RequestReadonlyView.vue`

```vue
<!-- frontend/src/modules/api-studio/components/request-viewer/RequestReadonlyView.vue -->
<template>
  <el-empty v-if="!detail" description="选择左侧请求查看详情" />
  <div v-else class="request-readonly">
    <header class="request-readonly__header">
      <el-tag :type="methodTagType(detail.method)" size="large" class="method-tag">{{ detail.method }}</el-tag>
      <code class="request-readonly__url">{{ detail.url || '(no url)' }}</code>
    </header>

    <el-tabs class="request-readonly__tabs">
      <el-tab-pane label="Headers">
        <el-empty v-if="!detail.headers.length" description="无 Header" />
        <el-table v-else :data="detail.headers" stripe size="small">
          <el-table-column prop="key" label="Key" />
          <el-table-column prop="value" label="Value" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="Body">
        <el-empty v-if="!detail.body?.raw" description="无 Body" />
        <pre v-else class="request-readonly__body">{{ formattedBody }}</pre>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { YaadeRequestDetail } from '../../types/yaade'

const props = defineProps<{ detail: YaadeRequestDetail | null }>()

const methodTagType = (method: string) => {
  switch ((method || 'GET').toUpperCase()) {
    case 'GET': return 'success'
    case 'POST': return 'warning'
    case 'PUT': return 'primary'
    case 'DELETE': return 'danger'
    default: return 'info'
  }
}

const formattedBody = computed(() => {
  const raw = props.detail?.body?.raw
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
})
</script>

<style scoped>
.request-readonly { display: flex; flex-direction: column; height: 100%; gap: 12px; padding: 16px; }
.request-readonly__header { display: flex; align-items: center; gap: 12px; }
.method-tag { font-family: var(--el-font-family-monospace, monospace); }
.request-readonly__url { font-family: var(--el-font-family-monospace, monospace); color: var(--el-text-color-regular); }
.request-readonly__tabs { flex: 1; min-height: 0; }
.request-readonly__body { background: var(--el-fill-color-light); padding: 12px; border-radius: 6px; overflow: auto; max-height: 480px; }
</style>
```

### Step 9.3 创建 `ApiStudioLayout.vue`

```vue
<!-- frontend/src/modules/api-studio/views/ApiStudioLayout.vue -->
<template>
  <div class="api-studio-layout">
    <slot />
  </div>
</template>

<style scoped>
.api-studio-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--el-bg-color);
}
</style>
```

### Step 9.4 创建 `ApiWorkbenchView.vue`

```vue
<!-- frontend/src/modules/api-studio/views/ApiWorkbenchView.vue -->
<template>
  <ApiStudioLayout>
    <div class="workbench">
      <aside class="workbench__sidebar" v-loading="collectionsStore.loading">
        <header class="workbench__sidebar-header">
          <h3>{{ scopeTitle }}</h3>
          <el-button :icon="Refresh" text @click="refresh">刷新</el-button>
        </header>
        <el-alert v-if="collectionsStore.error" :title="collectionsStore.error" type="error" show-icon />
        <CollectionTree :collections="collectionsStore.rootCollections" @select-request="handleSelectRequest" />
      </aside>
      <main class="workbench__main" v-loading="detailLoading">
        <RequestReadonlyView :detail="currentDetail" />
      </main>
    </div>
  </ApiStudioLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import ApiStudioLayout from './ApiStudioLayout.vue'
import CollectionTree from '../components/collection-tree/CollectionTree.vue'
import RequestReadonlyView from '../components/request-viewer/RequestReadonlyView.vue'
import { useCollectionsStore } from '../stores/useCollectionsStore'
import { useApiStudioSessionStore } from '../stores/useApiStudioSessionStore'
import * as yaadeRest from '../api/yaade-rest'
import type { ApiStudioScope, YaadeRequestDetail } from '../types/yaade'

const route = useRoute()
const collectionsStore = useCollectionsStore()
const sessionStore = useApiStudioSessionStore()

const currentDetail = ref<YaadeRequestDetail | null>(null)
const detailLoading = ref(false)

const scope = computed<ApiStudioScope>(() => {
  const projectId = Number(route.params.projectId)
  if (Number.isFinite(projectId) && projectId > 0) {
    return { kind: 'project', projectId }
  }
  return { kind: 'public' }
})

const scopeTitle = computed(() => (scope.value.kind === 'project' ? `项目 #${scope.value.projectId}` : '公共空间'))

const refresh = () => collectionsStore.loadCollections(scope.value)

const handleSelectRequest = async (requestId: number) => {
  sessionStore.setSelectedRequest(requestId)
  detailLoading.value = true
  currentDetail.value = null
  try {
    currentDetail.value = await yaadeRest.getRequest(scope.value, requestId)
  } catch (ex) {
    currentDetail.value = null
    ElMessage.error(ex instanceof Error ? ex.message : String(ex))
  } finally {
    detailLoading.value = false
  }
}

watch(scope, (next) => {
  sessionStore.setScope(next)
  refresh()
}, { immediate: true })

onMounted(refresh)
</script>

<script lang="ts">
import { ElMessage } from 'element-plus'
export default {}
</script>

<style scoped>
.workbench { display: flex; flex: 1; min-height: 0; gap: 0; }
.workbench__sidebar {
  width: 320px;
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
.workbench__sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.workbench__sidebar-header h3 { margin: 0; font-size: 14px; }
.workbench__main { flex: 1; min-width: 0; }
</style>
```

### Step 9.5 创建 `ApiGroupListView.vue`

切片 1 复用既有 `ApiGroupHomeView` 的数据接口，仅作占位（避免在 Feature Flag 开启后 GROUP 页面回退到 iframe）。直接 import 并 re-export：

```vue
<!-- frontend/src/modules/api-studio/views/ApiGroupListView.vue -->
<script setup lang="ts">
// 切片 1 复用既有 GROUP 列表实现；切片 6 之后改为模块内自有列表。
import ApiGroupHomeView from '@/views/ApiGroupHomeView.vue'
</script>
<template>
  <ApiGroupHomeView />
</template>
```

### Step 9.6 创建 `router.ts`

```ts
// frontend/src/modules/api-studio/router.ts
import type { RouteRecordRaw } from 'vue-router'
import ApiGroupListView from './views/ApiGroupListView.vue'
import ApiWorkbenchView from './views/ApiWorkbenchView.vue'

export const apiStudioRoutes: RouteRecordRaw[] = [
  {
    path: 'apis',
    name: 'api-studio-groups',
    component: ApiGroupListView,
    meta: { title: 'API 项目', permission: 'api:view' }
  },
  {
    path: 'apis/projects/:projectId',
    name: 'api-studio-workbench',
    component: ApiWorkbenchView,
    meta: { title: 'API 工作台', permission: 'api:view', activeMenu: '/apis' }
  }
]
```

### Step 9.7 修改 `src/router/index.ts` Feature Flag 切换

把现有两条 `apis` 路由改造为按 `useAppStore().apiStudioEnabled` 切换组件：

```ts
// 在 children 数组里替换两条 apis 路由如下
{
  path: 'apis',
  name: 'api-groups',
  component: () => {
    const { useAppStore } = require('@/stores/app')
    const appStore = useAppStore()
    return appStore.apiStudioEnabled
      ? import('@/modules/api-studio/views/ApiGroupListView.vue')
      : import('@/views/ApiGroupHomeView.vue')
  },
  meta: { title: 'API 项目', permission: 'api:view' },
  beforeEnter: (to) => {
    const projectId = Number(to.query.projectId ?? '')
    if (Number.isFinite(projectId) && projectId > 0) {
      return { name: 'api-project-detail', params: { projectId: String(projectId) } }
    }
    return true
  }
},
{
  path: 'apis/projects/:projectId',
  name: 'api-project-detail',
  component: () => {
    const { useAppStore } = require('@/stores/app')
    const appStore = useAppStore()
    return appStore.apiStudioEnabled
      ? import('@/modules/api-studio/views/ApiWorkbenchView.vue')
      : import('@/views/ProjectApiManagementView.vue')
  },
  meta: { title: 'API 工作台', permission: 'api:view', activeMenu: '/apis' }
},
```

注：Vite 不支持 `require`，改用顶层 import 并在 component 函数里同步读取 store：

```ts
import ApiGroupHomeView from '@/views/ApiGroupHomeView.vue'
import ProjectApiManagementView from '@/views/ProjectApiManagementView.vue'
const ApiStudioGroupListView = () => import('@/modules/api-studio/views/ApiGroupListView.vue')
const ApiStudioWorkbenchView = () => import('@/modules/api-studio/views/ApiWorkbenchView.vue')

// ...
{
  path: 'apis',
  name: 'api-groups',
  component: () => {
    const appStore = useAppStore()
    return appStore.apiStudioEnabled ? ApiStudioGroupListView() : Promise.resolve({ default: ApiGroupHomeView })
  },
  // ...
}
```

并保证 router 启动前 `appStore.refreshRuntimeCapabilities()` 已经跑过（现有 `router.beforeEach` 已经在 `requiresAuth` 流程里调用了 `appStore.refreshRuntimeCapabilities()`，因此 Flag 在路由组件解析前已经就绪）。

- [ ] **Step 9.8 构建验证**

```
cd frontend && npm run build
```
Expected: 通过。

- [ ] **Step 9.9 手工回归脚本**

按 `docs/superpowers/specs/2026-06-23-api-studio-redesign-design.md` §11 验证清单 + 本切片专项：

1. `platform.frontend.api-studio.enabled=false`（默认）→ `/apis` 与 `/apis/projects/:id` 仍渲染旧 `ApiGroupHomeView` / `ProjectApiManagementView`，iframe 正常工作；
2. 在 `application.yml` 改成 `true` 重启 → `/apis` 进入 `ApiStudioGroupListView`，`/apis/projects/:id` 进入 `ApiWorkbenchView`，左树展示当前项目的 Yaade collections；点击 request 节点 → 右侧 Headers / Body 只读展示；
3. 直接访问 `/apis/projects/:idA`（用户无权项目）→ 后端 controller 抛 `ProjectNotVisible` 类异常，前端 403 toast；
4. 在浏览器手动改 URL 到 `/api/yaade/proxy/projects/{idA}/api/collection/{属于 idB 的 collectionId}` → 后端返回 403 + `YAADE_RESOURCE_OUT_OF_SCOPE`；
5. 浏览器手动访问 `/api/yaade/proxy/projects/{idA}/api/environment` → 后端返回 403 + `YAADE_ENDPOINT_NOT_WHITELISTED`。

- [ ] **Step 9.10 提交**

```
git add frontend/src/modules/api-studio/ frontend/src/router/index.ts
git commit -m "feat(api-studio): 新增只读 MVP 视图、路由 Feature Flag 切换"
```

---

## Task 10：联合 harness + 文档更新

**Files:**
- Modify: `docs/superpowers/specs/2026-06-23-api-studio-redesign-design.md` · 在"§12 待决问题"补 Feature Flag 决策（运营开关 + 默认 false 已落地，按用户灰度推迟到切片 6 前），或新增简短"切片 1 落地记录"段。
- Modify: `docs/architecture.md` · 在 Yaade 章节加一句："`/api/yaade/proxy/projects/{projectId}/**` 与 `/public/**` 为 API Studio 新版路径，鉴权走 Bearer + 后端代登 cookie 缓存。"

### Step 10.1 文档更新

按上面"Files"逐处补内容（每处 1–3 句），不展开技术细节。

### Step 10.2 跨服务 harness

```
python scripts/check_encoding.py
cd backend && mvn -s maven-settings-central.xml -Dtest='YaadeProjectScopedProxyServiceTests,YaadeProxyControllerScopedTests,YaadeEndpointWhitelistTests,YaadeClientServiceTests,RuntimeCapabilityServiceTests,YaadeControllerPermissionTests,YaadeEmbedSessionServiceTests,YaadeProjectSyncServiceTests,YaadeUserSyncServiceTests' test
cd frontend && npm run build
```
Expected: 全部通过。

### Step 10.3 提交

```
git add docs/superpowers/specs/2026-06-23-api-studio-redesign-design.md docs/architecture.md
git commit -m "docs(api-studio): 切片 1 落地记录与 Yaade 路径补充"
```

---

## Done 条件

- [ ] 所有 Task 测试通过、`npm run build` 通过、`check_encoding.py` 通过。
- [ ] `application.yml` 中 `platform.frontend.api-studio.enabled` 默认 `false`，旧 iframe 体验未被破坏。
- [ ] 灰度开启时 `/apis` 与 `/apis/projects/:id` 切到新前端，能完成"看树 + 选 Request 只读详情"全链路。
- [ ] 越权（跨项目资源 / 未放行 endpoint）一律 403，且 JSON 含明确 code。
- [ ] 文档已更新 spec 与 `docs/architecture.md`。
