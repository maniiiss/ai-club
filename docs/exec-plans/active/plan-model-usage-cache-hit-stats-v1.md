# 模型调用量缓存命中统计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在模型调用量统计与智能体调用量统计两个看板新增「缓存命中率」与「缓存命中 token 数」,自下而上打通采集、落账、聚合与展示链路。

**Architecture:** 复用单张流水表 `agent_invocation_log` 加 `cached_tokens` 列;在各 LLM 响应 extractor 补抽并归一化缓存字段(OpenAI `cached_tokens` / Anthropic `cache_read_input_tokens` -> `cachedTokens`);token 通过 `UsageSink` 透传到 `AgentInvocationRecorder` 落库;两个聚合 Service 的 native SQL 加 `SUM` + `NULLIF` 除零保护算命中率;DTO 加字段返回前端;前端两页新增 KPI 卡 + 表格列 + 趋势右轴线。

**Tech Stack:** Spring Boot + JPA/Hibernate + Flyway(PostgreSQL) + native SQL + JUnit 5;code-processing FastAPI(Python);前端 Vue 3 + Element Plus + ECharts + TypeScript。

## Global Constraints

- 所有源码、脚本、文档 UTF-8 无 BOM;中文直接写入,禁止 `\uXXXX` 转义。
- 新增实体字段、DTO 字段需补中文注释说明业务意图。
- 缓存口径:仅命中读取(`cache_read_input_tokens` / `cached_tokens`),不采集 `cache_creation_input_tokens`。命中率 = `cached_tokens / prompt_tokens`,分母为 0 时返回 null(前端显示 `-`)。
- 字段归一化命名:数据库列 `cached_tokens`(`INTEGER` nullable);Java/TS 字段 `cachedTokens`;命中率字段 `cacheHitRate`(`Double`/`number | null`,0-1)。
- 历史数据不回填,迁移前记录 `cached_tokens` 为 null,聚合 `SUM` 自动跳过。
- 迁移命名 `V<版本>__<snake_case>.sql`,紧接现有最新 `V145`。
- 后端测试:`cd backend && mvn -s maven-settings-central.xml test`;前端构建:`cd frontend && npm run build`;code-processing:`cd code-processing && pip install -e .`;编码检查:`python scripts/check_encoding.py`。
- 前置设计:`docs/design-docs/model-usage-cache-hit-stats-technical-design-v1.md`(已提交 commit abd0f264)。

---

## File Structure

| 层 | 文件 | 职责 | 动作 |
|---|---|---|---|
| DB | `backend/src/main/resources/db/migration/V146__agent_invocation_log_add_cached_tokens.sql` | 加列 | 新增 |
| 实体 | `backend/.../domain/model/AgentInvocationLogEntity.java` | `cachedTokens` 字段 | 修改 |
| 通道 | `backend/.../agentusage/UsageSink.java` | token 传递通道加 `cachedTokens` | 修改 |
| 记录器 | `backend/.../agentusage/AgentInvocationRecorder.java` | `buildRecord` 回填 | 修改 |
| Java extractor | `backend/.../service/ModelConfigService.java` | 3 处 extract + 2 record + 回填点 | 修改 |
| Java extractor | `backend/.../service/AssistantGatewayService.java` | `UsageTokens` + `extractUsage` + `readUsageInt` | 修改 |
| Java extractor | `backend/.../service/GitPilotModelProxyService.java` | `UsageAccumulator` + `observe` + sink 回填 | 修改 |
| ingest DTO | `backend/.../dto/ModelUsageIngestDtos.java` | `ModelUsageIngestItem` 加字段 | 修改 |
| ingest Service | `backend/.../service/ModelUsageIngestService.java` | `persistOne` 回填 sink | 修改 |
| Python | `code-processing/app/services/review_service.py` | `_extract_usage` 抽缓存 | 修改 |
| Python | `code-processing/app/.../model_usage_reporter.py` | event 加 `cachedTokens` | 修改 |
| 模型聚合 | `backend/.../service/ModelUsageStatsService.java` | overview/by-model/trend/by-provider SQL | 修改 |
| 模型 DTO | `backend/.../dto/ModelUsageStatsDtos.java` | 4 record 加字段 | 修改 |
| 智能体聚合 | `backend/.../service/AgentUsageStatsService.java` | overview/trend/by-*/logs SQL | 修改 |
| 智能体 DTO | `backend/.../dto/AgentUsageStatsDtos.java` | 6 record 加字段 | 修改 |
| 前端类型 | `frontend/src/api/model-usage.ts` | 4 interface 加字段 | 修改 |
| 前端类型 | `frontend/src/api/agent-usage.ts` | 对应 interface 加字段 | 修改 |
| 前端页 | `frontend/src/views/ModelUsageStatsView.vue` | KPI 卡 + 表格列 + 趋势线 | 修改 |
| 前端页 | `frontend/src/views/AgentUsageStatsView.vue` | KPI 卡 + 表格列 + 趋势线 | 修改 |

---

### Task 1: 数据库迁移与实体字段

**Files:**
- Create: `backend/src/main/resources/db/migration/V146__agent_invocation_log_add_cached_tokens.sql`
- Modify: `backend/src/main/java/com/aiclub/platform/domain/model/AgentInvocationLogEntity.java:155-156`(`total_tokens` 字段后插入新字段)

**Interfaces:**
- Produces: `agent_invocation_log.cached_tokens` 列;`AgentInvocationLogEntity.getCachedTokens()/setCachedTokens(Integer)`

- [ ] **Step 1: 写迁移脚本**

`V146__agent_invocation_log_add_cached_tokens.sql`:
```sql
-- 模型调用量统计:缓存命中读取的输入 token 数。
-- OpenAI prompt_tokens_details.cached_tokens / Anthropic cache_read_input_tokens 归一化;
-- null 表示上游未返回或 provider 不支持缓存。历史数据不回填。
ALTER TABLE agent_invocation_log ADD COLUMN cached_tokens INTEGER;
COMMENT ON COLUMN agent_invocation_log.cached_tokens IS '缓存命中读取的输入token数(OpenAI cached_tokens / Anthropic cache_read_input_tokens);null表示上游未返回或provider不支持缓存';
```

- [ ] **Step 2: 实体加字段**

在 `AgentInvocationLogEntity.java` 第 156 行 `private Integer totalTokens;` 之后插入(仿现有 `prompt_tokens` 字段模式):
```java
    /**
     * 缓存命中读取的输入 token 数（OpenAI cached_tokens / Anthropic cache_read_input_tokens 归一化）。
     * null 表示上游未返回或 provider 不支持缓存。
     */
    @Column(name = "cached_tokens")
    private Integer cachedTokens;
```
并在 getter/setter 区(类末尾,仿 `getPromptTokens`)加:
```java
    public Integer getCachedTokens() { return cachedTokens; }
    public void setCachedTokens(Integer cachedTokens) { this.cachedTokens = cachedTokens; }
```

