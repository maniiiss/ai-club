/**
 * 桌面版部署配置。
 *
 * 业务意图：把桌面应用连接的目标平台地址收敛到单一配置，避免散落在登录页与账户菜单里。
 * 平台采用「后端 API 地址 + 前端 Web 地址」分离部署：
 *  - apiBaseUrl：后端 API 基地址，登录（/api/cli/device/*）、模型、会话等全部接口走这里。
 *  - webBaseUrl：前端 Web 基地址，桌面端「前往 GitPilot Web」跳转到这里；登录时后端返回的
 *    verificationUri 也由后端基于同一前端地址生成，因此桌面端可直接用它作为校验页入口。
 *
 * 发布不同环境的安装包时只需改这里，无需改动业务组件。
 */
export const DEPLOYMENT = {
	/** 后端 API 基地址（登录与所有 /api/cli/* 请求）。 */
	apiBaseUrl: 'http://192.168.111.74:8899',
	/** 前端 Web 基地址（「前往 GitPilot Web」跳转目标）。 */
	webBaseUrl: 'http://192.168.111.74:9138',
} as const;