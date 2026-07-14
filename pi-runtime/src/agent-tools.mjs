import { Type } from 'typebox'

/**
 * 构造 Pi 可见的平台工具。
 * Pi 只执行运行时预检，真正的用户权限、项目范围和审计仍由 backend 工具网关复核。
 */
export const createPlatformTools = ({ executeTool, sessionToken, allowedTools = [] }) => {
  return [...new Set(allowedTools.filter((item) => typeof item === 'string' && item.trim()))].map((toolCode) => ({
    name: `platform_${toolCode.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    label: toolCode,
    description: `调用平台只读工具 ${toolCode}，结果由 backend 再次鉴权。`,
    parameters: Type.Object({}, { additionalProperties: true }),
    execute: async (toolCallId, args, signal) => {
      if (signal?.aborted) throw new Error('工具调用已取消')
      const result = await executeTool({ sessionToken, toolCode, arguments: args || {} })
      const text = typeof result === 'string' ? result : JSON.stringify(result || {})
      return {
        content: [{ type: 'text', text }],
        details: { toolCallId, toolCode, result },
      }
    },
  }))
}