- [ ] **Step 3: 验证迁移与映射**

Run: `cd backend && mvn -s maven-settings-central.xml test -Dtest=AgentInvocationLogEntityTest`
Expected: 现有实体测试通过(若该测试类不存在,跑 `mvn -s maven-settings-central.xml compile` 确认编译通过 + Flyway 迁移在测试库生效无报错)。

- [ ] **Step 4: Commit**
```bash
git add backend/src/main/resources/db/migration/V146__agent_invocation_log_add_cached_tokens.sql backend/src/main/java/com/aiclub/platform/domain/model/AgentInvocationLogEntity.java
git commit -m "feat(usage): agent_invocation_log 新增 cached_tokens 列与实体字段"
```

---

### Task 2: UsageSink 通道与 Recorder 回填

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/agentusage/UsageSink.java`
- Modify: `backend/src/main/java/com/aiclub/platform/agentusage/AgentInvocationRecorder.java:154-158`(`buildRecord` sink 字段回填段)

**Interfaces:**
- Consumes: Task 1 的 `AgentInvocationLogEntity.setCachedTokens`
- Produces: `UsageSink.getCachedTokens()/setCachedTokens(Integer)` 与 `setUsage(prompt, completion, total, cached)` 重载;Recorder 落账时写入 `cached_tokens`

- [ ] **Step 1: UsageSink 加字段与重载**

`UsageSink.java`:在 `private Integer totalTokens;` 后加字段;在现有 `setUsage(3参)` 后加 4 参重载;在 getter 区加 `getCachedTokens/setCachedTokens`:
```java
    private Integer cachedTokens;

    public void setUsage(Integer promptTokens, Integer completionTokens, Integer totalTokens, Integer cachedTokens) {
        setUsage(promptTokens, completionTokens, totalTokens);
        this.cachedTokens = cachedTokens;
    }
```
```java
    public Integer getCachedTokens() { return cachedTokens; }
    public void setCachedTokens(Integer cachedTokens) { this.cachedTokens = cachedTokens; }
```
> 保留现有 3 参 `setUsage` 重载,不破坏现有调用点。

- [ ] **Step 2: Recorder buildRecord 回填**

`AgentInvocationRecorder.java` 第 156 行 `entity.setTotalTokens(sink.getTotalTokens());` 之后插入:
```java
        entity.setCachedTokens(sink.getCachedTokens());
```

- [ ] **Step 3: 写失败测试**

`backend/src/test/java/com/aiclub/platform/agentusage/UsageSinkTest.java`:
```java
package com.aiclub.platform.agentusage;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class UsageSinkTest {
    @Test
    void setUsageWithCachedTokens_回填缓存字段() {
        UsageSink sink = new UsageSink();
        sink.setUsage(100, 50, 150, 60);
        assertEquals(100, sink.getPromptTokens());
        assertEquals(60, sink.getCachedTokens());
    }

    @Test
    void setCachedTokens_独立设置() {
        UsageSink sink = new UsageSink();
        sink.setUsage(100, 50, 150);
        assertNull(sink.getCachedTokens());
        sink.setCachedTokens(40);
        assertEquals(40, sink.getCachedTokens());
    }
}
```

- [ ] **Step 4: Run tests**
Run: `cd backend && mvn -s maven-settings-central.xml test -Dtest=UsageSinkTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/com/aiclub/platform/agentusage/UsageSink.java backend/src/main/java/com/aiclub/platform/agentusage/AgentInvocationRecorder.java backend/src/test/java/com/aiclub/platform/agentusage/UsageSinkTest.java
git commit -m "feat(usage): UsageSink 与 Recorder 支持 cachedTokens 透传"
```

---

### Task 3: ModelConfigService extractor 补抽

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/ModelConfigService.java:875-921`(三处 `extract*Usage`)、`:1124`(`ModelInvocation` record)、`:1141`(`ModelInvocationUsage` record)、`doInvokePromptWithUsage` 系列回填点(约 651/697/734/777/814/851)

**Interfaces:**
- Consumes: Task 2 的 `UsageSink.setUsage(...,cached)` 与 `setCachedTokens`
- Produces: `ModelInvocationUsage.cached()` / `ModelInvocation.cachedTokens()`;三处 extractor 返回的 `cachedTokens` 透传到 sink

**归一化口径:**
- OpenAI Responses:`usage.input_tokens_details.cached_tokens`
- OpenAI Chat:`usage.prompt_tokens_details.cached_tokens`
- Anthropic:`usage.cache_read_input_tokens`

- [ ] **Step 1: ModelInvocationUsage record 加 cached 字段**

`ModelConfigService.java:1141`:
```java
    private record ModelInvocationUsage(Integer input, Integer output, Integer total, Integer cached) {
    }
```

- [ ] **Step 2: ModelInvocation record 加 cachedTokens 字段**

`ModelConfigService.java:1124`:
```java
    public record ModelInvocation(String text, Integer promptTokens, Integer completionTokens, Integer totalTokens, Integer cachedTokens) {
    }
```

- [ ] **Step 3: 三处 extract 补抽缓存字段**

`extractOpenAiUsage`(行875,Responses)替换 `return new ModelInvocationUsage(...)`:
```java
        Integer cachedTokens = jsonIntOrNull(usage.path("input_tokens_details").path("cached_tokens"));
        return new ModelInvocationUsage(inputTokens, outputTokens, totalTokens, cachedTokens);
```
> Responses 缓存字段路径:`usage.input_tokens_details.cached_tokens`。

`extractOpenAiChatUsage`(行892,Chat)替换 return:
```java
        Integer cachedTokens = jsonIntOrNull(usage.path("prompt_tokens_details").path("cached_tokens"));
        return new ModelInvocationUsage(prompt, completion, total, cachedTokens);
```
> Chat 缓存字段路径:`usage.prompt_tokens_details.cached_tokens`。

`extractAnthropicUsage`(行909)在 `Integer total = ...` 之后、return 之前加:
```java
        Integer cachedTokens = jsonIntOrNull(usage.path("cache_read_input_tokens"));
        return new ModelInvocationUsage(inputTokens, outputTokens, total, cachedTokens);
```
> Anthropic 缓存字段:`usage.cache_read_input_tokens`(仅命中读取,不取 `cache_creation_input_tokens`)。

- [ ] **Step 4: 传透到 sink(回填点)**

搜索全文件 `new ModelInvocation(` 构造点,每个点把 `ModelInvocationUsage u` 的 `u.cached()` 作为第 5 参数传入:
```java
new ModelInvocation(text, u.input(), u.output(), u.total(), u.cached())
```
搜索 `sink.setUsage(` 调用点(从 `ModelInvocation` 取值回填 sink 的地方),改用 4 参重载或补 `setCachedTokens`:
```java
sink.setUsage(inv.promptTokens(), inv.completionTokens(), inv.totalTokens(), inv.cachedTokens());
```
> 若某构造点无对应 `ModelInvocationUsage`(如非流式直接构造),`cached` 传 `null`。

