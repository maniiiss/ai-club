/** 面向整个工作台的命令面板；slash 命令仍保留在输入框附近。 */
import { useMemo } from 'react';
import { ArrowBendDownLeft as CornerDownLeft, Cpu, Plus, Square, TextAa as Type } from '@phosphor-icons/react';
import { useSessionStore } from '@/src/store/session';
import { useWorkbenchStore, type WorkbenchCommand } from '@/src/store/workbench';
import { isHostActionCommand } from './host-actions';
import { Command as CommandRoot, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/src/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import styles from './GlobalCommandPalette.module.css';

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
	const executeCommand = useSessionStore((s) => s.executeCommand);

	const builtIns = useMemo<Array<WorkbenchCommand & { execute: () => void }>>(() => [
		{ id: 'new-task', label: '新建任务', description: '在当前工作空间创建新的 Agent 会话', shortcut: 'Ctrl N', execute: onNewSession },
		{ id: 'focus-input', label: '聚焦输入框', description: '回到任务输入区', shortcut: 'Ctrl I', execute: () => document.querySelector<HTMLTextAreaElement>('textarea')?.focus() },
		{ id: 'model', label: '切换模型', description: '选择模型或思维级别', shortcut: 'Ctrl L', execute: requestModelPicker },
		{ id: 'stop', label: '停止 Agent', description: '中止当前正在执行的回合', shortcut: 'Esc', execute: onAbort },
	], [onAbort, onNewSession, requestModelPicker]);
	const all = useMemo<Array<WorkbenchCommand & { execute: () => void }>>(() => [
		...builtIns,
		...commands.filter((command) => !isHostActionCommand(command)).map<WorkbenchCommand & { execute: () => void }>((command) => ({ id: `slash-${command.source}-${command.name}`, label: `/${command.name}`, description: command.description ?? '执行 sidecar 注册命令', execute: () => { void (command.source === 'extension' && command.name === 'requirement' ? executeCommand(command.name) : prompt(`/${command.name}`)); } })),
	], [builtIns, commands, executeCommand, prompt]);
	if (!open) return null;

	const iconFor = (id: string) => id === 'new-task' ? <Plus /> : id === 'model' ? <Cpu /> : id === 'stop' ? <Square /> : <Type />;
	return <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
		<DialogContent className={`${styles.dialog} p-0`} aria-describedby="global-command-description">
			<DialogHeader className="sr-only"><DialogTitle>命令面板</DialogTitle><DialogDescription id="global-command-description">搜索并执行工作台操作</DialogDescription></DialogHeader>
			<CommandRoot>
				<CommandInput placeholder="搜索操作、模型或 / 命令…" />
				<CommandList>
					<CommandEmpty>没有匹配的工作台命令</CommandEmpty>
					{all.map((item) => <CommandItem key={item.id} value={`${item.label} ${item.description}`} onSelect={() => { close(); item.execute(); }}>
						<span className={styles.itemIcon}>{iconFor(item.id)}</span>
						<span className={styles.itemCopy}><b>{item.label}</b><small>{item.description}</small></span>
						{item.shortcut && <kbd>{item.shortcut}</kbd>}
					</CommandItem>)}
				</CommandList>
				<div className={styles.footer}><CornerDownLeft /> 执行 <span>↑↓ 选择</span><span>Esc 关闭</span></div>
			</CommandRoot>
		</DialogContent>
	</Dialog>;
}
