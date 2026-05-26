# 服务器管理模块技术设计 v1

## 1. 目标

服务器管理模块面向平台级基础设施资产，第一版覆盖以下能力：

- Linux 服务器接入与 SSH 凭据管理
- 页面内 SSH 终端操作
- 页面内 SFTP 文件浏览、上传、下载、删除和创建目录
- CPU / 内存 / 磁盘 / 连通性监控
- 站内告警与通知人绑定
- 运行期即时总开关，停用时不影响平台其他业务

## 2. 边界与原则

- 只支持 Linux 服务器。
- 只支持单跳跳板机场景，跳板机配置内嵌在目标服务器详情中。
- 不支持明文导出密码、私钥或口令。
- 不保存完整终端输入输出，只记录会话建立、关闭和错误摘要。
- 不改 `code-processing`，SSH、监控采样、告警评估和 WebSocket 终端都由 `backend` 承担。

## 3. 数据模型

### 3.1 `server_info`

保存服务器主数据、SSH 接入参数、跳板机参数、默认告警覆盖值和最近采样摘要。

敏感字段统一采用 `*_ciphertext` 命名并通过 `TokenCipherService` 存储：

- `password_ciphertext`
- `private_key_ciphertext`
- `private_key_passphrase_ciphertext`
- `jump_password_ciphertext`
- `jump_private_key_ciphertext`
- `jump_private_key_passphrase_ciphertext`

### 3.2 `server_metric_sample`

保存资源采样结果，第一版保留 72 小时，用于详情页“最近 24 小时短趋势”和告警评估。

### 3.3 `server_alert_state`

每台服务器按告警类型维护一条状态，支持：

- 连续越线计数
- 冷却时间控制
- 恢复通知
- 活跃告警数汇总

### 3.4 `server_alert_recipient_rel`

保存服务器与站内通知人的绑定关系。

### 3.5 `server_terminal_session_log`

保存终端会话审计日志，包括：

- 会话 ID
- 服务器 / 用户
- 连接状态
- 来源 IP
- 建立、连接、结束时间
- 关闭原因与错误摘要

## 4. 运行期总开关

总开关通过 `PLATFORM_SERVER_MODULE_ENABLED` 控制，并纳入环境变量管理。

关闭时：

- 前端菜单入口隐藏
- `/servers` 路由不可进入
- `GET /api/runtime-capabilities` 立即返回 `serverManagementEnabled=false`
- 服务器相关 REST 接口统一拒绝访问
- `/ws/server-terminals` 拒绝新握手
- 已连接 SSH 终端收到 `MODULE_DISABLED` 并主动断开
- 监控调度与告警发送立即停用

重新开启时，不清理历史服务器、采样和告警状态，继续在原数据基础上恢复。

## 5. 监控与告警

默认配置走固定注册表：

- `PLATFORM_SERVER_MONITOR_INTERVAL_SECONDS`
- `PLATFORM_SERVER_ALERT_CONNECTIVITY_ENABLED`
- `PLATFORM_SERVER_ALERT_CPU_THRESHOLD_PERCENT`
- `PLATFORM_SERVER_ALERT_MEMORY_THRESHOLD_PERCENT`
- `PLATFORM_SERVER_ALERT_DISK_THRESHOLD_PERCENT`
- `PLATFORM_SERVER_ALERT_CONSECUTIVE_BREACHES`
- `PLATFORM_SERVER_ALERT_COOLDOWN_MINUTES`

服务器详情允许覆盖上述告警项并绑定通知人。告警仅走站内通知，暂不接企业微信、钉钉、飞书等外部通道。

## 6. SSH 终端

- 前端先调用 `POST /api/servers/{id}/terminal-sessions` 创建会话。
- 再通过 `/ws/server-terminals?token=...&sessionId=...` 建立 WebSocket。
- 后端通过 `sshj` 打开 PTY shell，把输入输出桥接到页面终端。
- 第一版协议只支持 `INPUT`、`RESIZE`、`OUTPUT`、`STATUS`。

## 7. SFTP 文件管理

- SFTP 复用 `server:terminal` 权限和服务器管理总开关，后端通过 `sshj` 为每次文件操作建立独立 SFTP 会话。
- 浏览目录、上传、删除和创建目录使用常规 Bearer 鉴权 API。
- 下载大文件时前端先调用 `POST /api/servers/{id}/sftp/download-ticket` 创建短期票据，再用浏览器原生下载请求访问 `GET /api/servers/{id}/sftp/download`。
- 下载票据绑定当前用户、服务器 ID、规范化远程路径和过期时间，只保存 HMAC 签名后的短期凭证，不把长期登录 Token 放入 URL。
- 下载响应使用 `filename` + `filename*` 双格式 `Content-Disposition`，兼容中文文件名与旧浏览器兜底文件名。

## 8. 安全要求

- 所有敏感凭据只在写入时接收，读取时只返回 `passwordConfigured` / `privateKeyConfigured` 等布尔状态。
- 操作日志、异常信息、告警文案和终端错误输出都不得拼接或暴露明文凭据。
- 临时私钥文件只用于 sshj 装载内存私钥，使用后立即删除。