- [ ] **Step 5: 写 extractor 测试**

`backend/src/test/java/com/aiclub/platform/service/ModelConfigServiceUsageExtractTest.java`(用 ObjectMapper 构造 JsonNode):
```java
package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Method;
import static org.junit.jupiter.api.Assertions.*;

class ModelConfigServiceUsageExtractTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final ModelConfigService service = new ModelConfigService(null, null, null, null, null, null, null, null);
    // 注:构造参数按实际签名调整,或用 Mockito 构造;extract 为 private 方法用反射调用

    private Object invoke(String method, String json) throws Exception {
        Method m = ModelConfigService.class.getDeclaredMethod(method, JsonNode.class);
        m.setAccessible(true);
        return m.invoke(service, mapper.readTree(json));
    }

    @Test
    void openAiResponses_抽取input_tokens_details_cached_tokens() throws Exception {
        String json = "{\"usage\":{\"input_tokens\":100,\"output_tokens\":50,\"total_tokens\":150,"
                + "\"input_tokens_details\":{\"cached_tokens\":60}}}";
        Object u = invoke("extractOpenAiUsage", json);
        assertNotNull(u);
        // ModelInvocationUsage(Integer input, Integer output, Integer total, Integer cached)
        Method cached = u.getClass().getDeclaredMethod("cached");
        assertEquals(60, cached.invoke(u));
    }

    @Test
    void openAiChat_抽取prompt_tokens_details_cached_tokens() throws Exception {
        String json = "{\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":50,\"total_tokens\":150,"
                + "\"prompt_tokens_details\":{\"cached_tokens\":70}}}";
        Object u = invoke("extractOpenAiChatUsage", json);
        assertNotNull(u);
        Method cached = u.getClass().getDeclaredMethod("cached");
        assertEquals(70, cached.invoke(u));
    }

    @Test
    void anthropic_抽取cache_read_input_tokens() throws Exception {
        String json = "{\"usage\":{\"input_tokens\":100,\"output_tokens\":50,"
                + "\"cache_read_input_tokens\":80,\"cache_creation_input_tokens\":20}}";
        Object u = invoke("extractAnthropicUsage", json);
        assertNotNull(u);
        Method cached = u.getClass().getDeclaredMethod("cached");
        assertEquals(80, cached.invoke(u));
    }

    @Test
    void 无缓存字段时cached为null() throws Exception {
        String json = "{\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":50,\"total_tokens\":150}}";
        Object u = invoke("extractOpenAiChatUsage", json);
        Method cached = u.getClass().getDeclaredMethod("cached");
        assertNull(cached.invoke(u));
    }
}
```
> `ModelConfigService` 构造参数与 `extract*` 为 private:按实际构造器签名填参数(可传 null 或 mock),反射调用 private 方法。若构造过重,改为把 `jsonIntOrNull` 抽成 package-private 静态并单独测;但优先按现有测试范式(若仓库已有 `ModelConfigService` 测试类则在其内加方法)。

- [ ] **Step 6: Run tests**
Run: `cd backend && mvn -s maven-settings-central.xml test -Dtest=ModelConfigServiceUsageExtractTest`
Expected: PASS;若 `ModelConfigService` 构造器签名不符,按编译错误调整构造参数(传 null/mock)。

- [ ] **Step 7: Commit**
```bash
git add backend/src/main/java/com/aiclub/platform/service/ModelConfigService.java backend/src/test/java/com/aiclub/platform/service/ModelConfigServiceUsageExtractTest.java
git commit -m "feat(usage): ModelConfigService extractor 抽取并归一化 cached_tokens"
```

---

### Task 4: AssistantGatewayService extractor 补抽

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/AssistantGatewayService.java:274-306`(`extractUsage` + `readUsageInt` + `UsageTokens` record)、`ChatAssistantService.java:561`(sink.setUsage 回填点)

**Interfaces:**
- Consumes: Task 2 的 `UsageSink.setUsage(...,cached)`
- Produces: `UsageTokens.cachedTokens()`;流式对话落账 `cached_tokens`

- [ ] **Step 1: UsageTokens record 加字段**

`AssistantGatewayService.java:305`:
```java
    private record UsageTokens(Integer promptTokens, Integer completionTokens, Integer totalTokens, Integer cachedTokens) {
    }
```

- [ ] **Step 2: extractUsage 抽缓存字段**

`extractUsage`(行274)在 `Integer totalTokens = ...` 计算之后、`return new UsageTokens(...)` 之前加:
```java
        Integer cachedTokens = readUsageInt(usage, "cached_tokens", "cache_read_input_tokens");
```
并改 return:
```java
        return new UsageTokens(promptTokens, completionTokens, totalTokens, cachedTokens);
```
> `readUsageInt` 已支持多 key 兜底(OpenAI `cached_tokens` / Anthropic `cache_read_input_tokens`),复用即可。两个 key 都命中时取前者(实际只有其一存在)。

- [ ] **Step 3: 回填 sink**

`ChatAssistantService.java:561`(原 `sink.setUsage(prompt, completion, total)` 处)改为传 `usage.cachedTokens()`:
```java
sink.setUsage(usage.promptTokens(), usage.completionTokens(), usage.totalTokens(), usage.cachedTokens());
```
> 若该处是从 `AssistantGatewayResult` 取 usage,确认 `AssistantGatewayResult` 已携带 `UsageTokens`(前置设计已扩展);若变量名不同,按实际命名替换,核心是把 `cachedTokens` 作为第 4 参传入。

- [ ] **Step 4: 写测试**

`backend/src/test/java/com/aiclub/platform/service/AssistantGatewayServiceUsageTest.java`(反射调 private `extractUsage`):
```java
package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Method;
import static org.junit.jupiter.api.Assertions.*;

class AssistantGatewayServiceUsageTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void extractUsage_openAi抽取cached_tokens() throws Exception {
        String json = "{\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":50,\"total_tokens\":150,"
                + "\"prompt_tokens_details\":{\"cached_tokens\":65}}}";
        Object u = invokeExtract(json);
        Method cached = u.getClass().getDeclaredMethod("cachedTokens");
        assertEquals(65, cached.invoke(u));
    }

    @Test
    void extractUsage_anthropic抽取cache_read() throws Exception {
        String json = "{\"usage\":{\"input_tokens\":100,\"output_tokens\":50,"
                + "\"cache_read_input_tokens\":75}}";
        Object u = invokeExtract(json);
        Method cached = u.getClass().getDeclaredMethod("cachedTokens");
        assertEquals(75, cached.invoke(u));
    }

    private Object invokeExtract(String json) throws Exception {
        AssistantGatewayService svc = new AssistantGatewayService(null, null, null, null);
        // 构造参数按实际签名调整
        Method m = AssistantGatewayService.class.getDeclaredMethod("extractUsage", JsonNode.class);
        m.setAccessible(true);
        return m.invoke(svc, mapper.readTree(json));
    }
}
```

- [ ] **Step 5: Run tests**
Run: `cd backend && mvn -s maven-settings-central.xml test -Dtest=AssistantGatewayServiceUsageTest`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add backend/src/main/java/com/aiclub/platform/service/AssistantGatewayService.java backend/src/main/java/com/aiclub/platform/service/ChatAssistantService.java backend/src/test/java/com/aiclub/platform/service/AssistantGatewayServiceUsageTest.java
git commit -m "feat(usage): AssistantGatewayService 流式对话抽取 cached_tokens 并回填"
```

