import { http, unwrap } from './http'

/** GitPilot CLI 公开下载元信息（无需登录）。 */
export interface GitPilotCliInfo {
  /** 下载基础地址，为空时前端回退到当前访问域名。 */
  downloadBaseUrl: string
}

/** 获取 GitPilot CLI 下载基础地址，公众端据此拼接一键安装命令。 */
export const fetchGitPilotCliInfo = async (): Promise<GitPilotCliInfo> => {
  const res = await http.get<{ success: boolean; message: string; data: GitPilotCliInfo }>(
    '/api/public/gitpilot-cli/info',
  )
  return unwrap(res)
}
