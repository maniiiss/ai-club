import { Entry } from '@napi-rs/keyring'

const SERVICE = 'gitpilot'

/** 将平台地址映射到凭据库账户，避免不同部署环境相互覆盖。 */
const accountFor = (platformUrl: string) => `cli-token:${platformUrl.replace(/\/$/, '')}`
const entryFor = (platformUrl: string) => new Entry(SERVICE, accountFor(platformUrl))

export const readCliToken = async (platformUrl: string): Promise<string | null> => {
  try {
    return entryFor(platformUrl).getPassword() || null
  } catch (error) {
    throw new Error(`系统凭据库不可用，无法读取 GitPilot 登录态: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const saveCliToken = async (platformUrl: string, token: string): Promise<void> => {
  try {
    entryFor(platformUrl).setPassword(token)
  } catch (error) {
    throw new Error(`系统凭据库不可用，无法保存 GitPilot 登录态: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const deleteCliToken = async (platformUrl: string): Promise<void> => {
  try {
    entryFor(platformUrl).deletePassword()
  } catch (error) {
    throw new Error(`系统凭据库不可用，无法删除 GitPilot 登录态: ${error instanceof Error ? error.message : String(error)}`)
  }
}