---

### Task 5: GitPilotModelProxyService UsageAccumulator 补抽

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/GitPilotModelProxyService.java:119`(sink.setUsage 回填)、`:194-227`(`UsageAccumulator` + `observe`)

**Interfaces:**
- Consumes: Task 2 的 `UsageSink.setUsage(...,cached)`
- Produces: `UsageAccumulator.cachedTokens`;GitPilot 代理流式落账 `cached_tokens`

- [ ] **Step 1: UsageAccumulator 加字段**

`GitPilotModelProxyService.java:194` `final class UsageAccumulator` 内加:
```java
        Integer cachedTokens;
```

- [ ] **Step 2: observe 的 OPENAI 分支抽 cached_tokens**

行 202 `if ("OPENAI".equals(provider))` 块内,`usageNode.isObject()` 之后补:
```java
                        Integer cached = readInt(usageNode, "cached_tokens", "prompt_tokens_details");
```
> OpenAI 流末 usage 的缓存可能在顶层 `usage.cached_tokens` 或 `usage.prompt_tokens_details.cached_tokens`。`readInt` 取多 key 第一个命中的数值;若 `prompt_tokens_details` 是对象而非数值,需改为:
```java
        JsonNode details = usageNode.path("prompt_tokens_details");
        Integer cached = readInt(usageNode, "cached_tokens");
        if (cached == null && details.isObject()) {
            cached = readInt(details, "cached_tokens");
        }
        if (cached != null) cachedTokens = cached;
```

- [ ] **Step 3: observe 的 ANTHROPIC 分支抽 cache_read_input_tokens**

行 214 `message_start` 块内,`Integer p = readInt(usageNode, "input_tokens");` 之后补:
```java
                            Integer cr = readInt(usageNode, "cache_read_input_tokens");
                            if (cr != null) cachedTokens = cr;
```

- [ ] **Step 4: sink 回填**

行 119 `sink.setUsage(usage.promptTokens, usage.completionTokens, usage.totalTokens);` 改为 4 参:
```java
                    sink.setUsage(usage.promptTokens, usage.completionTokens, usage.totalTokens, usage.cachedTokens);
```

- [ ] **Step 5: 写测试**

`backend/src/test/java/com/aiclub/platform/service/GitPilotModelProxyServiceUsageAccumulatorTest.java`:
```java
package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Method;
import static org.junit.jupiter.api.Assertions.*;

class GitPilotModelProxyServiceUsageAccumulatorTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void observe_openAi流末cached_tokens() throws Exception {
        Object acc = newAccumulator();
        invokeObserve(acc, "{\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":50,"
                + "\"total_tokens\":150,\"prompt_tokens_details\":{\"cached_tokens\":60}}}", "OPENAI");
        assertEquals(60, getCached(acc));
    }

    @Test
    void observe_anthropicMessageStart_cache_read() throws Exception {
        Object acc = newAccumulator();
        invokeObserve(acc, "{\"type\":\"message_start\",\"message\":{\"usage\":"
                + "{\"input_tokens\":100,\"cache_read_input_tokens\":80}}}", "ANTHROPIC");
        assertEquals(80, getCached(acc));
    }

    private Object newAccumulator() throws Exception {
        Class<?> outer = GitPilotModelProxyService.class;
        Class<?> inner = Class.forName("com.aiclub.platform.service.GitPilotModelProxyService$UsageAccumulator");
        return inner.getDeclaredConstructor().newInstance();
    }
    private void invokeObserve(Object acc, String json, String provider) throws Exception {
        Method m = acc.getClass().getDeclaredMethod("observe", String.class, String.class);
        m.setAccessible(true);
        m.invoke(acc, json, provider);
    }
    private Integer getCached(Object acc) throws Exception {
        Method m = acc.getClass().getDeclaredField("cachedTokens");
        m.setAccessible(true);
        return (Integer) m.get(acc);
    }
}
```
> `UsageAccumulator` 是包级私有内部类(注释行 192 说明包级私有以便单测)。若反射构造受阻,把 `observe`/字段改 package-private 后测,或直接在同包测试类里 `new GitPilotModelProxyService.UsageAccumulator()`。

- [ ] **Step 6: Run tests**
Run: `cd backend && mvn -s maven-settings-central.xml test -Dtest=GitPilotModelProxyServiceUsageAccumulatorTest`
Expected: PASS

- [ ] **Step 7: Commit**
```bash
git add backend/src/main/java/com/aiclub/platform/service/GitPilotModelProxyService.java backend/src/test/java/com/aiclub/platform/service/GitPilotModelProxyServiceUsageAccumulatorTest.java
git commit -m "feat(usage): GitPilotModelProxy UsageAccumulator 抽取 cached_tokens 并回填"
```

---

### Task 6: code-processing 采集与 ingest 回传

**Files:**
- Modify: `code-processing/app/services/review_service.py:386-411`(`_extract_usage`)
- Modify: `code-processing/app/.../model_usage_reporter.py`(event 构造,约 49-65 行)
- Modify: `backend/.../dto/ModelUsageIngestDtos.java:40-55`(`ModelUsageIngestItem`)
- Modify: `backend/.../service/ModelUsageIngestService.java:63-83`(`persistOne`)

**Interfaces:**
- Consumes: Task 2 的 `UsageSink.setUsage(...,cached)`
- Produces: Python `_extract_usage` 返回的 `cached_tokens`;回传链路 `ModelUsageIngestItem.cachedTokens()` -> sink -> `agent_invocation_log.cached_tokens`

- [ ] **Step 1: Python _extract_usage 抽缓存**

`review_service.py` `_extract_usage` 在组装 `result` dict 处补:
```python
    cached = (
        usage.get("prompt_tokens_details", {}).get("cached_tokens")
        if isinstance(usage.get("prompt_tokens_details"), dict)
        else None
    )
    if cached is None:
        cached = usage.get("cache_read_input_tokens")
    if cached is not None:
        result["cached_tokens"] = int(cached)
