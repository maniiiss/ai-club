/**
 * Slash 命令面板。
 *
 * 输入框输入 / 触发，列出 sidecar extension 注册的命令（/login、/model 等），
 * 选中后通过 onPick 回调执行。对应设计文档第 7.2 节。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import type { RpcSlashCommand } from '@/src/rpc/types';

interface CommandPaletteProps {
	commands: RpcSlashCommand[];
	onPick: (name: string) => void;
	onDismiss: () => void;
}

export function CommandPalette({ commands, onPick, onDismiss }: CommandPaletteProps) {
	const [query, setQuery] = useState('');
	const [active, setActive] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const filtered = useMemo(() => {
		const q = query.toLowerCase();
		return commands.filter((c) => !q || c.name.toLowerCase().includes(q));
	}, [commands, query]);

	useEffect(() => {
		setActive(0);
	}, [query]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onDismiss();
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				setActive((a) => Math.min(a + 1, filtered.length - 1));
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				setActive((a) => Math.max(a - 1, 0));
			} else if (e.key === 'Enter') {
				e.preventDefault();
				const cmd = filtered[active];
				if (cmd) onPick(cmd.name);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [filtered, active, onPick, onDismiss]);

	// Slash 面板不遮住工作台交互，点击面板外部即关闭并让原点击继续生效。
	useEffect(() => {
		const dismissOutside = (event: PointerEvent) => {
			if (!panelRef.current?.contains(event.target as Node)) onDismiss();
		};
		document.addEventListener('pointerdown', dismissOutside);
		return () => document.removeEventListener('pointerdown', dismissOutside);
	}, [onDismiss]);

	if (filtered.length === 0) {
		return (
			<div ref={panelRef} className="input-composer__palette absolute bottom-[calc(100%+10px)] left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 text-sm text-[var(--color-text-muted)] shadow-lg">
				无可用命令
			</div>
		);
	}

	return (
		<div ref={panelRef} className="input-composer__palette absolute bottom-[calc(100%+10px)] left-1/2 z-50 -translate-x-1/2 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-lg">
			<div className="border-b border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)]">命令</div>
			<div className="border-b border-[var(--color-border)] px-3 py-2">
				<input
					autoFocus
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="搜索命令…"
					className="w-full bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
				/>
			</div>
			<div ref={listRef} className="max-h-72 overflow-y-auto py-1">
				{filtered.map((cmd, i) => (
					<button
						key={`${cmd.source}:${cmd.name}`}
						type="button"
						onClick={() => onPick(cmd.name)}
						onMouseEnter={() => setActive(i)}
						className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
							i === active ? 'bg-[var(--color-primary-muted)] text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'
						}`}
					>
						<span className="mono">/{cmd.name}</span>
						{cmd.description && <span className="ml-2 truncate text-xs text-[var(--color-text-muted)]">{cmd.description}</span>}
					</button>
				))}
			</div>
			<div className="flex items-center gap-1 border-t border-[var(--color-border)] px-3 py-1.5 text-[10px] text-[var(--color-text-muted)]">
				<CornerDownLeft size={11} /> 选择 · ↑↓ 移动 · Esc 关闭
			</div>
		</div>
	);
}
