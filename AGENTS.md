# AI Club 智能体工作入口

## 基本约束

- 所有源码、脚本、文档必须使用 UTF-8 无 BOM 保存。
- 中文必须直接写入文件，不允许写成 `\uXXXX` 转义。
- 新增或修改类、接口方法、实体字段、复杂流程时，需要补充中文注释说明业务意图。
- 修改前先阅读关联模块和现有测试，避免只按文件名猜测职责。
- 不要回滚、覆盖或格式化与当前任务无关的改动。

## 项目地图

- `frontend/`：Vue 3 + Vite + Element Plus 控制台。
- `backend/`：Spring Boot 业务后端，数据库迁移由 Flyway 管理。
- `code-processing/`：FastAPI 代码处理服务，负责代码扫描、MR 审查和 MCP 工具服务。
- `scripts/`：本地启动、停止、打包、校验脚本。
- `docs/`：架构、模块设计和智能体协作规范。
- `.run-logs/`：本地源码模式运行日志，排查启动和集成问题优先查看这里。

## 常用命令

- 编码检查：`python scripts/check_encoding.py`
- 后端测试：`cd backend && mvn -s maven-settings-central.xml test`
- 前端构建：`cd frontend && npm run build`
- 代码处理服务安装：`cd code-processing && pip install -e .`
- Windows 源码模式启动：`powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1`
- Windows 源码模式停止：`powershell -ExecutionPolicy Bypass -File .\scripts\stop-windows.ps1`
- Linux 源码模式启动：`bash ./scripts/start-linux.sh`
- Linux 源码模式停止：`bash ./scripts/stop-linux.sh`

## Harness 优先级

- 接到任务后先判断影响范围，再选择最小可验证 harness。
- 文档、脚本、配置变更至少运行编码检查。
- 后端业务变更优先运行相关 JUnit 测试，再视影响范围运行 Maven 全量测试。
- 前端类型或页面变更优先运行 `npm run build`。
- 跨服务改动需要至少验证对应服务能启动，必要时使用源码模式脚本串起 `backend`、`frontend`、`code-processing`。
- 详细规范见 `docs/harness-best-practices.md`。
