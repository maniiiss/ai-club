# AI 代理工程管理平台

这是一个面向 **AI Agent 工程管理** 的基础脚手架，按职责拆分为：

- `frontend`：前端控制台，基于 **Vue 3 + Vite + Element Plus**
- `backend`：业务后端，基于 **Spring Boot + PostgreSQL**
- `code-processing`：代码处理服务，基于 **FastAPI**
- `backend/src/main/resources/db/migration`：Flyway 数据库版本脚本

> 说明：Vue 3 推荐使用 **Element Plus**，因此前端已按 Vue 3 + Element Plus 组合搭建。

## 目录结构

```text
git-ai-club/
├─ frontend/                  # Vue3 + Element Plus 前端
├─ backend/                   # Spring Boot 后端
│  └─ src/main/resources/db/migration/  # Flyway 数据库迁移脚本
├─ code-processing/           # Python 代码处理服务
├─ docker-compose.yml         # PostgreSQL 容器编排
└─ README.md
```

## 启动方式

### Windows 脚本入口

1. 源码模式启动：
   `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1`
   作用：`hermes / hindsight / postgres / redis / minio` 走 Docker，`code-processing / backend / frontend` 走源码启动。
2. 源码模式停止：
   `powershell -ExecutionPolicy Bypass -File .\scripts\stop-windows.ps1`
   作用：先停源码服务，再停源码模式依赖容器。
3. 源码服务重启：
   `powershell -ExecutionPolicy Bypass -File .\scripts\restart-source.ps1`
   作用：只重启 `code-processing / backend / frontend`，不重新拉起 Docker 中间件。
4. 全量 Docker 启动：
   `powershell -ExecutionPolicy Bypass -File .\scripts\start-docker.ps1`
   作用：使用 `docker-compose.server.yml` 启动整套项目。
5. 全量 Docker 关闭：
   `powershell -ExecutionPolicy Bypass -File .\scripts\stop-docker.ps1`
6. 全量 Docker 打包：
   `powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1`
7. Hindsight 向量重建：
   `python .\scripts\rebuild_hindsight_vectors.py`
   作用：备份 `hindsight` 数据库、清理旧向量快照，并按当前 Wiki 页面重新回灌平台托管的记忆数据。

### Linux 脚本入口

1. 源码模式启动：
   `bash ./scripts/start-linux.sh`
   作用：`hermes / hindsight / postgres / redis / minio` 走 Docker，`code-processing / backend / frontend` 走源码启动。
2. 源码模式停止：
   `bash ./scripts/stop-linux.sh`
   作用：先停源码服务，再停源码模式依赖容器。
3. 源码服务重启：
   `bash ./scripts/restart-source-linux.sh`
   作用：只重启 `code-processing / backend / frontend`，不重新拉起 Docker 中间件。
4. 全量 Docker 启动：
   `bash ./scripts/start-docker-linux.sh`
   作用：使用 `docker-compose.server.yml` 启动整套项目。
5. 全量 Docker 关闭：
   `bash ./scripts/stop-docker-linux.sh`
6. 全量 Docker 打包：
   `bash ./scripts/package-linux.sh`
7. Hindsight 向量重建：
   `python ./scripts/rebuild_hindsight_vectors.py`
   作用：备份 `hindsight` 数据库、清理旧向量快照，并按当前 Wiki 页面重新回灌平台托管的记忆数据。

源码模式脚本会自动完成以下动作：

1. 启动 `postgres`、`redis`、`minio`、`hindsight`、`hermes` 容器
2. 安装前端依赖
3. 检查并创建 `code-processing/.venv`
4. 启动 `code-processing`、`backend`、`frontend`
5. 将日志写入项目根目录 `.run-logs/`

全量 Docker 脚本默认使用 `docker-compose.server.yml` 和 `.env.server`。
如果 `.env.server` 不存在，脚本会优先根据 `.env` 自动生成一份可用于容器互联的配置。

默认访问地址：

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080`
- Code Processing: `http://localhost:9000`
- Hermes: `http://localhost:18080`
- Hindsight: `http://localhost:18888`

## Harness 验证

为了让文档、脚本和多服务改动都能用统一方式验证，仓库提供了 harness 入口：

- Windows：`powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target docs`
- Windows：`powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target backend`
- Windows：`powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target frontend`
- Windows：`powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target all`
- Linux：`bash ./scripts/harness-linux.sh docs`
- Linux：`bash ./scripts/harness-linux.sh backend`
- Linux：`bash ./scripts/harness-linux.sh frontend`
- Linux：`bash ./scripts/harness-linux.sh all`

`Target` 含义：

- `docs`：校验 `AGENTS.md`、`README.md`、`docs/`、`scripts/` 的编码与乱码风险。
- `backend`：校验 `backend/` 编码并执行 Maven 测试。
- `frontend`：校验 `frontend/` 编码并执行前端构建。
- `code-processing`：校验 `code-processing/` 编码并执行 Python 包安装检查。
- `all`：对整个仓库执行完整 harness。

## 架构与设计文档 Harness

- 任何技术架构调整、跨模块方案重构或大型技术设计完成后，必须同步更新 `docs/architecture.md` 或新增专题设计文档。
- 推荐直接基于 `docs/architecture-design-template.md` 新建 `docs/<主题>-architecture-v1.md` 或 `docs/<主题>-technical-design-v1.md`。
- 如果改动同时影响启动方式、环境变量、日志路径或 harness，请在同一次交付里同步更新 `README.md`、`AGENTS.md` 和对应专题文档。

### 1. 启动 PostgreSQL

```bash
docker compose up -d
```

数据库默认配置：

- Host: `localhost`
- Port: `5432`
- Database: `ai_agent_platform`
- Username: `aiclub`
- Password: `aiclub123`

> 数据库结构统一由 Flyway 管理，首次启动后端时会自动执行 `backend/src/main/resources/db/migration` 下的迁移脚本。  
> 如果你想重新初始化数据库，请执行：

```bash
docker compose down -v
docker compose up -d
```

### 2. 启动后端

```bash
cd backend
mvn -s maven-settings-central.xml spring-boot:run
```

默认启动地址：`http://localhost:8080`

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

默认启动地址：`http://localhost:5173`

### 4. 启动代码处理服务

```bash
cd code-processing
python -m venv .venv
.venv\Scripts\activate
pip install -e .
uvicorn app.main:app --reload --port 9000
```

默认启动地址：`http://localhost:9000`

## 当前已完成内容

- 前端基础布局（仪表盘 / 项目 / Agent / 任务）
- 后端 Project / Agent / Task 基础 CRUD API
- PostgreSQL 持久化接入
- Docker 一键部署 PostgreSQL
- Flyway 数据库版本管理

## 后续建议

1. 接入 Spring Security + JWT
2. 增加用户、组织、仓库等实体
3. 完善 Flyway 增量迁移与回滚规范
4. 接入 Git 仓库与 Webhook
5. 增加 Agent 执行日志、Prompt 模板、工具链编排
