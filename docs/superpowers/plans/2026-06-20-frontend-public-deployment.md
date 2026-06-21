# Frontend Public Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `frontend-public` 补齐真实模块文档和独立 Docker 部署入口。

**Architecture:** `frontend-public` 作为公众端独立服务与管理端 `frontend` 并存，二者共享后端 API。公众端镜像使用 Node 构建、nginx 托管静态资源和代理 `/api/`、`/ws/`。

**Tech Stack:** React 19、Vite 6、nginx alpine、Docker Compose、PowerShell/Node/npm。

---

### Task 1: Module Deployment Files

**Files:**
- Create: `frontend-public/Dockerfile`
- Create: `frontend-public/nginx.conf`
- Create: `frontend-public/.dockerignore`
- Modify: `frontend-public/.env.example`

- [ ] **Step 1: Add Dockerfile**

Create `frontend-public/Dockerfile` with a two-stage build. Pass `VITE_API_BASE_URL` and `VITE_API_PORT` as build args so the browser bundle can resolve backend requests.

- [ ] **Step 2: Add nginx config**

Create `frontend-public/nginx.conf` with SPA fallback and proxy rules for `/api/` and `/ws/` to `backend:8080`.

- [ ] **Step 3: Add Docker ignore rules**

Create `frontend-public/.dockerignore` so Docker builds exclude `node_modules`, `dist`, IDE folders, and local logs.

- [ ] **Step 4: Replace module env example**

Replace AI Studio variables in `frontend-public/.env.example` with Vite variables used by the code: `VITE_API_BASE_URL`, `VITE_API_PORT`, and `DISABLE_HMR`.

### Task 2: Root Deployment Wiring

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.server.yml`
- Modify: `.env.example`
- Modify: `.env.server.example`

- [ ] **Step 1: Add local compose service**

Add `frontend-public` service to `docker-compose.yml`, using build context `./frontend-public`, image `${FRONTEND_PUBLIC_IMAGE:-git-ai-club-frontend-public:latest}`, and port `${FRONTEND_PUBLIC_PORT:-5175}:80`.

- [ ] **Step 2: Add server compose service**

Add matching `frontend-public` service to `docker-compose.server.yml`, including the same Vite build args used by the management frontend.

- [ ] **Step 3: Add environment examples**

Add `FRONTEND_PUBLIC_PORT=5175` near frontend port settings and `FRONTEND_PUBLIC_IMAGE=git-ai-club-frontend-public:latest` near image settings in both env example files.

### Task 3: Documentation

**Files:**
- Modify: `frontend-public/README.md`

- [ ] **Step 1: Rewrite README**

Document module positioning, directory map, local development, env variables, Docker deployment, compose deployment, API routing, and troubleshooting.

### Task 4: Verification

**Files:**
- Verify only

- [ ] **Step 1: Encoding check**

Run `python scripts/check_encoding.py`. Expected result: no encoding violations.

- [ ] **Step 2: Public frontend build**

Run `cd frontend-public && npm run build`. Expected result: Vite build succeeds.

- [ ] **Step 3: Compose config check**

Run `docker compose config` and `docker compose -f docker-compose.server.yml config`. Expected result: both commands exit successfully.
