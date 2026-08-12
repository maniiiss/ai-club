# GitPilot CLI 专题页与一键安装 技术设计 v1

> 状态：设计稿（已确认）
> 日期：2026-07-26
> 关联模块：`backend`（Spring Boot）、`frontend-public`（React 公众端）、`gitpilot-cli`（打包产物）

## 1. 背景与目标

公众端（frontend-public）右上角用户下拉菜单增加 "GitPilot CLI" 专题页入口，专题页提供一键安装命令（`curl ... | bash` / `irm ... | iex`），用户执行后自动下载预打包 tarball 并完成构建注册，无需手动 git clone。

### 目标
1. 用户下拉新增 "GitPilot CLI" 入口 -> `/gitpilot-cli` 专题页。
2. 专题页展示 Windows / Linux+macOS 一键安装命令（带复制按钮）+ 使用步骤 + 环境要求。
3. 一键安装：预打包 `gitpilot-cli.tar.gz` + `install.ps1`/`install.sh`，托管在公众端 `public/downloads/`。
4. 生产域名可配：后端环境变量 `PLATFORM_GITPILOT_CLI_DOWNLOAD_BASE_URL` + 公开端点 `/api/public/gitpilot-cli/info` 暴露，公众端调端点拼接命令；为空时回退 `window.location.origin`。

### 非目标（YAGNI）
- 不做安装包签名校验、版本选择 UI。
- 不做管理端环境变量管理 UI（通过 .env / 环境变量配置）。
- tarball 不含 `package-lock.json`（用户确认），用户本地 `npm install` 解析依赖。

## 2. 后端设计（backend · Spring Boot）

### 2.1 `GitPilotCliProperties` 加 `downloadBaseUrl`
沿用现有 `@Value` 注入模式（参考 `publicBaseUrl`）：
- 新增字段 `private final String downloadBaseUrl;`
- `@Autowired` 构造函数加 `@Value("${platform.gitpilot.cli.download-base-url:}") String downloadBaseUrl`
- 构造函数体规范化：`this.downloadBaseUrl = downloadBaseUrl == null ? "" : downloadBaseUrl.trim().replaceFirst("/+$", "");`
- 访问器 `public String downloadBaseUrl()`
- 遗留测试构造函数 `this(...)` 委托补 `""

### 2.2 `application.yml`
`platform.gitpilot.cli` 块（第 84 行后）加：
```yaml
download-base-url: ${PLATFORM_GITPILOT_CLI_DOWNLOAD_BASE_URL:}
```

### 2.3 `AuthInterceptor.isPublicPath()` 白名单
加 `|| requestUri.startsWith("/api/public/gitpilot-cli/")`，使 `/api/public/gitpilot-cli/info` 免登录。

### 2.4 新建 `PublicGitPilotCliController`
`@RestController @RequestMapping("/api/public/gitpilot-cli")`，注入 `GitPilotCliProperties`：
```java
@GetMapping("/info")
public ApiResponse<GitPilotCliInfo> info() {
    return ApiResponse.success(new GitPilotCliInfo(properties.downloadBaseUrl()));
}
public record GitPilotCliInfo(String downloadBaseUrl) {}
```
无 `@RequirePermission`，无 `AuthContextHolder`。

## 3. 一键安装脚本（`frontend-public/public/downloads/`）

### 3.1 `install.ps1`（Windows）
`irm <BASE>/downloads/install.ps1 | iex`。流程：
1. 顶部 `DOWNLOAD_BASE` 变量（占位 `https://YOUR_PLATFORM_DOMAIN`，部署时改；打包脚本可注入）
2. 下载 `$DOWNLOAD_BASE/downloads/gitpilot-cli.tar.gz` 到临时目录
3. 解压到 `~/.gitpilot/cli/`
4. `cd` -> `npm install` -> `npm run build` -> `npm link`
5. 提示运行 `gitpilot` -> `/login`

### 3.2 `install.sh`（Linux/macOS）
`curl -fsSL <BASE>/downloads/install.sh | bash`。同上流程（tar/gzip 解压）。

