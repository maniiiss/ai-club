# Public Hermes Markdown Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent public Hermes and chat rendering paths from corrupting valid Markdown before `react-markdown` receives it.

**Architecture:** `Markdown` retains its existing default normalization for existing consumers but exposes an opt-out. Hermes uses the opt-out for server-produced assistant content. Chat keeps its one deliberate outer normalization call and opts out of the component's second pass.

**Tech Stack:** React 18, TypeScript, `react-markdown`, Node test runner with `tsx`.

---

### Task 1: Lock in the real Hermes regression

**Files:**
- Modify: `frontend-public/tests/markdownUtils.test.ts`

- [ ] **Step 1: Write the failing regression test**

Add a test using the database-proven Hermes response fragment and assert that a render-path opt-out preserves it:

```ts
const raw = '我在 CRM项目（项目 #4）中尝试了多个关键词搜索，均未找到标题为 **【PC端】审批台帐中列表个别字段没有回显**的工作项。'
assert.equal(resolveMarkdownContent(raw, false), raw)
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --import tsx --test tests/markdownUtils.test.ts`

Expected: failure because `resolveMarkdownContent` does not exist.

### Task 2: Make normalization explicit at the renderer boundary

**Files:**
- Modify: `frontend-public/src/components/common/Markdown.tsx`
- Modify: `frontend-public/src/lib/markdownUtils.ts`

- [ ] **Step 1: Add the minimal pure helper**

Export this helper from `markdownUtils.ts`:

```ts
export const resolveMarkdownContent = (content: string, normalize = true): string =>
  normalize ? normalizeGeneratedMarkdown(content) : content || ''
```

- [ ] **Step 2: Use the helper in `Markdown`**

Add `normalize?: boolean` to `MarkdownProps`, default it to `true`, and replace the unconditional call with:

```ts
const normalizedContent = resolveMarkdownContent(content, normalize)
```

- [ ] **Step 3: Run the targeted test to verify it passes**

Run: `node --import tsx --test tests/markdownUtils.test.ts`

Expected: all Markdown utility tests pass, including the new preservation case.

### Task 3: Apply the opt-out to assistant content

**Files:**
- Modify: `frontend-public/src/components/hermes/HermesMessageList.tsx`
- Modify: `frontend-public/src/components/chat/ChatMessageList.tsx`

- [ ] **Step 1: Disable normalization for Hermes assistant messages**

Render Hermes content with:

```tsx
<Markdown content={assistantDisplay.content} normalize={false} variant="assistant" className="text-[13px]" />
```

- [ ] **Step 2: Prevent the chat component from normalizing twice**

Keep the existing outer `normalizeGeneratedMarkdown(resolveChatAssistantContent(message))` call and pass `normalize={false}` to `Markdown`.

- [ ] **Step 3: Run public-front-end validation**

Run:

```powershell
node --import tsx --test tests/markdownUtils.test.ts tests/chatUtils.test.ts
npm run test
npm run build
```

Expected: targeted and full relevant tests pass; the build exits with code 0.

### Task 4: Verify repository constraints

**Files:**
- Verify only

- [ ] **Step 1: Run the encoding check**

Run: `python scripts/check_encoding.py`

Expected: exit code 0.

- [ ] **Step 2: Inspect the scoped diff**

Run: `git diff --check -- frontend-public/src/lib/markdownUtils.ts frontend-public/src/components/common/Markdown.tsx frontend-public/src/components/hermes/HermesMessageList.tsx frontend-public/src/components/chat/ChatMessageList.tsx frontend-public/tests/markdownUtils.test.ts`

Expected: no whitespace errors.
