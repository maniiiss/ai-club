/**
 * Slash 命令面板。
 *
 * 输入框中的 / 后文本直接筛选 sidecar extension 注册的命令（/login、/model 等），
 * 选中后通过 onPick 回调执行。对应设计文档第 7.2 节。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import type { RpcSlashCommand } from '@/src/rpc/types';
import { Command as CommandRoot, CommandEmpty, CommandItem, CommandList } from '@/src/components/ui/command';
import styles from './CommandPalette.module.css';

interface CommandPaletteProps {
	commands: RpcSlashCommand[];
	query: string;
	onPick: (name: string) => void;
	onDismiss: () => void;
}

export function CommandPalette({ commands, query, onPick, onDismiss }: CommandPaletteProps) {
	const [active, setActive] = useState(0);
	const panelRef = useRef<HTMLDivElement>(null);
	const activeRef = useRef(0);
	const filteredRef = useRef<RpcSlashCommand[]>([]);
	const onPickRef = useRef(onPick);
	const onDismissRef = useRef(onDismiss);

	const filtered = useMemo(() => {
		const q = query.toLowerCase();
		return commands.filter((c) => !q || c.name.toLowerCase().includes(q));
	}, [commands, query]);

	useEffect(() => {
		filteredRef.current = filtered;
	}, [filtered]);

	useEffect(() => {
		onPickRef.current = onPick;
		onDismissRef.current = onDismiss;
	}, [onPick, onDismiss]);

	useEffect(() => {
		activeRef.current = 0;
		setActive(0);
	}, [query]);

	// 面板生命周期内只注册一次全局监听，避免每次筛选/移动高亮都反复解绑和绑定。
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const list = filteredRef.current;
			if (e.key === 'Escape') {
				e.preventDefault();
				onDismissRef.current();
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				const next = Math.min(activeRef.current + 1, Math.max(0, list.length - 1));
				activeRef.current = next;
				setActive(next);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				const next = Math.max(activeRef.current - 1, 0);
				activeRef.current = next;
				setActive(next);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				const cmd = list[activeRef.current];
				if (cmd) onPickRef.current(cmd.name);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	// Slash 面板不遮住工作台交互，点击面板外部即关闭并让原点击继续生效。
	useEffect(() => {
		const dismissOutside = (event: PointerEvent) => {
			if (!panelRef.current?.contains(event.target as Node)) onDismissRef.current();
		};
		document.addEventListener('pointerdown', dismissOutside);
		return () => document.removeEventListener('pointerdown', dismissOutside);
	}, []);

	if (filtered.length === 0) {
		return (
			<div ref={panelRef} className={`${styles.panel} ${styles.empty}`}>
				无可用命令
			</div>
		);
	}

	return (
		<div ref={panelRef} className={styles.panel}>
			<div className={styles.header}>命令</div>
			<CommandRoot shouldFilter={false} className="bg-transparent">
				<CommandList className="max-h-72 py-1">
					<CommandEmpty>无可用命令</CommandEmpty>
					{filtered.map((cmd, i) => (
					<CommandItem
						key={`${cmd.source}:${cmd.name}`}
						onSelect={() => onPick(cmd.name)}
						onMouseEnter={() => { activeRef.current = i; setActive(i); }}
						className={`${styles.item} ${i === active ? styles.active : ''}`}
					>
						<span className={styles.command}>/{cmd.name}</span>
						{cmd.description && <span className={styles.description}>{cmd.description}</span>}
					</CommandItem>
				))}
				</CommandList>
			</CommandRoot>
			<div className={styles.footer}>
				<CornerDownLeft size={11} /> 选择 · ↑↓ 移动 · Esc 关闭
			</div>
		</div>
	);
}
