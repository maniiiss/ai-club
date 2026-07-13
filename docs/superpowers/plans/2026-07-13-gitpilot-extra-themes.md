# GitPilot Extra Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `paper-white` and `carbon-black` to the existing account-synchronized GitPilot theme system.

**Architecture:** Extend one shared theme catalog contract across Spring Boot, React public frontend, and Vue management frontend. Reuse the existing `/api/auth/theme` persistence and session-refresh flow; only catalogs, tokens, selectors, tests, and architecture notes change.

**Tech Stack:** Spring Boot 3, Flyway, Vue 3 + Pinia + Element Plus, React + Zustand + Tailwind CSS, Node test runner, Maven.

---

### Task 1: Extend the shared catalog contract

**Files:** `backend/src/main/java/com/aiclub/platform/constants/ThemeCatalog.java`, `frontend-public/src/lib/theme.ts`, `frontend/src/constants/theme.ts`, and the existing unified-theme tests.

- [ ] Add failing assertions requiring `paper-white` and `carbon-black` in both frontend catalogs and backend acceptance tests.
- [ ] Run the focused public, management, and `AuthServiceTests` suites and confirm the new assertions fail.
- [ ] Add both IDs while keeping `deep-sea` as the default and preserving unknown-ID rejection.
- [ ] Rerun the focused suites and confirm they pass.

### Task 2: Add public white and carbon tokens

**Files:** `frontend-public/src/styles/tokens.css`, `frontend-public/src/pages/settings/ProfilePage.tsx`, `frontend-public/tests/unifiedTheme.test.ts`.

- [ ] Add failing selector/token assertions for `[data-theme="paper-white"]` and `[data-theme="carbon-black"]`.
- [ ] Add complete surface, text, border, focus, status, and `--auth-*` variables. Use pure white surfaces for `paper-white`; use `#080C12`, `#111821`, `#0D131B`, and `#E8EEF5` for `carbon-black`.
- [ ] Ensure the existing profile card map displays five presets and retains async server update plus failure rollback.
- [ ] Run `cd frontend-public; npm test; npm run build`.

### Task 3: Add management white and carbon presets

**Files:** `frontend/src/constants/theme.ts`, `frontend/src/styles/index.css`, `frontend/src/views/ProfileView.vue`, `frontend/tests/unifiedTheme.test.mjs`.

- [ ] Add failing assertions for both IDs, Chinese labels, representative `--app-*` values, and Element Plus primary bindings.
- [ ] Add complete presets with page surfaces, cards, text, outlines, primary/hover/fixed colors, previews, and dark-theme Element Plus values.
- [ ] Keep the root fallback aligned with `deep-sea`, and keep the profile view’s async account update flow.
- [ ] Run `cd frontend; node --test tests/unifiedTheme.test.mjs; npm run build`.

### Task 4: Verify backend and document the extension

**Files:** `backend/src/test/java/com/aiclub/platform/service/AuthServiceTests.java`, `docs/architecture.md`.

- [ ] Add tests that both new IDs persist and refresh the current session snapshot.
- [ ] Run `cd backend; mvn -s maven-settings-central.xml "-Dtest=AuthServiceTests,FlywayMigrationCompatibilityTests" test`.
- [ ] Update the architecture theme section from three supported IDs to five and document the same server-source-of-truth behavior.
- [ ] Run `python scripts/check_encoding.py` and `git diff --check`.
