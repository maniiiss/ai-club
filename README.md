# AI 代理工程管理平台

这是一个面向 **AI Agent 工程管理** 的基础脚手架，按职责拆分为：

- `frontend`：管理端控制台，基于 **Vue 3 + Vite + Element Plus**
- `frontend-public`：公众端前端，基于 **React + Vite**
- `backend`：业务后端，基于 **Spring Boot + PostgreSQL**
- `code-processing`：代码处理服务，基于 **FastAPI**
- `backend/src/main/resources/db/migration`：Flyway 数据库版本脚本

> 说明：Vue 3 推荐使用 **Element Plus**，因此前端已按 Vue 3 + Element Plus 组合搭建。

## 目录结构

```text
git-ai-club/
├─ frontend/                  # Vue3 + Element Plus 管理端控制台
├─ frontend-public/           # React + Vite 公众端前端
├─ backend/                   # Spring Boot 后端
│  └─ src/main/resources/db/migration/  # Flyway 数据库迁移脚本
├─ code-processing/           # Python 代码处理服务
├─ docker-compose.yml         # 源码模式依赖容器编排，含可选 Woodpecker profile
└─ README.md
```

## 启动方式

### Windows 脚本入口

1. 源码模式启动：
   `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1`
   作用：`hermes / qdrant / hindsight / gitnexus-web / postgres / redis / minio / woodpecker-server / woodpecker-agent` 走 Docker，`code-processing / backend / frontend / frontend-public` 走源码启动；显式设置 `WOODPECKER_ENABLED=false` 时跳过 Woodpecker。
2. 源码模式停止：
   `powershell -ExecutionPolicy Bypass -File .\scripts\stop-windows.ps1`
   作用：先停源码服务，再停源码模式依赖容器。
3. 源码服务重启：
   `powershell -ExecutionPolicy Bypass -File .\scripts\restart-source.ps1`
   作用：只重启 `code-processing / backend / frontend / frontend-public`，不重新拉起 Docker 中间件。
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
8. 环境变量升级：
   `bash ./scripts/upgrade-env.sh`
   作用：将 `.env.example` / `.env.server.example` 中新增的配置项增量补齐到对应环境文件，并提示仍需人工补全的字段。
9. PostgreSQL 排序规则检查：
   `python .\scripts\check_postgres_collation.py`
   作用：检查 `ai_agent_platform` / `hindsight` 的 collation version mismatch；默认只检查，显式追加 `--apply` 才执行备份、`REINDEX DATABASE` 和 `ALTER DATABASE ... REFRESH COLLATION VERSION`。

### Linux 脚本入口

1. 源码模式启动：
   `bash ./scripts/start-linux.sh`
   作用：`hermes / qdrant / hindsight / gitnexus-web / postgres / redis / minio / woodpecker-server / woodpecker-agent` 走 Docker，`code-processing / backend / frontend / frontend-public` 走源码启动；显式设置 `WOODPECKER_ENABLED=false` 时跳过 Woodpecker。
2. 源码模式停止：
   `bash ./scripts/stop-linux.sh`
   作用：先停源码服务，再停源码模式依赖容器。
3. 源码服务重启：
   `bash ./scripts/restart-source-linux.sh`
   作用：只重启 `code-processing / backend / frontend / frontend-public`，不重新拉起 Docker 中间件。
4. 全量 Docker 启动：
   `bash ./scripts/start-docker-linux.sh`
   作用：使用 `docker-compose.server.yml` 启动整套项目；默认复用已有镜像，加 `--rebuild` 才会重新 build 业务镜像（也可设置 `REBUILD=true` 环境变量）。
5. 全量 Docker 关闭：
   `bash ./scripts/stop-docker-linux.sh`
6. 全量 Docker 打包：
   `bash ./scripts/package-linux.sh`
7. Hindsight 向量重建：
   `python ./scripts/rebuild_hindsight_vectors.py`
   作用：备份 `hindsight` 数据库、清理旧向量快照，并按当前 Wiki 页面重新回灌平台托管的记忆数据。
8. 环境变量升级：
   `bash ./scripts/upgrade-env.sh`
   作用：将 `.env.example` / `.env.server.example` 中新增的配置项增量补齐到对应环境文件，并提示仍需人工补全的字段。
9. PostgreSQL 排序规则检查：
   `python ./scripts/check_postgres_collation.py`
   作用：检查 `ai_agent_platform` / `hindsight` 的 collation version mismatch；默认只检查，显式追加 `--apply` 才执行备份、`REINDEX DATABASE` 和 `ALTER DATABASE ... REFRESH COLLATION VERSION`。

Windows 源码模式脚本会自动完成以下动作：

