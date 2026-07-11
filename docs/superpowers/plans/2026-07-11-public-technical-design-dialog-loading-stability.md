# Public Technical Design Dialog Loading Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除公众端技术设计 AI 弹窗从加载态切换到表单时的尺寸抖动。

**Architecture:** 保持弹窗 Header、Body、Footer 三段结构和稳定外框高度。Loading 改为 Body 内覆盖层，真实内容始终占据同一布局槽位并在加载完成后做短暂透明度过渡。

**Tech Stack:** React、TypeScript、Tailwind CSS、Node Test、Vite

---

### Task 1: 锁定稳定加载结构

**Files:**
- Modify: `frontend-public/tests/technicalDesignUiContract.test.ts`
- Modify: `frontend-public/src/pages/planning/TechnicalDesignAiDialog.tsx`

- [x] **Step 1: 编写失败契约测试**

在现有弹窗契约测试中断言稳定高度类、Body 相对定位、覆盖式 Loading 与内容透明度过渡标识存在。

- [x] **Step 2: 验证测试失败**

Run: `cd frontend-public && npm run test -- --test-name-pattern="technical design AI public UI contract"`

Expected: FAIL，因为旧实现仍用三元表达式替换不同高度的 Loading 与表单根节点。

- [x] **Step 3: 实现稳定弹窗布局**

将弹窗外框设为 `h-[min(720px,90vh)]`；Body 设为 `relative min-h-0 flex-1`。Loading 使用绝对定位覆盖 Body，表单内容保留在 Body 中并通过 `opacity-0/opacity-100` 和 `transition-opacity duration-200` 切换。

- [x] **Step 4: 验证测试与构建**

Run: `cd frontend-public && npm run test && npm run build`

Expected: 公众端全量测试和生产构建通过。

- [x] **Step 5: 验证编码与补丁格式**

Run: `python scripts/check_encoding.py && git diff --check`

Expected: 两项均通过。
