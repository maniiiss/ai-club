# Frontend Public Deployment Design

## 背景

`frontend-public` 是面向公众用户的独立 React + Vite 前端，现有 `frontend` 继续作为管理系统控制台使用。公众端当前已有源码和构建产物，但 README 与环境变量示例仍停留在 AI Studio 模板，根级 Docker Compose 也没有独立服务入口。

## 目标

- 将 `frontend-public` 文档改成项目真实说明，明确它与管理端 `frontend` 的边界。
- 为公众端补齐 Docker 镜像构建、nginx 静态托管和 SPA fallback 配置。
- 在本地与服务器 Docker Compose 中新增独立公众端服务，使用独立端口与镜像变量。
- 在根级环境变量示例中补充公众端端口、镜像和 API 构建参数说明。

## 方案

公众端采用与管理端一致的两阶段镜像构建：Node 阶段执行 `npm ci` 与 `npm run build`，nginx 阶段托管 `dist`。nginx 负责将页面路由 fallback 到 `index.html`，并将 `/api/` 与 `/ws/` 反向代理到 compose 内部的 `backend:8080`。

Docker Compose 新增 `frontend-public` 服务，与 `frontend` 并存。默认管理端继续暴露 `FRONTEND_PORT=5173`，公众端默认暴露 `FRONTEND_PUBLIC_PORT=5175`，两者共享后端服务但使用独立镜像变量。

## 配置

- `frontend-public/.env.example`：声明 `VITE_API_BASE_URL`、`VITE_API_PORT`、`DISABLE_HMR`。
- `frontend-public/.dockerignore`：排除本地依赖、构建产物和 IDE 文件，避免 Docker 构建上下文膨胀。
- `.env.example` 与 `.env.server.example`：声明 `FRONTEND_PUBLIC_PORT`、`FRONTEND_PUBLIC_IMAGE`，并保留 `VITE_API_BASE_URL` 与 `VITE_API_PORT` 作为构建参数。
- `docker-compose.yml` 与 `docker-compose.server.yml`：新增 `frontend-public` 服务，依赖 `backend` 启动。

## 验证

- 运行 `python scripts/check_encoding.py` 确认新增文档和配置编码合规。
- 运行 `cd frontend-public && npm run build` 确认公众端可构建。
- 运行 `docker compose config` 与 `docker compose -f docker-compose.server.yml config` 确认 compose 配置可解析。
