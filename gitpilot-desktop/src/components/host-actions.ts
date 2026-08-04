import type { RpcSlashCommand } from '@/src/rpc/types';

/**
 * 判断命令是否需要宿主二次操作。
 *
 * 这类命令（如 requirement 需求选择器、rtk 设置）不通过 / 输入发送到对话，
 * 改由输入框工具栏按钮入口触发，点击后打开对应的选择器/设置 Dialog。
 * 未来 goal、plan 等 curated 扩展的宿主动作命令沿用同一规则。
 */
export function isHostActionCommand(cmd: RpcSlashCommand): boolean {
	return cmd.name === 'requirement' || (cmd.hostAction !== undefined && cmd.hostAction !== 'prompt');
}
