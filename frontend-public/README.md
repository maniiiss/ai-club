# AI Club 公众端前端

`frontend-public` 是 AI Club 面向公众用户的独立前端应用，负责承载公开访问、用户注册登录、项目浏览、知识库、规划、执行、开发和发布等公众侧体验。`frontend/` 继续作为管理系统控制台使用，两者共享后端 API，但部署为两个独立静态前端服务。

## 技术栈

- React 19
- Vite 6
- TypeScript
- React Router
- Zustand
- Tailwind CSS 4
- nginx 静态托管

## 目录结构

```text
frontend-public/
  src/api/          后端接口封装
  src/app/          路由、Provider 和前端应用装配
  src/components/   通用组件与导航组件
  src/hooks/        复用 Hooks
  src/layouts/      登录、产品页和项目页布局
  src/lib/          Markdown、主题等前端工具
  src/pages/        公众端页面
  src/styles/       设计变量
  src/types/        前端类型定义
```

## 本地开发

```bash
cd frontend-public
npm install
npm run dev
```

默认开发端口是 `3000`。后端默认按 `http://当前主机名:8080` 推导；如果后端不在该地址，复制 `.env.example` 为 `.env.local` 后配置：

```env
VITE_API_BASE_URL=http://localhost:8080
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 空 | 后端 API 完整地址。配置后优先使用该地址。 |
| `VITE_API_PORT` | `8080` | 未配置完整 API 地址时，用当前页面主机名和该端口拼出后端地址。 |
| `DISABLE_HMR` | `false` | 设置为 `true` 时关闭 Vite HMR 和文件监听。 |

## 常用命令

```bash
npm run dev      # 本地开发
npm run build    # 生产构建
npm run preview  # 预览 dist
npm run lint     # TypeScript 类型检查
```

## Docker 构建

```bash
docker build \
  --build-arg VITE_API_BASE_URL= \
  --build-arg VITE_API_PORT=8080 \
  -t git-ai-club-frontend-public:latest \
  frontend-public
```

镜像内使用 nginx 托管 `dist`，并将 `/api/` 与 `/ws/` 代理到 compose 网络内的 `backend:8080`。浏览器路由使用 SPA fallback，刷新深层页面不会返回 404。

## Compose 部署

根目录的 `docker-compose.yml` 和 `docker-compose.server.yml` 都包含独立的 `frontend-public` 服务：

```env
FRONTEND_PUBLIC_PORT=5175
FRONTEND_PUBLIC_IMAGE=git-ai-club-frontend-public:latest
```

启动后：

- 公众端：`http://localhost:5175`
- 管理端：`http://localhost:5173`
- 后端：`http://localhost:8080`

服务器部署时将 `FRONTEND_PUBLIC_PORT` 改为公网入口端口，或在外层网关中把公众域名转发到该服务。

## API 路由策略

前端代码会先读取 `VITE_API_BASE_URL`。如果该变量为空，则使用当前页面协议、当前主机名和 `VITE_API_PORT` 组合后端地址，例如：

```text
http://192.168.110.23:8080
```

在 Docker Compose 内部，nginx 同时提供 `/api/` 和 `/ws/` 同源代理能力，适合由外层网关统一暴露公众端域名时使用。

## 排错

- 页面能打开但接口失败：检查 `VITE_API_BASE_URL` 或 `VITE_API_PORT` 是否指向真实后端，并确认后端 CORS 允许公众端访问源。
- 刷新子路由 404：确认部署使用了本模块的 `nginx.conf`，其中 `try_files` 会回退到 `index.html`。
- Docker 构建依赖冲突：使用仓库内 `package-lock.json`，镜像构建默认执行 `npm ci --legacy-peer-deps`。
- 远程文件监听导致开发服务卡顿：在 `.env.local` 设置 `DISABLE_HMR=true`。
