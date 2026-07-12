# 公众端发布观测交互稳定性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复公众端流水线中心搜索框聚焦态叠加和操作按钮点击后的视觉位移。

**Architecture:** 在 `PipelinesPanel.tsx` 内将条目级异步操作状态细化为条目动作级状态，避免无关按钮跟随变化；搜索框和原生文字按钮使用局部、可访问的 focus-visible 样式覆盖全局 outline。只增加页面契约测试，不改变公共按钮组件或后端接口。

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Node test runner。

---

### Task 1: Add regression contract tests

**Files:**
- Modify: `frontend-public/tests/releasePipelineInteraction.test.ts`

- [ ] **Step 1: Write the failing test**

断言流水线面板使用动作级 loading key，搜索框关闭全局 outline，并且文字操作按钮声明 `type="button"`。

- [ ] **Step 2: Run the focused test**

Run: `cd frontend-public && node --import tsx --test tests/releasePipelineInteraction.test.ts`

Expected: FAIL because the current panel still compares `actionLoading` directly with `entry.entryId` and search input lacks `focus-visible:outline-none`.

### Task 2: Isolate operation loading and focus styles

**Files:**
- Modify: `frontend-public/src/pages/release/panels/PipelinesPanel.tsx`

- [ ] **Step 1: Replace the shared loading state**

Use a typed action key such as `` `${entry.entryType}-${entry.entryId}-${action}` ``. Set the key in each asynchronous handler and compare each control only with its own key. Keep the trigger control on the `trigger` action key so it remains visually stable when another action is running.

- [ ] **Step 2: Normalize focus behavior**

Add `focus-visible:outline-none` to the search input and preserve its existing border/ring feedback. Add `type="button"`, `focus:outline-none`, and a non-layout `focus-visible:ring` to the card text buttons.

### Task 3: Verify the fix

**Files:**
- Verify: `frontend-public/tests/releasePipelineInteraction.test.ts`
- Verify: `frontend-public/src/pages/release/panels/PipelinesPanel.tsx`

- [ ] **Step 1: Run the focused regression test**

Run: `cd frontend-public && node --import tsx --test tests/releasePipelineInteraction.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the public frontend test suite**

Run: `cd frontend-public && npm run test`

Expected: all tests pass with exit code 0.

- [ ] **Step 3: Build the public frontend**

Run: `cd frontend-public && npm run build`

Expected: TypeScript and Vite build complete with exit code 0.

- [ ] **Step 4: Check file encoding**

Run: `python scripts/check_encoding.py`

Expected: no encoding violations.