```
> OpenAI 兼容网关:先取 `prompt_tokens_details.cached_tokens`(Chat)或 `input_tokens_details.cached_tokens`(Responses,二者结构同),兜底取 Anthropic 的 `cache_read_input_tokens`。

- [ ] **Step 2: reporter event 带 cached_tokens**

`model_usage_reporter.py` 构造 event dict 处(在 `prompt_tokens/completion_tokens/total_tokens` 旁),从 `_extract_usage` 返回的 dict 透传:
```python
event["cachedTokens"] = usage.get("cached_tokens")
```
> JSON 字段名用 camelCase `cachedTokens` 与 Java DTO 对齐;Python 侧 `usage.get` 缺失返回 None,Java 侧反序列化为 null。

- [ ] **Step 3: ModelUsageIngestItem DTO 加字段**

`ModelUsageIngestDtos.java:40` record 在 `totalTokens` 参数后加:
```java
                                       Integer totalTokens,
                                       Integer cachedTokens,
                                       long durationMs,
```
并更新 javadoc `@param`:
```java
     * @param cachedTokens    缓存命中读取的输入 token，可空（provider 未返回或不支持缓存）
```

- [ ] **Step 4: persistOne 回填 sink**

`ModelUsageIngestService.java:81`:
```java
        sink.setUsage(item.promptTokens(), item.completionTokens(), item.totalTokens(), item.cachedTokens());
```

- [ ] **Step 5: 写 Python 测试**

`code-processing/tests/test_review_service_extract_usage.py`:
```python
from app.services.review_service import _extract_usage


def test_extract_usage_openai_cached():
    body = {"usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150,
                      "prompt_tokens_details": {"cached_tokens": 60}}}
    assert _extract_usage(body)["cached_tokens"] == 60