1. 启动 `postgres`、`redis`、`minio`、`qdrant`、`hindsight`、`gitnexus-web`、`hermes`、`woodpecker-server`、`woodpecker-agent` 容器；显式设置 `WOODPECKER_ENABLED=false` 时跳过 Woodpecker
2. 安装管理端和公众端前端依赖
3. 检查并创建 `code-processing/.venv`
4. 启动 `code-processing`、`backend`、`frontend`、`frontend-public`
5. 将日志写入项目根目录 `.run-logs/`

全量 Docker 脚本默认使用 `docker-compose.server.yml` 和 `.env.server`。
如果 `.env.server` 不存在，脚本会优先根据 `.env` 自动生成一份可用于容器互联的配置。

默认访问地址：

- Frontend 管理端: `http://localhost:5173`
- Frontend 公众端: `http://localhost:5175`
- Backend: `http://localhost:8080`
- Code Processing: `http://localhost:9000`
- Hermes: `http://localhost:18080`
- Qdrant: `http://localhost:16333`
- Hindsight: `http://localhost:18888`
- GitNexus Web UI: `http://localhost:5174`
- Woodpecker（默认启用）: `http://localhost:18000`

GitNexus Web UI 会通过 `docker/gitnexus-web` 基于官方镜像构建本地中文镜像，页面端口仍保持 `5174`；`4747` 的 `gitnexus serve` 仍由 `code-processing` 在代码结构跳转时按需接入。

## AI Club Pipeline / Woodpecker

平台内置 Woodpecker 作为默认流水线 provider，前端入口是统一的“流水线中心”。业务用户只登录 AI Club，不需要登录 Woodpecker；Woodpecker UI 仅作为管理员排障入口。外部 Jenkins 兼容绑定也会进入同一个流水线列表，但 Jenkins 服务实例管理页降为次级入口。Woodpecker 不需要在页面里新增服务实例；默认启用，管理员只需要在 `.env` 或 `.env.server` 中补齐部署级配置：

- `WOODPECKER_HOST=http://localhost:18000`
- `WOODPECKER_AGENT_SECRET=<随机强密钥>`
- `PLATFORM_WOODPECKER_API_TOKEN=<Woodpecker 访问 Token>`

AI Club 不再在 `.env` 中承载 Woodpecker 的 GitLab OAuth 配置。GitLab 仓库身份、MR 和自动合并仍走平台已有 GitLab 配置；Woodpecker 只作为后台执行底座，由 `PLATFORM_WOODPECKER_API_TOKEN` 授权平台调用。Woodpecker 运行时如果仍需要底座 forge 兼容配置，应放在 `.data/woodpecker/forge.env` 这类运行数据文件里，不进入 AI Club 平台配置。源码模式下平台后端默认通过 `http://localhost:18000` 调用 Woodpecker；全量 Docker 下默认通过 `http://woodpecker-server:8000` 调用。若需要临时关闭内置 provider，可设置 `WOODPECKER_ENABLED=false`。若手工运行 Compose，需要带上 profile：

流水线中心列表只展示轻量摘要，不再实时检查每条 AI 流水线目标分支上的 `.woodpecker.yml` 是否存在；配置状态、缺失提示和“补全配置”入口统一下沉到 AI 流水线详情页按需加载。目标分支缺少 `.woodpecker.yml` 时，详情页里的“补全配置”会以模板参数表单生成配置：用户可在页面里填写项目根目录、推送服务器地址、分支、Docker 凭据、SSH 主机和私钥等元素，平台创建 GitLab MR；敏感值写入 Woodpecker repo secrets。`部署到服务器` 作为共享后置动作挂在 Java、Node、Python、Docker 等模板里，打开开关后可在构建完成后自动上传产物并执行远程重启脚本；如果产物已经在 registry，只保留远程重启脚本也可以。对于 monorepo 或多模块仓库，可通过“项目根目录”指定实际包含 `pom.xml`、`package.json` 或应用代码的子目录。高级用户仍可切换到手动 YAML 模式继续自定义配置文件。

```bash
docker compose --env-file .env --profile woodpecker -f docker-compose.yml up -d woodpecker-server woodpecker-agent
```

详细设计见 `docs/pipeline-woodpecker-provider-technical-design-v1.md`。

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

如果 PostgreSQL 使用了复杂密码，同时又需要启动 `hindsight`，推荐在 `.env` 或 `.env.server` 里把 `HINDSIGHT_API_DATABASE_URL` 写成不带密码的连接串，并通过 `HINDSIGHT_API_DATABASE_PASSWORD` 或 `POSTGRES_PASSWORD` 单独提供密码。
这样可以避免 Hindsight 启动迁移时，复杂密码在 Alembic / SQLAlchemy URL 解析链路里触发转义与插值问题。

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
