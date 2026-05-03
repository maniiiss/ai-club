# Execution Result Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为执行中心所有结果态补齐站内通知，并让前端消息中心正确展示新增业务类型。

**Architecture:** 以后端 `ExecutionDispatchService` 统一收口通知为主，继续保留开发执行待确认的专用通知；前端只扩充通知业务类型映射，不新增接口或交互。测试优先覆盖后端收口通知行为，再补前端构建和文档更新。

**Tech Stack:** Spring Boot、JUnit 5、Mockito、Vue 3、TypeScript、Element Plus

---

### Task 1: 补写后端失败测试

**Files:**
- Modify: `backend/src/test/java/com/aiclub/platform/service/ExecutionDispatchServiceTests.java`

- [ ] **Step 1: 写出失败与取消通知的新增测试**

```java
@Test
void shouldNotifyRequesterWhenTestAutomationFails() {
    // 断言 TEST_AUTOMATION_FAILED
}

@Test
void shouldNotifyRequesterWhenRepositoryScanCanceled() {
    // 断言 CODEBASE_SCAN_CANCELED
}
```

- [ ] **Step 2: 运行定向测试确认先失败**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionDispatchServiceTests test`
Expected: FAIL，提示缺少对应通知发送或 bizType 不匹配

- [ ] **Step 3: 再补一个通用兜底场景测试**

```java
@Test
void shouldNotifyRequesterWhenGenericExecutionSucceeds() {
    // 断言 EXECUTION_COMPLETED
}
```

- [ ] **Step 4: 再次运行定向测试确认仍为红灯**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionDispatchServiceTests test`
Expected: FAIL，并且失败点只剩通知行为未实现

### Task 2: 实现后端统一结果通知

**Files:**
- Modify: `backend/src/main/java/com/aiclub/platform/service/ExecutionDispatchService.java`

- [ ] **Step 1: 添加统一通知辅助方法与场景 bizType 映射**

```java
private void notifyRequesterWhenExecutionFinished(ExecutionTaskEntity executionTask,
                                                  ExecutionRunEntity executionRun,
                                                  String resultStatus) {
    // 根据场景和结果态生成 bizType、level、title、content
}
```

- [ ] **Step 2: 在 `finishSuccess`、`finishFailed`、`finishInfrastructureFailure`、`finishCanceled` 中调用辅助方法**

```java
notifyRequesterWhenExecutionFinished(executionTask, executionRun, "SUCCESS");
```

- [ ] **Step 3: 保留开发执行待确认和开发执行成功原有业务码兼容**

```java
if (isDevelopmentScenario(executionTask) && "SUCCESS".equals(resultStatus)) {
    return "DEVELOPMENT_EXECUTION_COMPLETED";
}
```

- [ ] **Step 4: 运行后端定向测试转绿**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionDispatchServiceTests test`
Expected: PASS

### Task 3: 扩充前端通知映射

**Files:**
- Modify: `frontend/src/layout/AppLayout.vue`

- [ ] **Step 1: 补充新增 bizType 的中文标签**

```ts
TEST_AUTOMATION_COMPLETED: '自动化测试完成',
CODEBASE_SCAN_FAILED: '仓库扫描失败',
EXECUTION_CANCELED: '执行已取消',
```

- [ ] **Step 2: 补充对应色调映射**

```ts
if (bizKey.endsWith('_FAILED')) return 'warning'
if (bizKey.endsWith('_CANCELED')) return 'warning'
if (bizKey.endsWith('_COMPLETED')) return 'secondary'
```

- [ ] **Step 3: 运行前端构建验证**

Run: `cd frontend && npm run build`
Expected: PASS

### Task 4: 更新架构文档与完成验证

**Files:**
- Modify: `docs/architecture.md`
- Test: `scripts/check_encoding.py`

- [ ] **Step 1: 在架构文档补充执行中心结果通知规则**

```md
- 执行中心在统一收口阶段向任务发起人发送站内通知，覆盖成功、失败、取消三类结果。
```

- [ ] **Step 2: 运行编码检查**

Run: `python scripts/check_encoding.py`
Expected: PASS

- [ ] **Step 3: 合并运行本次最小 harness**

Run: `cd backend && mvn -s maven-settings-central.xml -Dtest=ExecutionDispatchServiceTests test`
Expected: PASS

Run: `cd frontend && npm run build`
Expected: PASS