def test_extract_usage_anthropic_cache_read():
    body = {"usage": {"input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 80}}
    assert _extract_usage(body)["cached_tokens"] == 80


def test_extract_usage_无缓存字段不含cached_tokens():
    body = {"usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}}
    result = _extract_usage(body)
    assert "cached_tokens" not in result
```

- [ ] **Step 6: Run tests**
Run: `cd code-processing && pip install -e . && pytest tests/test_review_service_extract_usage.py -v`
Expected: PASS

- [ ] **Step 7: Commit**
```bash
git add code-processing/app/services/review_service.py code-processing/app/model_usage_reporter.py code-processing/tests/test_review_service_extract_usage.py backend/src/main/java/com/aiclub/platform/dto/ModelUsageIngestDtos.java backend/src/main/java/com/aiclub/platform/service/ModelUsageIngestService.java
git commit -m "feat(usage): code-processing 抽取 cached_tokens 并经 ingest 回传落账"
```
> reporter 文件实际路径以 `find code-processing -name model_usage_reporter.py` 为准(可能在 `app/services/` 或 `app/utils/`)。

---

### Task 7: 模型维度聚合 SQL 与 DTO

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/dto/ModelUsageStatsDtos.java:48-96`(`ModelOverview`/`ModelBreakdown`/`ModelTrendPoint`/`ProviderBreakdown`)
- Modify: `backend/src/main/java/com/aiclub/platform/service/ModelUsageStatsService.java:79-118`(overview)、`123-166`(by-model)、`171-193`(trend)、by-provider

**Interfaces:**
- Consumes: Task 1-6 落账的 `cached_tokens` 列
- Produces: 4 个 DTO record 新增 `cachedTokens`/`cacheHitRate` 字段;overview/by-model/trend/by-provider 返回缓存指标

- [ ] **Step 1: DTO record 加字段**

`ModelUsageStatsDtos.java`:
- `ModelOverview` 末尾加 `long cachedTokens, Double cacheHitRate`(record 参数尾部追加):
```java
    public record ModelOverview(long totalCalls, long successCount, long failureCount, double successRate,
                                long inputTokens, long outputTokens, long totalTokens, double tokenCoverage,
                                double avgDurationMs, long p95DurationMs, long activeModelCount, long distinctUsers,
                                long cachedTokens, Double cacheHitRate) {
    }
```
- `ModelBreakdown` 末尾加 `long cachedTokens, Double cacheHitRate`(在 `uniqueUserNames` 之后):
```java
    public record ModelBreakdown(String modelName, String provider, Long modelConfigId, long total, long success,
                                 long failure, double successRate, long inputTokens, long outputTokens, long totalTokens,
                                 double avgDurationMs, long p95DurationMs, long uniqueUsers, String uniqueUserNames,
                                 long cachedTokens, Double cacheHitRate) {
    }
```
- `ModelTrendPoint` 末尾加 `long cachedTokens, Double cacheHitRate`:
```java
    public record ModelTrendPoint(String bucket, long total, long success, long failure, long totalTokens,
                                  double avgDurationMs, long cachedTokens, Double cacheHitRate) {
    }
```
- `ProviderBreakdown` 末尾加 `long cachedTokens, Double cacheHitRate`。

- [ ] **Step 2: overview SQL + 映射**

`ModelUsageStatsService.java` getOverview SQL(行 83-95)在 `COUNT(DISTINCT user_id)... AS distinct_users ` 之后加:
```java
                "  COALESCE(SUM(cached_tokens), 0) AS cached_tokens, " +
                "  CASE WHEN COALESCE(SUM(prompt_tokens), 0) = 0 THEN NULL"
                + " ELSE SUM(cached_tokens) * 1.0 / SUM(prompt_tokens) END AS cache_hit_rate " +
```
row 映射补(原 row 长度 11,新增两个取 row[11]/row[12]):
```java
        long cachedTokens = toLong(row[11]);
        Double cacheHitRate = row[12] == null ? null : ((Number) row[12]).doubleValue();
        return new ModelOverview(
                total, success, failure, round(successRate),
                totalPrompt, totalCompletion, totalTotal, round(tokenCoverage),
                round(avgDuration), p95Duration, activeModels, distinctUsers,
                cachedTokens, cacheHitRate);
```

- [ ] **Step 3: by-model SQL + 映射**

getByModel SQL(行 132-147)在 `COALESCE(string_agg(...)) AS unique_user_names ` 之后、`FROM` 之前加:
```java
                "  COALESCE(SUM(cached_tokens), 0) AS cached_tokens, " +
                "  CASE WHEN COALESCE(SUM(prompt_tokens), 0) = 0 THEN NULL"
                + " ELSE SUM(cached_tokens) * 1.0 / SUM(prompt_tokens) END AS cache_hit_rate " +
```
映射:原 r 索引到 r[12](`unique_user_names`),新增 r[13]/r[14]:
```java
                    round(toDouble(r[9])), toLong(r[10]), toLong(r[11]),
                    truncateUserNames((String) r[12]),
                    toLong(r[13]),
                    r[14] == null ? null : ((Number) r[14]).doubleValue()));
```

- [ ] **Step 4: trend SQL + 映射**

getTrend SQL(行 177+)在 `COALESCE(AVG(duration_ms), 0) AS avg_duration ` 之后加:
```java
                "  COALESCE(SUM(cached_tokens), 0) AS cached_tokens, " +
                "  CASE WHEN COALESCE(SUM(prompt_tokens), 0) = 0 THEN NULL"
                + " ELSE SUM(cached_tokens) * 1.0 / SUM(prompt_tokens) END AS cache_hit_rate " +
```
映射(r[5] 是 avg_duration,新增 r[6]/r[7]):
```java
            result.add(new ModelTrendPoint(bucket, toLong(r[1]), toLong(r[2]), toLong(r[3]), toLong(r[4]),
                    round(toDouble(r[5])), toLong(r[6]),
                    r[7] == null ? null : ((Number) r[7]).doubleValue()));
```

- [ ] **Step 5: by-provider SQL + 映射**

照 by-model 模式:在 `total_tokens` 聚合后加 `cached_tokens` 与 `cache_hit_rate` 两列,映射对应追加。

- [ ] **Step 6: 写聚合测试**

`backend/src/test/java/com/aiclub/platform/service/ModelUsageStatsServiceCacheHitTest.java`(用 `@DataJpaTest` 或 `@SpringBootTest` 注入 repository 灌数据):
```java
package com.aiclub.platform.service;

import com.aiclub.platform.dto.ModelUsageStatsDtos.*;
import com.aiclub.platform.repository.AgentInvocationLogRepository;
import com.aiclub.platform.domain.model.AgentInvocationLogEntity;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class ModelUsageStatsServiceCacheHitTest {
    @Autowired ModelUsageStatsService service;
    @Autowired AgentInvocationLogRepository repo;

    @Test
    void overview_缓存命中率等于cached除以prompt() {
        saveLog("gpt-4", "OPENAI", 100, 50, 150, 60); // prompt=100, cached=60
        saveLog("gpt-4", "OPENAI", 200, 0, 200, null); // prompt=200, cached=null
        ModelOverview ov = service.getOverview(req());
        assertEquals(60, ov.cachedTokens());
        // SUM(prompt)=300, cached=60 -> 0.2
        assertEquals(0.2, ov.cacheHitRate(), 0.001);
    }

    @Test
    void overview_promptTokens全为0时命中率返回null() {
        saveLog("m", "X", 0, 0, 0, null);
        ModelOverview ov = service.getOverview(req());
        assertNull(ov.cacheHitRate());
    }

    private void saveLog(String model, String provider, Integer prompt, Integer comp, Integer total, Integer cached) {
        AgentInvocationLogEntity e = new AgentInvocationLogEntity();
        e.setAgentType("UNKNOWN_MODEL_CALL"); e.setStatus("SUCCESS");
        e.setModelName(model); e.setProvider(provider); e.setTriggerSource("AUTO");
        e.setUsernameSnapshot(""); e.setNicknameSnapshot(""); e.setDurationMs(1L);
        e.setPromptTokens(prompt); e.setCompletionTokens(comp); e.setTotalTokens(total); e.setCachedTokens(cached);
        e.setCreatedAt(LocalDateTime.now());
        repo.save(e);
    }
    private ModelUsageQueryRequest req() {
        return new ModelUsageQueryRequest(null, null, null, null, "day", 20);
    }
}
```
> `AgentInvocationLogEntity` 的 `status`/`agentType`/`triggerSource` 字段类型若为枚举则用枚举名;`createdAt` 由 DB 默认值或显式 set。若 `@SpringBootTest` 启动重,改用 `@DataJpaTest` + 手动 new service(entityManager 注入)。`setStatus` 若是枚举按实际调整。

- [ ] **Step 7: Run tests**
Run: `cd backend && mvn -s maven-settings-central.xml test -Dtest=ModelUsageStatsServiceCacheHitTest`
Expected: PASS

- [ ] **Step 8: Commit**
```bash
git add backend/src/main/java/com/aiclub/platform/dto/ModelUsageStatsDtos.java backend/src/main/java/com/aiclub/platform/service/ModelUsageStatsService.java backend/src/test/java/com/aiclub/platform/service/ModelUsageStatsServiceCacheHitTest.java
git commit -m "feat(usage): 模型维度聚合 SQL 与 DTO 增加 cached_tokens/cacheHitRate"
```

---

### Task 8: 智能体维度聚合 SQL 与 DTO

**Files:**
- Modify: `backend/.../dto/AgentUsageStatsDtos.java:55-159`(6 个 record)
- Modify: `backend/.../service/AgentUsageStatsService.java:75-118`(overview)、`141-164`(trend)、`169-197`(by-agent)、by-user、by-model、`268-309`(logs)

**Interfaces:**
- Consumes: Task 1-6 落账的 `cached_tokens`
- Produces: 智能体维度 6 个 DTO 的 `cachedTokens`/`cacheHitRate`;logs 明细 `cachedTokens`

- [ ] **Step 1: DTO 加字段**

`AgentUsageStatsDtos.java`:
- `AgentUsageOverview` 末尾加 `long cachedTokens, Double cacheHitRate`。
- `AgentUsageTrendPoint` 末尾加 `long cachedTokens, Double cacheHitRate`。
- `AgentUsageAgentBreakdown` 末尾(`totalTokens` 后)加 `long cachedTokens, Double cacheHitRate`。
- `AgentUsageUserBreakdown` 末尾加 `long cachedTokens, Double cacheHitRate`。
- `AgentUsageModelBreakdown` 末尾加 `long cachedTokens, Double cacheHitRate`。
- `AgentInvocationLogSummary` 在 `totalTokens` 后加 `Integer cachedTokens`(明细仅 token,无率):
```java
            Integer promptTokens, Integer completionTokens, Integer totalTokens,
            Integer cachedTokens,
            Integer inputChars, Integer outputChars,
```

- [ ] **Step 2: overview SQL + 映射**

`AgentUsageStatsService.java` getOverview(行 79-91)在 `SUM(...unknown_count) ` 之后加:
```java
                "  COALESCE(SUM(cached_tokens), 0) AS cached_tokens, " +
                "  CASE WHEN COALESCE(SUM(prompt_tokens), 0) = 0 THEN NULL"
                + " ELSE SUM(cached_tokens) * 1.0 / SUM(prompt_tokens) END AS cache_hit_rate " +
```
映射:原 row 索引到 row[10](`unknown_count`),新增 row[11]/row[12]:
```java
        return new AgentUsageOverview(
                total, success, failure, round(successRate),
                totalPrompt, totalCompletion, totalTotal, round(tokenCoverage),
                round(avgDuration), p95Duration, distinctUsers,
                unknownCount, unknownSources,
                toLong(row[11]),
                row[12] == null ? null : ((Number) row[12]).doubleValue());
```

- [ ] **Step 3: trend SQL + 映射**

getTrend(行 147-154)在 `COALESCE(AVG(duration_ms), 0) AS avg_duration ` 之后加两列;映射 r[5] 是 avg_duration,新增 r[6]/r[7]:
```java
            result.add(new AgentUsageTrendPoint(bucket, toLong(r[1]), toLong(r[2]), toLong(r[3]), toLong(r[4]),
                    round(toDouble(r[5])), toLong(r[6]),
                    r[7] == null ? null : ((Number) r[7]).doubleValue()));
```

- [ ] **Step 4: by-agent / by-user / by-model SQL + 映射**

每段在 `total_tokens` 聚合后加 `cached_tokens` 与 `cache_hit_rate` 两列,映射对应追加(照 Task 7 by-model 模式)。by-agent 映射 `new AgentUsageAgentBreakdown(...)` 末尾追加两参。

- [ ] **Step 5: logs 明细 SQL + 映射**

getLogs(行 273-306)dataSql SELECT 在 `total_tokens` 之后加 `cached_tokens`:
```java
        String dataSql = "SELECT id, created_at, user_id, username_snapshot, nickname_snapshot, " +
                "agent_type, action, model_name, provider, status, trigger_source, duration_ms, " +
                "prompt_tokens, completion_tokens, total_tokens, cached_tokens, input_chars, output_chars, " +
                "error_code, error_message " +
```
映射:r[14] 原 `total_tokens`,新增 `cached_tokens` 占 r[15],`input_chars` 顺移为 r[16],`output_chars` 为 r[17],`error_code` r[18],`error_message` r[19]:
```java
            content.add(new AgentInvocationLogSummary(
                    ((Number) r[0]).longValue(), toTime(r[1]),
                    r[2] == null ? null : ((Number) r[2]).longValue(),
                    (String) r[3], (String) r[4], typeCode, resolveAgentLabel(typeCode),
                    (String) r[6], (String) r[7], (String) r[8], (String) r[9], (String) r[10],
                    r[11] == null ? null : ((Number) r[11]).longValue(),
                    r[12] == null ? null : ((Number) r[12]).intValue(),
                    r[13] == null ? null : ((Number) r[13]).intValue(),
                    r[14] == null ? null : ((Number) r[14]).intValue(),
                    r[15] == null ? null : ((Number) r[15]).intValue(), // cached_tokens
                    r[16] == null ? null : ((Number) r[16]).intValue(), // input_chars
                    r[17] == null ? null : ((Number) r[17]).intValue(), // output_chars
                    (String) r[18], (String) r[19]
            ));
```
> 注意 SELECT 列顺序变更后,所有 r[i] 索引顺移,务必同步。

- [ ] **Step 6: 写聚合测试**

`backend/src/test/java/com/aiclub/platform/service/AgentUsageStatsServiceCacheHitTest.java`(照 Task 7 模式,断言 `AgentUsageOverview.cachedTokens()`/`cacheHitRate()` 与 logs 明细 `cachedTokens`):
```java
    @Test
    void overview_缓存命中率与明细cachedTokens() {
        saveLog(...); // 灌 prompt/cached 数据
        AgentUsageOverview ov = service.getOverview(req());
        assertEquals(expected, ov.cacheHitRate(), 0.001);
    }
```

- [ ] **Step 7: Run tests**
Run: `cd backend && mvn -s maven-settings-central.xml test -Dtest=AgentUsageStatsServiceCacheHitTest`
Expected: PASS

- [ ] **Step 8: Commit**
```bash
git add backend/src/main/java/com/aiclub/platform/dto/AgentUsageStatsDtos.java backend/src/main/java/com/aiclub/platform/service/AgentUsageStatsService.java backend/src/test/java/com/aiclub/platform/service/AgentUsageStatsServiceCacheHitTest.java
git commit -m "feat(usage): 智能体维度聚合 SQL 与 DTO 增加 cached_tokens/cacheHitRate"
```

---

### Task 9: 前端模型统计页类型与展示

**Files:**
- Modify: `frontend/src/api/model-usage.ts:33-82`(4 interface)
- Modify: `frontend/src/views/ModelUsageStatsView.vue:57-78`(KPI 卡)、`:100-131`(表格)、`:297-316`(趋势 option)

**Interfaces:**
- Consumes: Task 7 的后端返回字段
- Produces: 模型统计页新增缓存命中 KPI 卡、表格两列、趋势右轴线

- [ ] **Step 1: TS 类型加字段**

`model-usage.ts`:
- `ModelOverview` 末尾加 `cachedTokens: number; cacheHitRate: number | null;`
- `ModelBreakdown` 末尾加 `cachedTokens: number; cacheHitRate: number | null;`
- `ModelTrendPoint` 末尾加 `cachedTokens: number; cacheHitRate: number | null;`
- `ProviderBreakdown` 末尾加同两字段。

- [ ] **Step 2: KPI 卡新增缓存命中**

`ModelUsageStatsView.vue` 模板 KPI 区(行 57-78)`活跃模型` 卡之后插入第 5 张卡:
```vue
      <div class="kpi-card">
        <div class="kpi-label">缓存命中</div>
        <div class="kpi-value">{{ formatNumber(overview?.cachedTokens ?? 0) }}</div>
        <div class="kpi-sub" v-if="overview?.cacheHitRate != null">命中率 {{ formatPercent(overview.cacheHitRate) }}</div>
        <div class="kpi-sub" v-else>命中率 -</div>
      </div>
```
> grid 自适应已存在(`.kpi-row` 为 grid,窄屏自动换行),无需改布局。`formatPercent`/`formatNumber` 为页面已有函数。

- [ ] **Step 3: 表格加两列**

模板表格(行 100-131)`总Token` 列(`prop="totalTokens"`)之后插入:
```vue
        <el-table-column prop="cachedTokens" label="缓存命中Token" width="130" sortable>
          <template #default="{ row }">{{ formatNumber(row.cachedTokens) }}</template>
        </el-table-column>
        <el-table-column label="缓存命中率" width="120" sortable :sort-method="(a,b)=>(a.cacheHitRate??-1)-(b.cacheHitRate??-1)">
          <template #default="{ row }">
            <span v-if="row.cacheHitRate != null">{{ formatPercent(row.cacheHitRate) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
```

- [ ] **Step 4: 趋势图加命中率右轴线**

`trendLineOption`(行 297-316)改为:
```ts
const trendLineOption = computed(() => {
  const buckets = trend.value.map((p) => p.bucket)
  const totals = trend.value.map((p) => p.total)
  const tokens = trend.value.map((p) => p.totalTokens)
  const rates = trend.value.map((p) => (p.cacheHitRate == null ? null : Math.round(p.cacheHitRate * 100)))
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['调用数', 'Token 数', '缓存命中率'] },
    grid: { left: '3%', right: '5%', bottom: '10%', containLabel: true },
    dataZoom: [{ type: 'inside' }],
    xAxis: { type: 'category', data: buckets, boundaryGap: false },
    yAxis: [
      { type: 'value', name: '调用数' },
      { type: 'value', name: 'Token' },
      { type: 'value', name: '命中率%', min: 0, max: 100, position: 'right', splitLine: { show: false } }
    ],
    series: [
      { name: '调用数', type: 'line', smooth: true, data: totals, itemStyle: { color: '#409eff' } },
      { name: 'Token 数', type: 'line', smooth: true, yAxisIndex: 1, data: tokens, itemStyle: { color: '#67c23a' } },
      { name: '缓存命中率', type: 'line', smooth: true, yAxisIndex: 2, data: rates,
        lineStyle: { type: 'dashed' }, itemStyle: { color: '#e6a23c' }, connectNulls: true }
    ]
  }
})
```
> 第 3 个 yAxis(右侧),series 用 `yAxisIndex: 2`,虚线 + `connectNulls` 处理 null(不支持缓存的桶)。

- [ ] **Step 5: 构建验证**
Run: `cd frontend && npm run build`
Expected: 无 TS 类型错误,构建成功。

- [ ] **Step 6: Commit**
```bash
git add frontend/src/api/model-usage.ts frontend/src/views/ModelUsageStatsView.vue
git commit -m "feat(usage): 模型统计页展示缓存命中 KPI/表格列/趋势线"
```

---

### Task 10: 前端智能体统计页类型与展示

**Files:**
- Modify: `frontend/src/api/agent-usage.ts`(对应 interface 加字段)
- Modify: `frontend/src/views/AgentUsageStatsView.vue`(KPI 卡 + by-agent/by-user/by-model 表格两列 + logs 明细一列 + 趋势线)

**Interfaces:**
- Consumes: Task 8 的后端返回字段
- Produces: 智能体统计页新增缓存指标展示(与模型页一致策略)

- [ ] **Step 1: TS 类型加字段**

`agent-usage.ts`:对应 `AgentUsageOverview`、`AgentUsageTrendPoint`、`AgentUsageAgentBreakdown`、`AgentUsageUserBreakdown`、`AgentUsageModelBreakdown` 末尾加 `cachedTokens: number; cacheHitRate: number | null;`;`AgentInvocationLogSummary` 在 `totalTokens` 后加 `cachedTokens: number | null;`。

- [ ] **Step 2: KPI 卡 + 聚合表 + logs 明细 + 趋势线**

`AgentUsageStatsView.vue` 照 Task 9 模式:
- KPI 区新增「缓存命中」卡(主值 `overview.cachedTokens`,副信息命中率 `overview.cacheHitRate` 或 `-`)。
- `by-agent`/`by-user`/`by-model` 三张表在 `totalTokens` 列后加 `缓存命中Token` + `缓存命中率` 两列(模板同 Task 9 Step 3)。
- `logs` 明细表在 `totalTokens` 列后加 `缓存命中Token` 一列(`prop="cachedTokens"`)。
- 趋势图 `trendLineOption` 改为三 yAxis + 命中率虚线 series(同 Task 9 Step 4)。

- [ ] **Step 3: 构建验证**
Run: `cd frontend && npm run build`
Expected: 无 TS 类型错误,构建成功。

- [ ] **Step 4: Commit**
```bash
git add frontend/src/api/agent-usage.ts frontend/src/views/AgentUsageStatsView.vue
git commit -m "feat(usage): 智能体统计页展示缓存命中 KPI/表格列/趋势线"
```

---

### Task 11: 全量验证与文档收尾

**Files:**
- 无代码文件;运行 harness 与文档更新

- [ ] **Step 1: 编码检查**
Run: `python scripts/check_encoding.py`
Expected: 全部 UTF-8 无 BOM,无 `\uXXXX` 中文转义。

- [ ] **Step 2: 后端全量测试**
Run: `cd backend && mvn -s maven-settings-central.xml test`
Expected: 全部通过(含新增 extractor/sink/聚合测试 + 现有回归)。

- [ ] **Step 3: code-processing 测试**
Run: `cd code-processing && pip install -e . && pytest`
Expected: 通过。

- [ ] **Step 4: 前端构建**
Run: `cd frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 5: 扩展验证(手动,需运行环境)**
- 触发一次 OpenAI 模型调用(带缓存命中):`psql` 查 `agent_invocation_log` 该条 `cached_tokens` 等于响应 `cached_tokens`。
- 触发一次 Anthropic 调用(prompt caching 命中):`cached_tokens` 等于 `cache_read_input_tokens`。
- 不支持缓存的模型调用:`cached_tokens` 为 null。
- code-processing 代码审核:回传记录 `cached_tokens` 正确落账。
- 访问 `/model-usage-stats` 与智能体统计页:KPI 卡、表格两列、趋势右轴线数据正确;无数据时命中率显示 `-`。
- 调整时间范围到迁移前历史段:命中率偏低或 `-`,符合预期。

- [ ] **Step 6: 文档更新**
- 在 `docs/architecture.md` 模型统计章节补一句缓存命中指标(若该章节存在)。
- 确认 `docs/design-docs/index.md` 已含本设计条目(已在 commit abd0f264 提交)。

- [ ] **Step 7: Commit**
```bash
git add docs/architecture.md
git commit -m "docs(usage): 架构文档补充缓存命中统计指标"
```

---

## Self-Review

**1. Spec 覆盖:**
- §2.1 目标(加列、归一化、两看板展示、口径)→ Task 1-10 全覆盖。
- §2.2 非目标(不采集 creation、不回填、不加汇总表)→ Global Constraints + 各 Task 未涉及 creation_tokens。
- §5.2 流程(Java 采集 + code-processing 采集 + 看板查询)→ Task 3-6 采集、Task 7-10 聚合展示。
- §5.3 数据/接口/配置变更(迁移、实体、DTO、SQL、前端类型、展示)→ Task 1,2,7,8,9,10。
- §7 风险(provider 兼容、除零、历史 null)→ extractor 返回 null、SQL NULLIF/CASE、Global Constraints。
- §8 Harness → Task 11。

**2. Placeholder scan:** 无 TBD/TODO。回填点用「搜索 `new ModelInvocation(` / `sink.setUsage(` 全量替换 + 给出新签名」形式,属机械传透,可执行。

**3. Type consistency:** `cachedTokens`/`cacheHitRate` 命名在 DB(列)/Java(record 字段)/Python(event key camelCase)/TS(interface)全程一致;`cacheHitRate` 在聚合 DTO 为 `Double`(null 表不支持),明细 `AgentInvocationLogSummary` 仅 `cachedTokens`(单条无率),与设计 §5.3 一致。

---

## Execution Handoff

Plan complete and saved to `docs/exec-plans/active/plan-model-usage-cache-hit-stats-v1.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 每个 Task 派一个 fresh subagent 实施,Task 间 review,快速迭代。

**2. Inline Execution** - 当前会话内按 executing-plans 批量执行,带检查点 review。

Which approach?
