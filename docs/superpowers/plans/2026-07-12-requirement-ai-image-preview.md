# Requirement AI Image Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将需求 AI 标准化结果中的图片引用规范化为可持久化、可预览的 Markdown 图片，同时兼容历史普通图片链接。

**Architecture:** 后端为结果增加图片元数据，并在生成结果后根据受控图片引用生成 canonical Markdown；前端在结果进入草稿前执行安全的图片链接兼容转换。两端沿用现有 Markdown 渲染和灯箱能力，回写仍保存 canonical Markdown。

**Tech Stack:** Spring Boot/Jackson/JUnit 5、Vue 3、React/Vite、现有 Markdown 渲染器、Node source-contract tests。

---

### Task 1: Add canonical image normalization tests and helper

**Files:**
- Create: `frontend-public/src/lib/requirementAiImageMarkdown.ts`
- Test: `frontend-public/tests/requirementAiImageMarkdown.test.ts`
- Modify: `frontend/src/utils/markdown.ts`
- Test: `frontend/tests/requirementAiImageMarkdown.test.mjs`

- [x] Add failing tests for standalone image URLs, same-target Markdown links, existing image Markdown, code blocks, ordinary links, and unsafe protocols.
- [x] Implement a shared-behavior-compatible normalizer in each frontend boundary, preserving non-image links and converting only allowlisted image URL forms.
- [x] Run both focused test files and confirm green.

### Task 2: Extend the AI result image contract

**Files:**
- Create: `backend/src/main/java/com/aiclub/platform/dto/RequirementAiResultImage.java`
- Modify: `backend/src/main/java/com/aiclub/platform/dto/TaskRequirementAiResult.java`
- Modify: `backend/src/main/java/com/aiclub/platform/service/RequirementAiExecutionService.java`
- Test: `backend/src/test/java/com/aiclub/platform/service/RequirementAiExecutionServiceTests.java`

- [x] Add a failing serialization test proving `images` is present while old JSON without `images` remains readable.
- [x] Add image metadata from prepared context to the final result and render platform asset URLs as Markdown images.
- [x] Keep external URLs as compatibility Markdown only when they were not imported/validated; include a warning in the context artifact.
- [x] Run focused backend tests.

### Task 3: Wire both AI dialogs and image editor preview

**Files:**
- Modify: `frontend-public/src/pages/planning/RequirementAiDialog.tsx`
- Modify: `frontend/src/components/RequirementAiDialog.vue`
- Modify: `frontend/src/components/MarkdownEditor.vue` only if preview integration requires it
- Test: `frontend-public/tests/requirementAiAsync.test.ts`
- Test: `frontend/tests/requirementAiAsync.test.mjs`

- [x] Add failing source-contract assertions that result drafts pass through image normalization and management Markdown editors receive the image upload callback.
- [x] Apply normalization only when a result enters the editable draft, leaving global Markdown rendering semantics unchanged.
- [x] Preserve the existing public lightbox and management preview behavior.
- [x] Run focused frontend tests and both frontend builds.

### Task 4: Verify encoding, backend regression, and documentation

**Files:**
- Modify: `docs/architecture.md`

- [x] Document canonical image Markdown, asset ID truth, external-image fallback, and result compatibility.
- [x] Run `python scripts/check_encoding.py`.
- [x] Run the focused backend/frontend tests, then the relevant builds.
- [x] Review the diff for unrelated changes.
