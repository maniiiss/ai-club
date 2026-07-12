# GitPilot Login Background Implementation Plan

> **For agentic workers:** Implement the tasks in order and verify each checkpoint before moving on.

**Goal:** Add a performant Git branch star-trail animated wallpaper to the public login and authentication layout.

**Architecture:** Create a focused `AuthBackground` React component containing decorative SVG branch routes and lightweight CSS particles. Mount it as an absolute background layer in `AuthLayout`, keep the authentication form above it, and pause nonessential motion under `prefers-reduced-motion`.

**Tech Stack:** React, TypeScript, inline SVG, CSS keyframes, Node test runner.

---

### Task 1: Lock the visual contract with a failing test

**Files:**
- Create: `frontend-public/tests/authBackground.test.ts`

- [x] Assert that `AuthLayout` mounts `AuthBackground`.
- [x] Assert that the background component exposes the Git branch route, particle class, and decorative accessibility marker.
- [x] Assert that the shared stylesheet contains the particle animation and reduced-motion media query.
- [x] Run the focused test and confirm it fails because the component and hooks do not exist yet.

### Task 2: Implement the animated background layer

**Files:**
- Create: `frontend-public/src/components/auth/AuthBackground.tsx`
- Modify: `frontend-public/src/layouts/AuthLayout.tsx`
- Modify: `frontend-public/src/index.css`

- [x] Render dark GitPilot background artwork with three branch paths, merge nodes, AI spark markers, and low-density particles.
- [x] Keep it `aria-hidden`, pointer-events disabled, and independent of login state or form events.
- [x] Place it behind both desktop and mobile authentication content.
- [x] Add CSS-only particle drift, node breathing, and a `prefers-reduced-motion: reduce` fallback that pauses motion and reduces visual density.
- [x] Run the focused test and confirm it passes.

### Task 3: Verify the public frontend

**Files:**
- No additional files.

- [x] Run `npm test` in `frontend-public`.
- [x] Run `npm run build` in `frontend-public`.
- [x] Run `python scripts/check_encoding.py` from the repository root.
- [x] Run `git diff --check` and inspect the final diff for unrelated changes.