> 脚本内 `DOWNLOAD_BASE` 硬编码（curl/irm 管道执行无法传参）；与后端配置 `PLATFORM_GITPILOT_CLI_DOWNLOAD_BASE_URL` 保持一致靠运维/打包脚本注入。

## 4. 打包脚本 `scripts/package-gitpilot-cli.ps1`
把 `gitpilot-cli/` 打包成 `gitpilot-cli.tar.gz`，排除 `node_modules`/`dist`/`.git`/`package-lock.json`，输出到 `frontend-public/public/downloads/gitpilot-cli.tar.gz`。发版时跑一次更新。

## 5. 公众端设计（frontend-public · React）

### 5.1 API `src/api/gitpilot-cli.ts`
```ts
export interface GitPilotCliInfo { downloadBaseUrl: string }
export const fetchGitPilotCliInfo = async (): Promise<GitPilotCliInfo> => {
    const res = await http.get<ApiResponse<GitPilotCliInfo>>('/api/public/gitpilot-cli/info')
    return unwrap(res)
}
```

### 5.2 专题页 `src/pages/cli/GitPilotCliPage.tsx`
- `useEffect` 调 `fetchGitPilotCliInfo` 取 `downloadBaseUrl`，为空回退 `window.location.origin`
- **标题区**：Terminal 图标 + "GitPilot CLI" + 副标题
- **一键安装 Card**：
  - Windows：`powershell -ep Bypass -c "irm ${base}/downloads/install.ps1 | iex"` + 复制按钮
  - Linux/macOS：`curl -fsSL ${base}/downloads/install.sh | bash` + 复制按钮
- **使用步骤 Card**：`gitpilot` -> `/login` -> `/model` -> `/requirement`
- **环境要求 Card**：Node.js ≥ 22.19
- 用 `tokens.css` 标准 token + `Card` 组件，兼容深色主题，中文硬编码

### 5.3 路由 `src/app/router.tsx`
ProductLayout children 加 `{ path: '/gitpilot-cli', element: <GitPilotCliPage /> }`

### 5.4 入口 `src/components/navigation/TopNav.tsx`
用户下拉（桌面 192-233 + 移动 248-343 两处）加 "GitPilot CLI" 项：
- 图标 `Terminal`（lucide-react，新增 import）
- `navigate('/gitpilot-cli')`
- 位置：在"我的反馈"后、"重播新手引导"前

## 6. 关键决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 源码获取 | 预打包 tarball | 不依赖 git，curl/irm 一键装 |
| tarball 排除 | node_modules/dist/.git/package-lock.json | 用户确认不含 lock；体积小，本地构建 |
| 生产域名 | 后端环境变量 + 公开端点 | 可配，回退 window.location.origin |
| 安装目标 | `~/.gitpilot/cli/` | 与配置目录 `~/.gitpilot/agent/` 同根 |
| 脚本内 BASE | 硬编码（打包脚本注入） | curl/irm 管道无传参，需固定 URL |
| 页面位置 | ProductLayout（登录后） | 入口在用户菜单 |

## 7. 错误处理

| 场景 | 处理 |
|---|---|
| `downloadBaseUrl` 未配置 | 回退 `window.location.origin` |
| 公开端点跨域 | CORS 已全局覆盖 `/**`，无需改 |
| 安装脚本下载 tarball 失败 | 脚本内报错退出，提示检查网络/域名 |
| npm install/build 失败 | 脚本保留退出码，提示 Node 版本 |

## 8. 测试与验证

### 8.1 后端
- JUnit：`PublicGitPilotCliController.info` 返回 `downloadBaseUrl`（mock properties）
- `mvn -s maven-settings-central.xml compile`
- 手动：未登录 `curl /api/public/gitpilot-cli/info` 返回 200（非 401）

### 8.2 公众端
- `cd frontend-public && npm run build`
- 手动：登录后访问 `/gitpilot-cli`，命令 URL 含配置域名；未配置时用 localhost

### 8.3 端到端
- 跑打包脚本生成 tarball
- 本地执行 `irm http://localhost:5175/downloads/install.ps1 | iex` 验证安装链路
