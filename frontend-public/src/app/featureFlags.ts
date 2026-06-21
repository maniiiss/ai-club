/**
 * 运行时功能开关。
 * 第一阶段使用静态配置，后续接入 GET /api/public-runtime-config 后
 * 应从后端动态获取并合并到此处。
 */
export interface FeatureFlags {
  /** 是否开放注册。 */
  registrationEnabled: boolean
  /** 是否展示 GitLab 集成功能。 */
  gitlabIntegrationEnabled: boolean
  /** 是否展示 CI/CD 相关功能。 */
  cicdEnabled: boolean
  /** 是否展示可观测性功能。 */
  observabilityEnabled: boolean
  /** 是否展示服务器管理（公众用户不可见）。 */
  serverManagementVisible: boolean
  /** 是否展示模型供应商管理（公众用户不可见）。 */
  modelProviderManagementVisible: boolean
  /** 是否展示自升级中心（公众用户不可见）。 */
  selfUpgradeVisible: boolean
}

export const featureFlags: FeatureFlags = {
  registrationEnabled: true,
  gitlabIntegrationEnabled: true,
  cicdEnabled: true,
  observabilityEnabled: true,
  serverManagementVisible: false,
  modelProviderManagementVisible: false,
  selfUpgradeVisible: false,
}
