/** 面向整个工作台的命令面板；slash 命令仍保留在输入框附近。 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Command, CornerDownLeft, Cpu, Plus, Square, Type } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { useWorkbenchStore, type WorkbenchCommand } from '@/src/store/workbench';

interface GlobalCommandPaletteProps {
	onNewSession: () => void;
	onAbort: () => void;
}

export function GlobalCommandPalette({ onNewSession, onAbort }: GlobalCommandPaletteProps) {
	const open = useWorkbenchStore((s) => s.globalPaletteOpen);
	const close = useWorkbenchStore((s) => s.closeGlobalPalette);
	const requestModelPicker = useWorkbenchStore((s) => s.requestModelPicker);
	const commands = useSessionStore((s) => s.commands);
	const prompt = useSessionStore((s) => s.prompt);
	const [query, setQuery] = useState('');
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	const builtIns = useMemo<Array<WorkbenchCommand & { execute: () => void }>>(() => [
		{ id: 'new-task', label: '新建任务', description: '在当前项目创建新的 Agent 会话', shortcut: 'Ctrl N', execute: onNewSession },
		{ id: 'focus-input', label: '聚焦输入框', description: '回到任务输入区', shortcut: 'Ctrl I', execute: () => document.querySelector<HTMLTextAreaElement>('textarea')?.focus() },
		{ id: 'model', label: '切换模型', description: '选择模型或思维级别', shortcut: 'Ctrl L', execute: requestModelPicker },
		{ id: 'stop', label: '停止 Agent', description: '中止当前正在执行的回合', shortcut: 'Esc', execute: onAbort },
	], [onAbort, onNewSession, requestModelPicker]);
	const all = useMemo<Array<WorkbenchCommand & { execute: () => void }>>(() => [
		...builtIns,
		...commands.map<WorkbenchCommand & { execute: () => void }>((command) => ({ id: `slash-${command.source}-${command.name}`, label: `/${command.name}`, description: command.description ?? '执行 sidecar 注册命令', execute: () => { void prompt(`/${command.name}`); } })),
	], [builtIns, commands, prompt]);
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return all.filter((item) => !needle || `${item.label} ${item.description}`.toLowerCase().includes(needle));
	}, [all, query]);

	useEffect(() => {
		if (!open) return;
		setQuery('');
		setActive(0);
		requestAnimationFrame(() => inputRef.current?.focus());
	}, [open]);
	useEffect(() => setActive(0), [query]);
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') { event.preventDefault(); close(); }
			if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(value + 1, Math.max(0, filtered.length - 1))); }
			if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
			if (event.key === 'Enter') { event.preventDefault(); const item = filtered[active]; if (item) { close(); item.execute(); } }
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [active, close, filtered, open]);
	if (!open) return null;

	return <div className="global-palette-backdrop" role="presentation" onMouseDown={close}>
		<div className="global-palette" role="dialog" aria-modal="true" aria-label="命令面板" onMouseDown={(event) => event.stopPropagation()}>
			<div className="global-palette__search"><Command size={16} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索操作、模型或 / 命令…" /></div>
			<div className="global-palette__list">
				{filtered.map((item, index) => <button key={item.id} type="button" onMouseEnter={() => setActive(index)} onClick={() => { close(); item.execute(); }} className={index === active ? 'is-active' : ''}>
					<span>{item.id === 'new-task' ? <Plus size={15} /> : item.id === 'model' ? <Cpu size={15} /> : item.id === 'stop' ? <Square size={14} /> : <Type size={15} />}</span>
					<span className="global-palette__copy"><b>{item.label}</b><small>{item.description}</small></span>
					{item.shortcut && <kbd>{item.shortcut}</kbd>}
				</button>)}
				{filtered.length === 0 && <p className="global-palette__empty">没有匹配的工作台命令</p>}
			</div>
			<div className="global-palette__footer"><CornerDownLeft size={12} /> 执行 <span>↑↓ 选择</span><span>Esc 关闭</span></div>
		</div>
	</div>;
}
