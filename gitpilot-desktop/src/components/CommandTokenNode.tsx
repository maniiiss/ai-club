import { Node, type JSONContent } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { ChatText as MessageSquareText, ClipboardText as ClipboardList, Cpu, Gear as Settings, ListChecks, Sparkle as Sparkles, Target as Goal, Terminal, type Icon } from '@phosphor-icons/react';
import type { RpcSlashCommand } from '@/src/rpc/types';
import styles from './InputBox.module.css';

export type CommandIconKey = 'goal' | 'plan' | 'requirement' | 'llama' | 'rtk' | 'skill' | 'prompt' | 'extension';

/** 将命令标识映射为稳定的产品图标语义，节点渲染和命令面板共享同一套规则。 */
export function getCommandIconKey(name: string, source?: RpcSlashCommand['source']): CommandIconKey {
	if (name === 'goal') return 'goal';
	if (name === 'plan') return 'plan';
	if (name === 'requirement') return 'requirement';
	if (name === 'llama') return 'llama';
	if (name === 'rtk') return 'rtk';
	if (name.startsWith('skill:')) return 'skill';
	return source === 'prompt' ? 'prompt' : 'extension';
}

const COMMAND_ICON_COMPONENTS: Record<CommandIconKey, Icon> = {
	goal: Goal,
	plan: ListChecks,
	requirement: ClipboardList,
	llama: Cpu,
	rtk: Settings,
	skill: Sparkles,
	prompt: MessageSquareText,
	extension: Terminal,
};

/** 命令图标由输入 token 和历史用户消息共同复用，避免同一个命令在不同区域出现两套视觉语义。 */
export function CommandIcon({ name, source, size = 13, strokeWidth = 1.8 }: { name: string; source?: RpcSlashCommand['source']; size?: number; strokeWidth?: number }) {
	const Icon = COMMAND_ICON_COMPONENTS[getCommandIconKey(name, source)];
	return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}

/** 将命令标识转换为 token 中的可读名称，例如 code-review -> Code Review。 */
export function formatCommandLabel(name: string): string {
	return name
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
		.join(' ');
}

function CommandTokenView({ node }: NodeViewProps) {
	const name = String(node.attrs.name ?? 'command');
	const source = node.attrs.source as RpcSlashCommand['source'] | undefined;
	return (
		<NodeViewWrapper as="span" className={styles.commandToken} data-command-name={name}>
			<CommandIcon name={name} source={source} />
			<span>{formatCommandLabel(name)}</span>
		</NodeViewWrapper>
	);
}

/** Tiptap 中的命令 token 是不可拆分的 inline 原子节点，避免再用 CSS 覆盖 textarea。 */
export const CommandTokenNode = Node.create({
	name: 'commandToken',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: false,
	draggable: false,

	addAttributes() {
		return {
			name: { default: '' },
			source: { default: 'extension' },
		};
	},

	parseHTML() {
		return [{
			tag: 'span[data-gp-command-token]',
			getAttrs: (element) => {
				const node = element as HTMLElement;
				return { name: node.dataset.commandName ?? '', source: node.dataset.commandSource ?? 'extension' };
			},
		}];
	},

	renderHTML({ node, HTMLAttributes }) {
		return ['span', { ...HTMLAttributes, 'data-gp-command-token': 'true', 'data-command-name': node.attrs.name, 'data-command-source': node.attrs.source }, `/${node.attrs.name}`];
	},

	renderText({ node }) {
		// 线性文本中保留一个协议分隔空格；视觉间距仍由 token CSS 控制。
		return `/${node.attrs.name} `;
	},

	addNodeView() {
		return ReactNodeViewRenderer(CommandTokenView);
	},
});

function serializeCommandNode(node: JSONContent): string {
	if (node.type === 'text') return node.text ?? '';
	if (node.type === 'commandToken') return `/${String(node.attrs?.name ?? '')} `;
	if (node.type === 'hardBreak') return '\n';
	return (node.content ?? []).map(serializeCommandNode).join('');
}

/** 将 Tiptap 文档还原为现有 prompt 协议使用的纯文本，命令 token 保留 slash 前缀。 */
export function serializeCommandContent(content: JSONContent[] | undefined): string {
	return (content ?? []).map(serializeCommandNode).join('\n');
}

/** 恢复草稿或编辑队列时识别文档中的第一个命令 token。 */
export function findCommandToken(content: JSONContent[] | undefined): { name: string; source: RpcSlashCommand['source'] } | null {
	const firstParagraph = content?.find((node) => node.type === 'paragraph');
	const token = firstParagraph?.content?.find((node) => node.type === 'commandToken');
	if (!token?.attrs?.name) return null;
	return { name: String(token.attrs.name), source: (token.attrs.source ?? 'extension') as RpcSlashCommand['source'] };
}

/** 构造可直接交给 editor.commands.setContent 的命令草稿文档。 */
export function createCommandDocument(name: string, source: RpcSlashCommand['source'], text = ''): JSONContent {
	const content: JSONContent[] = [{ type: 'commandToken', attrs: { name, source } }];
	if (text.length > 0) content.push({ type: 'text', text });
	return { type: 'doc', content: [{ type: 'paragraph', content }] };
}
