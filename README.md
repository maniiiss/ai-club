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

### 一键启动脚本

- Windows: `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1`
- macOS: `bash ./scripts/start-macos.sh`
- Linux: `bash ./scripts/start-linux.sh`

### 一键停止脚本

- Windows: `powershell -ExecutionPolicy Bypass -File .\scripts\stop-windows.ps1`
- macOS: `bash ./scripts/stop-macos.sh`
- Linux: `bash ./scripts/stop-linux.sh`

脚本会自动完成以下动作：

1. 启动 `postgres`、`redis`、`minio` 容器
2. 安装前端依赖
3. 检查并创建 `code-processing/.venv`
4. 启动 `code-processing`、`backend`、`frontend`
5. 将日志写入项目根目录 `.run-logs/`

停止脚本会：

1. 根据 `.run-logs/*.pid` 停止由一键启动脚本拉起的本地服务
2. 执行 `docker compose stop postgres redis minio`

默认访问地址：

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080`
- Code Processing: `http://localhost:9000/health`

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
