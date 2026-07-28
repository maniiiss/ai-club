/**
 * 会话侧栏。
 *
 * 展示会话树（支持父子层级），新建会话，切换会话。
 * 会话树来自 sidecar 的 get_tree，复用 Pi 的会话持久化。
 */
import { Plus, MessageSquare, ChevronRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useSessionStore } from '@/src/store/session';
import type { SessionTreeNode } from '@/src/rpc/types';

function TreeItem({ node, depth }: { node: SessionTreeNode; depth: number }) {
	const switchSession = useSessionStore((s) => s.switchSession);
	const sessionState = useSessionStore((s) => s.sessionState);
	const [open, setOpen] = useState(true);

	const nodeKey = node.entry?.id || node.id || '';
	const nodeLabel = node.name || node.entry?.name || nodeKey.slice(0, 8) || '未命名';
	const isActive = sessionState?.sessionFile === node.sessionFile;
	const hasChildren = node.children && node.children.length > 0;

	return (
		<div>
			<button
				type="button"
				onClick={() => node.sessionFile && switchSession(node.sessionFile)}
				className={`flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${
					isActive ? 'bg-[var(--color-primary-muted)] text-[var(--color-text)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
				}`}
				style={{ paddingLeft: `${8 + depth * 14}px` }}
			>
				{hasChildren ? (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							setOpen((o) => !o);
						}}
						className="text-[var(--color-text-muted)]"
					>
						{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
					</button>
				) : (
					<MessageSquare size={13} className="shrink-0 text-[var(--color-text-muted)]" />
				)}
				<span className="truncate">{nodeLabel}</span>
			</button>
			{hasChildren && open && node.children!.map((child) => <TreeItem key={child.entry?.id || child.id || Math.random()} node={child} depth={depth + 1} />)}
		</div>
	);
}

export function SessionSidebar() {
	const tree = useSessionStore((s) => s.sessionTree);
	const newSession = useSessionStore((s) => s.newSession);
	const connection = useSessionStore((s) => s.connection);

	return (
		<aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-surface)]">
			<div className="flex items-center justify-between px-3 py-3">
				<span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">会话</span>
				<button
					type="button"
					onClick={() => newSession()}
					disabled={connection !== 'ready'}
					className="flex items-center gap-1 rounded-md bg-[var(--color-primary-muted)] px-2 py-1 text-xs text-[var(--color-primary-hover)] transition-colors hover:bg-[var(--color-primary)]/25 disabled:opacity-40"
				>
					<Plus size={13} /> 新建
				</button>
			</div>
			<div className="flex-1 overflow-y-auto px-1.5 pb-2">
				{tree.length === 0 ? (
					<div className="px-2 py-4 text-xs text-[var(--color-text-muted)]">暂无会话</div>
				) : (
					tree.map((node) => <TreeItem key={node.id} node={node} depth={0} />)
				)}
			</div>
		</aside>
	);
}
